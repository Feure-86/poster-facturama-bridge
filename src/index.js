const express = require("express");
const path = require("path");

const { config } = require("./config");
const { JsonStore } = require("./storage");
const { PosterService } = require("./services/poster");
const { FacturamaService } = require("./services/facturama");
const { createSupabasePersistence } = require("./supabase");
const {
  normalizePosterWebhookPayload,
  getTransactionId,
  isInvoiceRequested,
  mapToFacturamaInvoice
} = require("./mappers/posterToFacturama");
const { buildMonthlyFinancialReports, DEFAULT_CHART_OF_ACCOUNTS } = require("./reporting/monthlyReports");

const app = express();
app.use(express.json({ limit: "2mb" }));

const posterTokenStore = new JsonStore(path.join(config.dataDir, "poster-tokens.json"));
const processedSaleStore = new JsonStore(path.join(config.dataDir, "processed-sales.json"));
const persistence = createSupabasePersistence(config);

async function persistSafely(label, operation) {
  try {
    return await operation();
  } catch (error) {
    console.warn(`${label} warning:`, error.message);
    return null;
  }
}

async function resolvePosterAccessToken({ accountId, posterService, persistence }) {
  const savedInstallation = await posterService.getSavedInstallation(accountId);
  if (savedInstallation?.accessToken) {
    return savedInstallation.accessToken;
  }

  if (!persistence.enabled) {
    return null;
  }

  const connection = await persistence.getPosterConnection(accountId);
  return connection?.access_token || null;
}

function centsToAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Number((number / 100).toFixed(2));
}

function isTaxExemptCategory(categoryName) {
  return String(categoryName || "").trim().toLowerCase() === "cafe en grano";
}

function mapTicketItems({ ticket, items }) {
  const merged = new Map();

  for (const item of items || []) {
    const quantity = Number(item.num || item.count || 0);
    const unitPrice = centsToAmount(item.product_price || 0);
    const lineTotal = centsToAmount(item.payed_sum || item.product_price * quantity || 0);
    const categoryName = item.category_name || null;
    const isTaxExempt = isTaxExemptCategory(categoryName);
    const key = String(item.product_id || "");
    const existing = merged.get(key);
    const next = existing
      ? {
          ...existing,
          quantity: Number((existing.quantity + quantity).toFixed(4)),
          line_total: Number((existing.line_total + lineTotal).toFixed(2)),
          raw_payload: Array.isArray(existing.raw_payload) ? [...existing.raw_payload, item] : [existing.raw_payload, item]
        }
      : {
      ticket_id: ticket?.id || null,
      poster_ticket_id: ticket?.poster_ticket_id || ticket?.ticket_number || null,
      product_id: key,
      product_name: item.product_name || item.modification_name || null,
      category_id: item.category_id != null ? String(item.category_id) : null,
      category_name: categoryName,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      is_tax_exempt: isTaxExempt,
      tax_rate: isTaxExempt ? 0 : 0.16,
      raw_payload: item
    };

    merged.set(key, next);
  }

  return [...merged.values()];
}

function summarizeTicket(ticket, items = []) {
  if (!ticket) {
    return null;
  }

  const transactionDetail = ticket?.raw_payload?.transaction_detail || null;
  const products = Array.isArray(transactionDetail?.products) ? transactionDetail.products : [];
  const payedSum = transactionDetail?.payed_sum != null ? centsToAmount(transactionDetail.payed_sum) : Number(ticket.total || 0);
  const sum = transactionDetail?.sum != null ? centsToAmount(transactionDetail.sum) : Number(ticket.total || 0);
  const isClosed = Number(transactionDetail?.status || 0) === 2 || Number(transactionDetail?.date_close || 0) > 0 || payedSum > 0;
  const isInvoiced = Boolean(ticket.invoice_id) || String(ticket.status || "").trim() === "invoiced";

  return {
    id: ticket.id || null,
    ticketNumber: ticket.ticket_number || ticket.poster_ticket_id || null,
    posterTicketId: ticket.poster_ticket_id || null,
    accountId: ticket.poster_account_id || null,
    total: Number(ticket.total || 0),
    payedSum,
    sum,
    currency: ticket.currency || "MXN",
    status: ticket.status || null,
    invoiceId: ticket.invoice_id || null,
    isClosed,
    isInvoiced,
    dateClose: transactionDetail?.date_close || null,
    dateStart: transactionDetail?.date_start || null,
    paymentType: transactionDetail?.pay_type ?? null,
    processingStatus: transactionDetail?.processing_status ?? null,
    productCount: items.length || products.length,
    products,
    items,
    rawPayload: ticket.raw_payload || null
  };
}

