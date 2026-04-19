const form = document.getElementById("questionnaireForm");
const statusBox = document.getElementById("statusBox");
const productList = document.getElementById("productList");
const addProductBtn = document.getElementById("addProductBtn");

// Modal Elements
const modalOverlay = document.getElementById("modalOverlay");
const resultModal = document.getElementById("resultModal");
const modalIcon = document.getElementById("modalIcon");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const modalDetails = document.getElementById("modalDetails");
const closeModalBtn = document.getElementById("closeModalBtn");
const businessInfoStep = document.getElementById("businessInfoStep");
const personalInfoStep = document.getElementById("personalInfoStep");
const businessInfoChip = document.getElementById("businessInfoChip");
const personalInfoChip = document.getElementById("personalInfoChip");
const businessInfoNextBtn = document.getElementById("businessInfoNextBtn");
const personalInfoBackBtn = document.getElementById("personalInfoBackBtn");
const socialLinkInputs = [
  document.getElementById("facebookLink"),
  document.getElementById("linkedinLink"),
  document.getElementById("instagramLink"),
  document.getElementById("tiktokLink"),
  document.getElementById("otherSocialLink")
];

function showModal(title, message, type = "success", details = "") {
  resultModal.className = `modal ${type}`;
  modalIcon.textContent = type === "success" ? "\u2713" : "\u2715";
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  
  if (details) {
    modalDetails.textContent = details;
    modalDetails.classList.remove("hidden");
  } else {
    modalDetails.classList.add("hidden");
  }
  
  modalOverlay.style.display = "flex";
  setTimeout(() => resultModal.classList.add("show"), 10);
}

closeModalBtn.addEventListener("click", () => {
  resultModal.classList.remove("show");
  setTimeout(() => {
    modalOverlay.style.display = "none";
  }, 300);
});

