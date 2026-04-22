const DEFAULT_API_BASE_URL = "https://questionaire2-0.onrender.com";
const API_BASE_URL_KEY = "questionnaire_viewer_api_base_url";
const TOKEN_KEY = "questionnaire_admin_token";
const LOCAL_VIEWER_CONFIG = window.__VIEWER_CONFIG__ || {};
const IS_FILE_VIEWER = window.location.protocol === "file:";

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginStatus = document.getElementById("loginStatus");
const viewerStatus = document.getElementById("viewerStatus");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const openAdminBtn = document.getElementById("openAdminBtn");
const sourceUrlBadge = document.getElementById("sourceUrlBadge");
const lastSyncBadge = document.getElementById("lastSyncBadge");
const summaryGrid = document.getElementById("summaryGrid");
const submissionList = document.getElementById("submissionList");
const submissionDetail = document.getElementById("submissionDetail");
const detailState = document.getElementById("detailState");
const submissionCountBadge = document.getElementById("submissionCountBadge");
const submissionSearch = document.getElementById("submissionSearch");
const statusFilter = document.getElementById("statusFilter");
const paymentFilter = document.getElementById("paymentFilter");
const tableTabs = document.getElementById("tableTabs");
const tableMeta = document.getElementById("tableMeta");
const tableOutput = document.getElementById("tableOutput");
const tableSearch = document.getElementById("tableSearch");

const TABLE_LABELS = {
  admins: "Admins",
  questionnaires: "Questionnaires",
  products: "Products",
  product_images: "Product Images",
  payment_receipts: "Payment Receipts",
  paypal_payments: "PayPal Payments"
};

const TABLE_COLUMN_ORDER = {
  admins: ["id", "name", "email", "created_at"],
  questionnaires: [
    "id", "business_name", "contact_name", "first_name", "middle_name", "surname",
    "nid_number", "email", "phone", "address", "home_address", "status",
    "payment_status", "payment_txn_id", "payment_amount", "payment_currency",
    "portrait_url", "logo_url", "store_policies_pdf_url", "created_at", "updated_at"
  ],
  products: ["id", "questionnaire_id", "name", "price", "description", "category", "stock", "sort_order"],
  product_images: ["id", "product_id", "image_url", "sort_order"],
  payment_receipts: [
    "id", "submission_id", "business_name", "customer_name", "customer_email", "customer_phone",
    "customer_address", "domain_pgk", "hosting_pgk", "subtotal_pgk", "tax_rate",
    "tax_pgk", "total_pgk", "payment_currency", "paypal_quote_amount",
    "manual_banking_method", "manual_banking_receipt_url", "manual_banking_receipt_filename",
    "manual_banking_receipt_mime", "manual_banking_status", "manual_banking_submitted_at",
    "created_at", "updated_at"
  ],
  paypal_payments: [
    "id", "submission_id", "txn_id", "parent_txn_id", "payment_status", "verification_status",
    "payment_source", "gross_amount", "currency", "payer_email", "receiver_email",
    "item_name", "item_number", "raw_payload", "created_at", "updated_at"
  ]
};

const state = {
  apiBaseUrl: "",
  viewerUsername: "",
  viewerPassword: "",
  readOnlyRouteMode: "",
  snapshotMode: false,
  summary: null,
  submissions: [],
  filteredSubmissions: [],
  tables: {},
  selectedSubmissionId: null,
  activeTable: "questionnaires",
  lastSyncedAt: "",
  snapshotGeneratedAt: ""
};

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return text.replace(/\/+$/, "");
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getStoredApiBaseUrl() {
  return normalizeBaseUrl(
    localStorage.getItem(API_BASE_URL_KEY) ||
    LOCAL_VIEWER_CONFIG.apiBaseUrl ||
    DEFAULT_API_BASE_URL
  );
}

function setStoredApiBaseUrl(value) {
  const normalized = normalizeBaseUrl(value || DEFAULT_API_BASE_URL);
  localStorage.setItem(API_BASE_URL_KEY, normalized);
  state.apiBaseUrl = normalized;
  sourceUrlBadge.textContent = normalized ? `API: ${normalized}` : "API URL missing";
  openAdminBtn.href = normalized ? `${normalized}/admin` : "#";
}

function getSnapshotScriptUrl() {
  const baseUrl = new URL("viewer-data.js", window.location.href);
  baseUrl.searchParams.set("v", Date.now().toString());
  return baseUrl.href;
}

async function loadSnapshotPayload({ force = false } = {}) {
  if (!force && window.__DB_VIEWER_DATA__) {
    return window.__DB_VIEWER_DATA__;
  }

  window.__DB_VIEWER_DATA__ = null;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = getSnapshotScriptUrl();
    script.async = true;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Unable to load viewer-data.js. Run open-viewer.bat or npm run viewer:open to generate a fresh snapshot."));
    };
    document.head.appendChild(script);
  });

  if (!window.__DB_VIEWER_DATA__) {
    throw new Error("viewer-data.js loaded but did not expose any viewer snapshot data.");
  }

  return window.__DB_VIEWER_DATA__;
}

