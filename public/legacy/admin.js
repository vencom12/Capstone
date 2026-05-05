const API_URL = '/api/admin';
const AUTH_API_URL = '/api/auth';
const SOCKET_URL = window.location.origin;

// Helper: Secure API fetch wrapper
async function apiFetch(url, options = {}) {
    const defaultHeaders = { 'X-Requested-With': 'XMLHttpRequest' };
    if (options.body && !(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
    }
    const fetchOptions = {
        ...options,
        headers: { ...defaultHeaders, ...(options.headers || {}) },
        credentials: 'include'
    };
    return fetch(url, fetchOptions);
}

// --- Global Sync Indicator ---
let _syncCount = 0;
const updateSyncIndicator = (isStarting) => {
    _syncCount += isStarting ? 1 : -1;
    if (_syncCount < 0) _syncCount = 0;
    const el = document.getElementById('global-sync-indicator');
    if (el) {
        if (_syncCount > 0) el.classList.add('is-syncing');
        else el.classList.remove('is-syncing');
    }
};

// --- Toast Notifications ---
function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// --- Auth Manager ---
const AuthManager = {
    SESSION_KEY: 'stitch_opt_session',
    async login(email, password, rememberMe = false, portal = 'admin') {
        try {
            const response = await apiFetch(`${AUTH_API_URL}/login`, {
                method: 'POST',
                body: JSON.stringify({ email, password, rememberMe, portal })
            });
            if (!response.ok) return { success: false, message: (await response.json()).message || 'Login failed' };
            const data = await response.json();
            const storage = rememberMe ? localStorage : sessionStorage;
            storage.setItem(this.SESSION_KEY, JSON.stringify({ user: data.user }));
            return { success: true };
        } catch (err) { return { success: false, message: 'Connection error' }; }
    },
    async logout() {
        await apiFetch(`${AUTH_API_URL}/logout`, { method: 'POST' });
        localStorage.removeItem(this.SESSION_KEY);
        sessionStorage.removeItem(this.SESSION_KEY);
        window.location.href = 'index.html';
    },
    getSession() {
        const session = localStorage.getItem(this.SESSION_KEY) || sessionStorage.getItem(this.SESSION_KEY);
        return session ? JSON.parse(session) : null;
    },
    getUserRole() {
        const session = this.getSession();
        return session ? session.user.role : null;
    },
    isAuthenticated() { return !!this.getSession(); },
    checkAccess(role, redirect = true) {
        const session = this.getSession();
        if (!session || session.user.role !== role) {
            if (redirect) window.location.href = 'index.html';
            return false;
        }
        return true;
    }
};

// --- State Management ---
const State = {
    _cache: { orders: [], users: [], inventory: [], products: [], analytics: null },
    async getDashboardState() {
        try {
            const response = await apiFetch(`${API_URL}/dashboard-state`);
            if (response.ok) {
                const data = await response.json();
                this._cache = { ...this._cache, ...data };
                return data;
            }
        } catch (err) { console.error('Admin state error:', err); }
        return null;
    }
};

// --- UI Rendering ---
function updateUI() {
    const { orders, users, inventory, products, analytics } = State._cache;

    // 1. Update Stats
    if (analytics) {
        const revEl = document.querySelector('.stat-card:nth-child(3) .stat-value');
        if (revEl) revEl.innerText = `$${(analytics.revenue / 1000).toFixed(1)}k`;
        
        // Low stock indicators (midnight/gold)
        const midnight = inventory.find(i => i.name.toLowerCase().includes('midnight'))?.count || 0;
        const gold = inventory.find(i => i.name.toLowerCase().includes('gold'))?.count || 0;
        const midEl = document.getElementById('inv-midnight');
        const goldEl = document.getElementById('inv-gold');
        if (midEl) midEl.innerText = `${midnight} Cones`;
        if (goldEl) goldEl.innerText = `${gold} Cones`;
    }

    // 2. Update Orders Table
    const orderTable = document.getElementById('admin-order-table-body');
    if (orderTable) {
        orderTable.innerHTML = orders.length === 0
            ? '<tr><td colspan="6" style="text-align:center; padding:40px;">No orders found.</td></tr>'
            : orders.map(order => `
                <tr>
                    <td><input type="checkbox" class="admin-order-checkbox" data-id="${order._id}"></td>
                    <td>${order.orderId}</td>
                    <td>${order.client || 'Guest'}</td>
                    <td>${formatOrderDesign(order)}</td>
                    <td><span class="status-pill">${order.status}</span></td>
                    <td><button class="btn" onclick="openEditOrder('${order._id}')">Edit</button></td>
                </tr>`).join('');
    }

    // 3. Update Personnel Table
    const staffTable = document.getElementById('staff-table-body');
    if (staffTable) {
        staffTable.innerHTML = users.length === 0
            ? '<tr><td colspan="5" style="text-align:center; padding:40px;">No personnel found.</td></tr>'
            : users.map(user => `
                <tr>
                    <td>${user.username}</td>
                    <td>${user.email}</td>
                    <td><span class="status-pill">${user.role}</span></td>
                    <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                    <td><button class="btn" style="color:#ef4444" onclick="deleteUser('${user._id}')">Delete</button></td>
                </tr>`).join('');
    }

    // 4. Update Product Grid
    const productGrid = document.getElementById('product-list-container');
    if (productGrid) {
        productGrid.innerHTML = products.map(p => `
            <div class="stat-card glass animate-fade" style="display: flex; align-items: center; gap: 20px; padding: 15px; position: relative;">
                <div style="width: 80px; height: 80px; border-radius: 12px; background-image: url('${p.imageUrl}'); background-size: cover; background-position: center;"></div>
                <div style="flex: 1;">
                    <h4 style="margin: 0;">${p.name}</h4>
                    <p style="color: var(--text-dim); font-size: 0.85rem;">${p.tag} • $${p.price.toFixed(2)}</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button class="btn btn-secondary" onclick="editProduct('${p._id}')" style="padding: 4px 8px; font-size: 0.7rem;">Edit</button>
                    <button class="btn" onclick="deleteProduct('${p._id}')" style="padding: 4px 8px; font-size: 0.7rem; color: #ef4444;">Del</button>
                </div>
            </div>`).join('');
    }

    // 5. Update Charts
    updateCharts();
    updateAITip();
}

function formatOrderDesign(order) {
    if (order.items && order.items.length > 0) return order.items.map(i => i.name).join(', ');
    return order.design || 'Custom';
}

// --- Initialization & Socket ---
async function refreshDashboardState() {
    updateSyncIndicator(true);
    await State.getDashboardState();
    updateUI();
    updateSyncIndicator(false);
}

function initSocket() {
    const script = document.createElement('script');
    script.src = "/socket.io/socket.io.js";
    script.onload = () => {
        const socket = io(SOCKET_URL, { credentials: 'include' });
        socket.on('ordersUpdated', () => refreshDashboardState());
        socket.on('usersUpdated', () => refreshDashboardState());
    };
    document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    if (AuthManager.isAuthenticated()) {
        refreshDashboardState();
    }
});

