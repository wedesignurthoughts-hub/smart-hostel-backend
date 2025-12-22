require("dotenv").config({ path: "env.txt" });

const express = require("express");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const PORT = 4000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET";
const JWT_EXPIRY = "30d";

/* ===============================
   IN-MEMORY STORES (DEV ONLY)
   =============================== */
const otpStore = new Map();      // phone -> { otp, expiresAt }
const users = new Map();         // phone -> { phone, subscriptionActive }

/* ===============================
   HEALTH CHECK
   =============================== */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ===============================
   SEND OTP
   =============================== */
app.post("/api/v1/send-otp", (req, res) => {
  const phone = String(req.body.phone || "")
    .replace(/\D/g, "")
    .slice(-10);

  if (phone.length !== 10) {
    return res.status(400).json({ message: "Invalid phone number" });
  }

  const otp = "123456"; // DEV OTP
  otpStore.set(phone, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  console.log("SEND OTP:", phone, otp);

  return res.json({ success: true });
});

/* ===============================
   VERIFY OTP
   =============================== */
app.post("/api/v1/verify-otp", (req, res) => {
  const phone = String(req.body.phone || "")
    .replace(/\D/g, "")
    .slice(-10);

  const otp = String(req.body.otp || "");

  console.log("VERIFY HIT:", phone, otp);

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

  // OTP SUCCESS
  otpStore.delete(phone);

  // Create or fetch user
  let user = users.get(phone);
  if (!user) {
    user = {
      phone,
      subscriptionActive: false, // ❌ NO FREE TRIAL
    };
    users.set(phone, user);
  }

  // Create JWT
  const token = jwt.sign(
    { phone },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return res.json({
    success: true,
    token,
    subscriptionActive: user.subscriptionActive,
  });
});

/* ===============================
   JWT AUTH MIDDLEWARE
   =============================== */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/* ===============================
   PROTECTED DASHBOARD
   =============================== */
app.get("/api/v1/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Welcome to dashboard",
    phone: req.user.phone,
  });
});

/* ===============================
   START SERVER
   =============================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
