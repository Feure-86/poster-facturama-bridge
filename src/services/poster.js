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
}

module.exports = { PosterService };
