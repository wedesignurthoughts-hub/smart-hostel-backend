require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET;

/* ================= DATABASE ================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ================= SEND OTP ================= */
app.post("/api/v1/send-otp", async (req, res) => {
  try {
    const phone = String(req.body.phone || "")
      .replace(/\D/g, "")
      .slice(-10);

    if (phone.length !== 10) {
      return res.status(400).json({ message: "Invalid phone" });
    }

    const otp = "123456"; // DEV OTP
    const expiresAt = Date.now() + 5 * 60 * 1000; // BIGINT

    await pool.query(
      `
      INSERT INTO otp (phone, otp, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (phone)
      DO UPDATE SET otp = $2, expires_at = $3
      `,
      [phone, otp, expiresAt]
    );

    console.log("OTP SENT:", phone, otp, expiresAt);
    res.json({ success: true });
  } catch (err) {
    console.error("SEND OTP ERROR:", err.message);
    res.status(500).json({ message: "OTP failed" });
  }
});

/* ================= VERIFY OTP ================= */
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

    const dbOtp = rows[0].otp;
    const dbExpires = Number(rows[0].expires_at);

    console.log("DB OTP:", dbOtp);
    console.log("REQ OTP:", otp);
    console.log("DB EXPIRES:", dbExpires);
    console.log("NOW:", Date.now());

    if (Date.now() > dbExpires) {
      await pool.query("DELETE FROM otp WHERE phone=$1", [phone]);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (dbOtp !== otp) {
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

    const token = jwt.sign({ phone }, JWT_SECRET, { expiresIn: "30d" });

    res.json({
      success: true,
      token,
      subscriptionActive: false,
    });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err.message);
    res.status(500).json({ message: "Verification failed" });
  }
});

/* ================= START ================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
