// ===== CONFIG =====
const API = '/api';
let token = localStorage.getItem('hl_token');
let currentPage = 'dashboard';
let ordersPage = 1, productsPage = 1;
let editingProductId = null;
let debounceTimer;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (token) initApp();
  else showLogin();

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const err = document.getElementById('login-error');
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    err.classList.add('hidden');
    try {
      const res = await apiFetch('/auth/login', 'POST', {
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value
      }, false);
      token = res.token;
      localStorage.setItem('hl_token', token);
      initApp();
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove('hidden');
    } finally {
      btn.textContent = 'Sign In';
      btn.disabled = false;
    }
  });

  // Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // View-all links
  document.querySelectorAll('.view-all').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); navigateTo(a.dataset.page); });
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('hl_token');
    token = null;
    document.getElementById('app').classList.add('hidden');
    showLogin();
  });

  // Sidebar toggle
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Change password
  document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('pw-msg');
    const np = document.getElementById('new-password').value;
    const cp = document.getElementById('confirm-password').value;
    if (np !== cp) { showMsg(msg, 'Passwords do not match.', 'error'); return; }
    try {
      await apiFetch('/auth/change-password', 'POST', {
        currentPassword: document.getElementById('current-password').value,
        newPassword: np
      });
      showMsg(msg, 'Password updated successfully!', 'success');
      e.target.reset();
    } catch (err) { showMsg(msg, err.message, 'error'); }
  });

  document.getElementById('product-form').addEventListener('submit', saveProduct);
  document.getElementById('product-images-input').addEventListener('change', previewImages);

  // Auto-generate slug from name
  document.getElementById('cat-name').addEventListener('input', (e) => {
    const slugField = document.getElementById('cat-slug');
    // Only auto-fill if slug is empty or was previously auto-generated
    if (!slugField.dataset.manualEdit) {
      slugField.value = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
  });
  document.getElementById('cat-slug').addEventListener('input', (e) => {
    e.target.dataset.manualEdit = e.target.value ? 'true' : '';
  });

  // Add category form
  document.getElementById('add-category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('cat-form-msg');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Adding...';
    msg.classList.add('hidden');
    try {
      await apiFetch('/categories', 'POST', {
        name: document.getElementById('cat-name').value.trim(),
        slug: document.getElementById('cat-slug').value.trim()
      });
      showToast('Category added!', 'success');
      e.target.reset();
      document.getElementById('cat-slug').dataset.manualEdit = '';
      loadCategories();
    } catch (err) {
      showMsg(msg, err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '+ Add Category';
    }
  });
});

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

async function initApp() {
  try {
    const res = await apiFetch('/auth/me');
    document.getElementById('admin-name').textContent = `👤 ${res.admin.username}`;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    navigateTo('dashboard');
  } catch {
    localStorage.removeItem('hl_token');
    showLogin();
  }
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', p.id !== `page-${page}`));
  if (page === 'dashboard') loadDashboard();
  if (page === 'orders') { ordersPage = 1; loadOrders(); }
  if (page === 'products') { productsPage = 1; loadProducts(); }
  if (page === 'categories') loadCategories();
}