function showStatus(message, type = "success") {
  statusBox.className = `status show ${type}`;
  statusBox.textContent = message;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function buildContactName() {
  return [
    document.getElementById("firstName").value.trim(),
    document.getElementById("middleName").value.trim(),
    document.getElementById("surname").value.trim()
  ].filter(Boolean).join(" ");
}

function buildSocialLinksSummary() {
  const links = [
    ["Facebook", document.getElementById("facebookLink").value.trim()],
    ["LinkedIn", document.getElementById("linkedinLink").value.trim()],
    ["Instagram", document.getElementById("instagramLink").value.trim()],
    ["TikTok", document.getElementById("tiktokLink").value.trim()],
    ["Other", document.getElementById("otherSocialLink").value.trim()]
  ];

  return links
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

function updateSocialLinkGlow(input) {
  const item = input.closest(".social-link-item");
  if (!item) {
    return;
  }
  item.classList.toggle("active", Boolean(input.value.trim()));
}

function redirectToCheckout(data, payload) {
  const params = new URLSearchParams({
    submissionId: String(data.id || ""),
    businessName: payload.businessName || "Your business"
  });

  window.location.assign(`/checkout?${params.toString()}`);
}

function setInfoStep(step) {
  const showBusiness = step === "business";
  businessInfoStep.classList.toggle("hidden", !showBusiness);
  personalInfoStep.classList.toggle("hidden", showBusiness);
  businessInfoChip.classList.toggle("active", showBusiness);
  personalInfoChip.classList.toggle("active", !showBusiness);
}

function validatePrimaryFields() {
  const requiredFields = [
    { id: "businessName", label: "Business Name", step: "business" },
    { id: "firstName", label: "Name", step: "personal" },
    { id: "surname", label: "Surname", step: "personal" },
    { id: "nidNumber", label: "NID Number", step: "personal" },
    { id: "email", label: "Email Address", step: "personal" }
  ];

  for (const field of requiredFields) {
    const input = document.getElementById(field.id);
    if (!input.value.trim()) {
      setInfoStep(field.step);
      showStatus(`${field.label} is required.`, "error");
      input.focus();
      return false;
    }
  }

  const emailValue = document.getElementById("email").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    setInfoStep("personal");
    showStatus("Please enter a valid email address.", "error");
    document.getElementById("email").focus();
    return false;
  }

  return true;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadSingleFile(file, folder) {
  const fileBase64 = await fileToBase64(file);
  const res = await fetch("/api/public/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileBase64, folder })
  });
  
  let data;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await res.json();
  } else {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text.slice(0, 50)}`);
  }
  
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

function renderFileNames(container, files) {
  container.innerHTML = "";
  Array.from(files || []).forEach((file) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    chip.textContent = file.name;
    container.appendChild(chip);
  });
}

function createProductCard(index) {
  const wrapper = document.createElement("div");
  wrapper.className = "product-card";
  wrapper.innerHTML = `
    <h3>Product ${index + 1}</h3>
    <div class="grid">
      <div class="field full"><label>Product Name</label><input data-field="name" /></div>
      <div class="field full"><label>Product Description</label><textarea data-field="description"></textarea></div>
      <div class="field"><label>Product Price</label><input data-field="price" /></div>
      <div class="field"><label>Product Category</label><input data-field="category" /></div>
      <div class="field">
        <label>Stock Availability</label>
        <select data-field="stock">
          <option value="">Select</option>
          <option>In Stock</option>
          <option>Limited Stock</option>
          <option>Out of Stock</option>
          <option>Made to Order</option>
        </select>
      </div>
      <div class="field full">
        <label>Product Images</label>
        <input type="file" data-field="images" accept="image/*" multiple />
        <div class="file-list"></div>
      </div>
    </div>
    <button type="button" class="remove-btn">Remove Product</button>
  `;

  const fileInput = wrapper.querySelector('input[type="file"]');
  const fileList = wrapper.querySelector(".file-list");
  fileInput.addEventListener("change", () => renderFileNames(fileList, fileInput.files));

  wrapper.querySelector(".remove-btn").addEventListener("click", () => {
    wrapper.remove();
    refreshProductNumbers();
  });

  return wrapper;
}

function refreshProductNumbers() {
  [...document.querySelectorAll(".product-card h3")].forEach((h3, idx) => {
    h3.textContent = `Product ${idx + 1}`;
  });
}

function addProduct() {
  const card = createProductCard(productList.children.length);
  productList.appendChild(card);
}

addProductBtn.addEventListener("click", addProduct);
addProduct();
setInfoStep("business");

const portraitInput = document.getElementById("portrait");
const logoInput = document.getElementById("logo");
const storePoliciesPdfInput = document.getElementById("storePoliciesPdf");
portraitInput.addEventListener("change", () => renderFileNames(document.getElementById("portraitFiles"), portraitInput.files));
logoInput.addEventListener("change", () => renderFileNames(document.getElementById("logoFiles"), logoInput.files));
storePoliciesPdfInput.addEventListener("change", () => renderFileNames(document.getElementById("storePoliciesPdfFiles"), storePoliciesPdfInput.files));
socialLinkInputs.forEach((input) => {
  input.addEventListener("input", () => updateSocialLinkGlow(input));
  updateSocialLinkGlow(input);
});
businessInfoNextBtn.addEventListener("click", () => {
  setInfoStep("personal");
  document.getElementById("firstName").focus();
});
personalInfoBackBtn.addEventListener("click", () => {
  setInfoStep("business");
  document.getElementById("businessName").focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusBox.className = "status";
  statusBox.textContent = "";

  if (!validatePrimaryFields()) {
    return;
  }

  let payload;

  try {
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    let portraitUrl = "";
    let logoUrl = "";
    let storePoliciesPdfUrl = "";

    if (portraitInput.files[0]) {
      portraitUrl = await uploadSingleFile(portraitInput.files[0], "questionnaire-saas/portrait");
    }
    if (logoInput.files[0]) {
      logoUrl = await uploadSingleFile(logoInput.files[0], "questionnaire-saas/logo");
    }
    if (storePoliciesPdfInput.files[0]) {
      storePoliciesPdfUrl = await uploadSingleFile(storePoliciesPdfInput.files[0], "questionnaire-saas/policies");
    }

    const products = [];
    for (const card of document.querySelectorAll(".product-card")) {
      const imageInput = card.querySelector('input[type="file"]');
      const images = [];
      for (const file of Array.from(imageInput.files || [])) {
        const url = await uploadSingleFile(file, "questionnaire-saas/products");
        images.push(url);
      }

      products.push({
        name: card.querySelector('[data-field="name"]').value.trim(),
        price: card.querySelector('[data-field="price"]').value.trim(),
        description: card.querySelector('[data-field="description"]').value.trim(),
        category: card.querySelector('[data-field="category"]').value.trim(),
        stock: card.querySelector('[data-field="stock"]').value,
        images
      });
    }

    payload = {
      businessName: document.getElementById("businessName").value.trim(),
      contactName: buildContactName(),
      firstName: document.getElementById("firstName").value.trim(),
      middleName: document.getElementById("middleName").value.trim(),
      surname: document.getElementById("surname").value.trim(),
      nidNumber: document.getElementById("nidNumber").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      address: document.getElementById("address").value.trim(),
      homeAddress: document.getElementById("homeAddress").value.trim(),
      socialLinks: buildSocialLinksSummary(),
      facebookLink: document.getElementById("facebookLink").value.trim(),
      linkedinLink: document.getElementById("linkedinLink").value.trim(),
      instagramLink: document.getElementById("instagramLink").value.trim(),
      tiktokLink: document.getElementById("tiktokLink").value.trim(),
      otherSocialLink: document.getElementById("otherSocialLink").value.trim(),
      governmentTaxNumber: document.getElementById("governmentTaxNumber").value.trim(),
      collectionBusinessTaxNumber: document.getElementById("collectionBusinessTaxNumber").value.trim(),
      shortDescription: document.getElementById("shortDescription").value.trim(),
      services: document.getElementById("services").value.trim(),
      uniquePoint: document.getElementById("uniquePoint").value.trim(),
      audience: document.getElementById("audience").value.trim(),
      aboutDescription: document.getElementById("aboutDescription").value.trim(),
      story: document.getElementById("story").value.trim(),
      mission: document.getElementById("mission").value.trim(),
      achievements: document.getElementById("achievements").value.trim(),
      portraitUrl,
      logoUrl,
      brandColors: document.getElementById("brandColors").value.trim(),
      websiteStyle: document.getElementById("websiteStyle").value,
      websiteBuildType: document.getElementById("websiteBuildType").value,
      exampleWebsites: document.getElementById("exampleWebsites").value.trim(),
      storePolicies: document.getElementById("storePolicies").value.trim(),
      storePoliciesPdfUrl,
      notes: document.getElementById("notes").value.trim(),
      requestedFeatures: document.getElementById("requestedFeatures").value.trim(),
      products
    };

    const res = await fetch("/api/public/questionnaires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    let data;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      console.error("Non-JSON response received:", text);
      throw { message: "Server Error", details: `Non-JSON response: ${text.slice(0, 100)}` };
    }

    if (!res.ok) {
      throw { 
        message: data.error || "Submission Failed", 
        details: data.details ? `${data.details}${data.code ? ` (Code: ${data.code})` : ""} [Env: ${data.env}]` : "" 
      };
    }

    redirectToCheckout(data, payload);
  } catch (error) {
    console.error("Submission Error:", error);
    showModal(
      error.message || "Error", 
      "There was a problem submitting your questionnaire.", 
      "error", 
      error.details || error.toString()
    );
  } finally {
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Questionnaire";
  }
});