function buildApiUrl(path) {
  const normalizedPath = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${state.apiBaseUrl}${normalizedPath}`;
}

function hasReadOnlyViewerCredentials() {
  return Boolean(state.viewerUsername && state.viewerPassword);
}

function resolveUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  if (text.startsWith("//")) {
    return `https:${text}`;
  }

  if (!/^(\/|uploads\/|public\/uploads\/|viewer-assets\/|\/viewer-assets\/)/i.test(text)) {
    return "";
  }

  if (state.snapshotMode && IS_FILE_VIEWER) {
    if (text.startsWith("/uploads/")) {
      return new URL(`./public${text}`, window.location.href).href;
    }

    if (text.startsWith("uploads/")) {
      return new URL(`./public/${text}`, window.location.href).href;
    }

    if (text.startsWith("public/uploads/")) {
      return new URL(`./${text}`, window.location.href).href;
    }

    if (text.startsWith("/viewer-assets/")) {
      return new URL(`.${text}`, window.location.href).href;
    }

    if (text.startsWith("viewer-assets/")) {
      return new URL(`./${text}`, window.location.href).href;
    }
  }

  if (!state.apiBaseUrl) {
    return text;
  }

  if (text.startsWith("/")) {
    return `${state.apiBaseUrl}${text}`;
  }

  return `${state.apiBaseUrl}/${text.replace(/^\.?\//, "")}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString();
}

function looksLikeUrl(value) {
  return Boolean(resolveUrl(value));
}

function looksLikeImageUrl(value) {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(resolveUrl(value));
}

function looksLikePdfUrl(value) {
  return /\.pdf(\?.*)?$/i.test(resolveUrl(value));
}

function looksLikeHtmlUrl(value) {
  return /\.html?(\?.*)?$/i.test(resolveUrl(value));
}

function renderFileLink(url, label) {
  const resolved = resolveUrl(url);
  if (!resolved) {
    return escapeHtml(label || url || "-");
  }

  return `<a href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label || resolved)}</a>`;
}

function renderPreviewLink(url, label = "Open file") {
  const resolved = resolveUrl(url);
  if (!resolved) {
    return '<span class="dbv-empty">-</span>';
  }

  if (looksLikeImageUrl(url)) {
    return `
      <a class="dbv-thumb-link" href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer">
        <img class="dbv-thumb-inline" src="${escapeHtml(resolved)}" alt="${escapeHtml(label)}">
        <span>${escapeHtml(label)}</span>
      </a>
    `;
  }

  if (looksLikePdfUrl(url)) {
    return `
      <a class="dbv-thumb-link" href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer">
        <span class="dbv-chip">PDF</span>
        <span>${escapeHtml(label)}</span>
      </a>
    `;
  }

  if (looksLikeHtmlUrl(url)) {
    return `
      <a class="dbv-thumb-link" href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer">
        <span class="dbv-chip">HTML</span>
        <span>${escapeHtml(label)}</span>
      </a>
    `;
  }

  return renderFileLink(url, label);
}

function normalizeStatus(value) {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function renderStatusPill(type, value) {
  const normalized = normalizeStatus(value);
  return `<span class="dbv-pill ${type}-${normalized}">${escapeHtml(value || "unknown")}</span>`;
}

function renderValue(value) {
  if (value === null || value === undefined || value === "") {
    return '<span class="dbv-empty">-</span>';
  }

  const resolved = resolveUrl(value);
  if (resolved) {
    if (looksLikeImageUrl(value)) {
      return renderPreviewLink(value, "View image");
    }

    if (looksLikePdfUrl(value) || looksLikeHtmlUrl(value)) {
      return renderPreviewLink(value, looksLikePdfUrl(value) ? "Open PDF" : "Open HTML");
    }

    return `<a href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer">${escapeHtml(resolved)}</a>`;
  }

  return escapeHtml(value);
}

function renderField(label, value, options = {}) {
  const className = options.full ? "dbv-field full" : "dbv-field";
  const content = value === null || value === undefined || value === ""
    ? '<span class="dbv-empty">-</span>'
    : options.isDate
      ? escapeHtml(formatDateTime(value))
      : options.html
        ? value
        : renderValue(value);

  return `
    <article class="${className}">
      <span class="dbv-field-label">${escapeHtml(label)}</span>
      <div class="dbv-field-value">${content}</div>
    </article>
  `;
}

function updateLastSyncBadge() {
  if (state.snapshotMode) {
    const loadedAt = state.lastSyncedAt ? formatDateTime(state.lastSyncedAt) : "Not loaded yet";
    lastSyncBadge.textContent = `Loaded: ${loadedAt}`;
    return;
  }

  lastSyncBadge.textContent = state.lastSyncedAt
    ? `Last sync: ${formatDateTime(state.lastSyncedAt)}`
    : "Not synced yet";
}

function setLoginStatus(message, type = "error") {
  loginStatus.textContent = message;
  loginStatus.className = `dbv-status ${type}`;
}

function setViewerStatus(message, type = "info") {
  if (!message) {
    viewerStatus.textContent = "";
    viewerStatus.className = "dbv-status hidden";
    return;
  }

  viewerStatus.textContent = message;
  viewerStatus.className = `dbv-status ${type}`;
}

function applyLocalViewerConfig() {
  state.viewerUsername = String(LOCAL_VIEWER_CONFIG.viewerUsername || "").trim();
  state.viewerPassword = String(LOCAL_VIEWER_CONFIG.viewerPassword || "");

  if (hasReadOnlyViewerCredentials()) {
    setLoginStatus("Local viewer credentials detected. Connecting to the live viewer route...", "info");
  } else {
    setLoginStatus("Viewer credentials are missing. The viewer will use the local snapshot if one is available.", "info");
  }
}

function normalizeLegacyProducts(products) {
  if (!products) {
    return [];
  }

  if (Array.isArray(products)) {
    return products.map((product) => ({
      ...product,
      images: Array.isArray(product.images)
        ? product.images.filter(Boolean)
        : []
    }));
  }

  try {
    const parsed = JSON.parse(products);
    return normalizeLegacyProducts(parsed);
  } catch (_error) {
    return [];
  }
}

function buildLegacyMedia(submission, products) {
  const media = [];
  const addMedia = (kind, label, sourceTable, url) => {
    if (!url) {
      return;
    }

    media.push({ kind, label, sourceTable, url });
  };

  addMedia("portrait", "Portrait Photo", "questionnaires", submission.portrait_url);
  addMedia("logo", "Business Logo", "questionnaires", submission.logo_url);
  addMedia("policy_pdf", "Store Policies PDF", "questionnaires", submission.store_policies_pdf_url);

  products.forEach((product, productIndex) => {
    (product.images || []).forEach((imageUrl, imageIndex) => {
      addMedia(
        "product_image",
        `${product.name || `Product ${productIndex + 1}`} Image ${imageIndex + 1}`,
        "product_images",
        imageUrl
      );
    });
  });

  return media;
}

function buildSummaryFromTables(tables, submissions) {
  const paidSubmissions = submissions.filter((item) => item.payment_status === "paid").length;
  const pendingPayments = submissions.filter((item) => item.payment_status && item.payment_status !== "paid").length;
  const pendingReview = submissions.filter((item) => ["new", "in_review"].includes(item.status)).length;
  const mediaAssets = submissions.reduce((total, item) => total + item.media.length, 0);

  return {
    totalSubmissions: submissions.length,
    totalProducts: tables.products.length,
    totalMediaAssets: mediaAssets,
    paidSubmissions,
    pendingPayments,
    pendingReview,
    lastSubmissionAt: submissions[0]?.created_at || null,
    tableCounts: Object.fromEntries(
      Object.entries(tables).map(([key, rows]) => [key, rows.length])
    )
  };
}

function loadViewerPayload(payload, mode = "") {
  state.snapshotMode = mode === "snapshot";
  state.readOnlyRouteMode = mode;
  state.summary = payload.summary || null;
  state.submissions = payload.submissions || [];
  state.tables = payload.tables || {};
  state.selectedSubmissionId = state.selectedSubmissionId || state.submissions[0]?.id || null;
  state.snapshotGeneratedAt = payload.generatedAt || "";
  state.lastSyncedAt = new Date().toISOString();
  updateLastSyncBadge();
  renderAll();
}

function bootSnapshotViewer(snapshotPayload, message = "") {
  showApp();
  openAdminBtn.href = "#";
  sourceUrlBadge.textContent = "Source: PostgreSQL snapshot";
  loadViewerPayload(snapshotPayload, "snapshot");
  const snapshotTimeNote = state.snapshotGeneratedAt
    ? ` Snapshot generated at ${formatDateTime(state.snapshotGeneratedAt)}.`
    : "";
  setViewerStatus(
    (message || "Snapshot loaded from viewer-data.js. Run open-viewer.bat or npm run viewer:open to refresh the exported PostgreSQL snapshot.") + snapshotTimeNote,
    "info"
  );
}

function adaptLegacyViewerPayload(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.rows)
        ? payload.rows
        : [];

  const submissions = rows.map((row) => {
    const products = normalizeLegacyProducts(row.products);
    return {
      ...row,
      products,
      payments: [],
      receipt: null,
      media: buildLegacyMedia(row, products)
    };
  });

  const productRows = [];
  const productImageRows = [];

  submissions.forEach((submission) => {
    submission.products.forEach((product) => {
      productRows.push({
        ...product,
        questionnaire_id: product.questionnaire_id || submission.id
      });

      (product.images || []).forEach((imageUrl, index) => {
        productImageRows.push({
          id: `${product.id || submission.id}-${index + 1}`,
          product_id: product.id || null,
          image_url: imageUrl,
          sort_order: index
        });
      });
    });
  });

  const tables = {
    admins: [],
    questionnaires: rows,
    products: productRows,
    product_images: productImageRows,
    payment_receipts: [],
    paypal_payments: []
  };

  return {
    summary: buildSummaryFromTables(tables, submissions),
    tables,
    submissions
  };
}

async function fetchLegacyViewerData() {
  const data = await api("/api/public/view-submissions", { useViewerCredentials: true });
  state.readOnlyRouteMode = "legacy_headers";
  return adaptLegacyViewerPayload(data);
}

async function fetchReadOnlyViewerData() {
  try {
    const data = await api("/api/public/database-viewer-live", { useViewerCredentials: true });
    state.readOnlyRouteMode = "full";
    return data;
  } catch (error) {
    if (!/404|not found/i.test(error.message)) {
      throw error;
    }

    return fetchLegacyViewerData();
  }
}

function renderSummary() {
  const summary = state.summary;
  if (!summary) {
    summaryGrid.innerHTML = "";
    return;
  }

  const cards = [
    {
      label: "Submissions",
      value: summary.totalSubmissions,
      subtext: `${summary.pendingReview} currently need review`
    },
    {
      label: "Products",
      value: summary.totalProducts,
      subtext: `${summary.tableCounts.product_images || 0} product image rows`
    },
    {
      label: "Media Assets",
      value: summary.totalMediaAssets,
      subtext: "Portraits, logos, product images, and PDFs"
    },
    {
      label: "Paid",
      value: summary.paidSubmissions,
      subtext: `${summary.tableCounts.paypal_payments || 0} PayPal records stored`
    },
    {
      label: "Pending Payments",
      value: summary.pendingPayments,
      subtext: `${summary.tableCounts.payment_receipts || 0} receipts tracked`
    },
    {
      label: "Last Sync",
      value: state.lastSyncedAt ? formatDate(state.lastSyncedAt) : "-",
      subtext: state.lastSyncedAt ? formatDateTime(state.lastSyncedAt) : "Waiting for live data"
    }
  ];

  summaryGrid.innerHTML = cards.map((card) => `
    <article class="dbv-summary-card">
      <div class="dbv-summary-label">${escapeHtml(card.label)}</div>
      <div class="dbv-summary-value">${escapeHtml(card.value)}</div>
      <div class="dbv-summary-subtext">${escapeHtml(card.subtext)}</div>
    </article>
  `).join("");
}

function getFilteredSubmissions() {
  const searchTerm = submissionSearch.value.trim().toLowerCase();
  const statusValue = statusFilter.value;
  const paymentValue = paymentFilter.value;

  return state.submissions.filter((item) => {
    const matchesSearch = !searchTerm || [
      item.business_name,
      item.contact_name,
      item.email,
      item.phone,
      item.first_name,
      item.surname
    ].some((value) => String(value || "").toLowerCase().includes(searchTerm));

    const matchesStatus = statusValue === "all" || item.status === statusValue;
    const matchesPayment = paymentValue === "all" || item.payment_status === paymentValue;

    return matchesSearch && matchesStatus && matchesPayment;
  });
}

function renderSubmissionList() {
  state.filteredSubmissions = getFilteredSubmissions();
  submissionCountBadge.textContent = `${state.filteredSubmissions.length} records`;

  if (!state.filteredSubmissions.length) {
    submissionList.innerHTML = `
      <div class="dbv-empty-state" style="min-height: 280px;">
        <div>
          <h2>No matching submissions</h2>
          <p>Try clearing the filters or wait for the next live refresh.</p>
        </div>
      </div>
    `;
    state.selectedSubmissionId = null;
    renderSubmissionDetail();
    return;
  }

  if (!state.filteredSubmissions.some((item) => item.id === state.selectedSubmissionId)) {
    state.selectedSubmissionId = state.filteredSubmissions[0].id;
  }

  submissionList.innerHTML = state.filteredSubmissions.map((item) => `
    <article class="dbv-submission-card ${item.id === state.selectedSubmissionId ? "active" : ""}" data-id="${item.id}">
      <h3 class="dbv-submission-title">${escapeHtml(item.business_name || "Untitled Business")}</h3>
      <div class="dbv-submission-meta">${escapeHtml(item.contact_name || "No contact")} | ${escapeHtml(item.email || "No email")}</div>
      <div class="dbv-submission-date">${escapeHtml(formatDateTime(item.created_at))}</div>
      <div class="dbv-pill-row">
        ${renderStatusPill("status", item.status)}
        ${renderStatusPill("payment", item.payment_status || "unpaid")}
        <span class="dbv-chip">${escapeHtml(`${item.products.length} products`)}</span>
      </div>
    </article>
  `).join("");

  submissionList.querySelectorAll("[data-id]").forEach((node) => {
    node.addEventListener("click", () => {
      state.selectedSubmissionId = Number(node.getAttribute("data-id"));
      renderSubmissionList();
      renderSubmissionDetail();
    });
  });

  renderSubmissionDetail();
}

function renderMediaSection(submission) {
  if (!submission.media.length) {
    return `
      <section class="dbv-section">
        <h3 class="dbv-section-title">Media & Documents</h3>
        <div class="dbv-empty-state" style="min-height: 180px;">
          <div>
            <h2>No media uploaded</h2>
            <p>This client has not uploaded a portrait, logo, product image, or policy PDF yet.</p>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="dbv-section">
      <h3 class="dbv-section-title">Media & Documents</h3>
      <div class="dbv-media-grid">
        ${submission.media.map((item) => {
          const url = resolveUrl(item.url);
          return `
            <article class="dbv-media-card">
              ${looksLikePdfUrl(item.url)
                ? `<div class="dbv-media-thumb" style="display:grid;place-items:center;font-family:'Space Grotesk',sans-serif;font-size:1.15rem;color:#145442;">PDF</div>`
                : looksLikeHtmlUrl(item.url)
                  ? `<div class="dbv-media-thumb" style="display:grid;place-items:center;font-family:'Space Grotesk',sans-serif;font-size:1.15rem;color:#145442;">HTML</div>`
                : `<img class="dbv-media-thumb" src="${escapeHtml(url)}" alt="${escapeHtml(item.label)}">`}
              <div class="dbv-media-body">
                <div class="dbv-media-title">${escapeHtml(item.label)}</div>
                <div class="dbv-media-source">${escapeHtml(formatLabel(item.sourceTable))}</div>
                ${renderFileLink(item.url, "Open file")}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderProductsSection(submission) {
  if (!submission.products.length) {
    return `
      <section class="dbv-section">
        <h3 class="dbv-section-title">Products</h3>
        <div class="dbv-empty-state" style="min-height: 180px;">
          <div>
            <h2>No products submitted</h2>
            <p>The product tables do not currently contain rows for this client.</p>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="dbv-section">
      <h3 class="dbv-section-title">Products</h3>
      <div class="dbv-product-list">
        ${submission.products.map((product, index) => `
          <article class="dbv-product-card">
            <h4 class="dbv-card-title">${escapeHtml(product.name || `Product ${index + 1}`)}</h4>
            <div class="dbv-mini-grid">
              <div class="dbv-mini-block">
                <span class="dbv-mini-label">Price</span>
                <div class="dbv-mini-value">${escapeHtml(product.price || "-")}</div>
              </div>
              <div class="dbv-mini-block">
                <span class="dbv-mini-label">Category</span>
                <div class="dbv-mini-value">${escapeHtml(product.category || "-")}</div>
              </div>
              <div class="dbv-mini-block">
                <span class="dbv-mini-label">Stock</span>
                <div class="dbv-mini-value">${escapeHtml(product.stock || "-")}</div>
              </div>
            </div>
            ${renderField("Description", product.description, { full: true })}
            ${(product.images || []).length
              ? `
                <div class="dbv-media-grid" style="margin-top: 14px;">
                  ${product.images.map((url) => {
                    const resolvedUrl = resolveUrl(url);
                    return `
                      <article class="dbv-media-card">
                        <img class="dbv-media-thumb" src="${escapeHtml(resolvedUrl)}" alt="${escapeHtml(product.name || "Product image")}">
                        <div class="dbv-media-body">
                          <div class="dbv-media-title">Stored Product Image</div>
                          <div class="dbv-media-source">product_images table</div>
                          <a href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noopener noreferrer">Open file</a>
                        </div>
                      </article>
                    `;
                  }).join("")}
                </div>
              `
              : `<div class="dbv-empty" style="margin-top: 12px;">No product images stored for this row.</div>`
            }
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderReceiptSection(submission) {
  const receipt = submission.receipt;
  const payments = submission.payments || [];

  return `
    <section class="dbv-section">
      <h3 class="dbv-section-title">Payments & Receipt Rows</h3>
      <div class="dbv-payment-grid">
        <article class="dbv-payment-card">
          <h4 class="dbv-card-title">Questionnaire Payment State</h4>
          <div class="dbv-field-grid">
            ${renderField("Payment Status", submission.payment_status)}
            ${renderField("Transaction ID", submission.payment_txn_id)}
            ${renderField("Amount", submission.payment_amount)}
            ${renderField("Currency", submission.payment_currency)}
            ${renderField("Paid At", submission.paid_at, { isDate: true, full: true })}
          </div>
        </article>

        <article class="dbv-payment-card">
          <h4 class="dbv-card-title">Receipt Snapshot</h4>
          ${receipt
            ? `
              <div class="dbv-field-grid">
                ${renderField("Customer Name", receipt.customer_name)}
                ${renderField("Customer Email", receipt.customer_email)}
                ${renderField("Customer Phone", receipt.customer_phone)}
                ${renderField("Customer Address", receipt.customer_address, { full: true })}
                ${renderField("Domain (PGK)", receipt.domain_pgk)}
                ${renderField("Hosting (PGK)", receipt.hosting_pgk)}
                ${renderField("Subtotal (PGK)", receipt.subtotal_pgk)}
                ${renderField("Tax Rate", receipt.tax_rate)}
                ${renderField("Tax (PGK)", receipt.tax_pgk)}
                ${renderField("Total (PGK)", receipt.total_pgk)}
                ${renderField("Payment Currency", receipt.payment_currency)}
                ${renderField("Stored PayPal Quote", receipt.paypal_quote_amount)}
                ${renderField("Manual Banking Method", receipt.manual_banking_method)}
                ${renderField("Manual Banking Receipt", receipt.manual_banking_receipt_url)}
                ${renderField("Manual Banking File Name", receipt.manual_banking_receipt_filename)}
                ${renderField("Manual Banking File Type", receipt.manual_banking_receipt_mime)}
                ${renderField("Manual Banking Status", receipt.manual_banking_status)}
                ${renderField("Manual Banking Submitted At", receipt.manual_banking_submitted_at, { isDate: true })}
              </div>
            `
            : `<div class="dbv-empty">No payment_receipts row linked to this submission.</div>`
          }
        </article>

        <article class="dbv-payment-card">
          <h4 class="dbv-card-title">Linked PayPal Rows</h4>
          ${payments.length
            ? payments.map((payment) => `
              <div class="dbv-field-grid" style="margin-bottom: 14px;">
                ${renderField("Transaction ID", payment.txn_id)}
                ${renderField("Parent Transaction ID", payment.parent_txn_id)}
                ${renderField("Payment Status", payment.payment_status)}
                ${renderField("Verification Status", payment.verification_status)}
                ${renderField("Payment Source", payment.payment_source)}
                ${renderField("Gross Amount", payment.gross_amount)}
                ${renderField("Currency", payment.currency)}
                ${renderField("Payer Email", payment.payer_email)}
                ${renderField("Receiver Email", payment.receiver_email)}
                ${renderField("Item Name", payment.item_name)}
                ${renderField("Item Number", payment.item_number)}
                ${renderField("Created At", payment.created_at, { isDate: true })}
                ${renderField("Raw Payload", payment.raw_payload, { full: true })}
              </div>
            `).join("")
            : `<div class="dbv-empty">No paypal_payments rows are currently linked to this submission.</div>`
          }
        </article>
      </div>
    </section>
  `;
}

function renderSubmissionDetail() {
  const submission = state.filteredSubmissions.find((item) => item.id === state.selectedSubmissionId);

  if (!submission) {
    detailState.classList.remove("hidden");
    submissionDetail.classList.add("hidden");
    submissionDetail.innerHTML = "";
    return;
  }

  detailState.classList.add("hidden");
  submissionDetail.classList.remove("hidden");

  const socialLinksHtml = [
    ["Facebook", submission.facebook_url],
    ["LinkedIn", submission.linkedin_url],
    ["Instagram", submission.instagram_url],
    ["TikTok", submission.tiktok_url],
    ["Other", submission.other_social_url]
  ].map(([label, value]) => renderField(label, value)).join("");

  submissionDetail.innerHTML = `
    <div class="dbv-detail-grid">
      <section class="dbv-section">
        <div class="dbv-detail-header">
          <div>
            <p class="dbv-eyebrow">Submission Detail</p>
            <h2 class="dbv-detail-title">${escapeHtml(submission.business_name || "Untitled Business")}</h2>
            <p class="dbv-detail-subtitle">
              ${escapeHtml(submission.contact_name || "No contact")} | ${escapeHtml(submission.email || "No email")} | ${escapeHtml(submission.phone || "No phone")}
            </p>
          </div>
          <div class="dbv-pill-row">
            ${renderStatusPill("status", submission.status)}
            ${renderStatusPill("payment", submission.payment_status || "unpaid")}
            <span class="dbv-chip">${escapeHtml(`${submission.media.length} media files`)}</span>
          </div>
        </div>

        <div class="dbv-field-grid">
          ${renderField("Submission ID", submission.id)}
          ${renderField("Created At", submission.created_at, { isDate: true })}
          ${renderField("Updated At", submission.updated_at, { isDate: true })}
          ${renderField("Contact Name", submission.contact_name)}
        </div>
      </section>

      <section class="dbv-section">
        <h3 class="dbv-section-title">Business Information</h3>
        <div class="dbv-field-grid">
          ${renderField("Business Name", submission.business_name)}
          ${renderField("Government Tax Number", submission.government_tax_number)}
          ${renderField("Collection Tax Number", submission.collection_business_tax_number)}
          ${renderField("Address", submission.address, { full: true })}
          ${socialLinksHtml}
          ${renderField("Links Summary", submission.social_links, { full: true })}
        </div>
      </section>

      <section class="dbv-section">
        <h3 class="dbv-section-title">Personal Information</h3>
        <div class="dbv-field-grid">
          ${renderField("First Name", submission.first_name)}
          ${renderField("Middle Name", submission.middle_name)}
          ${renderField("Surname", submission.surname)}
          ${renderField("NID Number", submission.nid_number)}
          ${renderField("Email Address", submission.email)}
          ${renderField("Phone Number", submission.phone)}
          ${renderField("Home Address", submission.home_address, { full: true })}
        </div>
      </section>

      <section class="dbv-section">
        <h3 class="dbv-section-title">Homepage Content</h3>
        <div class="dbv-field-grid">
          ${renderField("Short Description", submission.short_description, { full: true })}
          ${renderField("Services", submission.services, { full: true })}
          ${renderField("Unique Point", submission.unique_point)}
          ${renderField("Audience", submission.audience)}
        </div>
      </section>

      <section class="dbv-section">
        <h3 class="dbv-section-title">About Page</h3>
        <div class="dbv-field-grid">
          ${renderField("About Description", submission.about_description, { full: true })}
          ${renderField("Story", submission.story, { full: true })}
          ${renderField("Mission", submission.mission)}
          ${renderField("Achievements", submission.achievements)}
        </div>
      </section>

      <section class="dbv-section">
        <h3 class="dbv-section-title">Branding & Website Build</h3>
        <div class="dbv-field-grid">
          ${renderField("Brand Colors", submission.brand_colors)}
          ${renderField("Website Style", submission.website_style)}
          ${renderField("Website Build Type", submission.website_build_type)}
          ${renderField("Example Websites", submission.example_websites, { full: true })}
        </div>
      </section>

      <section class="dbv-section">
        <h3 class="dbv-section-title">Store Policies & Notes</h3>
        <div class="dbv-field-grid">
          ${renderField("Store Policies Text", submission.store_policies_text, { full: true })}
          ${renderField("Store Policies PDF", submission.store_policies_pdf_url)}
          ${renderField("Additional Notes", submission.notes, { full: true })}
          ${renderField("Requested Features", submission.requested_features, { full: true })}
        </div>
      </section>

      ${renderMediaSection(submission)}
      ${renderProductsSection(submission)}
      ${renderReceiptSection(submission)}
    </div>
  `;
}

function getActiveTableRows() {
  const rows = state.tables[state.activeTable] || [];
  const searchTerm = tableSearch.value.trim().toLowerCase();

  if (!searchTerm) {
    return rows;
  }

  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(searchTerm));
}

function getTableColumns(rows) {
  const preferred = TABLE_COLUMN_ORDER[state.activeTable] || [];
  const extras = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!preferred.includes(key) && !extras.includes(key)) {
        extras.push(key);
      }
    });
  });
  return [...preferred, ...extras].filter((key) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, key)));
}

