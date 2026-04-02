const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const required = [
  "PUBLIC_BASE_URL",
  "POSTER_CLIENT_ID",
  "POSTER_CLIENT_SECRET",
  "FACTURAMA_BASE_URL",
  "FACTURAMA_USERNAME",
  "FACTURAMA_PASSWORD"
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

const config = {
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL.replace(/\/$/, ""),
  dataDir: path.resolve(process.cwd(), "data"),
  poster: {
    clientId: process.env.POSTER_CLIENT_ID,
    clientSecret: process.env.POSTER_CLIENT_SECRET,
    authorizeUrl: process.env.POSTER_OAUTH_AUTHORIZE_URL || "https://joinposter.com/api/auth",
    tokenUrl: process.env.POSTER_OAUTH_TOKEN_URL || "https://joinposter.com/api/access_token",
    webhookSecret: process.env.POSTER_WEBHOOK_SECRET || ""
  },
  facturama: {
    baseUrl: process.env.FACTURAMA_BASE_URL.replace(/\/$/, ""),
    username: process.env.FACTURAMA_USERNAME,
    password: process.env.FACTURAMA_PASSWORD,
    apiPath: process.env.FACTURAMA_API_PATH || "/3/cfdis",
    defaults: {
      serie: process.env.FACTURAMA_SERIE || "A",
      currency: process.env.FACTURAMA_CURRENCY || "MXN",
      expeditionPlace: process.env.FACTURAMA_EXPEDITION_PLACE || ""
    }
  }
};

module.exports = { config };
