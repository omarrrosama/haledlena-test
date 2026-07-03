// ===== CONFIG =====
const API = "/api";
let token = localStorage.getItem("hl_token");
let currentPage = "dashboard";
let ordersPage = 1,
  productsPage = 1;
let editingProductId = null;
let debounceTimer;
let deletedGeneralImages = []; // URLs of general images to remove on save
let deletedColorImages = {}; // { colorName: [url, ...] } to remove on save
let selectedCoverImageUrl = "";
let selectedCoverUploadIndex = null;
let homepageProductsCache = null;
let currentNewFiles = []; // Track current new files for reordering
let currentExistingImages = []; // Track existing images for reordering
let currentColorImagesMap = {}; // { color: { existing: [], new: [] } }

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("today-date").textContent =
    new Date().toLocaleDateString("en", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // Allow token passing via URL from frontend (e.g. /admin/?token=XYZ)
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");
  if (urlToken) {
    token = urlToken;
    localStorage.setItem("hl_token", token);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (token) initApp();
  else showLogin();

  document
    .getElementById("login-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("login-btn");
      const err = document.getElementById("login-error");
      btn.textContent = "Signing in...";
      btn.disabled = true;
      err.classList.add("hidden");
      try {
        const res = await apiFetch(
          "/auth/login",
          "POST",
          {
            username: document.getElementById("login-username").value,
            password: document.getElementById("login-password").value,
          },
          false,
        );
        token = res.token;
        localStorage.setItem("hl_token", token);
        initApp();
      } catch (e) {
        err.textContent = e.message;
        err.classList.remove("hidden");
      } finally {
        btn.textContent = "Sign In";
        btn.disabled = false;
      }
    });

  // Nav
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // View-all links
  document.querySelectorAll(".view-all").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(a.dataset.page);
    });
  });

  // Logout
  document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("hl_token");
    token = null;
    document.getElementById("app").classList.add("hidden");
    showLogin();
  });

  // Sidebar toggle
  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  // Change password
  document
    .getElementById("change-password-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("pw-msg");
      const np = document.getElementById("new-password").value;
      const cp = document.getElementById("confirm-password").value;
      if (np !== cp) {
        showMsg(msg, "Passwords do not match.", "error");
        return;
      }
      try {
        await apiFetch("/auth/change-password", "POST", {
          currentPassword: document.getElementById("current-password").value,
          newPassword: np,
        });
        showMsg(msg, "Password updated successfully!", "success");
        e.target.reset();
      } catch (err) {
        showMsg(msg, err.message, "error");
      }
    });

  document
    .getElementById("product-form")
    .addEventListener("submit", saveProduct);
  // Note: image preview listeners are added dynamically per color section

  const productImagesInput = document.getElementById("product-images-input");
  if (productImagesInput) {
    productImagesInput.addEventListener("change", () => {
      renderGeneralUploadPreview(productImagesInput.files || []);
    });
  }

  const homepageSaveBtn = document.getElementById("homepage-save-btn");
  if (homepageSaveBtn) {
    homepageSaveBtn.addEventListener("click", saveHomepageSlots);
  }

  const homepageHeroForm = document.getElementById("homepage-hero-form");
  if (homepageHeroForm) {
    homepageHeroForm.addEventListener("submit", saveHomepageHero);
  }

  const navbarMenuImageForm = document.getElementById("navbar-menu-image-form");
  if (navbarMenuImageForm) {
    navbarMenuImageForm.addEventListener("submit", saveNavbarMenuImage);
  }

  // Auto-generate slug from name
  document.getElementById("cat-name").addEventListener("input", (e) => {
    const slugField = document.getElementById("cat-slug");
    // Only auto-fill if slug is empty or was previously auto-generated
    if (!slugField.dataset.manualEdit) {
      slugField.value = e.target.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
  });
  document.getElementById("cat-slug").addEventListener("input", (e) => {
    e.target.dataset.manualEdit = e.target.value ? "true" : "";
  });

  // Add category form
  document
    .getElementById("add-category-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("cat-form-msg");
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Adding...";
      msg.classList.add("hidden");
      try {
        await apiFetch("/categories", "POST", {
          name: document.getElementById("cat-name").value.trim(),
          slug: document.getElementById("cat-slug").value.trim(),
        });
        showToast("Category added!", "success");
        e.target.reset();
        document.getElementById("cat-slug").dataset.manualEdit = "";
        loadCategories();
      } catch (err) {
        showMsg(msg, err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "+ Add Category";
      }
    });
});

function showLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

async function initApp() {
  try {
    const res = await apiFetch("/auth/me");
    document.getElementById("admin-name").textContent =
      `👤 ${res.admin.username}`;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    navigateTo("dashboard");
  } catch {
    localStorage.removeItem("hl_token");
    showLogin();
  }
}

function navigateTo(page) {
  currentPage = page;
  document
    .querySelectorAll(".nav-item")
    .forEach((i) => i.classList.toggle("active", i.dataset.page === page));
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.toggle("active", p.id === `page-${page}`));
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.toggle("hidden", p.id !== `page-${page}`));
  if (page === "dashboard") loadDashboard();
  if (page === "orders") {
    ordersPage = 1;
    loadOrders();
  }
  if (page === "products") {
    productsPage = 1;
    loadProducts();
  }
  if (page === "homepage") loadHomepage();
  if (page === "categories") loadCategories();
}

