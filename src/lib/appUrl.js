function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return text.replace(/\/+$/, "");
}

function getConfiguredAppUrl() {
  return normalizeBaseUrl(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "");
}

function getRequestDerivedAppUrl(req) {
  if (!req) {
    return "";
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || req.get("host") || "";
  const protocol = forwardedProto || req.protocol || "http";

  if (!host) {
    return "";
  }

  return normalizeBaseUrl(`${protocol}://${host}`);
}

function getPublicAppUrl(req) {
  return getConfiguredAppUrl() || getRequestDerivedAppUrl(req);
}

module.exports = {
  getConfiguredAppUrl,
  getPublicAppUrl,
  normalizeBaseUrl
};