function renderTableCell(key, value) {
  if (value === null || value === undefined || value === "") {
    return '<span class="dbv-empty">-</span>';
  }

  const resolved = resolveUrl(value);

  if (looksLikeImageUrl(value)) {
    return `
      <a class="dbv-thumb-link" href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer">
        <img class="dbv-thumb-inline" src="${escapeHtml(resolved)}" alt="${escapeHtml(key)}">
        <span>${escapeHtml(resolved)}</span>
      </a>
    `;
  }

  if (looksLikePdfUrl(value)) {
    return renderPreviewLink(value, "Open PDF");
  }

  if (looksLikeHtmlUrl(value)) {
    return renderPreviewLink(value, "Open HTML");
  }

  if (resolved) {
    return `<a href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer">${escapeHtml(resolved)}</a>`;
  }

  if (typeof value === "object") {
    return `
      <details>
        <summary>Open JSON</summary>
        <pre class="dbv-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>
      </details>
    `;
  }

  if (String(value).length > 220) {
    return `
      <details>
        <summary>Open text</summary>
        <pre class="dbv-json">${escapeHtml(value)}</pre>
      </details>
    `;
  }

  if (/_at$/.test(key)) {
    return escapeHtml(formatDateTime(value));
  }

  return escapeHtml(value);
}

