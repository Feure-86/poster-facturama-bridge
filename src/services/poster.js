const querystring = require("querystring");

class PosterService {
  constructor(config, tokenStore) {
    this.config = config;
    this.tokenStore = tokenStore;
  }

  buildAuthorizeUrl(state) {
    const qs = querystring.stringify({
      client_id: this.config.clientId,
      redirect_uri: `${this.config.publicBaseUrl}/poster/oauth/callback`,
      response_type: "code",
      state
    });
    return `${this.config.authorizeUrl}?${qs}`;
  }

  async exchangeCodeForToken({ code, account }) {
    const body = {
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      application_id: this.config.clientId,
      application_secret: this.config.clientSecret,
      redirect_uri: `${this.config.publicBaseUrl}/poster/oauth/callback`,
      code
    };

    if (account) {
      body.account = account;
    }

    const endpoints = [
      this.config.tokenUrl,
      account ? `https://${account}.joinposter.com/api/access_token` : null,
      "https://joinposter.com/api/access_token",
      account ? `https://${account}.joinposter.com/api/v2/auth/access_token` : null,
      "https://joinposter.com/api/v2/auth/access_token"
    ].filter(Boolean);

    const errors = [];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: querystring.stringify(body)
        });

        const text = await response.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch (_) {
          payload = { raw: text };
        }

        const normalized = payload?.response || payload?.data || payload || {};
        if (response.ok && normalized.access_token) {
          return normalized;
        }

        errors.push({ endpoint, status: response.status, payload });
      } catch (error) {
        errors.push({ endpoint, error: error.message });
      }
    }

    throw new Error(`Poster token exchange failed: ${JSON.stringify(errors)}`);
  }

  async saveInstallation({ accountId, payload }) {
    const storageKey =
      String(accountId || payload.account_id || payload.accountId || payload.account || payload.account_name || "")
        .trim() || "default";

    const value = {
      accessToken: payload.access_token || "",
      refreshToken: payload.refresh_token || "",
      tokenType: payload.token_type || "Bearer",
      expiresIn: payload.expires_in || null,
      scope: payload.scope || "",
      storageKey,
      createdAt: new Date().toISOString()
    };

    await this.tokenStore.set(storageKey, value);
    return value;
  }

  async getSavedInstallation(accountId) {
    if (!accountId) {
      return null;
    }

    return this.tokenStore.get(String(accountId).trim());
  }

  async getTransactionDetails({ accountId, accessToken, transactionId }) {
    if (!accessToken) {
      throw new Error("Missing Poster access token");
    }

    if (!transactionId) {
      throw new Error("Missing Poster transaction id");
    }

    const qs = querystring.stringify({
      token: accessToken,
      transaction_id: transactionId,
      include_products: true,
      include_history: true,
      include_delivery: true
    });

    const endpoints = [
      accountId ? `https://${accountId}.joinposter.com/api/dash.getTransaction` : null,
      "https://joinposter.com/api/dash.getTransaction"
    ].filter(Boolean);

    const payload = await this.fetchFromEndpoints(endpoints, qs, "Poster transaction fetch failed");
    const normalized = payload?.response || payload?.data || payload;
    const transaction = Array.isArray(normalized) ? normalized[0] : normalized;
    if (transaction && typeof transaction === "object") {
      return transaction;
    }

    throw new Error(`Poster transaction fetch returned no transaction: ${JSON.stringify(payload)}`);
  }

  async getTransactionProducts({ accountId, accessToken, transactionId }) {
    const qs = querystring.stringify({
      token: accessToken,
      transaction_id: transactionId
    });

    const endpoints = [
      accountId ? `https://${accountId}.joinposter.com/api/dash.getTransactionProducts` : null,
      "https://joinposter.com/api/dash.getTransactionProducts"
    ].filter(Boolean);

    const payload = await this.fetchFromEndpoints(endpoints, qs, "Poster transaction products fetch failed");
    const normalized = payload?.response || payload?.data || payload;
    return Array.isArray(normalized) ? normalized : normalized ? [normalized] : [];
  }

  async getCategoryDetails({ accountId, accessToken, categoryId }) {
    const qs = querystring.stringify({
      token: accessToken,
      category_id: categoryId
    });

    const endpoints = [
      accountId ? `https://${accountId}.joinposter.com/api/menu.getCategory` : null,
      "https://joinposter.com/api/menu.getCategory"
    ].filter(Boolean);

    const payload = await this.fetchFromEndpoints(endpoints, qs, "Poster category fetch failed");
    const normalized = payload?.response || payload?.data || payload;
    return Array.isArray(normalized) ? normalized[0] || null : normalized || null;
  }

  async fetchFromEndpoints(endpoints, qs, errorPrefix) {
    const errors = [];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${endpoint}?${qs}`, {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        });

        const text = await response.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch (_) {
          payload = { raw: text };
        }

        if (!response.ok) {
          errors.push({ endpoint, status: response.status, payload });
          continue;
        }

        return payload;
      } catch (error) {
        errors.push({ endpoint, error: error.message });
      }
    }

    throw new Error(`${errorPrefix}: ${JSON.stringify(errors)}`);
  }
}

module.exports = { PosterService };
