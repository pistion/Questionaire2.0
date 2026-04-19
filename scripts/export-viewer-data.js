require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("../src/db");
const { loadDatabaseViewerPayload } = require("../src/lib/databaseViewer");

async function main() {
  const payload = await loadDatabaseViewerPayload(pool);
  const outputPath = path.join(__dirname, "..", "viewer-data.js");
  const generatedAt = new Date().toISOString();
  const banner = `// Generated at ${generatedAt}\n`;
  const body = `window.__DB_VIEWER_DATA__ = ${JSON.stringify({
    ...payload,
    generatedAt
  }, null, 2)};\n`;

  fs.writeFileSync(outputPath, banner + body, "utf8");
  console.log(`Wrote standalone viewer data to ${outputPath}`);
}

main()
  .catch((error) => {
    console.error("Failed to export viewer data:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
