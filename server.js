require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./src/routes/auth");
const publicRoutes = require("./src/routes/public");
const adminRoutes = require("./src/routes/admin");
const pool = require("./src/db");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300
  })
);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected", service: "questionnaire-saas" });
  } catch (err) {
    res.status(500).json({ ok: false, database: "error", error: err.message });
  }
});

// TEMPORARY: Force database initialization via browser
app.get("/api/force-init", async (req, res) => {
  const token = req.query.token;
  if (!token || token !== process.env.JWT_SECRET) {
    return res.status(403).json({ error: "Unauthorized. Please provide the correct token." });
  }

  try {
    const fs = require("fs");
    const path = require("path");
    const schema = fs.readFileSync(path.join(__dirname, "src", "db", "schema.sql"), "utf8");
    
    // Split schema into individual statements to handle potential issues with multiple commands in one query
    await pool.query(schema);
    
    res.json({ 
      success: true, 
      message: "Database initialized successfully via force-init.",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Force Init Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin", adminRoutes);

app.use(express.static(path.join(__dirname, "public")));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
const host = "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Server running on port ${port} and host ${host}`);
});