// ===== API HELPER =====
async function apiFetch(endpoint, method = 'GET', body = null, auth = true) {
  const headers = {};
  if (auth && token) headers['Authorization'] = `Bearer ${token}`;
  let opts = { method, headers };
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(`${API}${endpoint}`, opts);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Request failed');
  return data;
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const { stats } = await apiFetch('/dashboard/stats');
    document.getElementById('stat-total-orders').textContent = stats.totalOrders;
    document.getElementById('stat-revenue').textContent = stats.totalRevenue.toLocaleString() + ' EGP';
    document.getElementById('stat-month-orders').textContent = stats.thisMonthOrders;
    document.getElementById('stat-products').textContent = stats.totalProducts;

    // Recent orders
    const tbody = document.getElementById('recent-orders-body');
    tbody.innerHTML = stats.recentOrders.map(o => `
      <tr>
        <td><strong>${o.orderNumber}</strong></td>
        <td>${o.customer.name}</td>
        <td><strong>${o.total.toLocaleString()} EGP</strong></td>
        <td><span class="status-badge status-${o.status}">${o.status}</span></td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="loading-row">No orders yet.</td></tr>';

    // Status chart
    const statusColors = { pending: '#f39c12', confirmed: '#3498db', processing: '#9b59b6', shipped: '#1abc9c', delivered: '#2ecc71', cancelled: '#e74c3c' };
    const total = Object.values(stats.ordersByStatus).reduce((a, b) => a + b, 0) || 1;
    document.getElementById('status-chart').innerHTML = Object.entries(stats.ordersByStatus).map(([s, c]) => `
      <div class="status-bar-item">
        <span class="status-bar-label">${s}</span>
        <div class="status-bar-track"><div class="status-bar-fill" style="width:${(c/total*100).toFixed(1)}%;background:${statusColors[s]||'#888'}"></div></div>
        <span class="status-bar-count">${c}</span>
      </div>
    `).join('') || '<p style="color:#888;font-size:13px;">No orders yet.</p>';

    // Pending badge
    const pending = stats.ordersByStatus.pending || 0;
    const badge = document.getElementById('pending-badge');
    badge.textContent = pending;
    badge.classList.toggle('show', pending > 0);

    // Low stock
    document.getElementById('low-stock-list').innerHTML = stats.lowStock.length
      ? stats.lowStock.map(p => `
        <div class="low-stock-item">
          ${p.images?.[0] ? `<img src="${p.images[0]}" alt="${p.name}">` : '<div class="no-image">N/A</div>'}
          <div class="low-stock-info">
            <p>${p.name}</p>
            <span>${p.computedStock ?? 0} units left</span>
          </div>
        </div>
      `).join('')
      : '<p style="color:#888;font-size:13px;padding:10px 0;">All products are well-stocked.</p>';
  } catch (err) { console.error(err); }
}

// ===== ORDERS =====
async function loadOrders() {
  const search = document.getElementById('order-search').value;
  const status = document.getElementById('order-status-filter').value;
  const from = document.getElementById('order-from').value;
  const to = document.getElementById('order-to').value;

  let url = `/orders?page=${ordersPage}&limit=15`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (status) url += `&status=${status}`;
  if (from) url += `&from=${from}`;
  if (to) url += `&to=${to}`;

  document.getElementById('orders-tbody').innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    const { orders, total } = await apiFetch(url);
    document.getElementById('orders-tbody').innerHTML = orders.map(o => `
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
    `).join('') || '<tr><td colspan="8" class="loading-row">No orders found.</td></tr>';

    renderPagination('orders-pagination', total, 15, ordersPage, (p) => { ordersPage = p; loadOrders(); });
  } catch (err) { document.getElementById('orders-tbody').innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${err.message}</td></tr>`; }
}