// ===== API HELPER =====
async function apiFetch(endpoint, method = "GET", body = null, auth = true) {
  const headers = {};
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;
  let opts = { method, headers };
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(`${API}${endpoint}`, opts);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Request failed");
  return data;
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const { stats } = await apiFetch("/dashboard/stats");
    document.getElementById("stat-total-orders").textContent =
      stats.totalOrders;
    document.getElementById("stat-revenue").textContent =
      stats.totalRevenue.toLocaleString() + " EGP";
    document.getElementById("stat-month-orders").textContent =
      stats.thisMonthOrders;
    document.getElementById("stat-products").textContent = stats.totalProducts;

    // Recent orders
    const tbody = document.getElementById("recent-orders-body");
    tbody.innerHTML =
      stats.recentOrders
        .map(
          (o) => `
      <tr>
        <td><strong>${o.orderNumber}</strong></td>
        <td>${o.customer.name}</td>
        <td><strong>${o.total.toLocaleString()} EGP</strong></td>
        <td><span class="status-badge status-${o.status}">${o.status}</span></td>
      </tr>
    `,
        )
        .join("") ||
      '<tr><td colspan="4" class="loading-row">No orders yet.</td></tr>';

    // Status chart
    const statusColors = {
      pending: "#f39c12",
      confirmed: "#3498db",
      processing: "#9b59b6",
      shipped: "#1abc9c",
      delivered: "#2ecc71",
      cancelled: "#e74c3c",
    };
    const total =
      Object.values(stats.ordersByStatus).reduce((a, b) => a + b, 0) || 1;
    document.getElementById("status-chart").innerHTML =
      Object.entries(stats.ordersByStatus)
        .map(
          ([s, c]) => `
      <div class="status-bar-item">
        <span class="status-bar-label">${s}</span>
        <div class="status-bar-track"><div class="status-bar-fill" style="width:${((c / total) * 100).toFixed(1)}%;background:${statusColors[s] || "#888"}"></div></div>
        <span class="status-bar-count">${c}</span>
      </div>
    `,
        )
        .join("") || '<p style="color:#888;font-size:13px;">No orders yet.</p>';

    // Pending badge
    const pending = stats.ordersByStatus.pending || 0;
    const badge = document.getElementById("pending-badge");
    badge.textContent = pending;
    badge.classList.toggle("show", pending > 0);

    // Low stock
    document.getElementById("low-stock-list").innerHTML = stats.lowStock.length
      ? stats.lowStock
          .map(
            (p) => `
        <div class="low-stock-item">
          ${p.images?.[0] ? `<img src="${p.images[0]}" alt="${p.name}">` : '<div class="no-image">N/A</div>'}
          <div class="low-stock-info">
            <p>${p.name}</p>
            <span>${p.computedStock ?? 0} units left</span>
          </div>
        </div>
      `,
          )
          .join("")
      : '<p style="color:#888;font-size:13px;padding:10px 0;">All products are well-stocked.</p>';
  } catch (err) {
    console.error(err);
  }
}

// ===== ORDERS =====
async function loadOrders() {
  const search = document.getElementById("order-search").value;
  const status = document.getElementById("order-status-filter").value;
  const from = document.getElementById("order-from").value;
  const to = document.getElementById("order-to").value;

  let url = `/orders?page=${ordersPage}&limit=15`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (status) url += `&status=${status}`;
  if (from) url += `&from=${from}`;
  if (to) url += `&to=${to}`;

  document.getElementById("orders-tbody").innerHTML =
    '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    const { orders, total } = await apiFetch(url);
    document.getElementById("orders-tbody").innerHTML =
      orders
        .map(
          (o) => `
      <tr>
        <td><strong>${o.orderNumber}</strong></td>
        <td>${o.customer.name}</td>
        <td>${o.customer.phone}</td>
        <td>${o.items.length} item(s)</td>
        <td><strong>${o.total.toLocaleString()} EGP</strong></td>
        <td><span class="status-badge status-${o.status}">${o.status}</span></td>
        <td>${new Date(o.createdAt).toLocaleDateString()}</td>
        <td><button class="icon-btn" onclick="viewOrder('${o._id}')">👁 View</button></td>
      </tr>
    `,
        )
        .join("") ||
      '<tr><td colspan="8" class="loading-row">No orders found.</td></tr>';

    renderPagination("orders-pagination", total, 15, ordersPage, (p) => {
      ordersPage = p;
      loadOrders();
    });
  } catch (err) {
    document.getElementById("orders-tbody").innerHTML =
      `<tr><td colspan="8" class="loading-row">Error: ${err.message}</td></tr>`;
  }
}

