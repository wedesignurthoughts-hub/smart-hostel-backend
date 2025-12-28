require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = "30d";

if (!PORT) throw new Error("PORT missing");
if (!JWT_SECRET) throw new Error("JWT_SECRET missing");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");

/* ===============================
   POSTGRES (LAZY SAFE)
================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ===============================
   HEALTH — NO DATABASE
================================ */
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

/* ===============================
   SEND OTP
================================ */
app.post("/api/v1/send-otp", async (req, res) => {
  try {
    const phone = String(req.body.phone || "")
      .replace(/\D/g, "")
      .slice(-10);

    if (phone.length !== 10) {
      return res.status(400).json({ message: "Invalid phone" });
    }

    const otp = "123456";
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `
      INSERT INTO otp (phone, otp, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (phone)
      DO UPDATE SET otp = $2, expires_at = $3
      `,
      [phone, otp, expiresAt]
    );

    console.log("OTP SENT:", phone, otp);
    res.json({ success: true });
  } catch (err) {
    console.error("SEND OTP ERROR:", err);
    res.status(500).json({ message: "OTP failed" });
  }
});

/* ===============================
   VERIFY OTP
================================ */
app.post("/api/v1/verify-otp", async (req, res) => {
  try {
    const phone = String(req.body.phone || "")
      .replace(/\D/g, "")
      .slice(-10);
    const otp = String(req.body.otp || "");

    const { rows } = await pool.query(
      "SELECT otp, expires_at FROM otp WHERE phone=$1",
      [phone]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "OTP not found" });
    }

    if (new Date() > rows[0].expires_at) {
      await pool.query("DELETE FROM otp WHERE phone=$1", [phone]);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (rows[0].otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await pool.query("DELETE FROM otp WHERE phone=$1", [phone]);

    await pool.query(
      `
      INSERT INTO users (phone, subscription_active)
      VALUES ($1, false)
      ON CONFLICT (phone) DO NOTHING
      `,
      [phone]
    );

    const token = jwt.sign({ phone }, JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });

    res.json({
      success: true,
      token,
      subscriptionActive: false,
    });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({ message: "Verification failed" });
  }
});

/* ===============================
   START SERVER
================================ */
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