function renderTableTabs() {
  const entries = Object.entries(TABLE_LABELS);
  tableTabs.innerHTML = entries.map(([key, label]) => `
    <button class="dbv-tab ${state.activeTable === key ? "active" : ""}" data-table="${key}">
      ${escapeHtml(label)} (${escapeHtml((state.tables[key] || []).length)})
    </button>
  `).join("");

  tableTabs.querySelectorAll("[data-table]").forEach((node) => {
    node.addEventListener("click", () => {
      state.activeTable = node.getAttribute("data-table");
      renderTableTabs();
      renderActiveTable();
    });
  });
}

function renderActiveTable() {
  const allRows = state.tables[state.activeTable] || [];
  const rows = getActiveTableRows();
  const columns = getTableColumns(allRows.length ? allRows : rows);

  tableMeta.textContent = `${TABLE_LABELS[state.activeTable]}: showing ${rows.length} of ${allRows.length} stored rows`;

  if (!rows.length) {
    tableOutput.innerHTML = `
      <div class="dbv-empty-state" style="min-height: 220px;">
        <div>
          <h2>No rows to display</h2>
          <p>This table is currently empty or the active search did not match any rows.</p>
        </div>
      </div>
    `;
    return;
  }

  tableOutput.innerHTML = `
    <table>
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(formatLabel(column))}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>${columns.map((column) => `<td>${renderTableCell(column, row[column])}</td>`).join("")}</tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAll() {
  renderSummary();
  renderSubmissionList();
  renderTableTabs();
  renderActiveTable();
}

function showLogin() {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
  setViewerStatus("");
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();

  if (options.useViewerCredentials && hasReadOnlyViewerCredentials()) {
    headers["x-viewer-username"] = state.viewerUsername;
    headers["x-viewer-password"] = state.viewerPassword;
  } else if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...options,
      cache: "no-store",
      headers
    });
  } catch (_error) {
    throw new Error(`Unable to reach ${state.apiBaseUrl}. Make sure the Render app is live.`);
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data.error || data.details || `Request failed (${response.status})`);
  }

  return data;
}

async function loadDatabaseViewer({ silent = false } = {}) {
  if (!silent) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing...";
  }

  try {
    const data = hasReadOnlyViewerCredentials()
      ? await fetchReadOnlyViewerData()
      : await api("/api/admin/database-viewer");
    sourceUrlBadge.textContent = state.apiBaseUrl ? `API: ${state.apiBaseUrl}` : "Source: Live viewer route";
    openAdminBtn.href = state.apiBaseUrl ? `${state.apiBaseUrl}/admin` : "#";
    loadViewerPayload({
      ...data,
      generatedAt: new Date().toISOString()
    }, state.readOnlyRouteMode || "remote");
    const modeMessage = state.readOnlyRouteMode === "legacy_headers"
      ? "Live database sync active through the legacy viewer route. Use Refresh Now or reload the page whenever you want the latest data."
      : "Live database sync active. Use Refresh Now or reload the page whenever you want the latest data.";
    setViewerStatus(modeMessage, "info");
  } catch (error) {
    updateLastSyncBadge();
    setViewerStatus(`Sync failed: ${error.message}`, "error");
    throw error;
  } finally {
    if (!silent) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh Now";
    }
  }
}

async function loadSnapshotViewer({ silent = false, message = "" } = {}) {
  if (!silent) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing...";
  }

  try {
    const payload = await loadSnapshotPayload({ force: true });
    bootSnapshotViewer(payload, message);
  } catch (error) {
    setViewerStatus(`Snapshot refresh failed: ${error.message}`, "error");
    throw error;
  } finally {
    if (!silent) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh Now";
    }
  }
}

async function checkAuth() {
  if (hasReadOnlyViewerCredentials()) {
    try {
      showApp();
      await loadDatabaseViewer();
    } catch (error) {
      try {
        await loadSnapshotViewer({
          message: `Live sync is unavailable right now, so the viewer loaded the last exported PostgreSQL snapshot instead. ${error.message}`
        });
      } catch (_snapshotError) {
        showLogin();
        setLoginStatus(error.message, "error");
      }
    }
    return;
  }

  const token = getToken();
  if (!token) {
    try {
      await loadSnapshotViewer({
        message: "Live viewer credentials are not configured in this page, so the viewer loaded the last exported PostgreSQL snapshot."
      });
      return;
    } catch (_snapshotError) {
      showLogin();
      setLoginStatus("Automatic viewer credentials are not available for this page.", "error");
      return;
    }
  }

  try {
    await api("/api/auth/me");
    showApp();
    await loadDatabaseViewer();
  } catch (error) {
    clearToken();
    try {
      await loadSnapshotViewer({
        message: `Signed-in admin access is unavailable right now, so the viewer loaded the last exported PostgreSQL snapshot instead. ${error.message}`
      });
    } catch (_snapshotError) {
      showLogin();
    }
  }
}

refreshBtn.addEventListener("click", async () => {
  try {
    if (hasReadOnlyViewerCredentials() || getToken()) {
      try {
        await loadDatabaseViewer();
        return;
      } catch (_error) {
        // Fall back to the last exported snapshot below.
      }
    }

    await loadSnapshotViewer({
      message: "The viewer reloaded the local snapshot from viewer-data.js."
    });
  } catch (_error) {
    // Status banner already updated in the loader helpers.
  }
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  location.reload();
});

submissionSearch.addEventListener("input", renderSubmissionList);
statusFilter.addEventListener("change", renderSubmissionList);
paymentFilter.addEventListener("change", renderSubmissionList);
tableSearch.addEventListener("input", renderActiveTable);

applyLocalViewerConfig();
setStoredApiBaseUrl(getStoredApiBaseUrl());
updateLastSyncBadge();
checkAuth();