async function viewOrder(id) {
  document.getElementById("order-modal").classList.remove("hidden");
  document.getElementById("order-modal-body").innerHTML =
    '<p class="loading-row">Loading...</p>';
  try {
    const { order } = await apiFetch(`/orders/${id}`);
    document.getElementById("order-modal-title").textContent =
      `Order #${order.orderNumber}`;
    document.getElementById("order-modal-body").innerHTML = `
      <div class="order-detail-grid">
        <div class="detail-section">
          <h4>Customer</h4>
          <p><strong>Name:</strong> ${order.customer.name}</p>
          <p><strong>Phone:</strong> ${order.customer.phone}</p>
          <p><strong>Email:</strong> ${order.customer.email || "N/A"}</p>
          <p><strong>Address:</strong> ${order.customer.address}, ${order.customer.city}</p>
          ${order.customer.notes ? `<p><strong>Notes:</strong> ${order.customer.notes}</p>` : ""}
        </div>
        <div class="detail-section">
          <h4>Order Info</h4>
          <p><strong>Order #:</strong> ${order.orderNumber}</p>
          <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
          <p><strong>Payment:</strong> Cash on Delivery</p>
          <p><strong>Status:</strong> <span class="status-badge status-${order.status}">${order.status}</span></p>
        </div>
      </div>

      <table class="table" style="margin-top:16px;">
        <thead><tr><th>Product</th><th>Variant</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
        <tbody>
          ${order.items
            .map(
              (i) => `
            <tr>
              <td>${i.productName}</td>
              <td>${i.size || "-"} / ${i.color || "-"}</td>
              <td>${i.quantity}</td>
              <td>${i.price.toLocaleString()} EGP</td>
              <td>${i.subtotal.toLocaleString()} EGP</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>

      <div style="text-align:right;margin-top:12px;padding:12px;background:#f9f9f9;border-radius:8px;">
        <p>Subtotal: <strong>${order.subtotal.toLocaleString()} EGP</strong></p>
        <p>Shipping: <strong>${order.shippingFee > 0 ? order.shippingFee.toLocaleString() + " EGP" : "Free"}</strong></p>
        <p style="font-size:16px;">Total: <strong>${order.total.toLocaleString()} EGP</strong></p>
      </div>

      <div style="margin-top:16px;">
        <h4 style="margin-bottom:8px;font-size:14px;">Update Status</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${[
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
          ]
            .map(
              (s) => `
            <button class="btn btn-sm ${s === order.status ? "btn-primary" : "btn-ghost"}" onclick="updateOrderStatus('${order._id}','${s}')">${s}</button>
          `,
            )
            .join("")}
        </div>
      </div>

      <div style="margin-top:16px;">
        <h4 style="margin-bottom:8px;font-size:14px;">Admin Notes</h4>
        <textarea id="order-notes-input" rows="2" style="width:100%;padding:8px;border:1px solid #e5e5e5;border-radius:6px;font-family:inherit;">${order.adminNotes || ""}</textarea>
        <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="saveOrderNotes('${order._id}')">Save Notes</button>
      </div>
    `;
  } catch (err) {
    document.getElementById("order-modal-body").innerHTML =
      `<p class="loading-row">Error: ${err.message}</p>`;
  }
}

async function updateOrderStatus(id, status) {
  try {
    await apiFetch(`/orders/${id}/status`, "PATCH", { status });
    showToast("Status updated!", "success");
    viewOrder(id);
    if (currentPage === "orders") loadOrders();
    loadDashboard();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function saveOrderNotes(id) {
  const notes = document.getElementById("order-notes-input").value;
  try {
    await apiFetch(`/orders/${id}/notes`, "PATCH", { notes });
    showToast("Notes saved!", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function exportOrders() {
  const status = document.getElementById("order-status-filter").value;
  const from = document.getElementById("order-from").value;
  const to = document.getElementById("order-to").value;
  let url = `/api/orders/export/excel?`;
  if (status) url += `status=${status}&`;
  if (from) url += `from=${from}&`;
  if (to) url += `to=${to}&`;
  window.open(url + `token=${token}`, "_blank");
}

// ===== PRODUCTS =====
async function loadProducts() {
  const search = document.getElementById("product-search").value;
  let url = `/products/admin/all?page=${productsPage}&limit=15`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  document.getElementById("products-tbody").innerHTML =
    '<tr><td colspan="7" class="loading-row">Loading...</td></tr>';
  try {
    const { products, total } = await apiFetch(url);
    document.getElementById("products-tbody").innerHTML =
      products
        .map((p) => {
          const stock = p.variants
            ? p.variants.reduce((s, v) => s + (v.stock || 0), 0)
            : 0;
          const categoryLabel =
            Array.isArray(p.categories) && p.categories.length > 0
              ? p.categories.join(", ")
              : p.category || "";
          return `
        <tr>
          <td>${p.images?.[0] ? `<img src="${p.images[0]}" class="product-thumb">` : '<div class="no-image">No img</div>'}</td>
          <td><strong>${p.name}</strong><br><small style="color:#888">${p.slug || ""}</small></td>
          <td><span style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;text-transform:capitalize;">${categoryLabel}</span></td>
          <td>${p.price.toLocaleString()} EGP</td>
          <td>${stock} units</td>
          <td><span class="status-badge ${p.active ? "status-delivered" : "status-cancelled"}">${p.active ? "Active" : "Inactive"}</span></td>
          <td style="display:flex;gap:6px;">
            <button class="icon-btn" onclick="openProductModal('${p._id}')">✏️</button>
            <button class="icon-btn" onclick="deleteProduct('${p._id}','${p.name}')">🗑</button>
          </td>
        </tr>
      `;
        })
        .join("") ||
      '<tr><td colspan="7" class="loading-row">No products found.</td></tr>';

    renderPagination("products-pagination", total, 15, productsPage, (p) => {
      productsPage = p;
      loadProducts();
    });
  } catch (err) {
    document.getElementById("products-tbody").innerHTML =
      `<tr><td colspan="7" class="loading-row">Error: ${err.message}</td></tr>`;
  }
}

async function openProductModal(id = null) {
  editingProductId = id;
  const form = document.getElementById("product-form");
  form.reset();
  document.getElementById("variants-container").innerHTML = "";
  document.getElementById("image-preview").innerHTML = "";
  document.getElementById("existing-images-container").innerHTML = "";
  const colorImgContainer = document.getElementById("color-images-container");
  if (colorImgContainer) colorImgContainer.innerHTML = "";

  document.getElementById("product-form-msg").classList.add("hidden");
  document.getElementById("product-modal-title").textContent = id
    ? "Edit Product"
    : "Add Product";
  document.getElementById("product-modal").classList.remove("hidden");

  deletedGeneralImages = [];
  deletedColorImages = {};
  selectedCoverImageUrl = "";
  selectedCoverUploadIndex = null;
  currentExistingImages = [];
  currentNewFiles = [];
  currentColorImagesMap = {};
  const productImagesInput = document.getElementById("product-images-input");
  if (productImagesInput) productImagesInput.value = "";

  const homeEnabled = document.getElementById("home-enabled");
  const homeSlotWrap = document.getElementById("home-slot-wrap");
  const homePositionSelect = document.getElementById("home-position-select");
  if (homeEnabled && homeSlotWrap && homePositionSelect) {
    homeEnabled.checked = false;
    homePositionSelect.value = "";
    homeSlotWrap.style.display = "none";
    homeEnabled.onchange = () => {
      if (homeEnabled.checked) {
        homeSlotWrap.style.display = "block";
      } else {
        homePositionSelect.value = "";
        homeSlotWrap.style.display = "none";
      }
    };
  }

  if (id) {
    try {
      const { product: p } = await apiFetch(`/products/admin/${id}`);

      const selectedCategories =
        Array.isArray(p.categories) && p.categories.length > 0
          ? p.categories
          : p.category
            ? [p.category]
            : [];
      await populateCategorySelect(selectedCategories);
      syncCategorySelects();

      form.querySelector("[name=name]").value = p.name || "";
      form.querySelector("[name=productType]").value = p.productType || "";
      form.querySelector("[name=price]").value = p.price || "";
      form.querySelector("[name=description]").value = p.description || "";
      form.querySelector("[name=productCare]").value = p.productCare || "";
      form.querySelector("[name=featured]").checked = p.featured || false;
      form.querySelector("[name=active]").checked = p.active !== false;
      if (homeEnabled && homeSlotWrap && homePositionSelect) {
        const pos = p.homePosition ? String(p.homePosition) : "";
        homeEnabled.checked = Boolean(pos);
        homePositionSelect.value = pos;
        homeSlotWrap.style.display = homeEnabled.checked ? "block" : "none";
      }

      selectedCoverImageUrl =
        p.coverImage ||
        (p.images && p.images.length > 0 ? p.images[0] : "") ||
        "";

      // Show current general images with delete buttons
      if (p.images && p.images.length > 0) {
        currentExistingImages = [...p.images]; // Start with original order
        const container = document.getElementById("existing-images-container");
        container.innerHTML = `
          <p style="font-size:12px;color:#888;margin-bottom:6px;">Current general images (click an image to set it as cover, click ✕ to remove):</p>
          <div id="existing-general-imgs" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
        `;
        const imgContainer = container.querySelector("#existing-general-imgs");
        deletedGeneralImages = [];

        currentExistingImages.forEach((img, idx) => {
          const wrap = document.createElement("div");
          wrap.className = "img-wrapper";
          wrap.dataset.url = img;
          wrap.innerHTML = `
            <img src="${img}" class="cover-thumb${img === selectedCoverImageUrl ? " selected" : ""}" data-url="${img}" style="width:64px;height:64px;object-fit:cover;border-radius:4px;display:block;cursor:pointer;">
            <button type="button" data-url="${img}" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#e74c3c;color:#fff;border:none;cursor:pointer;font-size:10px;line-height:18px;text-align:center;padding:0;">✕</button>
          `;

          // Click to set cover
          wrap.querySelector("img").addEventListener("click", (e) => {
            e.stopPropagation();
            setCoverFromExisting(img);
          });

          // Click to remove
          wrap.querySelector("button").addEventListener("click", (e) => {
            e.stopPropagation();
            removeGeneralImage(wrap, img);
          });

          imgContainer.appendChild(wrap);
        });

        // Make sortable
        new Sortable(imgContainer, {
          animation: 150,
          ghostClass: "sortable-ghost",
          chosenClass: "sortable-chosen",
          onEnd: function (evt) {
            // Reorder currentExistingImages
            const movedItem = currentExistingImages.splice(evt.oldIndex, 1)[0];
            currentExistingImages.splice(evt.newIndex, 0, movedItem);
          },
        });
      }

      // Load variants without calling buildColorImagesSections each time
      (p.variants || []).forEach((v) => {
        addVariantRowWithoutRebuild(v);
      });
      // Now build color images sections once with existing color images
      buildColorImagesSections(p.colorImages);
    } catch (err) {
      showToast("Failed to load product: " + err.message, "error");
    }
  } else {
    // Populate categories with no pre-selection
    await populateCategorySelect([]);
    syncCategorySelects();
    addVariantRow();
  }
}

function setCoverFromExisting(url) {
  selectedCoverImageUrl = url || "";
  selectedCoverUploadIndex = null;
  document
    .querySelectorAll("#existing-general-imgs img.cover-thumb")
    .forEach((img) => {
      img.classList.toggle(
        "selected",
        img.dataset.url === selectedCoverImageUrl,
      );
    });
  document
    .querySelectorAll("#image-preview img.cover-thumb")
    .forEach((img) => img.classList.remove("selected"));
}

function setCoverFromUpload(index) {
  selectedCoverImageUrl = "";
  selectedCoverUploadIndex = typeof index === "number" ? index : null;
  document
    .querySelectorAll("#existing-general-imgs img.cover-thumb")
    .forEach((img) => img.classList.remove("selected"));
  document.querySelectorAll("#image-preview img.cover-thumb").forEach((img) => {
    img.classList.toggle("selected", parseInt(img.dataset.index, 10) === index);
  });
}

function renderGeneralUploadPreview(fileList) {
  const preview = document.getElementById("image-preview");
  if (!preview) return;
  preview.innerHTML = "";
  currentNewFiles = Array.from(fileList || []);

  currentNewFiles.forEach((file, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "img-wrapper";
    wrapper.dataset.index = String(idx);

    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.className =
      "cover-thumb" + (selectedCoverUploadIndex === idx ? " selected" : "");
    img.dataset.index = String(idx);
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      setCoverFromUpload(parseInt(wrapper.dataset.index));
    });

    wrapper.appendChild(img);
    preview.appendChild(wrapper);
  });

  // Make sortable
  new Sortable(preview, {
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd: function (evt) {
      // Reorder currentNewFiles
      const movedItem = currentNewFiles.splice(evt.oldIndex, 1)[0];
      currentNewFiles.splice(evt.newIndex, 0, movedItem);

      // Update data-index on all wrappers
      const wrappers = preview.querySelectorAll(".img-wrapper");
      wrappers.forEach((w, i) => {
        w.dataset.index = String(i);
        w.querySelector("img").dataset.index = String(i);
        // Update selected state if needed
        w.querySelector("img").classList.toggle(
          "selected",
          selectedCoverUploadIndex === i,
        );
      });
    },
  });
}

function addVariantRowWithoutRebuild(v = {}) {
  const div = document.createElement("div");
  div.className = "variant-row";
  div.innerHTML = `
    <input type="text" placeholder="Size (e.g. S, M, L, S-M)" class="v-size" value="${v.size || ""}">
    <input type="text" placeholder="Color name (e.g. Black)" class="v-color" value="${v.color || ""}">
    <input type="color" class="v-colorhex" value="${v.colorHex || "#161619"}" title="Color swatch">
    <input type="number" placeholder="Stock" class="v-stock" min="0" value="${v.stock || 0}">
    <button type="button" class="icon-btn" onclick="this.parentElement.remove(); buildColorImagesSections();">🗑</button>
  `;
  // Rebuild color-images panel whenever color name changes
  div
    .querySelector(".v-color")
    .addEventListener("change", buildColorImagesSections);
  div
    .querySelector(".v-color")
    .addEventListener("blur", buildColorImagesSections);
  document.getElementById("variants-container").appendChild(div);
}

function addVariantRow(v = {}) {
  addVariantRowWithoutRebuild(v);
  buildColorImagesSections();
}

/** Build one image-upload section per unique color found in variants */
function buildColorImagesSections(existingColorImages = null) {
  const container = document.getElementById("color-images-container");
  if (!container) return;

  // Collect unique color names from the current variant rows
  const colors = [];
  document
    .querySelectorAll("#variants-container .variant-row .v-color")
    .forEach((inp) => {
      const c = inp.value.trim();
      if (c && !colors.includes(c)) colors.push(c);
    });

  // Preserve already-picked files & existing previews per color
  const savedFiles = {};
  container.querySelectorAll(".color-img-section").forEach((sec) => {
    const color = sec.dataset.color;
    const input = sec.querySelector("input[type=file]");
    if (input && input.files.length > 0) savedFiles[color] = input.files;
  });

  // Preserve currentColorImagesMap state
  const preservedColorState = {};
  Object.keys(currentColorImagesMap).forEach((c) => {
    preservedColorState[c] = {
      existing: [...(currentColorImagesMap[c]?.existing || [])],
      newFiles: [...(currentColorImagesMap[c]?.newFiles || [])],
    };
  });

  // Use passed existingColorImages or whatever is currently stored in the section
  const existingMap = {};
  if (existingColorImages) {
    existingColorImages.forEach((ci) => {
      existingMap[ci.color] = ci.images || [];
    });
  } else {
    // Try to read from data attributes we previously stored
    container.querySelectorAll(".color-img-section").forEach((sec) => {
      const raw = sec.dataset.existing;
      if (raw) existingMap[sec.dataset.color] = JSON.parse(raw);
    });
  }

  container.innerHTML = colors.length
    ? '<p style="font-size:12px;color:#888;margin:12px 0 6px;">Upload photos for each color:</p>'
    : "";

  colors.forEach((color) => {
    // Initialize color state
    if (!currentColorImagesMap[color]) {
      currentColorImagesMap[color] = {
        existing: [...(existingMap[color] || [])],
        newFiles: savedFiles[color] ? Array.from(savedFiles[color]) : [],
      };
    } else {
      // Use preserved state if available, else existing
      if (preservedColorState[color]) {
        currentColorImagesMap[color] = preservedColorState[color];
      } else {
        currentColorImagesMap[color] = {
          existing: [...(existingMap[color] || [])],
          newFiles: savedFiles[color] ? Array.from(savedFiles[color]) : [],
        };
      }
    }

    const sec = document.createElement("div");
    sec.className = "color-img-section";
    sec.dataset.color = color;
    sec.dataset.existing = JSON.stringify(
      currentColorImagesMap[color].existing,
    );

    sec.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="width:14px;height:14px;border-radius:50%;background:var(--ci-hex, #999);display:inline-block;"></span>
        <strong style="font-size:13px;">${color} — photos</strong>
      </div>
      ${
        currentColorImagesMap[color].existing.length
          ? `
        <div class="existing-color-imgs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"></div>
        <p style="font-size:11px;color:#888;margin-bottom:4px;">Upload new images to add more (existing images remain unless you click ✕).</p>
      `
          : ""
      }
      <label class="color-img-label" style="display:block;border:1px dashed #ccc;padding:10px;border-radius:6px;cursor:pointer;text-align:center;font-size:12px;color:#666;">
        📷 Choose photos for <strong>${color}</strong>
        <input type="file" accept="image/*" multiple name="colorImg_${encodeURIComponent(color)}" style="display:none;">
      </label>
      <div class="color-img-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;"></div>
    `;

    // Render existing color images
    const existingImgsContainer = sec.querySelector(".existing-color-imgs");
    if (existingImgsContainer) {
      currentColorImagesMap[color].existing.forEach((imgUrl, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "existing-color-img-wrap img-wrapper";
        wrap.style.cssText = "position:relative;display:inline-block;";
        wrap.dataset.url = imgUrl;

        wrap.innerHTML = `
          <img src="${imgUrl}" style="width:52px;height:52px;object-fit:cover;border-radius:4px;border:1px solid #eee;display:block;" title="Existing">
          <button type="button" class="del-color-img-btn" data-url="${imgUrl}" data-color="${color}" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:#e74c3c;color:#fff;border:none;cursor:pointer;font-size:9px;line-height:16px;text-align:center;padding:0;">✕</button>
        `;

        // Delete button
        wrap.querySelector("button").addEventListener("click", (e) => {
          e.stopPropagation();
          const url = e.currentTarget.dataset.url;
          const colorKey = e.currentTarget.dataset.color;
          if (!deletedColorImages[colorKey]) deletedColorImages[colorKey] = [];
          deletedColorImages[colorKey].push(url);

          // Remove from currentColorImagesMap
          const idx = currentColorImagesMap[colorKey].existing.indexOf(url);
          if (idx !== -1)
            currentColorImagesMap[colorKey].existing.splice(idx, 1);

          wrap.remove();
        });

        existingImgsContainer.appendChild(wrap);
      });

      // Make existing images sortable
      new Sortable(existingImgsContainer, {
        animation: 150,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        onEnd: function (evt) {
          const movedItem = currentColorImagesMap[color].existing.splice(
            evt.oldIndex,
            1,
          )[0];
          currentColorImagesMap[color].existing.splice(
            evt.newIndex,
            0,
            movedItem,
          );
        },
      });
    }

    // Attach file-change listener
    const fileInput = sec.querySelector("input[type=file]");
    const preview = sec.querySelector(".color-img-preview");
    fileInput.addEventListener("change", () => {
      currentColorImagesMap[color].newFiles = Array.from(fileInput.files || []);
      preview.innerHTML = "";
      currentColorImagesMap[color].newFiles.forEach((file, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "img-wrapper";
        wrap.style.cssText = "position:relative;display:inline-block;";
        wrap.dataset.index = String(idx);

        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.style.cssText =
          "width:52px;height:52px;object-fit:cover;border-radius:4px;border:1px solid #eee;";
        wrap.appendChild(img);
        preview.appendChild(wrap);
      });

      // Make new color images sortable
      new Sortable(preview, {
        animation: 150,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        onEnd: function (evt) {
          const movedItem = currentColorImagesMap[color].newFiles.splice(
            evt.oldIndex,
            1,
          )[0];
          currentColorImagesMap[color].newFiles.splice(
            evt.newIndex,
            0,
            movedItem,
          );
        },
      });
    });

    // If we had saved files, render them
    if (savedFiles[color] && savedFiles[color].length > 0) {
      fileInput.files = savedFiles[color]; // Re-set the files on input
      const event = new Event("change");
      fileInput.dispatchEvent(event);
    }

    container.appendChild(sec);
  });
}

