require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

/* ================= DATABASE ================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ================= RAZORPAY ================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
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
    const expiresAt = Date.now() + 5 * 60 * 1000; // BIGINT (ms)

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

/* ================= VERIFY OTP ================= */
app.post("/api/v1/verify-otp", async (req, res) => {
  try {
    const phone = String(req.body.phone || "")
      .replace(/\D/g, "")
      .slice(-10);

    const otp = String(req.body.otp || "");

    const { rows } = await pool.query(
      "SELECT otp, expires_at FROM otp WHERE phone = $1",
      [phone]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "OTP not found" });
    }

    const dbOtp = rows[0].otp;
    const dbExpires = Number(rows[0].expires_at);

    if (Date.now() > dbExpires) {
      await pool.query("DELETE FROM otp WHERE phone = $1", [phone]);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (dbOtp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await pool.query("DELETE FROM otp WHERE phone = $1", [phone]);

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
    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({ message: "Verification failed" });
  }
});

/* ================= CREATE ORDER ================= */
app.post("/api/v1/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ message: "Amount required" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    });

    res.json(order);
  } catch (err) {
    console.error("ORDER ERROR:", err);
    res.status(500).json({ message: "Order creation failed" });
  }
});

/* ================= VERIFY PAYMENT ================= */
app.post("/api/v1/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      phone,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    // ✅ ACTIVATE SUBSCRIPTION
    await pool.query(
      "UPDATE users SET subscription_active = true WHERE phone = $1",
      [phone]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ message: "Payment verification failed" });
  }
});

/* ================= START ================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
