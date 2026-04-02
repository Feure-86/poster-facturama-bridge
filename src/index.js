const express = require("express");
const path = require("path");

const { config } = require("./config");
const { JsonStore } = require("./storage");
const { PosterService } = require("./services/poster");
const { FacturamaService } = require("./services/facturama");
const { createSupabasePersistence } = require("./supabase");
const { getTransactionId, isInvoiceRequested, mapToFacturamaInvoice } = require("./mappers/posterToFacturama");
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

    const event = req.body || {};
    const transactionId = getTransactionId(event);

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

    const alreadyProcessed = await processedSaleStore.get(transactionId);
    if (alreadyProcessed) {
      if (persistence.enabled) {
        await persistSafely("Supabase ticket log", () =>
          persistence.insertTicketLog({
            event,
            transactionId,
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
