require("dotenv").config({ path: "env.txt" });

const express = require("express");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET";
const JWT_EXPIRY = "30d";

/* ===============================
   SQLITE DATABASE
   =============================== */
const db = new sqlite3.Database("./data.db");

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      phone TEXT PRIMARY KEY,
      subscription_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS otp (
      phone TEXT PRIMARY KEY,
      otp TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
});

/* ===============================
   HEALTH
   =============================== */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ===============================
   SEND OTP
   =============================== */
app.post("/api/v1/send-otp", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(-10);

  if (phone.length !== 10) {
    return res.status(400).json({ message: "Invalid phone" });
  }

  const otp = "123456"; // DEV OTP
  const expiresAt = Date.now() + 5 * 60 * 1000;

  db.run(
    `
    INSERT INTO otp (phone, otp, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(phone)
    DO UPDATE SET otp = ?, expires_at = ?
    `,
    [phone, otp, expiresAt, otp, expiresAt],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "DB error" });
      }

      console.log("SEND OTP:", phone, otp);
      res.json({ success: true });
    }
  );
});

/* ===============================
   VERIFY OTP
   =============================== */
app.post("/api/v1/verify-otp", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(-10);
  const otp = String(req.body.otp || "");

  db.get(
    "SELECT * FROM otp WHERE phone = ?",
    [phone],
    (err, record) => {
      if (err || !record) {
        return res.status(400).json({ message: "OTP not found" });
      }

      if (Date.now() > record.expires_at) {
        return res.status(400).json({ message: "OTP expired" });
      }

      if (record.otp !== otp) {
        return res.status(400).json({ message: "Invalid OTP" });
      }

      // Delete OTP
      db.run("DELETE FROM otp WHERE phone = ?", [phone]);

      // Create user if not exists
      db.run(
        `
        INSERT OR IGNORE INTO users (phone, subscription_active)
        VALUES (?, 0)
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
    }
  );
});

/* ===============================
   JWT MIDDLEWARE
   =============================== */
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    req.user = jwt.verify(auth.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/* ===============================
   DASHBOARD
   =============================== */
app.get("/api/v1/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Welcome",
    phone: req.user.phone,
  });
});

/* ===============================
   START
   =============================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