async function handleTicketLookup(ticketNumber, res) {
  const normalizedTicketNumber = String(ticketNumber || "").trim();
  if (!normalizedTicketNumber) {
    return res.status(400).json({ ok: false, error: "Missing ticket number" });
  }

  if (!persistence.enabled) {
    return res.status(503).json({ ok: false, error: "Supabase persistence is required for ticket lookup" });
  }

  const ticket = await persistence.getTicketByNumber(normalizedTicketNumber);
  if (!ticket) {
    return res.status(404).json({ ok: false, error: "Ticket not found" });
  }

  const items = await persistence.getTicketItemsByTicketId(ticket.id);

  return res.status(200).json({
    ok: true,
    ticket: summarizeTicket(ticket, items)
  });
}

const posterService = new PosterService(
  {
    clientId: config.poster.clientId,
    clientSecret: config.poster.clientSecret,
    authorizeUrl: config.poster.authorizeUrl,
    tokenUrl: config.poster.tokenUrl,
    publicBaseUrl: config.publicBaseUrl
  },
  posterTokenStore
);

const facturamaService = new FacturamaService(config.facturama);

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "poster-facturama-middleware",
    persistence: persistence.enabled ? "supabase+file" : "file",
    time: new Date().toISOString()
  });
});

app.get("/api/tickets/:ticketNumber", async (req, res) => {
  try {
    return await handleTicketLookup(req.params.ticketNumber, res);
  } catch (error) {
    console.error("Ticket lookup error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/tickets/lookup", async (req, res) => {
  try {
    return await handleTicketLookup(req.body?.ticket_number || req.body?.ticketNumber, res);
  } catch (error) {
    console.error("Ticket lookup error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/reports/monthly", async (req, res) => {
  try {
    const {
      journal_entries: journalEntries = [],
      daily_sales_summary: dailySalesSummary = [],
      chart_of_accounts: chartOfAccounts = DEFAULT_CHART_OF_ACCOUNTS
    } = req.body || {};

    const reports = buildMonthlyFinancialReports({
      journalEntries,
      dailySalesSummary,
      chartOfAccounts
    });

    return res.status(200).json({
      ok: true,
      ...reports
    });
  } catch (error) {
    console.error("Monthly reports error:", error);
    return res.status(400).json({ ok: false, error: error.message });
  }
});

app.get("/poster/connect", async (_req, res) => {
  const state = Math.random().toString(36).slice(2);
  const authorizeUrl = posterService.buildAuthorizeUrl(state);
  res.status(200).send(`
    <html>
      <body style="font-family: sans-serif; margin: 2rem;">
        <h1>Poster Integration</h1>
        <p>Click to authorize this app in Poster.</p>
        <a href="${authorizeUrl}">Connect with Poster</a>
      </body>
    </html>
  `);
});

app.get("/poster/oauth/callback", async (req, res) => {
  try {
    const {
      code,
      token,
      access_token: directAccessToken,
      account,
      account_id: accountId,
      error,
      error_description: errorDescription
    } = req.query;

    if (error) {
      return res.status(400).json({ ok: false, error, errorDescription });
    }

    let payload;
    if (token || directAccessToken) {
      payload = {
        access_token: String(token || directAccessToken),
        token_type: "Bearer"
      };
    } else {
      if (!code) {
        return res.status(400).json({ ok: false, error: "Missing code/token query param" });
      }
      payload = await posterService.exchangeCodeForToken({
        code: String(code),
        account: String(account || "")
      });
    }
    const normalizedAccountId =
      String(accountId || account || payload.account_id || payload.accountId || payload.account || payload.user_id || "")
        .trim() || null;
    const installation = await posterService.saveInstallation({ accountId: normalizedAccountId, payload });
    if (persistence.enabled) {
      await persistSafely("Supabase poster connection", () =>
        persistence.savePosterConnection({ accountId: normalizedAccountId, payload })
      );
    }

    res.status(200).json({
      ok: true,
      accountId: normalizedAccountId || installation.storageKey,
      accessToken: installation.accessToken,
      connectedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/poster/webhook", async (req, res) => {
  try {
    const incomingSecret = req.header("x-poster-webhook-secret") || req.header("x-webhook-secret") || "";
    if (config.poster.webhookSecret && incomingSecret !== config.poster.webhookSecret) {
      return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
    }

    const event = normalizePosterWebhookPayload(req.body || {});
    const transactionId = getTransactionId(event);
    const accountId = String(event?.account_id || event?.account || event?.accountId || "").trim() || null;
    let transactionDetail = null;

    if (transactionId && accountId) {
      const accessToken = await persistSafely("Poster access token", () =>
        resolvePosterAccessToken({ accountId, posterService, persistence })
      );

      if (accessToken) {
        transactionDetail = await persistSafely("Poster transaction detail", () =>
          posterService.getTransactionDetails({
            accountId,
            accessToken,
            transactionId
          })
        );
      }
    }

    if (!transactionId) {
      if (persistence.enabled) {
        await persistSafely("Supabase ticket log", () =>
          persistence.insertTicketLog({
            event,
            transactionId: event?.data?.id || event?.id || "unknown",
            status: "missing-transaction-id"
          })
        );
      }
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "missing-transaction-id"
      });
    }

    let savedTicket = null;
    if (persistence.enabled) {
      savedTicket = await persistSafely("Supabase ticket log", () =>
        persistence.insertTicketLog({
          event,
          transactionId,
          transactionDetail,
          status: "received"
        })
      );
    }

    if (persistence.enabled && savedTicket?.id && accountId) {
      const accessToken = await persistSafely("Poster access token", () =>
        resolvePosterAccessToken({ accountId, posterService, persistence })
      );

      if (accessToken) {
        const transactionProducts = await persistSafely("Poster transaction products", () =>
          posterService.getTransactionProducts({
            accountId,
            accessToken,
            transactionId
          })
        );

        if (Array.isArray(transactionProducts) && transactionProducts.length > 0) {
          const categoryIds = [...new Set(transactionProducts.map((item) => item.category_id).filter((value) => value != null))];
          const categoryMap = new Map();

          for (const categoryId of categoryIds) {
            const category = await persistSafely("Poster category detail", () =>
              posterService.getCategoryDetails({
                accountId,
                accessToken,
                categoryId
              })
            );

            if (category) {
              categoryMap.set(String(categoryId), category.category_name || category.name || null);
            }
          }

          const enrichedItems = transactionProducts.map((item) => ({
            ...item,
            category_name: item.category_id != null ? categoryMap.get(String(item.category_id)) || null : null
          }));

          await persistSafely("Supabase ticket items", () =>
            persistence.upsertTicketItems({
              ticketId: savedTicket.id,
              posterTicketId: transactionId,
              items: mapTicketItems({
                ticket: savedTicket,
                items: enrichedItems
              })
            })
          );
        }
      }
    }

    const alreadyProcessed = await processedSaleStore.get(transactionId);
    if (alreadyProcessed) {
      if (persistence.enabled) {
        await persistSafely("Supabase ticket log", () =>
          persistence.insertTicketLog({
            event,
            transactionId,
            transactionDetail,
            invoiceId: alreadyProcessed.invoiceId || null,
            status: "duplicate"
          })
        );
      }
      return res.status(200).json({ ok: true, duplicate: true, invoiceId: alreadyProcessed.invoiceId || null });
    }

    if (!isInvoiceRequested(event)) {
      await processedSaleStore.set(transactionId, {
        skipped: true,
        reason: "invoice-not-requested",
        processedAt: new Date().toISOString()
      });
      if (persistence.enabled) {
        await persistSafely("Supabase ticket log", () =>
          persistence.insertTicketLog({
            event,
            transactionId,
            transactionDetail,
            status: "invoice-not-requested"
          })
        );
      }
      return res.status(200).json({ ok: true, skipped: true, reason: "invoice-not-requested" });
    }

    const invoicePayload = mapToFacturamaInvoice({ webhookPayload: event, config: config.facturama });
    const invoice = await facturamaService.createInvoice(invoicePayload);

    await processedSaleStore.set(transactionId, {
      processedAt: new Date().toISOString(),
      invoiceId: invoice?.Id || invoice?.id || null,
      invoice
    });
    if (persistence.enabled) {
      await persistSafely("Supabase ticket log", () =>
        persistence.insertTicketLog({
          event,
          transactionId,
          transactionDetail,
          invoiceId: invoice?.Id || invoice?.id || null,
          status: "invoiced"
        })
      );
    }

    return res.status(201).json({
      ok: true,
      transactionId,
      invoiceId: invoice?.Id || invoice?.id || null
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/poster/webhook", async (_req, res) => {
  return res.status(200).json({ ok: true, endpoint: "poster-webhook" });
});

app.listen(config.port, () => {
  console.log(`Poster-Facturama middleware listening on port ${config.port}`);
});
