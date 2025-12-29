require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const PORT = process.env.PORT || 8080;


const app = express();
app.use(express.json());

/* ===============================
   CONFIG
================================ */


const JWT_SECRET = process.env.JWT_SECRET || "temp_dev_secret";
const JWT_EXPIRY = "30d";

const DATABASE_URL = process.env.DATABASE_URL || null;


/* ===============================
   POSTGRES (LAZY SAFE)
================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});


/* ===============================
   SEND OTP
================================ */
app.post("/api/v1/send-otp", async (req, res) => {
  console.log("SEND OTP HIT");

  try {
    console.log("REQ BODY:", req.body);

    const phone = parseInt(
      String(req.body.phone || "").replace(/\D/g, "").slice(-10),
      10
    );

    console.log("PHONE:", phone);

    const otp = 123456;
    const expiresAt = Date.now() + 5 * 60 * 1000;

    console.log("BEFORE DB QUERY");

    await pool.query(
      `
      INSERT INTO otp (phone, otp, expires_at)
      VALUES ($1, $2, to_timestamp($3 / 1000.0))
      ON CONFLICT (phone)
      DO UPDATE SET otp = $2, expires_at = to_timestamp($3 / 1000.0)
      `,
      [phone, otp, expiresAt]
    );

    console.log("AFTER DB QUERY");

    res.json({ success: true });
  } catch (err) {
    console.error("SEND OTP ERROR FULL:", err);
    res.status(500).json({ message: "OTP failed" });
  }
});



app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/* ===============================
   VERIFY OTP
================================ */
app.post("/api/v1/verify-otp", async (req, res) => {
  try {
    const phone = parseInt(
      String(req.body.phone || "").replace(/\D/g, "").slice(-10),
      10
    );
    const otp = parseInt(req.body.otp, 10);

    const { rows } = await pool.query(
      "SELECT otp, expires_at FROM otp WHERE phone = $1",
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


/* ===============================
   START SERVER
================================ */
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
