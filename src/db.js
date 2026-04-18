const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

// Automatically ensure tables exist on startup
pool.bootstrap = async () => {
  console.log("Checking database schema...");
  try {
    const schemaPath = path.join(__dirname, "db", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await pool.query(schema);
    console.log("Database schema is ready.");
  } catch (err) {
    console.error("Database Bootstrap Error:", err.message);
    // Don't crash the whole app, but log it clearly
  }
};

module.exports = pool;
