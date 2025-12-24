
require("dotenv").config({ path: "env.txt" });

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
const express = require("express");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = 4000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = "30d";

/* ===============================
   RAZORPAY INSTANCE
================================ */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ===============================
   IN-MEMORY STORES (DEV ONLY)
================================ */
const otpStore = new Map();     // phone → { otp, expiresAt }


/* ===============================
   HEALTH
================================ */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ===============================
   SEND OTP
================================ */
app.post("/api/v1/send-otp", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(-10);

  if (phone.length !== 10) {
    return res.status(400).json({ message: "Invalid phone" });
  }

  const otp = "123456"; // DEV OTP
  otpStore.set(phone, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  console.log("SEND OTP:", phone, otp);
  res.json({ success: true });
});

/* ===============================
   VERIFY OTP
================================ */
app.post("/api/v1/verify-otp", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(-10);
  const otp = String(req.body.otp || "");

  const record = otpStore.get(phone);
  if (!record) return res.status(400).json({ message: "OTP not found" });
  if (Date.now() > record.expiresAt)
    return res.status(400).json({ message: "OTP expired" });
  if (otp !== record.otp)
    return res.status(400).json({ message: "Invalid OTP" });

  otpStore.delete(phone);

  let user = users.get(phone);
  if (!user) {
    user = { phone, subscriptionActive: false };
    users.set(phone, user);
  }

  const token = jwt.sign({ phone }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

  res.json({
    success: true,
    token,
    subscriptionActive: user.subscriptionActive,
  });
});

/* ===============================
   CREATE RAZORPAY ORDER
================================ */
app.post("/api/v1/create-order", async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!amount || amount < 1) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // ₹ → paise
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    });

    console.log("ORDER CREATED:", order.id);
    res.json(order);
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ message: "Order creation failed" });
  }
});

/* ===============================
   VERIFY PAYMENT
================================ */
app.post("/api/v1/verify-payment", (req, res) => {
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
    return res.status(400).json({ message: "Invalid payment signature" });
  }

  // ✅ PAYMENT VERIFIED → ACTIVATE SUBSCRIPTION
  let user = users.get(phone);
  if (!user) user = { phone };

  user.subscriptionActive = true;
  users.set(phone, user);

  console.log("PAYMENT VERIFIED FOR:", phone);
  res.json({ success: true });
});

/* ===============================
   JWT AUTH
================================ */
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return res.status(401).json({ message: "Unauthorized" });

  try {
    const token = auth.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/* ===============================
   DASHBOARD
================================ */
app.get("/api/v1/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Welcome to dashboard",
    phone: req.user.phone,
  });
});

/* ===============================
   START
================================ */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
