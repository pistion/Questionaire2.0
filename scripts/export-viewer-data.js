require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const pool = require("../src/db");
const { loadDatabaseViewerPayload } = require("../src/lib/databaseViewer");

const ROOT_DIR = path.join(__dirname, "..");
const SNAPSHOT_ASSETS_DIR = path.join(ROOT_DIR, "viewer-assets");
const MEDIA_FIELD_KEYS = new Set([
  "portrait_url",
  "logo_url",
  "store_policies_pdf_url",
  "manual_banking_receipt_url",
  "image_url"
]);

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isMediaValue(value) {
  if (typeof value !== "string") {
    return false;
  }

  const text = value.trim();
  if (!text) {
    return false;
  }

  return /^https?:\/\//i.test(text) || /^(\/|uploads\/|public\/uploads\/)/i.test(text);
}

function collectMediaUrls(value, key = "", target = new Set()) {
  if (Array.isArray(value)) {
    if (key === "images") {
      value.forEach((item) => {
        if (isMediaValue(item)) {
          target.add(item);
        }
      });
      return target;
    }

    value.forEach((item) => collectMediaUrls(item, "", target));
    return target;
  }

  if (!value || typeof value !== "object") {
    return target;
  }

  Object.entries(value).forEach(([childKey, childValue]) => {
    if (MEDIA_FIELD_KEYS.has(childKey) && isMediaValue(childValue)) {
      target.add(childValue);
      return;
    }

    collectMediaUrls(childValue, childKey, target);
  });

  return target;
}

function getViewerLocalConfigPath() {
  return path.join(ROOT_DIR, "viewer.local.js");
}

function getViewerLocalApiBaseUrl() {
  try {
    const raw = fs.readFileSync(getViewerLocalConfigPath(), "utf8");
    const match = raw.match(/apiBaseUrl\s*:\s*"([^"]+)"/i);
    return match ? match[1].trim() : "";
  } catch (_error) {
    return "";
  }
}

function getMediaBaseUrl() {
  const preferred = [
    process.env.VIEWER_SNAPSHOT_BASE_URL,
    getViewerLocalApiBaseUrl(),
    process.env.RENDER_EXTERNAL_URL,
    process.env.APP_URL,
    "https://questionaire2-0.onrender.com"
  ].map((value) => String(value || "").trim()).find(Boolean);

  return preferred ? preferred.replace(/\/+$/, "") : "";
}

function getLocalUploadPath(mediaUrl) {
  const normalized = normalizeSlashes(mediaUrl).replace(/^\/+/, "");
  if (normalized.startsWith("public/uploads/")) {
    return path.join(ROOT_DIR, normalized);
  }

  if (normalized.startsWith("uploads/")) {
    return path.join(ROOT_DIR, "public", normalized);
  }

  return "";
}

function sanitizeSegment(segment) {
  return String(segment || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
}

function getSnapshotRelativePath(mediaUrl) {
  const normalized = normalizeSlashes(mediaUrl).trim();
  if (/^(\/|uploads\/|public\/uploads\/)/i.test(normalized)) {
    const withoutPrefix = normalized
      .replace(/^\/+/, "")
      .replace(/^public\/uploads\//i, "uploads/")
      .replace(/^uploads\//i, "uploads/");
    return normalizeSlashes(path.posix.join("viewer-assets", withoutPrefix));
  }

  try {
    const parsed = new URL(normalized);
    const pathname = parsed.pathname.split("/").filter(Boolean).map(sanitizeSegment);
    const extension = path.extname(parsed.pathname) || ".bin";
    const fileName = pathname.length
      ? pathname[pathname.length - 1]
      : `file${extension}`;
    const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 10);
    const baseName = fileName.endsWith(extension) ? fileName.slice(0, -extension.length) : fileName;
    const safeName = `${sanitizeSegment(baseName)}-${hash}${extension}`;
    const hostSegment = sanitizeSegment(parsed.hostname);
    const folderParts = pathname.slice(0, -1);
    return normalizeSlashes(path.posix.join("viewer-assets", hostSegment, ...folderParts, safeName));
  } catch (_error) {
    const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 10);
    return normalizeSlashes(path.posix.join("viewer-assets", `media-${hash}.bin`));
  }
}

async function downloadMediaToSnapshot(mediaUrl, mediaBaseUrl) {
  const snapshotRelativePath = getSnapshotRelativePath(mediaUrl);
  const snapshotAbsolutePath = path.join(ROOT_DIR, snapshotRelativePath);
  await fsp.mkdir(path.dirname(snapshotAbsolutePath), { recursive: true });

  const localUploadPath = getLocalUploadPath(mediaUrl);
  if (localUploadPath && fs.existsSync(localUploadPath)) {
    await fsp.copyFile(localUploadPath, snapshotAbsolutePath);
    return snapshotRelativePath;
  }

  const requestUrl = /^https?:\/\//i.test(mediaUrl)
    ? mediaUrl
    : new URL(normalizeSlashes(mediaUrl).startsWith("/")
      ? mediaUrl
      : `/${normalizeSlashes(mediaUrl).replace(/^\.?\//, "")}`, mediaBaseUrl).toString();

  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${requestUrl} (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(snapshotAbsolutePath, buffer);
  return snapshotRelativePath;
}

function replaceMediaUrls(value, mediaMap) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceMediaUrls(item, mediaMap));
  }

  if (!value || typeof value !== "object") {
    return typeof value === "string" && mediaMap.has(value) ? mediaMap.get(value) : value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, childValue]) => [key, replaceMediaUrls(childValue, mediaMap)])
  );
}

async function main() {
  await fsp.rm(SNAPSHOT_ASSETS_DIR, { recursive: true, force: true });

  const payload = await loadDatabaseViewerPayload(pool);
  const mediaBaseUrl = getMediaBaseUrl();
  const mediaUrls = Array.from(collectMediaUrls(payload));
  const mediaMap = new Map();

  for (const mediaUrl of mediaUrls) {
    try {
      const localSnapshotPath = await downloadMediaToSnapshot(mediaUrl, mediaBaseUrl);
      mediaMap.set(mediaUrl, localSnapshotPath);
    } catch (error) {
      console.warn(`Skipped media download for ${mediaUrl}: ${error.message}`);
    }
  }

  const rewrittenPayload = replaceMediaUrls(payload, mediaMap);
  const outputPath = path.join(__dirname, "..", "viewer-data.js");
  const generatedAt = new Date().toISOString();
  const banner = `// Generated at ${generatedAt}\n`;
  const body = `window.__DB_VIEWER_DATA__ = ${JSON.stringify({
    ...rewrittenPayload,
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
