require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const pool = require("../src/db");

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, "..", "src", "db", "schema.sql"), "utf8");
  await pool.query(schema);

  const name = process.env.SEED_ADMIN_NAME || "Admin User";
  const email = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeThisPassword123!";

  const existing = await pool.query("SELECT id FROM admins WHERE email = $1", [email]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)",
      [name, email, hash]
    );
    console.log(`Seeded admin: ${email}`);
  } else {
    console.log(`Admin already exists: ${email}`);
  }

  console.log("Database initialized successfully.");
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