async function saveProduct(e) {
  e.preventDefault();
  const btn = document.getElementById("product-save-btn");
  const msg = document.getElementById("product-form-msg");
  btn.disabled = true;
  btn.textContent = "Saving...";
  msg.classList.add("hidden");

  try {
    const form = document.getElementById("product-form");
    const fd = new FormData();

    fd.append("name", form.querySelector("[name=name]").value);
    const cat1 = (form.querySelector("[name=category]")?.value || "").trim();
    const cat2 = (form.querySelector("[name=category2]")?.value || "").trim();
    const cat3 = (form.querySelector("[name=category3]")?.value || "").trim();
    const selectedCategories = Array.from(
      new Set([cat1, cat2, cat3].filter(Boolean)),
    );
    if (selectedCategories.length === 0) {
      throw new Error("Choose at least 1 category for this product.");
    }
    if (selectedCategories.length > 3) {
      throw new Error("You can choose up to 3 categories only.");
    }
    fd.append("category", selectedCategories[0]);
    selectedCategories.forEach((c) => fd.append("categories", c));
    fd.append("productType", form.querySelector("[name=productType]").value);
    fd.append("price", form.querySelector("[name=price]").value);
    fd.append("description", form.querySelector("[name=description]").value);
    fd.append("productCare", form.querySelector("[name=productCare]").value);
    fd.append("featured", form.querySelector("[name=featured]").checked);
    fd.append("active", form.querySelector("[name=active]").checked);
    const homeEnabled = document.getElementById("home-enabled");
    const homePosSelect = form.querySelector("[name=homePosition]");
    if (homePosSelect) {
      if (homeEnabled && homeEnabled.checked) {
        if (!homePosSelect.value) {
          throw new Error("Choose a homepage slot (1–5) for this product.");
        }
        fd.append("homePosition", homePosSelect.value);
      } else {
        fd.append("homePosition", "");
      }
    }

    if (selectedCoverImageUrl) fd.append("coverImage", selectedCoverImageUrl);
    if (selectedCoverUploadIndex !== null)
      fd.append("coverImageUploadIndex", String(selectedCoverUploadIndex));

    // Collect variants with colorHex
    const variants = [];
    document
      .querySelectorAll("#variants-container .variant-row")
      .forEach((row) => {
        const size = row.querySelector(".v-size").value.trim();
        const color = row.querySelector(".v-color").value.trim();
        const colorHex = row.querySelector(".v-colorhex").value;
        const stock = parseInt(row.querySelector(".v-stock").value) || 0;
        if (size || color) variants.push({ size, color, colorHex, stock });
      });
    fd.append("variants", JSON.stringify(variants));

    // Send ordered existing images (for edits)
    if (currentExistingImages.length > 0) {
      fd.append("orderedExistingImages", JSON.stringify(currentExistingImages));
    }

    // General images (optional fallback) - use ordered currentNewFiles
    if (currentNewFiles.length > 0) {
      currentNewFiles.forEach((file) => fd.append("images", file));
    }

    // Per-color images - send ordered existing and new files
    const colorImageData = {};
    Object.keys(currentColorImagesMap).forEach((color) => {
      colorImageData[color] = {
        existing: currentColorImagesMap[color].existing,
      };
      // Append new files in order
      currentColorImagesMap[color].newFiles.forEach((file) => {
        fd.append(`colorImg_${encodeURIComponent(color)}`, file);
      });
    });
    fd.append("colorImageOrder", JSON.stringify(colorImageData));

    // Send deleted image lists so the server can purge them
    if (deletedGeneralImages.length > 0) {
      fd.append("deleteGeneralImages", JSON.stringify(deletedGeneralImages));
    }
    if (Object.keys(deletedColorImages).length > 0) {
      fd.append("deleteColorImages", JSON.stringify(deletedColorImages));
    }

    const url = editingProductId
      ? `/products/${editingProductId}`
      : "/products";
    const method = editingProductId ? "PUT" : "POST";
    const headers = { Authorization: `Bearer ${token}` };
    const res = await fetch(`${API}${url}`, { method, headers, body: fd });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    showToast(
      editingProductId ? "Product updated!" : "Product added!",
      "success",
    );
    closeModal("product-modal");
    loadProducts();
  } catch (err) {
    showMsg(msg, err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Product";
  }
}

async function deleteProduct(id, name) {
  const ok = await showConfirm(
    `"${name}"`,
    "This will permanently remove the product and all its images.",
  );
  if (!ok) return;
  try {
    await apiFetch(`/products/${id}`, "DELETE");
    showToast("Product deleted.", "success");
    loadProducts();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== HOMEPAGE =====
async function loadHomepage() {
  const msg = document.getElementById("homepage-msg");
  if (msg) msg.classList.add("hidden");

  const heroMsg = document.getElementById("homepage-hero-msg");
  if (heroMsg) heroMsg.classList.add("hidden");

  const navbarMsg = document.getElementById("navbar-menu-image-msg");
  if (navbarMsg) navbarMsg.classList.add("hidden");

  const slotsEl = document.getElementById("homepage-slots");
  if (slotsEl)
    slotsEl.innerHTML = `<p style="color:#888;font-size:13px;">Loading...</p>`;

  try {
    // Load hero settings
    const heroRes = await apiFetch("/settings/homepage-hero");
    if (heroRes && heroRes.value) {
      const v = heroRes.value;
      const vidEl = document.getElementById("current-hero-video");
      const imgEl = document.getElementById("current-hero-image");
      if (vidEl)
        vidEl.innerHTML = v.heroVideo
          ? `Current: <a href="${v.heroVideo}" target="_blank" style="color:var(--accent);">View Video</a>`
          : "No video uploaded.";
      if (imgEl)
        imgEl.innerHTML = v.heroImage
          ? `Current: <a href="${v.heroImage}" target="_blank" style="color:var(--accent);">View Image</a>`
          : "No fallback image uploaded.";
    } else {
      const vidEl = document.getElementById("current-hero-video");
      const imgEl = document.getElementById("current-hero-image");
      if (vidEl) vidEl.innerHTML = "No video uploaded.";
      if (imgEl) imgEl.innerHTML = "No fallback image uploaded.";
    }

    // Load navbar menu image setting
    const navbarRes = await apiFetch("/settings/navbar-menu-image");
    const navbarImgEl = document.getElementById("current-navbar-menu-image");
    if (navbarImgEl) {
      if (navbarRes && navbarRes.value && navbarRes.value.menuImage) {
        navbarImgEl.innerHTML = `Current: <a href="${navbarRes.value.menuImage}" target="_blank" style="color:var(--accent);">View Image</a>`;
      } else {
        navbarImgEl.innerHTML = "No menu image uploaded.";
      }
    }

    if (!homepageProductsCache) {
      homepageProductsCache = await fetchAllProductsForHomepage();
    }
    const { items } = await apiFetch("/products/homepage/admin");
    renderHomepageSlots(homepageProductsCache, items || []);
  } catch (err) {
    if (slotsEl) slotsEl.innerHTML = "";
    if (msg) showMsg(msg, err.message, "error");
  }
}

async function saveHomepageHero(e) {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById("homepage-hero-msg");
  const btn = document.getElementById("homepage-hero-save-btn");
  if (msg) msg.classList.add("hidden");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  try {
    const fd = new FormData();
    const videoInput = form.querySelector("[name=heroVideo]");
    const imageInput = form.querySelector("[name=heroImage]");

    if (videoInput.files && videoInput.files.length > 0) {
      fd.append("heroVideo", videoInput.files[0]);
    }
    if (imageInput.files && imageInput.files.length > 0) {
      fd.append("heroImage", imageInput.files[0]);
    }

    // value is empty since files will be stored directly via route handling
    fd.append("value", JSON.stringify({}));

    await fetch(`${API}/settings/homepage-hero`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    showToast("Homepage hero saved!", "success");
    // Clear inputs
    videoInput.value = "";
    imageInput.value = "";
    loadHomepage();
  } catch (err) {
    if (msg) showMsg(msg, err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Save Hero Video";
    }
  }
}

async function saveNavbarMenuImage(e) {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById("navbar-menu-image-msg");
  const btn = document.getElementById("navbar-menu-image-save-btn");
  if (msg) msg.classList.add("hidden");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  try {
    const fd = new FormData();
    const imageInput = form.querySelector("[name=menuImage]");

    if (imageInput.files && imageInput.files.length > 0) {
      fd.append("menuImage", imageInput.files[0]);
    }

    fd.append("value", JSON.stringify({}));

    await fetch(`${API}/settings/navbar-menu-image`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    showToast("Navbar menu image saved!", "success");
    imageInput.value = "";
    loadHomepage();
  } catch (err) {
    if (msg) showMsg(msg, err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Save Menu Image";
    }
  }
}

async function fetchAllProductsForHomepage() {
  const limit = 200;
  let page = 1;
  let all = [];
  while (true) {
    const { products, total } = await apiFetch(
      `/products/admin/all?page=${page}&limit=${limit}`,
    );
    all = all.concat(products || []);
    if (all.length >= (total || 0)) break;
    if (!products || products.length === 0) break;
    page += 1;
    if (page > 50) break;
  }
  return all;
}

function pickProductCoverFromAdminProduct(p) {
  if (!p) return "";
  if (p.coverImage) return p.coverImage;
  if (p.images && p.images.length > 0) return p.images[0];
  if (p.colorImages && p.colorImages.length > 0) {
    const first = p.colorImages.find((ci) => (ci.images || []).length > 0);
    if (first && first.images && first.images.length > 0)
      return first.images[0];
  }
  return "";
}

function renderHomepageSlots(products, currentItems) {
  const slotsEl = document.getElementById("homepage-slots");
  if (!slotsEl) return;
  const currentByPos = new Map();
  (currentItems || []).forEach((it) =>
    currentByPos.set(it.position, String(it.productId)),
  );

  const optionsHtml = (products || [])
    .map((p) => {
      const suffix = p.active === false ? " (inactive)" : "";
      return `<option value="${p._id}">${escapeHtml(p.name || p.slug || p._id)}${suffix}</option>`;
    })
    .join("");

  slotsEl.innerHTML = [1, 2, 3, 4, 5]
    .map(
      (pos) => `
        <div class="form-group form-full">
          <label>Homepage Slot ${pos}</label>
          <select id="homepage-slot-${pos}">
            <option value="">Select product...</option>
            ${optionsHtml}
          </select>
          <div id="homepage-preview-${pos}" style="display:flex;gap:10px;align-items:center;margin-top:10px;"></div>
        </div>
      `,
    )
    .join("");

  [1, 2, 3, 4, 5].forEach((pos) => {
    const select = document.getElementById(`homepage-slot-${pos}`);
    if (!select) return;
    const current = currentByPos.get(pos) || "";
    select.value = current;
    select.addEventListener("change", () =>
      renderHomepagePreviewForSlot(pos, products),
    );
    renderHomepagePreviewForSlot(pos, products);
  });
}

function renderHomepagePreviewForSlot(pos, products) {
  const select = document.getElementById(`homepage-slot-${pos}`);
  const preview = document.getElementById(`homepage-preview-${pos}`);
  if (!select || !preview) return;
  const productId = select.value;
  const p = (products || []).find((x) => String(x._id) === String(productId));
  if (!p) {
    preview.innerHTML = `<span style="color:#888;font-size:12px;">No product selected.</span>`;
    return;
  }
  const imgUrl = pickProductCoverFromAdminProduct(p);
  preview.innerHTML = `
    ${
      imgUrl
        ? `<img src="${imgUrl}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #eee;">`
        : `<div style="width:64px;height:64px;border-radius:6px;border:1px solid #eee;display:flex;align-items:center;justify-content:center;color:#888;font-size:12px;">No img</div>`
    }
    <div>
      <div style="font-weight:600;">${escapeHtml(p.name || "")}</div>
      <div style="color:#888;font-size:12px;">/${escapeHtml(p.slug || "")}</div>
    </div>
  `;
}

async function saveHomepageSlots() {
  const msg = document.getElementById("homepage-msg");
  const btn = document.getElementById("homepage-save-btn");
  if (msg) msg.classList.add("hidden");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }
  try {
    const slots = [1, 2, 3, 4, 5].map((pos) => {
      const select = document.getElementById(`homepage-slot-${pos}`);
      return { position: pos, productId: select ? select.value : "" };
    });

    if (slots.some((s) => !s.productId)) {
      throw new Error("Please select a product for all 5 homepage slots.");
    }
    const unique = new Set(slots.map((s) => s.productId));
    if (unique.size !== 5) {
      throw new Error(
        "Each homepage slot must be a different product (no duplicates).",
      );
    }

    await apiFetch("/products/homepage", "PUT", { slots });
    showToast("Homepage updated!", "success");
    homepageProductsCache = null;
    loadHomepage();
  } catch (err) {
    if (msg) showMsg(msg, err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Save Homepage (5 slots)";
    }
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ===== CATEGORIES =====
async function loadCategories() {
  const list = document.getElementById("categories-list");
  list.innerHTML = '<p style="color:#888;font-size:13px;">Loading...</p>';
  try {
    const { categories } = await apiFetch("/categories/admin/all");
    renderCategories(categories);
  } catch (err) {
    list.innerHTML = `<p style="color:red;font-size:13px;">Error: ${err.message}</p>`;
  }
}

function renderCategories(categories) {
  const list = document.getElementById("categories-list");
  if (!categories || categories.length === 0) {
    list.innerHTML =
      '<p style="color:#888;font-size:13px;">No categories yet.</p>';
    return;
  }
  list.innerHTML = categories
    .map(
      (cat) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;background:#fafafa;">
      <div>
        <strong style="font-size:14px;">${cat.name}</strong>
        <span style="margin-left:8px;color:#888;font-size:12px;background:#f0f0f0;padding:2px 8px;border-radius:4px;">/shop/${cat.slug}</span>
      </div>
      <button class="icon-btn" onclick="deleteCategory('${cat._id}','${cat.name}')" style="color:#e74c3c;" title="Delete category">🗑</button>
    </div>
  `,
    )
    .join("");
}

async function deleteCategory(id, name) {
  const ok = await showConfirm(
    `"${name}"`,
    "Products in this category will remain but may not appear in the shop until reassigned.",
  );
  if (!ok) return;
  try {
    await apiFetch(`/categories/${id}`, "DELETE");
    showToast(`Category "${name}" deleted.`, "success");
    loadCategories();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function syncCategorySelects() {
  const s1 = document.getElementById("product-category-select-1");
  const s2 = document.getElementById("product-category-select-2");
  const s3 = document.getElementById("product-category-select-3");
  if (!s1 || !s2 || !s3) return;

  const v1 = (s1.value || "").trim();
  const v2 = (s2.value || "").trim();
  const v3 = (s3.value || "").trim();
  if (v1 && v2 && v1 === v2) s2.value = "";
  if (v1 && v3 && v1 === v3) s3.value = "";
  if (v2 && v3 && v2 === v3) s3.value = "";

  Array.from(s1.options || []).forEach((o) => {
    o.disabled = Boolean(
      (v2 && o.value && o.value === v2) || (v3 && o.value && o.value === v3),
    );
  });
  Array.from(s2.options || []).forEach((o) => {
    o.disabled = Boolean(
      (v1 && o.value && o.value === v1) || (v3 && o.value && o.value === v3),
    );
  });
  Array.from(s3.options || []).forEach((o) => {
    o.disabled = Boolean(
      (v1 && o.value && o.value === v1) || (v2 && o.value && o.value === v2),
    );
  });
}

async function populateCategorySelect(selectedValues) {
  const select1 = document.getElementById("product-category-select-1");
  const select2 = document.getElementById("product-category-select-2");
  const select3 = document.getElementById("product-category-select-3");
  if (!select1 || !select2 || !select3) return;

  const selected = (Array.isArray(selectedValues) ? selectedValues : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const selected1 = selected[0] || "";
  const selected2 = selected[1] || "";
  const selected3 = selected[2] || "";

  try {
    const { categories } = await apiFetch("/categories/admin/all");
    const options =
      `<option value="">Choose category...</option>` +
      categories
        .map((cat) => `<option value="${cat.slug}">${cat.name}</option>`)
        .join("");

    select1.innerHTML = options;
    select2.innerHTML = options;
    select3.innerHTML = options;
    select1.value = selected1;
    select2.value = selected2 !== selected1 ? selected2 : "";
    select3.value =
      selected3 !== selected1 && selected3 !== selected2 ? selected3 : "";

    const clear1 = document.getElementById("product-category-clear-1");
    const clear2 = document.getElementById("product-category-clear-2");
    const clear3 = document.getElementById("product-category-clear-3");
    if (clear1)
      clear1.onclick = () => {
        select1.value = "";
        syncCategorySelects();
      };
    if (clear2)
      clear2.onclick = () => {
        select2.value = "";
        syncCategorySelects();
      };
    if (clear3)
      clear3.onclick = () => {
        select3.value = "";
        syncCategorySelects();
      };
    select1.onchange = () => syncCategorySelects();
    select2.onchange = () => syncCategorySelects();
    select3.onchange = () => syncCategorySelects();
  } catch {
    select1.innerHTML = '<option value="">Failed to load categories</option>';
    select2.innerHTML = '<option value="">Failed to load categories</option>';
    select3.innerHTML = '<option value="">Failed to load categories</option>';
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}

function showMsg(el, msg, type = "error") {
  el.textContent = msg;
  el.className = `alert alert-${type}`;
  el.classList.remove("hidden");
}

function renderPagination(containerId, total, limit, currentP, onPage) {
  const pages = Math.ceil(total / limit);
  const container = document.getElementById(containerId);
  if (pages <= 1) {
    container.innerHTML = "";
    return;
  }
  let html = "";
  for (let i = 1; i <= pages; i++) {
    html += `<button class="page-btn${i === currentP ? " active" : ""}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

function debounceLoadOrders() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    ordersPage = 1;
    loadOrders();
  }, 400);
}

function debounceLoadProducts() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    productsPage = 1;
    loadProducts();
  }, 400);
}

function removeGeneralImage(wrapper, url) {
  deletedGeneralImages.push(url);
  // Remove from currentExistingImages too
  const idx = currentExistingImages.indexOf(url);
  if (idx !== -1) currentExistingImages.splice(idx, 1);

  wrapper.remove();
  if (selectedCoverImageUrl === url) selectedCoverImageUrl = "";
}

// ===== CUSTOM CONFIRM MODAL =====
let _confirmResolve = null;

function showConfirm(itemName = "", message = "This action cannot be undone.") {
  document.getElementById("confirm-item-name").textContent = itemName;
  document.getElementById("confirm-message").textContent = message;
  document.getElementById("confirm-modal").classList.remove("hidden");
  document.getElementById("confirm-delete-btn").focus();
  return new Promise((resolve) => {
    _confirmResolve = resolve;
  });
}

function confirmCancel() {
  document.getElementById("confirm-modal").classList.add("hidden");
  if (_confirmResolve) {
    _confirmResolve(false);
    _confirmResolve = null;
  }
}

function confirmProceed() {
  document.getElementById("confirm-modal").classList.add("hidden");
  if (_confirmResolve) {
    _confirmResolve(true);
    _confirmResolve = null;
  }
}