async function viewOrder(id) {
  document.getElementById('order-modal').classList.remove('hidden');
  document.getElementById('order-modal-body').innerHTML = '<p class="loading-row">Loading...</p>';
  try {
    const { order } = await apiFetch(`/orders/${id}`);
    document.getElementById('order-modal-title').textContent = `Order #${order.orderNumber}`;
    document.getElementById('order-modal-body').innerHTML = `
      <div class="order-detail-grid">
        <div class="detail-section">
          <h4>Customer</h4>
          <p><strong>Name:</strong> ${order.customer.name}</p>
          <p><strong>Phone:</strong> ${order.customer.phone}</p>
          <p><strong>Email:</strong> ${order.customer.email || 'N/A'}</p>
          <p><strong>Address:</strong> ${order.customer.address}, ${order.customer.city}</p>
          ${order.customer.notes ? `<p><strong>Notes:</strong> ${order.customer.notes}</p>` : ''}
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
          ${order.items.map(i => `
            <tr>
              <td>${i.productName}</td>
              <td>${i.size || '-'} / ${i.color || '-'}</td>
              <td>${i.quantity}</td>
              <td>${i.price.toLocaleString()} EGP</td>
              <td>${i.subtotal.toLocaleString()} EGP</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="text-align:right;margin-top:12px;padding:12px;background:#f9f9f9;border-radius:8px;">
        <p>Subtotal: <strong>${order.subtotal.toLocaleString()} EGP</strong></p>
        <p>Shipping: <strong>${order.shippingFee > 0 ? order.shippingFee.toLocaleString() + ' EGP' : 'Free'}</strong></p>
        <p style="font-size:16px;">Total: <strong>${order.total.toLocaleString()} EGP</strong></p>
      </div>

      <div style="margin-top:16px;">
        <h4 style="margin-bottom:8px;font-size:14px;">Update Status</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${['pending','confirmed','processing','shipped','delivered','cancelled'].map(s => `
            <button class="btn btn-sm ${s === order.status ? 'btn-primary' : 'btn-ghost'}" onclick="updateOrderStatus('${order._id}','${s}')">${s}</button>
          `).join('')}
        </div>
      </div>

      <div style="margin-top:16px;">
        <h4 style="margin-bottom:8px;font-size:14px;">Admin Notes</h4>
        <textarea id="order-notes-input" rows="2" style="width:100%;padding:8px;border:1px solid #e5e5e5;border-radius:6px;font-family:inherit;">${order.adminNotes || ''}</textarea>
        <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="saveOrderNotes('${order._id}')">Save Notes</button>
      </div>
    `;
  } catch (err) { document.getElementById('order-modal-body').innerHTML = `<p class="loading-row">Error: ${err.message}</p>`; }
}

async function updateOrderStatus(id, status) {
  try {
    await apiFetch(`/orders/${id}/status`, 'PATCH', { status });
    showToast('Status updated!', 'success');
    viewOrder(id);
    if (currentPage === 'orders') loadOrders();
    loadDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

async function saveOrderNotes(id) {
  const notes = document.getElementById('order-notes-input').value;
  try {
    await apiFetch(`/orders/${id}/notes`, 'PATCH', { notes });
    showToast('Notes saved!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

function exportOrders() {
  const status = document.getElementById('order-status-filter').value;
  const from = document.getElementById('order-from').value;
  const to = document.getElementById('order-to').value;
  let url = `/api/orders/export/excel?`;
  if (status) url += `status=${status}&`;
  if (from) url += `from=${from}&`;
  if (to) url += `to=${to}&`;
  window.open(url + `token=${token}`, '_blank');
}

// ===== PRODUCTS =====
async function loadProducts() {
  const search = document.getElementById('product-search').value;
  let url = `/products/admin/all?page=${productsPage}&limit=15`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  document.getElementById('products-tbody').innerHTML = '<tr><td colspan="7" class="loading-row">Loading...</td></tr>';
  try {
    const { products, total } = await apiFetch(url);
    document.getElementById('products-tbody').innerHTML = products.map(p => {
      const stock = p.variants ? p.variants.reduce((s, v) => s + (v.stock || 0), 0) : 0;
      return `
        <tr>
          <td>${p.images?.[0] ? `<img src="${p.images[0]}" class="product-thumb">` : '<div class="no-image">No img</div>'}</td>
          <td><strong>${p.name}</strong><br><small style="color:#888">${p.slug || ''}</small></td>
          <td><span style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;text-transform:capitalize;">${p.category}</span></td>
          <td>${p.price.toLocaleString()} EGP</td>
          <td>${stock} units</td>
          <td><span class="status-badge ${p.active ? 'status-delivered' : 'status-cancelled'}">${p.active ? 'Active' : 'Inactive'}</span></td>
          <td style="display:flex;gap:6px;">
            <button class="icon-btn" onclick="openProductModal('${p._id}')">✏️</button>
            <button class="icon-btn" onclick="deleteProduct('${p._id}','${p.name}')">🗑</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" class="loading-row">No products found.</td></tr>';

    renderPagination('products-pagination', total, 15, productsPage, (p) => { productsPage = p; loadProducts(); });
  } catch (err) { document.getElementById('products-tbody').innerHTML = `<tr><td colspan="7" class="loading-row">Error: ${err.message}</td></tr>`; }
}

