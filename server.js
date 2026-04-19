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

function captureRawBody(req, _res, buf, encoding) {
  if (!buf?.length || !req.originalUrl?.startsWith("/api/public/paypal")) {
    return;
  }
  req.rawBody = buf.toString(encoding || "utf8");
}

app.use(cors());
app.use(express.json({ limit: "10mb", verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, limit: "10mb", verify: captureRawBody }));

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

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin", adminRoutes);

app.use(express.static(path.join(__dirname, "public")));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/checkout", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "checkout.html"));
});

app.get("/payment", (_req, res) => {
  res.redirect("/checkout");
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
const host = "0.0.0.0";

async function startServer() {
  await pool.bootstrap();
  app.listen(port, host, () => {
    console.log(`Server running on port ${port} and host ${host}`);
    console.log("Database initialized and server is ready for traffic.");
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
