class FacturamaService {
  constructor(config) {
    this.config = config;
  }

  async createInvoice(invoicePayload) {
    const endpoint = `${this.config.baseUrl}${this.config.apiPath}`;
    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(invoicePayload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Facturama invoice failed (${response.status}): ${text}`);
    }

    return response.json();
  }
}

module.exports = { FacturamaService };
