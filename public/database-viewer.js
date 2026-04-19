const tokenKey = "questionnaire_admin_token";

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginStatus = document.getElementById("loginStatus");
const loginBtn = document.getElementById("loginBtn");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
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
    "tax_pgk", "total_pgk", "payment_currency", "paypal_quote_amount", "created_at", "updated_at"
  ],
  paypal_payments: [
    "id", "submission_id", "txn_id", "parent_txn_id", "payment_status", "verification_status",
    "payment_source", "gross_amount", "currency", "payer_email", "receiver_email",
    "item_name", "item_number", "raw_payload", "created_at", "updated_at"
  ]
};

const state = {
  summary: null,
  submissions: [],
  filteredSubmissions: [],
  tables: {},
  selectedSubmissionId: null,
  activeTable: "questionnaires"
};

function getToken() {
  return localStorage.getItem(tokenKey);
}

function setToken(token) {
  localStorage.setItem(tokenKey, token);
}

function clearToken() {
  localStorage.removeItem(tokenKey);
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
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function looksLikeImageUrl(value) {
  return looksLikeUrl(value) && /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value);
}

function looksLikePdfUrl(value) {
  return looksLikeUrl(value) && /\.pdf(\?.*)?$/i.test(value);
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

  if (looksLikeUrl(value)) {
    return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`;
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
      label: "Last Submission",
      value: summary.lastSubmissionAt ? formatDate(summary.lastSubmissionAt) : "-",
      subtext: summary.lastSubmissionAt ? formatDateTime(summary.lastSubmissionAt) : "No submissions found"
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
          <p>Try clearing the filters or refreshing the database snapshot.</p>
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
        ${submission.media.map((item) => `
          <article class="dbv-media-card">
            ${looksLikePdfUrl(item.url)
              ? `<div class="dbv-media-thumb" style="display:grid;place-items:center;font-family:'Space Grotesk',sans-serif;font-size:1.15rem;color:#145442;">PDF</div>`
              : `<img class="dbv-media-thumb" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.label)}">`}
            <div class="dbv-media-body">
              <div class="dbv-media-title">${escapeHtml(item.label)}</div>
              <div class="dbv-media-source">${escapeHtml(formatLabel(item.sourceTable))}</div>
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Open file</a>
            </div>
          </article>
        `).join("")}
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
                  ${product.images.map((url) => `
                    <article class="dbv-media-card">
                      <img class="dbv-media-thumb" src="${escapeHtml(url)}" alt="${escapeHtml(product.name || "Product image")}">
                      <div class="dbv-media-body">
                        <div class="dbv-media-title">Stored Product Image</div>
                        <div class="dbv-media-source">product_images table</div>
                        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open file</a>
                      </div>
                    </article>
                  `).join("")}
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

  if (looksLikeImageUrl(value)) {
    return `
      <a class="dbv-thumb-link" href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer">
        <img class="dbv-thumb-inline" src="${escapeHtml(value)}" alt="${escapeHtml(key)}">
        <span>${escapeHtml(value)}</span>
      </a>
    `;
  }

  if (looksLikeUrl(value)) {
    return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`;
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
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
}

function setLoginStatus(message, type = "error") {
  loginStatus.textContent = message;
  loginStatus.className = `dbv-status ${type}`;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data.error || data.details || `Request failed (${response.status})`);
  }

  return data;
}

async function loadDatabaseViewer() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  try {
    const data = await api("/api/admin/database-viewer");
    state.summary = data.summary;
    state.submissions = data.submissions || [];
    state.tables = data.tables || {};
    state.selectedSubmissionId = state.selectedSubmissionId || state.submissions[0]?.id || null;
    renderAll();
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh Data";
  }
}

async function checkAuth() {
  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }

  try {
    await api("/api/auth/me");
    showApp();
    await loadDatabaseViewer();
  } catch (_error) {
    clearToken();
    showLogin();
  }
}

loginBtn.addEventListener("click", async () => {
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";
  loginStatus.className = "dbv-status hidden";

  try {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    setToken(data.token);
    showApp();
    await loadDatabaseViewer();
  } catch (error) {
    setLoginStatus(error.message, "error");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Open Database Viewer";
  }
});

refreshBtn.addEventListener("click", async () => {
  try {
    await loadDatabaseViewer();
  } catch (error) {
    alert(`Failed to refresh database viewer: ${error.message}`);
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

checkAuth();