// --- Analytics & Charts ---
let charts = {};
function initCharts() {
    const ctxTrends = document.getElementById('orderTrendsChart')?.getContext('2d');
    if (ctxTrends) {
        charts.trends = new Chart(ctxTrends, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Revenue', data: [], borderColor: '#6366f1', tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
    const ctxDist = document.getElementById('statusDistChart')?.getContext('2d');
    if (ctxDist) {
        charts.dist = new Chart(ctxDist, {
            type: 'doughnut',
            data: { labels: [], datasets: [{ data: [], backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

async function updateCharts() {
    try {
        const res = await apiFetch(`${API_URL}/analytics`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (charts.trends) {
            charts.trends.data.labels = data.orderTrends.map(t => `${t._id.month}/${t._id.year}`);
            charts.trends.data.datasets[0].data = data.orderTrends.map(t => t.revenue);
            charts.trends.update();
        }
        if (charts.dist) {
            charts.dist.data.labels = data.statusDistribution.map(d => d._id);
            charts.dist.data.datasets[0].data = data.statusDistribution.map(d => d.count);
            charts.dist.update();
        }
    } catch (e) { console.error('Chart update error:', e); }
}

function updateAITip() {
    const tipEl = document.querySelector('#ai-production-advice p:last-child');
    if (!tipEl) return;
    const lowStock = State._cache.inventory.filter(i => i.count < 10);
    const pendingOrders = State._cache.orders.filter(o => o.status === 'In Queue').length;
    
    if (lowStock.length > 0) {
        tipEl.innerText = `Stock Alert: ${lowStock[0].name} is running low (${lowStock[0].count} units). Restock recommended to avoid production delays.`;
    } else if (pendingOrders > 5) {
        tipEl.innerText = `Queue Alert: There are ${pendingOrders} orders waiting. Consider assigning more staff to the production line.`;
    } else {
        tipEl.innerText = `Everything looks good! Production is running smoothly with current resources.`;
    }
}

// --- Product & Staff Actions ---
window.createProduct = async (formData) => {
    updateSyncIndicator(true);
    const res = await apiFetch(`${API_URL}/products`, { method: 'POST', body: JSON.stringify(formData) });
    updateSyncIndicator(false);
    if (res.ok) {
        showToast('Product published');
        UI.toggleModal('create-product-modal');
        refreshDashboardState();
    }
};

window.editProduct = (id) => {
    const p = State._cache.products.find(prod => prod._id === id);
    if (!p) return;
    // Populate create modal for editing
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-tag').value = p.tag;
    document.getElementById('product-desc').value = p.description || '';
    
    const form = document.getElementById('create-product-form');
    form.dataset.editId = id;
    document.querySelector('#create-product-modal h2').innerText = 'Edit Design';
    UI.toggleModal('create-product-modal');
};

window.deleteProduct = async (id) => {
    if (!confirm('Delete this design?')) return;
    const res = await apiFetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Product deleted'); refreshDashboardState(); }
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    
    // Create Product Form
    const productForm = document.getElementById('create-product-form');
    if (productForm) {
        productForm.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('product-name').value,
                price: document.getElementById('product-price').value,
                tag: document.getElementById('product-tag').value,
                description: document.getElementById('product-desc').value
            };
            const editId = productForm.dataset.editId;
            if (editId) {
                const res = await apiFetch(`${API_URL}/products/${editId}`, { method: 'PATCH', body: JSON.stringify(data) });
                if (res.ok) {
                    showToast('Product updated');
                    UI.toggleModal('create-product-modal');
                    refreshDashboardState();
                }
            } else {
                window.createProduct(data);
            }
        };
    }

    // Create Staff Form
    const staffForm = document.getElementById('create-staff-form');
    if (staffForm) {
        staffForm.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                username: document.getElementById('staff-username').value,
                email: document.getElementById('staff-email').value,
                password: document.getElementById('staff-password').value,
                role: document.getElementById('staff-role').value
            };
            const res = await apiFetch(`${API_URL}/users`, { method: 'POST', body: JSON.stringify(data) });
            if (res.ok) {
                showToast('Personnel account established');
                UI.toggleModal('staff-modal');
                refreshDashboardState();
            }
        };
    }
});

// --- Order Actions ---
window.openEditOrder = (id) => {
    const order = State._cache.orders.find(o => o._id === id);
    if (!order) return;
    
    document.getElementById('edit-order-modal-title').innerText = `Process Order #${order.orderId}`;
    document.getElementById('edit-order-client').value = order.client || '';
    document.getElementById('edit-order-design').value = formatOrderDesign(order);
    document.getElementById('edit-order-status').value = order.status;
    document.getElementById('edit-order-progress').value = order.progress;
    
    // Highlight active status button
    document.querySelectorAll('.status-btn').forEach(btn => {
        if (btn.dataset.value === order.status) btn.classList.add('btn-primary');
        else btn.classList.remove('btn-primary');
    });

    const form = document.getElementById('edit-order-form');
    form.dataset.orderId = id;
    UI.toggleModal('edit-order-modal');
};

window.deleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    const res = await apiFetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
        showToast('User deleted');
        refreshDashboardState();
    }
};

// Batch Status Update Handler
document.addEventListener('DOMContentLoaded', () => {
    const batchBtn = document.getElementById('admin-batch-update-btn');
    if (batchBtn) {
        batchBtn.onclick = async () => {
            const status = document.getElementById('admin-batch-status').value;
            const selectedIds = Array.from(document.querySelectorAll('.admin-order-checkbox:checked')).map(cb => cb.dataset.id);
            if (!status || selectedIds.length === 0) return showToast('Select status and orders');
            
            updateSyncIndicator(true);
            const res = await apiFetch(`${API_URL}/orders/batch-status`, {
                method: 'POST',
                body: JSON.stringify({ ids: selectedIds, status })
            });
            updateSyncIndicator(false);
            if (res.ok) {
                showToast('Orders updated');
                refreshDashboardState();
            }
        };
    }

    // Status button group listener
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('status-btn')) {
            document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('btn-primary'));
            e.target.classList.add('btn-primary');
            document.getElementById('edit-order-status').value = e.target.dataset.value;
        }
    });

    // Edit order form submit
    const editOrderForm = document.getElementById('edit-order-form');
    if (editOrderForm) {
        editOrderForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = editOrderForm.dataset.orderId;
            const status = document.getElementById('edit-order-status').value;
            const progress = document.getElementById('edit-order-progress').value;

            updateSyncIndicator(true);
            // Reusing updateOrderStatus from employee logic (assuming it's generic enough)
            const res = await apiFetch(`${API_URL}/orders/batch-status`, { 
                method: 'POST', 
                body: JSON.stringify({ ids: [id], status }) 
            });
            updateSyncIndicator(false);
            if (res.ok) {
                showToast('Order updated');
                UI.toggleModal('edit-order-modal');
                refreshDashboardState();
            }
        };
    }
});

window.UI = UI;
window.AuthManager = AuthManager;
window.State = State;
window.apiFetch = apiFetch;
window.showToast = showToast;
window.refreshDashboardState = refreshDashboardState;

