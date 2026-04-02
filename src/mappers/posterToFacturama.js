function tryParseJson(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

function normalizePosterWebhookPayload(webhookPayload) {
  if (!webhookPayload || typeof webhookPayload !== "object") {
    return webhookPayload;
  }

  const normalized = { ...webhookPayload };
  normalized.data = tryParseJson(normalized.data);

  if (normalized.data && typeof normalized.data === "object") {
    for (const [key, value] of Object.entries(normalized.data)) {
      normalized.data[key] = tryParseJson(value);
    }
  }

  return normalized;
}

function isInvoiceRequested(webhookPayload) {
  return Boolean(
    webhookPayload?.invoiceRequested ||
      webhookPayload?.requires_invoice ||
      webhookPayload?.customer?.invoiceRequested ||
      webhookPayload?.fiscalData
  );
}

function getTransactionId(webhookPayload) {
  return (
    webhookPayload?.object_id ||
    webhookPayload?.objectId ||
    webhookPayload?.transaction_id ||
    webhookPayload?.transactionId ||
    webhookPayload?.order?.id ||
    webhookPayload?.id ||
    null
  );
}

function mapToFacturamaInvoice({ webhookPayload, config }) {
  const customer = webhookPayload.customer || {};
  const lines = webhookPayload.items || webhookPayload.order?.items || [];
  const total = Number(webhookPayload.total || webhookPayload.order?.total || 0);

  return {
    Serie: config.defaults.serie,
    Currency: config.defaults.currency,
    ExpeditionPlace: config.defaults.expeditionPlace,
    CfdiType: "I",
    PaymentMethod: webhookPayload.paymentMethod || "PUE",
    PaymentForm: webhookPayload.paymentForm || "01",
    Receiver: {
      Rfc: customer.rfc || "XAXX010101000",
      Name: customer.name || "PUBLICO EN GENERAL",
      CfdiUse: customer.cfdiUse || "S01",
      FiscalRegime: customer.fiscalRegime || "616",
      TaxZipCode: customer.taxZipCode || config.defaults.expeditionPlace || "64000"
    },
    Items: lines.map((line) => {
      const quantity = Number(line.quantity || 1);
      const unitPrice = Number(line.price || line.unitPrice || 0);
      const amount = Number((quantity * unitPrice).toFixed(2));
      return {
        ProductCode: line.productCode || "01010101",
        IdentificationNumber: String(line.id || line.sku || ""),
        Description: line.name || line.description || "Producto",
        Unit: line.unit || "No aplica",
        UnitCode: line.unitCode || "H87",
        UnitPrice: unitPrice,
        Quantity: quantity,
        Subtotal: amount,
        Total: amount,
        TaxObject: "02",
        Taxes: line.taxes || []
      };
    }),
    Subtotal: total,
    Total: total
  };
}

module.exports = {
  normalizePosterWebhookPayload,
  isInvoiceRequested,
  getTransactionId,
  mapToFacturamaInvoice
};