async function openProductModal(id = null) {
  editingProductId = id;
  const form = document.getElementById('product-form');
  form.reset();
  document.getElementById('variants-container').innerHTML = '';
  document.getElementById('image-preview').innerHTML = '';
  document.getElementById('existing-images-container').innerHTML = '';
  document.getElementById('product-form-msg').classList.add('hidden');
  document.getElementById('product-modal-title').textContent = id ? 'Edit Product' : 'Add Product';
  document.getElementById('product-modal').classList.remove('hidden');

  if (id) {
    try {
      const data = await apiFetch(`/products/admin/all`);
      const p = data.products.find(x => x._id === id);
      if (!p) throw new Error('Product not found');

      // Populate categories and pre-select the product's current category
      await populateCategorySelect(p.category || '');

      form.querySelector('[name=name]').value = p.name || '';
      form.querySelector('[name=price]').value = p.price || '';
      form.querySelector('[name=description]').value = p.description || '';
      form.querySelector('[name=featured]').checked = p.featured || false;
      form.querySelector('[name=active]').checked = p.active !== false;

      // Show current images
      if (p.images && p.images.length > 0) {
        const container = document.getElementById('existing-images-container');
        container.innerHTML = `
          <p style="font-size:12px;color:#888;margin-bottom:6px;">Current images (add new ones above to replace):</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${p.images.map(img => `<img src="${img}" style="width:64px;height:64px;object-fit:cover;border-radius:4px;border:1px solid #eee;">`).join('')}
          </div>
        `;
      }

      // Load variants
      (p.variants || []).forEach(v => addVariantRow(v));
    } catch (err) { showToast('Failed to load product: ' + err.message, 'error'); }
  } else {
    // Populate categories with no pre-selection
    await populateCategorySelect('');
    addVariantRow();
  }
}


function addVariantRow(v = {}) {
  const div = document.createElement('div');
  div.className = 'variant-row';
  div.innerHTML = `
    <input type="text" placeholder="Size (e.g. S, M, L, S-M)" class="v-size" value="${v.size || ''}">
    <input type="text" placeholder="Color name (e.g. Black)" class="v-color" value="${v.color || ''}">
    <input type="color" class="v-colorhex" value="${v.colorHex || '#161619'}" title="Color swatch">
    <input type="number" placeholder="Stock" class="v-stock" min="0" value="${v.stock || 0}">
    <button type="button" class="icon-btn" onclick="this.parentElement.remove()">🗑</button>
  `;
  document.getElementById('variants-container').appendChild(div);
}

