require("dotenv").config({ path: "env.txt" });

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_later";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: false
});

/* ---------- HEALTH ---------- */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ---------- SEND OTP ---------- */
app.post("/api/v1/send-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone || phone.length < 10) {
    return res.status(400).json({ error: "Invalid phone number" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await pool.query("DELETE FROM otp_requests WHERE phone = $1", [phone]);

  await pool.query(
    "INSERT INTO otp_requests (phone, otp_hash, expires_at) VALUES ($1,$2,$3)",
    [phone, otpHash, expiresAt]
  );

  console.log("DEV OTP (remove later):", otp);

  res.json({ success: true });
});

/* ---------- VERIFY OTP ---------- */
app.post("/api/v1/verify-otp", (req, res) => {
  console.log("VERIFY OTP HIT:", req.body);

  const { phone, otp } = req.body;

  const record = otpStore.get(phone);
  if (!record) {
    return res.status(400).json({ message: "OTP not found" });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ message: "OTP expired" });
  }

  if (otp !== record.otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  otpStore.delete(phone);

  let user = users.get(phone);

  // First-time user → start trial
  if (!user) {
    const trialEndsAt =
        Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000;

    user = {
      phone,
      trialEndsAt,
      subscriptionActive: true,
    };

    users.set(phone, user);
  }

  const now = Date.now();
  const accessAllowed = user.subscriptionActive && now < user.trialEndsAt;

  return res.json({
    success: true,
    accessAllowed,
    trialEndsAt: user.trialEndsAt,
  });
});

// TEMP: in-memory OTP store (for development only)
const otpStore = new Map();

/**
 * SEND OTP (mock)
 */
app.post("/api/v1/send-otp", (req, res) => {
  const { phone } = req.body;

  if (!phone || phone.length !== 10) {
    return res.status(400).json({ message: "Invalid phone number" });
  }
// TEMP user store (replace with DB later)
const users = new Map();

const TRIAL_DAYS = 7;


  // Mock OTP
  const otp = "123456";

  otpStore.set(phone, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
  });

  console.log(`Mock OTP for ${phone}: ${otp}`);

  return res.json({
    success: true,
    message: "OTP sent",
  });
});

/**
 * VERIFY OTP
 */
app.post("/api/v1/verify-otp", (req, res) => {
  const { phone, otp } = req.body;

  const record = otpStore.get(phone);
  if (!record) {
    return res.status(400).json({ message: "OTP not found" });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ message: "OTP expired" });
  }

  if (otp !== record.otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  otpStore.delete(phone);

  let user = users.get(phone);

  // First-time user → start trial
  if (!user) {
    const trialEndsAt =
        Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000;

    user = {
      phone,
      trialEndsAt,
      subscriptionActive: true,
    };

    users.set(phone, user);
  }

  const now = Date.now();
  const accessAllowed = user.subscriptionActive && now < user.trialEndsAt;

  return res.json({
    success: true,
    accessAllowed,
    trialEndsAt: user.trialEndsAt,
  });
});



/* ---------- START ---------- */
// ---- SERVER START ----
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
