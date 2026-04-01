require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// =========================
// Poster OAuth start
// =========================
app.get("/poster/connect", (req, res) => {
  const redirectUrl = `${process.env.POSTER_BASE_URL}/oauth/authorize?client_id=${process.env.POSTER_CLIENT_ID}&redirect_uri=${process.env.APP_BASE_URL}/poster/oauth/callback`;

  res.redirect(redirectUrl);
});

// =========================
// Poster OAuth callback
// =========================
app.get("/poster/oauth/callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("Missing code");
    }

    const response = await axios.post(
      `${process.env.POSTER_BASE_URL}/oauth/token`,
      {
        grant_type: "authorization_code",
        code,
        client_id: process.env.POSTER_CLIENT_ID,
        client_secret: process.env.POSTER_CLIENT_SECRET,
        redirect_uri: `${process.env.APP_BASE_URL}/poster/oauth/callback`,
      }
    );

    const data = response.data;

    await supabase.from("poster_connections").upsert({
      poster_account_id: data.account_id,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      raw_oauth_payload: data,
    });

    res.send("Poster connected successfully ✅");
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("OAuth error");
  }
});

// =========================
// Poster webhook
// =========================
app.post("/poster/webhook", async (req, res) => {
  try {
    const payload = req.body;

    console.log("Webhook received:", payload);

    // Store ticket
    await supabase.from("tickets").insert({
      poster_ticket_id: payload?.data?.id || "unknown",
      poster_account_id: payload?.account_id || "unknown",
      raw_payload: payload,
      total: payload?.data?.total || 0,
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).send("Webhook error");
  }
});

// =========================
// Start server
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
