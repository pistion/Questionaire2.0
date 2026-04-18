const form = document.getElementById("questionnaireForm");
const statusBox = document.getElementById("statusBox");
const productList = document.getElementById("productList");
const addProductBtn = document.getElementById("addProductBtn");

function showStatus(message, type = "success") {
  statusBox.className = `status show ${type}`;
  statusBox.textContent = message;
  window.scrollTo({ top: 0, behavior: "smooth" });
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
      <div class="field"><label>Product Name</label><input data-field="name" /></div>
      <div class="field"><label>Product Price</label><input data-field="price" /></div>
      <div class="field full"><label>Product Description</label><textarea data-field="description"></textarea></div>
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

const portraitInput = document.getElementById("portrait");
const logoInput = document.getElementById("logo");
portraitInput.addEventListener("change", () => renderFileNames(document.getElementById("portraitFiles"), portraitInput.files));
logoInput.addEventListener("change", () => renderFileNames(document.getElementById("logoFiles"), logoInput.files));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusBox.className = "status";
  statusBox.textContent = "";

  try {
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    let portraitUrl = "";
    let logoUrl = "";

    if (portraitInput.files[0]) {
      portraitUrl = await uploadSingleFile(portraitInput.files[0], "questionnaire-saas/portrait");
    }
    if (logoInput.files[0]) {
      logoUrl = await uploadSingleFile(logoInput.files[0], "questionnaire-saas/logo");
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

    const payload = {
      businessName: document.getElementById("businessName").value.trim(),
      contactName: document.getElementById("contactName").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      address: document.getElementById("address").value.trim(),
      socialLinks: document.getElementById("socialLinks").value.trim(),
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
      exampleWebsites: document.getElementById("exampleWebsites").value.trim(),
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
      throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 100)}`);
    }

    if (!res.ok) throw new Error(data.error || "Failed to submit questionnaire");

    showStatus("Questionnaire submitted successfully.");
    form.reset();
    productList.innerHTML = "";
    addProduct();
    document.getElementById("portraitFiles").innerHTML = "";
    document.getElementById("logoFiles").innerHTML = "";
  } catch (error) {
    showStatus(error.message || "Something went wrong.", "error");
  } finally {
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Questionnaire";
  }
});
