require("dotenv").config();

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const isProduction = process.env.NODE_ENV === "production";
const databaseUrl = process.env.DATABASE_URL;

function createDatabaseUnavailableError() {
  const error = new Error("DATABASE_URL is required. Add it to your .env file or deployment environment.");
  error.code = "DB_NOT_CONFIGURED";
  return error;
}

const underlyingPool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: isProduction ? { rejectUnauthorized: false } : false
    })
  : null;

if (underlyingPool) {
  underlyingPool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
  });
}

const pool = {
  isConfigured: Boolean(databaseUrl),
  async query(...args) {
    if (!underlyingPool) {
      throw createDatabaseUnavailableError();
    }
    return underlyingPool.query(...args);
  },
  async connect() {
    if (!underlyingPool) {
      throw createDatabaseUnavailableError();
    }
    return underlyingPool.connect();
  },
  async end() {
    if (!underlyingPool) {
      return;
    }
    await underlyingPool.end();
  }
};

// Automatically ensure tables exist on startup
pool.bootstrap = async () => {
  if (!underlyingPool) {
    throw createDatabaseUnavailableError();
  }
  console.log("Checking database schema...");
  const schemaPath = path.join(__dirname, "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query("SELECT 1");
  await pool.query(schema);
  console.log("Database schema is ready.");
};

module.exports = pool;
