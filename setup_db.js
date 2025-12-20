require("dotenv").config({ path: "env.txt" });
const fs = require("fs");
const { Pool } = require("pg");

if (!process.env.POSTGRES_URL) {
  console.error("❌ POSTGRES_URL is missing or not loaded");
  process.exit(1);
}

(async () => {
  try {
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: false   // 🔥 IMPORTANT: FORCE SSL OFF
    });

    const sql = fs.readFileSync("./sql/create_tables.sql", "utf8");
    await pool.query(sql);

    console.log("✅ Database tables created successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Database setup failed:", err.message);
    process.exit(1);
  }
})();
