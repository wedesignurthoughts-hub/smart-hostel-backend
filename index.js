require("dotenv").config({ path: "env.txt" });

const express = require("express");
const app = express();

app.use(express.json());
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET";
const JWT_EXPIRY = "30d";

// 🔐 JWT AUTH MIDDLEWARE
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}



const PORT = 4000;
const TRIAL_DAYS = 7;

// In-memory stores (DEV ONLY)
const otpStore = new Map();
const users = new Map();

/* ---------- HEALTH ---------- */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ---------- SEND OTP ---------- */
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

/* ---------- VERIFY OTP ---------- */
app.post("/api/v1/verify-otp", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(-10);
  const otp = String(req.body.otp || "");

  console.log("VERIFY HIT");
  console.log("REQ PHONE:", req.body.phone);
  console.log("NORMALIZED PHONE:", phone);
  console.log("OTP ENTERED:", otp);
  console.log("OTP STORE KEYS:", Array.from(otpStore.keys()));

  const record = otpStore.get(phone);

  if (!record) {
    return res.status(400).json({ message: "OTP not found" });
  }
});

// 🔒 PROTECTED DASHBOARD (JWT REQUIRED)
app.get("/api/v1/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Welcome to dashboard",
    phone: req.user.phone,
  });
});



/* ---------- START ---------- */
app.listen(4000, "0.0.0.0", () => {
  console.log("Server running on port 4000");
});

