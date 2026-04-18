const tokenKey = "questionnaire_admin_token";
const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");
const submissionsTableBody = document.getElementById("submissionsTableBody");
const detailCard = document.getElementById("detailCard");
const statusFilter = document.getElementById("statusFilter");
const logoutBtn = document.getElementById("logoutBtn");

function setStatus(message, type = "error") {
  loginStatus.className = `status show ${type}`;
  loginStatus.textContent = message;
}

function getToken() {
  return localStorage.getItem(tokenKey);
}

function setToken(token) {
  localStorage.setItem(tokenKey, token);
}

function clearToken() {
  localStorage.removeItem(tokenKey);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function checkAuth() {
  const token = getToken();
  if (!token) {
    loginView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    return;
  }

  try {
    await api("/api/auth/me");
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    await loadSubmissions();
  } catch (_error) {
    clearToken();
    loginView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
  }
}

loginBtn.addEventListener("click", async () => {
  try {
    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    setToken(data.token);
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    await loadSubmissions();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  location.reload();
});

statusFilter.addEventListener("change", () => loadSubmissions());

async function loadSubmissions() {
  const filter = statusFilter.value ? `?status=${encodeURIComponent(statusFilter.value)}` : "";
  const data = await api(`/api/admin/questionnaires${filter}`);

  submissionsTableBody.innerHTML = "";
  detailCard.classList.add("hidden");
  detailCard.innerHTML = "";

  data.items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.business_name || ""}</td>
      <td>${item.contact_name || ""}</td>
      <td>${item.email || ""}</td>
      <td><span class="tag">${item.status}</span></td>
      <td>${item.product_count}</td>
      <td>${new Date(item.created_at).toLocaleString()}</td>
      <td><button class="add-btn" data-id="${item.id}">View</button></td>
    `;
    tr.querySelector("button").addEventListener("click", () => loadDetail(item.id));
    submissionsTableBody.appendChild(tr);
  });
}

function gallery(images) {
  if (!images?.length) return '<p class="muted">No images</p>';
  return `<div class="gallery">${images.map((url) => `<img src="${url}" alt="" />`).join("")}</div>`;
}

async function loadDetail(id) {
  const data = await api(`/api/admin/questionnaires/${id}`);
  const item = data.item;

  detailCard.classList.remove("hidden");
  detailCard.innerHTML = `
    <div class="topbar">
      <div>
        <h2 style="margin:0">${item.business_name}</h2>
        <p class="muted" style="margin:.35rem 0 0">${item.contact_name} · ${item.email}</p>
      </div>
      <div class="actions">
        <select id="detailStatus">
          ${["new","in_review","approved","completed","archived"].map((s) => `<option value="${s}" ${s === item.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        <button id="saveStatusBtn" class="submit-btn">Save Status</button>
      </div>
    </div>

    <div class="grid">
      <div class="section">
        <h2>Business</h2>
        <p><strong>Phone:</strong> ${item.phone || "-"}</p>
        <p><strong>Address:</strong> ${item.address || "-"}</p>
        <p><strong>Social Links:</strong><br>${(item.social_links || "-").replace(/\n/g, "<br>")}</p>
      </div>
      <div class="section">
        <h2>Branding</h2>
        <p><strong>Colors:</strong> ${item.brand_colors || "-"}</p>
        <p><strong>Style:</strong> ${item.website_style || "-"}</p>
        <p><strong>Examples:</strong><br>${(item.example_websites || "-").replace(/\n/g, "<br>")}</p>
      </div>
      <div class="section full">
        <h2>Homepage Content</h2>
        <p><strong>Description:</strong><br>${(item.short_description || "-").replace(/\n/g, "<br>")}</p>
        <p><strong>Services:</strong><br>${(item.services || "-").replace(/\n/g, "<br>")}</p>
        <p><strong>Unique Point:</strong><br>${(item.unique_point || "-").replace(/\n/g, "<br>")}</p>
        <p><strong>Audience:</strong><br>${(item.audience || "-").replace(/\n/g, "<br>")}</p>
      </div>
      <div class="section full">
        <h2>About Page</h2>
        <p><strong>About:</strong><br>${(item.about_description || "-").replace(/\n/g, "<br>")}</p>
        <p><strong>Story:</strong><br>${(item.story || "-").replace(/\n/g, "<br>")}</p>
        <p><strong>Mission:</strong><br>${(item.mission || "-").replace(/\n/g, "<br>")}</p>
        <p><strong>Achievements:</strong><br>${(item.achievements || "-").replace(/\n/g, "<br>")}</p>
      </div>
      <div class="section">
        <h2>Portrait</h2>
        ${item.portrait_url ? `<img src="${item.portrait_url}" alt="" style="max-width:100%;border-radius:12px;border:1px solid #dbe3ee" />` : '<p class="muted">No portrait uploaded</p>'}
      </div>
      <div class="section">
        <h2>Logo</h2>
        ${item.logo_url ? `<img src="${item.logo_url}" alt="" style="max-width:100%;border-radius:12px;border:1px solid #dbe3ee" />` : '<p class="muted">No logo uploaded</p>'}
      </div>
      <div class="section full">
        <h2>Products</h2>
        ${
          item.products.length
            ? item.products.map((p, idx) => `
              <div class="product-card">
                <h3>Product ${idx + 1}: ${p.name || ""}</h3>
                <p><strong>Price:</strong> ${p.price || "-"}</p>
                <p><strong>Category:</strong> ${p.category || "-"}</p>
                <p><strong>Stock:</strong> ${p.stock || "-"}</p>
                <p><strong>Description:</strong><br>${(p.description || "-").replace(/\n/g, "<br>")}</p>
                ${gallery(p.images)}
              </div>
            `).join("")
            : '<p class="muted">No products submitted</p>'
        }
      </div>
      <div class="section full">
        <h2>Additional Notes</h2>
        <p><strong>Notes:</strong><br>${(item.notes || "-").replace(/\n/g, "<br>")}</p>
        <p><strong>Requested Features:</strong><br>${(item.requested_features || "-").replace(/\n/g, "<br>")}</p>
      </div>
    </div>
  `;

  document.getElementById("saveStatusBtn").addEventListener("click", async () => {
    const status = document.getElementById("detailStatus").value;
    await api(`/api/admin/questionnaires/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadSubmissions();
    await loadDetail(id);
  });
}

checkAuth();
