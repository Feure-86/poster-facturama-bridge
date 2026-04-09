class FacturamaService {
  constructor(config) {
    this.config = config;
  }

  buildAuthHeader() {
    return `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`;
  }

  async createInvoice(invoicePayload) {
    const endpoint = `${this.config.baseUrl}${this.config.apiPath}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: this.buildAuthHeader(),
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

  async sendInvoiceByEmail({ cfdiType = "issued", cfdiId, email, subject = "", comments = "", issuerEmail = "", includePayBtn = false }) {
    if (!cfdiId || !email) {
      return null;
    }

    const endpoint = new URL(`${this.config.baseUrl}/Cfdi`);
    endpoint.searchParams.set("CfdiType", cfdiType);
    endpoint.searchParams.set("CfdiId", String(cfdiId));
    endpoint.searchParams.set("Email", String(email));
    endpoint.searchParams.set("Subject", subject);
    endpoint.searchParams.set("Comments", comments);
    endpoint.searchParams.set("IssuerEmail", issuerEmail);
    endpoint.searchParams.set("IncludePayBtn", includePayBtn ? "true" : "false");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: this.buildAuthHeader()
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Facturama email failed (${response.status}): ${text}`);
    }

    return response.json();
  }
}

module.exports = { FacturamaService };
