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

function pickFirstValue(object, keys) {
  for (const key of keys) {
    if (object[key] !== undefined) {
      return object[key];
    }
  }
  return undefined;
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
      async getTicketByNumber() {
        return null;
      },
      async getTicketItemsByTicketId() {
        return [];
      },
      async markTicketInvoiced() {
        return null;
      },
      async createInvoiceRequest() {
        return null;
      },
      async createInvoiceRecord() {
        return null;
      },
      async insertTicketLog() {
        return null;
      },
      async upsertTicketItems() {
        return [];
      }
    };
  }

  const client = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  const tableColumnsCache = new Map();

  async function getTableColumns(tableName) {
    if (tableColumnsCache.has(tableName)) {
      return tableColumnsCache.get(tableName);
    }

    const { data, error } = await client
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", tableName);

    if (error) {
      throw new Error(`Supabase schema read failed for ${tableName}: ${error.message}`);
    }

    const columns = new Set((data || []).map((row) => row.column_name));
    tableColumnsCache.set(tableName, columns);
    return columns;
  }

  async function insertAdaptiveRecord({ tableName, payload, aliases = {} }) {
    const columns = await getTableColumns(tableName);
    const row = {};

    for (const columnName of columns) {
      const candidateKeys = aliases[columnName] || [columnName];
      const value = pickFirstValue(payload, candidateKeys);
      if (value !== undefined) {
        row[columnName] = value;
      }
    }

    if (Object.keys(row).length === 0) {
      throw new Error(`Supabase ${tableName} write failed: no compatible columns found for payload`);
    }

    const { data, error } = await client
      .from(tableName)
      .insert(row)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(`Supabase ${tableName} write failed: ${error.message}`);
    }

    return data || row;
  }

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
    async getTicketByNumber(ticketNumber) {
      const normalizedTicketNumber = String(ticketNumber || "").trim();
      if (!normalizedTicketNumber) {
        return null;
      }

      const { data, error } = await client
        .from("tickets")
        .select("*")
        .eq("ticket_number", normalizedTicketNumber)
        .maybeSingle();

      if (error) {
        throw new Error(`Supabase tickets read failed: ${error.message}`);
      }

      return data || null;
    },
    async getTicketItemsByTicketId(ticketId) {
      const normalizedTicketId = String(ticketId || "").trim();
      if (!normalizedTicketId) {
        return [];
      }

      const { data, error } = await client
        .from("ticket_items")
        .select("*")
        .eq("ticket_id", normalizedTicketId)
        .order("product_name", { ascending: true });

      if (error) {
        throw new Error(`Supabase ticket_items read failed: ${error.message}`);
      }

      return data || [];
    },
    async markTicketInvoiced({ ticketId, invoiceId }) {
      const normalizedTicketId = String(ticketId || "").trim();
      if (!normalizedTicketId) {
        return null;
      }

      const patch = {
        invoice_id: invoiceId || null,
        status: "invoiced",
        updated_at: new Date().toISOString()
      };

      const { data, error } = await client
        .from("tickets")
        .update(patch)
        .eq("id", normalizedTicketId)
        .select("*")
        .maybeSingle();

      if (error) {
        throw new Error(`Supabase tickets update failed: ${error.message}`);
      }

      return data || null;
    },
    async createInvoiceRequest(payload) {
      return insertAdaptiveRecord({
        tableName: "invoice_requests",
        payload,
        aliases: {
          poster_account_id: ["poster_account_id", "account_id"],
          poster_ticket_id: ["poster_ticket_id", "ticket_number"],
          ticket_id: ["ticket_id"],
          ticket_number: ["ticket_number", "poster_ticket_id"],
          rfc: ["rfc", "customer_rfc"],
          customer_rfc: ["customer_rfc", "rfc"],
          customer_name: ["customer_name", "name"],
          name: ["name", "customer_name"],
          fiscal_regime: ["fiscal_regime"],
          tax_zip_code: ["tax_zip_code"],
          cfdi_use: ["cfdi_use"],
          email: ["email"],
          status: ["status"],
          payload: ["payload", "raw_payload", "request_payload"],
          raw_payload: ["raw_payload", "payload", "request_payload"],
          request_payload: ["request_payload", "payload", "raw_payload"]
        }
      });
    },
    async createInvoiceRecord(payload) {
      return insertAdaptiveRecord({
        tableName: "invoices",
        payload,
        aliases: {
          poster_account_id: ["poster_account_id", "account_id"],
          poster_ticket_id: ["poster_ticket_id", "ticket_number"],
          ticket_id: ["ticket_id"],
          ticket_number: ["ticket_number", "poster_ticket_id"],
          invoice_request_id: ["invoice_request_id"],
          facturama_invoice_id: ["facturama_invoice_id", "facturama_id"],
          facturama_id: ["facturama_id", "facturama_invoice_id"],
          facturama_uuid: ["facturama_uuid"],
          uuid: ["facturama_uuid", "uuid"],
          status: ["status"],
          total: ["total"],
          currency: ["currency"],
          payload: ["payload", "raw_payload", "invoice_payload"],
          raw_payload: ["raw_payload", "payload", "invoice_payload"],
          invoice_payload: ["invoice_payload", "raw_payload", "payload"]
        }
      });
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

      const { data, error } = await client
        .from("tickets")
        .upsert(row, {
          onConflict: "poster_ticket_id"
        })
        .select("*")
        .maybeSingle();
      if (!error) {
        return data || row;
      }

      const fallbackRow = {
        poster_ticket_id: row.poster_ticket_id,
        poster_account_id: row.poster_account_id,
        ticket_number: row.ticket_number,
        raw_payload: row.raw_payload,
        total: row.total,
        currency: row.currency
      };
      const fallbackInsert = await client
        .from("tickets")
        .upsert(fallbackRow, {
          onConflict: "poster_ticket_id"
        })
        .select("*")
        .maybeSingle();
      if (fallbackInsert.error) {
        throw new Error(`Supabase tickets write failed: ${fallbackInsert.error.message}`);
      }

      return fallbackInsert.data || fallbackRow;
    },
    async upsertTicketItems({ ticketId, posterTicketId, items }) {
      if (!ticketId || !posterTicketId || !Array.isArray(items) || items.length === 0) {
        return [];
      }

      const rows = items.map((item) => ({
        ticket_id: ticketId,
        poster_ticket_id: String(posterTicketId),
        product_id: String(item.product_id),
        product_name: item.product_name || null,
        category_id: item.category_id != null ? String(item.category_id) : null,
        category_name: item.category_name || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        is_tax_exempt: item.is_tax_exempt,
        tax_rate: item.tax_rate,
        raw_payload: item.raw_payload || item
      }));

      const { data, error } = await client
        .from("ticket_items")
        .upsert(rows, {
          onConflict: "poster_ticket_id,product_id"
        })
        .select("*");

      if (error) {
        throw new Error(`Supabase ticket_items write failed: ${error.message}`);
      }

      return data || rows;
    }
  };
}

module.exports = { createSupabasePersistence };
