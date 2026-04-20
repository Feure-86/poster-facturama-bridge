const API_BASE_URL = "https://poster-facturama-bridge.onrender.com";

const lookupForm = document.getElementById("lookup-form");
const invoiceForm = document.getElementById("invoice-form");
const invoiceSubmit = document.getElementById("invoice-submit");

const lookupMessage = document.getElementById("lookup-message");
const invoiceMessage = document.getElementById("invoice-message");
const ticketSummary = document.getElementById("ticket-summary");

const summaryTicketNumber = document.getElementById("summary-ticket-number");
const summaryStatus = document.getElementById("summary-status");
const summaryTotal = document.getElementById("summary-total");
const summaryCurrency = document.getElementById("summary-currency");
const summaryProductCount = document.getElementById("summary-product-count");
const summaryPaymentMethod = document.getElementById("summary-payment-method");
const summaryItems = document.getElementById("summary-items");
const invoiceTicketNumber = document.getElementById("invoice-ticket-number");
const invoiceTicketAmount = document.getElementById("invoice-ticket-amount");
const fiscalNameInput = document.getElementById("fiscal-name");

function setMessage(element, type, text) {
  element.className = `message ${type}`;
  element.textContent = text;
  element.classList.remove("hidden");
}

function clearMessage(element) {
  element.className = "message hidden";
  element.textContent = "";
}

function formatMoney(value, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency
  }).format(Number(value || 0));
}

function describePaymentForm(paymentType) {
  switch (String(paymentType || "")) {
    case "1":
      return "Efectivo";
    case "2":
      return "Tarjeta";
    case "3":
      return "Mixto";
    default:
      return "Sin definir";
  }
}

function normalizeFiscalName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeAmountInput(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return "";
  }

  return amount.toFixed(2);
}

function renderTicketSummary(ticket) {
  summaryTicketNumber.textContent = `Ticket ${ticket.ticketNumber}`;
  summaryStatus.textContent = ticket.isClosed ? "Cerrado" : "Abierto";
  summaryStatus.className = `status-pill${ticket.isClosed ? " success" : ""}`;
  summaryTotal.textContent = formatMoney(ticket.total || ticket.payedSum || 0, ticket.currency || "MXN");
  summaryCurrency.textContent = ticket.currency || "MXN";
  summaryProductCount.textContent = String(ticket.items?.length || ticket.productCount || 0);
  summaryPaymentMethod.textContent = describePaymentForm(ticket.paymentType);

  summaryItems.innerHTML = "";
  for (const item of ticket.items || []) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    const price = document.createElement("span");

    name.textContent = `${item.quantity} x ${item.product_name}${item.category_name ? ` · ${item.category_name}` : ""}`;
    price.textContent = formatMoney(item.line_total || 0, ticket.currency || "MXN");

    li.append(name, price);
    summaryItems.appendChild(li);
  }

  ticketSummary.classList.remove("hidden");
}

async function wakeBackend() {
  try {
    await fetch(`${API_BASE_URL}/health`);
  } catch (_error) {
    // Ignorado: la búsqueda real dará el error útil si el backend no está disponible.
  }
}

if (fiscalNameInput) {
  fiscalNameInput.addEventListener("input", (event) => {
    const cursor = event.target.selectionStart;
    event.target.value = normalizeFiscalName(event.target.value);
    if (cursor != null) {
      event.target.setSelectionRange(cursor, cursor);
    }
  });
}

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(lookupMessage);
  clearMessage(invoiceMessage);
  ticketSummary.classList.add("hidden");
  invoiceSubmit.disabled = true;

  const formData = new FormData(lookupForm);
  const ticketNumber = String(formData.get("ticket_number") || "").trim();
  const ticketAmount = String(formData.get("amount") || "").trim();

  if (!ticketNumber) {
    setMessage(lookupMessage, "error", "Ingresa un número de ticket.");
    return;
  }

  if (!ticketAmount) {
    setMessage(lookupMessage, "error", "Ingresa el monto total del ticket.");
    return;
  }

  setMessage(lookupMessage, "info", "Buscando ticket...");
  await wakeBackend();

  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets/lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticket_number: ticketNumber,
        amount: ticketAmount
      })
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo consultar el ticket.");
    }

    renderTicketSummary(data.ticket);
    invoiceTicketNumber.value = data.ticket.ticketNumber || ticketNumber;
    invoiceTicketAmount.value = normalizeAmountInput(ticketAmount);
    invoiceSubmit.disabled = !data.ticket.isClosed || data.ticket.isInvoiced;

    if (data.ticket.isInvoiced) {
      setMessage(lookupMessage, "info", "Este ticket ya fue facturado.");
      return;
    }

    if (!data.ticket.isClosed) {
      setMessage(lookupMessage, "info", "El ticket existe, pero todavía no está cerrado.");
      return;
    }

    setMessage(lookupMessage, "success", "Ticket listo para facturación.");
  } catch (error) {
    setMessage(lookupMessage, "error", error.message);
  }
});

invoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(invoiceMessage);

  const formData = new FormData(invoiceForm);
  const payload = Object.fromEntries(formData.entries());
  payload.name = normalizeFiscalName(payload.name);

  if (!payload.ticket_number) {
    setMessage(invoiceMessage, "error", "Primero busca un ticket válido.");
    return;
  }

  if (!payload.amount) {
    setMessage(invoiceMessage, "error", "Vuelve a buscar el ticket con su monto antes de facturar.");
    return;
  }

  invoiceSubmit.disabled = true;
  setMessage(invoiceMessage, "info", "Generando factura...");

  try {
    const response = await fetch(`${API_BASE_URL}/api/invoices/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "No se pudo generar la factura.");
    }

    const emailNote = data.emailSent ? " También se envió por correo." : "";
    setMessage(
      invoiceMessage,
      "success",
      `Factura generada correctamente. Folio interno: ${data.invoiceId || "sin dato"}.${emailNote}`
    );
  } catch (error) {
    invoiceSubmit.disabled = false;
    setMessage(invoiceMessage, "error", error.message);
  }
});
