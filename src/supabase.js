const { createClient } = require("@supabase/supabase-js");

function buildScopes(scopeValue) {
  if (!scopeValue) {
    return [];
  }

  if (Array.isArray(scopeValue)) {
    return scopeValue.map((value) => String(value)).filter(Boolean);
  }

  return String(scopeValue)
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function centsToAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Number((number / 100).toFixed(2));
}

function createSupabasePersistence(config) {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    return {
      enabled: false,
      async savePosterConnection() {
        return null;
      },
      async getPosterConnection() {
        return null;
      },
      async insertTicketLog() {
        return null;
      }
    };
  }

  const client = createClient(config.supabase.url, config.supabase.serviceRoleKey);

  return {
    enabled: true,
    async savePosterConnection({ accountId, payload }) {
      const normalizedAccountId =
        String(accountId || payload.account_id || payload.accountId || payload.account || payload.user_id || "")
          .trim() || null;

      const row = {
        poster_account_id: normalizedAccountId,
        access_token: payload.access_token || null,
        refresh_token: payload.refresh_token || null,
        token_expires_at: payload.expires_in
          ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString()
          : null,
        scopes: buildScopes(payload.scope)
      };

      const { error } = await client.from("poster_connections").upsert(row, {
        onConflict: "poster_account_id"
      });

      if (!error) {
        return row;
      }

      const fallbackInsert = await client.from("poster_connections").insert(row);
      if (fallbackInsert.error) {
        throw new Error(`Supabase poster_connections write failed: ${fallbackInsert.error.message}`);
      }

      return row;
    },
    async getPosterConnection(accountId) {
      const normalizedAccountId = String(accountId || "").trim();
      if (!normalizedAccountId) {
        return null;
      }

      const { data, error } = await client
        .from("poster_connections")
        .select("poster_account_id, access_token, refresh_token, token_expires_at, scopes")
        .eq("poster_account_id", normalizedAccountId)
        .maybeSingle();

      if (error) {
        throw new Error(`Supabase poster_connections read failed: ${error.message}`);
      }

      return data || null;
    },
    async insertTicketLog({ event, transactionId, invoiceId = null, status = "received", transactionDetail = null }) {
      const total = transactionDetail?.payed_sum
        ? centsToAmount(transactionDetail.payed_sum)
        : Number(event?.total || event?.order?.total || event?.data?.total || 0);
      const accountId = String(event?.account_id || event?.account || event?.accountId || "").trim() || null;
      const normalizedTicketId = String(transactionId || event?.object_id || event?.data?.id || event?.id || "unknown");
      const rawPayload = transactionDetail
        ? {
            webhook: event,
            transaction_detail: transactionDetail
          }
        : event;

      const row = {
        poster_ticket_id: normalizedTicketId,
        poster_account_id: accountId,
        ticket_number: normalizedTicketId,
        raw_payload: rawPayload,
        total,
        currency: event?.currency || "MXN",
        status,
        invoice_id: invoiceId
      };

      const { error } = await client.from("tickets").upsert(row, {
        onConflict: "poster_ticket_id"
      });
      if (!error) {
        return row;
      }

      const fallbackRow = {
        poster_ticket_id: row.poster_ticket_id,
        poster_account_id: row.poster_account_id,
        ticket_number: row.ticket_number,
        raw_payload: row.raw_payload,
        total: row.total,
        currency: row.currency
      };
      const fallbackInsert = await client.from("tickets").upsert(fallbackRow, {
        onConflict: "poster_ticket_id"
      });
      if (fallbackInsert.error) {
        throw new Error(`Supabase tickets write failed: ${fallbackInsert.error.message}`);
      }

      return fallbackRow;
    }
  };
}

module.exports = { createSupabasePersistence };
