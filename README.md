# Poster + Facturama Middleware

Backend API that receives sales events from Poster and creates CFDI invoices in Facturama when invoicing is requested.

## Endpoints for Poster configuration

- OAuth Redirect URL: `https://your-backend-domain.com/poster/oauth/callback`
- Webhook URL: `https://your-backend-domain.com/poster/webhook`
- Connection Code Page: `https://your-backend-domain.com/poster/connect`

## Features

- Poster OAuth installation flow (`/poster/connect` + `/poster/oauth/callback`)
- Poster webhook ingestion (`/poster/webhook`)
- Idempotent invoice generation by transaction ID
- Facturama invoice creation via Basic Auth API
- Supabase-backed storage for Poster connections and ticket logs when configured
- File-based fallback storage for tokens and processed transactions (`data/*.json`)
- Monthly financial reporting endpoint for Workflow 3 (`/reports/monthly`)

## Quick start

1. Install Node.js 18+.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy env template and fill values:
   ```bash
   cp .env.example .env
   ```
4. Run:
   ```bash
   npm start
   ```

## Environment variables

See `.env.example` for full list. Required:

- `PUBLIC_BASE_URL`
- `POSTER_CLIENT_ID`
- `POSTER_CLIENT_SECRET`
- `FACTURAMA_BASE_URL`
- `FACTURAMA_USERNAME`
- `FACTURAMA_PASSWORD`

Optional but recommended for persistent storage:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Notes

- Webhook payload formats differ by Poster event type and account setup.
- Mapping file is `src/mappers/posterToFacturama.js`. Adjust this to match your exact payload and CFDI rules.
- If you set `POSTER_WEBHOOK_SECRET`, the middleware validates either `x-poster-webhook-secret` or `x-webhook-secret` header.
- When Supabase is configured, Poster OAuth connections are upserted into `poster_connections` and webhook payloads are inserted into `tickets`.

## Monthly reporting layer

`POST /reports/monthly`

This endpoint is designed for Workflow 3 of the accounting automation layer. It accepts:

- `journal_entries`
- `daily_sales_summary`
- `chart_of_accounts` (optional; defaults to the Relato Phase 1 chart embedded in the code)

Example request body:

```json
{
  "journal_entries": [
    {
      "date": "2026-02-03",
      "debit_account": "Rent Expense",
      "credit_account": "Banco BBVA Operativo",
      "amount": 12000,
      "description": "February rent"
    }
  ],
  "daily_sales_summary": [
    {
      "date": "2026-02-03",
      "card_sales": 3200,
      "cash_sales": 800,
      "total_sales": 4000,
      "tickets": 52,
      "units_sold": 88
    }
  ]
}
```

The response returns:

- `general_ledger_monthly`
- `income_statement_monthly`
- `income_statement_monthly_detail`
- `balance_sheet_monthly`
- `balance_sheet_monthly_summary`
- `cash_flow_monthly`

Phase 1 assumptions built into the reporting logic:

- Sales revenue comes from `daily_sales_summary.total_sales`.
- Estimated COGS is based on monthly inventory purchases divided by monthly units sold.
- Inventory purchases are journal entries where `debit_account` is `Inventario` or `Inventory`.
- Cash flow only tracks entries that touch `Caja` or `Banco*` accounts.
