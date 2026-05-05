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
            <div class="stat-card glass animate-fade" style="display: flex; align-items: center; gap: 20px; padding: 15px;">
                <div style="width: 80px; height: 80px; border-radius: 12px; background-image: url('${p.imageUrl}'); background-size: cover; background-position: center;"></div>
                <div style="flex: 1;">
                    <h4 style="margin: 0;">${p.name}</h4>
                    <p style="color: var(--text-dim); font-size: 0.85rem;">${p.tag} • $${p.price.toFixed(2)}</p>
                </div>
            </div>`).join('');
    }
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

// --- Actions ---
window.openEditOrder = async (id) => {
    // This would typically open a modal and populate it
    showToast('Editing order: ' + id);
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
});

const UI = {
    toggleModal: (id) => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
    }
};

window.UI = UI;
window.AuthManager = AuthManager;
window.State = State;
window.apiFetch = apiFetch;
window.showToast = showToast;
window.refreshDashboardState = refreshDashboardState;