function previewImages(e) {
  const preview = document.getElementById('image-preview');
  preview.innerHTML = '';
  Array.from(e.target.files).forEach(file => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
}

async function saveProduct(e) {
  e.preventDefault();
  const btn = document.getElementById('product-save-btn');
  const msg = document.getElementById('product-form-msg');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  msg.classList.add('hidden');

  try {
    const form = document.getElementById('product-form');
    const fd = new FormData();

    fd.append('name', form.querySelector('[name=name]').value);
    fd.append('category', form.querySelector('[name=category]').value);
    fd.append('price', form.querySelector('[name=price]').value);
    fd.append('description', form.querySelector('[name=description]').value);
    fd.append('featured', form.querySelector('[name=featured]').checked);
    fd.append('active', form.querySelector('[name=active]').checked);

    // Collect variants with colorHex
    const variants = [];
    document.querySelectorAll('#variants-container .variant-row').forEach(row => {
      const size = row.querySelector('.v-size').value.trim();
      const color = row.querySelector('.v-color').value.trim();
      const colorHex = row.querySelector('.v-colorhex').value;
      const stock = parseInt(row.querySelector('.v-stock').value) || 0;
      if (size || color) variants.push({ size, color, colorHex, stock });
    });
    fd.append('variants', JSON.stringify(variants));

    // Images
    const imageInput = document.getElementById('product-images-input');
    Array.from(imageInput.files).forEach(file => fd.append('images', file));

    const url = editingProductId ? `/products/${editingProductId}` : '/products';
    const method = editingProductId ? 'PUT' : 'POST';
    const headers = { 'Authorization': `Bearer ${token}` };
    const res = await fetch(`${API}${url}`, { method, headers, body: fd });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    showToast(editingProductId ? 'Product updated!' : 'Product added!', 'success');
    closeModal('product-modal');
    loadProducts();
  } catch (err) {
    showMsg(msg, err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Product';
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await apiFetch(`/products/${id}`, 'DELETE');
    showToast('Product deleted.', 'success');
    loadProducts();
  } catch (err) { showToast(err.message, 'error'); }
}

// ===== CATEGORIES =====
async function loadCategories() {
  const list = document.getElementById('categories-list');
  list.innerHTML = '<p style="color:#888;font-size:13px;">Loading...</p>';
  try {
    const { categories } = await apiFetch('/categories/admin/all');
    renderCategories(categories);
  } catch (err) {
    list.innerHTML = `<p style="color:red;font-size:13px;">Error: ${err.message}</p>`;
  }
}

function renderCategories(categories) {
  const list = document.getElementById('categories-list');
  if (!categories || categories.length === 0) {
    list.innerHTML = '<p style="color:#888;font-size:13px;">No categories yet.</p>';
    return;
  }
  list.innerHTML = categories.map(cat => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;background:#fafafa;">
      <div>
        <strong style="font-size:14px;">${cat.name}</strong>
        <span style="margin-left:8px;color:#888;font-size:12px;background:#f0f0f0;padding:2px 8px;border-radius:4px;">/shop/${cat.slug}</span>
      </div>
      <button class="icon-btn" onclick="deleteCategory('${cat._id}','${cat.name}')" style="color:#e74c3c;" title="Delete category">🗑</button>
    </div>
  `).join('');
}

async function deleteCategory(id, name) {
  if (!confirm(`Delete category "${name}"?\n\nNote: Existing products in this category will not be deleted, but they may not appear on the shop until reassigned.`)) return;
  try {
    await apiFetch(`/categories/${id}`, 'DELETE');
    showToast(`Category "${name}" deleted.`, 'success');
    loadCategories();
  } catch (err) { showToast(err.message, 'error'); }
}

async function populateCategorySelect(selectedValue) {
  const select = document.getElementById('product-category-select');
  try {
    const { categories } = await apiFetch('/categories/admin/all');
    select.innerHTML = categories.map(cat =>
      `<option value="${cat.slug}"${cat.slug === selectedValue ? ' selected' : ''}>${cat.name}</option>`
    ).join('');
    if (selectedValue) select.value = selectedValue;
  } catch {
    select.innerHTML = '<option value="">Failed to load categories</option>';
  }
}


function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

function showMsg(el, msg, type = 'error') {
  el.textContent = msg;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
}

function renderPagination(containerId, total, limit, currentP, onPage) {
  const pages = Math.ceil(total / limit);
  const container = document.getElementById(containerId);
  if (pages <= 1) { container.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= pages; i++) {
    html += `<button class="page-btn${i === currentP ? ' active' : ''}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

function debounceLoadOrders() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { ordersPage = 1; loadOrders(); }, 400);
}

function debounceLoadProducts() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { productsPage = 1; loadProducts(); }, 400);
}
