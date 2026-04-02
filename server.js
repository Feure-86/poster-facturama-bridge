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
 const redirectUrl = `https://joinposter.com/api/v2/auth?response_type=code&client_id=${process.env.POSTER_CLIENT_ID}&redirect_uri=${process.env.APP_BASE_URL}/poster/oauth/callback`;
  res.redirect(redirectUrl);
});

// =========================
// Poster OAuth callback
// =========================
app.get("/poster/oauth/callback", async (req, res) => {
  try {
    const { code, account } = req.query;

    if (!code) {
      return res.status(400).send("Missing code");
    }

    if (!account) {
      return res.status(400).send("Missing account");
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

  const { error } = await supabase
  .from("poster_connections")
  .upsert(
    {
      poster_account_id: account,
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      token_expires_at: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      raw_oauth_payload: data,
    },
    {
      onConflict: "poster_account_id",
    }
  );

if (error) {
  console.error("Supabase upsert error:", error);
  return res.status(500).send("Failed to save Poster connection");
}

    res.send("Poster connected successfully ✅");
  } catch (error) {
    console.error("OAuth error:", error.response?.data || error.message);
    res.status(500).send("OAuth error");
  }
});

// =========================
// Poster webhook
// =========================
app.post("/poster/webhook", async (req, res) => {
  try {
    const payload = req.body;

    console.log("Webhook received:", JSON.stringify(payload, null, 2));

    const { error } = await supabase.from("tickets").insert({
      poster_ticket_id: String(payload?.data?.id || "unknown"),
      poster_account_id: String(payload?.account_id || payload?.account || "unknown"),
      raw_payload: payload,
      total: payload?.data?.total || 0,
    });

    if (error) {
      console.error("Supabase ticket insert error:", error);
      return res.status(500).send("Webhook DB error");
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
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
