require("dotenv").config({ path: "env.txt" });

const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_later";
const JWT_EXPIRY = "30d";

/* ===============================
   POSTGRES CONNECTION
   IMPORTANT: DO NOT CRASH SERVER
================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

pool.on("error", (err) => {
  console.error("Postgres error:", err.message);
});

/* ===============================
   HEALTH CHECK
================================ */
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true });
  } catch (e) {
    res.json({ ok: true, db: false });
  }
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
      return res.status(400).json({ message: "Invalid phone number" });
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
  } catch (err) {
    console.error("SEND OTP ERROR:", err.message);
    res.status(500).json({ message: "Failed to send OTP" });
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

    const result = await pool.query(
      "SELECT otp, expires_at FROM otp WHERE phone = $1",
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "OTP not found" });
    }

    const record = result.rows[0];

    if (new Date() > record.expires_at) {
      await pool.query("DELETE FROM otp WHERE phone = $1", [phone]);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP verified
    await pool.query("DELETE FROM otp WHERE phone = $1", [phone]);

    // Create user if not exists (NO FREE TRIAL)
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
    console.error("VERIFY OTP ERROR:", err.message);
    res.status(500).json({ message: "Verification failed" });
  }
});

/* ===============================
   JWT MIDDLEWARE
================================ */
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = auth.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
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
   START SERVER
================================ */
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
