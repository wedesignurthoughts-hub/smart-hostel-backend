require("dotenv").config({ path: "env.txt" });

const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = 4000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = "30d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

/* ===============================
   POSTGRES CONNECTION
   =============================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ===============================
   HEALTH
   =============================== */
app.get("/health", async (req, res) => {
  const r = await pool.query("SELECT 1");
  res.json({ ok: true, db: true });
});

/* ===============================
   SEND OTP (STORE IN DB)
   =============================== */
app.post("/api/v1/send-otp", async (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(-10);
  if (phone.length !== 10) {
    return res.status(400).json({ message: "Invalid phone" });
  }

  const otp = "123456"; // DEV OTP
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

  console.log("SEND OTP:", phone, otp);
  res.json({ success: true });
});

/* ===============================
   VERIFY OTP
   =============================== */
app.post("/api/v1/verify-otp", async (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(-10);
  const otp = String(req.body.otp || "");

  const result = await pool.query(
    "SELECT otp, expires_at FROM otp WHERE phone = $1",
    [phone]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ message: "OTP not found" });
  }

  const record = result.rows[0];

  if (new Date() > record.expires_at) {
    return res.status(400).json({ message: "OTP expired" });
  }

  if (record.otp !== otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  // OTP verified → delete OTP
  await pool.query("DELETE FROM otp WHERE phone = $1", [phone]);

  // Create user if not exists
  const userResult = await pool.query(
    `
    INSERT INTO users (phone, subscription_active)
    VALUES ($1, false)
    ON CONFLICT (phone) DO NOTHING
    RETURNING *
    `,
    [phone]
  );

  const user =
    userResult.rows[0] ||
    (
      await pool.query(
        "SELECT * FROM users WHERE phone = $1",
        [phone]
      )
    ).rows[0];

  const token = jwt.sign({ phone }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

  res.json({
    success: true,
    token,
    subscriptionActive: user.subscription_active,
  });
});

/* ===============================
   JWT MIDDLEWARE
   =============================== */
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    req.user = jwt.verify(auth.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

/* ===============================
   DASHBOARD
   =============================== */
app.get("/api/v1/dashboard", authMiddleware, (req, res) => {
  res.json({ message: "Welcome", phone: req.user.phone });
});

/* ===============================
   START
   =============================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
