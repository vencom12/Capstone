const API_URL = '/api/employee';
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
    SESSION_KEY: 'stitch_employee_session',
    async login(email, password, rememberMe = false, portal = 'employee') {
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
    _cache: { orders: [], inventory: [], products: [], machine: { status: 'STOPPED', progress: 0 } },
    async getDashboardState() {
        try {
            const response = await apiFetch(`${API_URL}/dashboard-state`);
            if (response.ok) {
                const data = await response.json();
                this._cache = { ...this._cache, ...data };
                return data;
            }
        } catch (err) { console.error('Employee state error:', err); }
        return null;
    }
};

// --- UI Rendering ---
function updateUI() {
    const { orders, products, machine } = State._cache;

    // 1. Machine Status
    const statusEl = document.getElementById('workbench-status');
    const progressEl = document.getElementById('workbench-progress');
    if (statusEl) {
        statusEl.innerText = machine.status;
        statusEl.style.background = machine.status === 'RUNNING' ? 'var(--primary)' : 'var(--accent)';
    }
    if (progressEl) progressEl.style.width = `${machine.progress}%`;

    // 2. Active Orders Table
    const tableBody = document.getElementById('employee-order-table-body');
    if (tableBody) {
        const activeOrders = orders.filter(o => !['Order Delivered', 'Order Canceled'].includes(o.status));
        tableBody.innerHTML = activeOrders.length === 0
            ? '<tr><td colspan="6" style="text-align:center; padding:40px;">No active orders.</td></tr>'
            : activeOrders.map(order => `
                <tr>
                    <td><input type="checkbox" class="order-checkbox" data-id="${order._id}"></td>
                    <td>${order.orderId}</td>
                    <td>${order.client || 'Guest'}</td>
                    <td>${formatOrderDesign(order)}</td>
                    <td><span class="status-pill">${order.status}</span></td>
                    <td><button class="btn" onclick="openEditOrder('${order._id}')">Process</button></td>
                </tr>`).join('');
    }

    // 3. Inventory/Catalog
    const productList = document.getElementById('product-list-container');
    if (productList) {
        productList.innerHTML = products.map(p => `
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
        socket.on('machineUpdate', (data) => {
            State._cache.machine = data;
            updateUI();
        });
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

const UI = {
    toggleModal: (id) => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
    }
};

document.addEventListener('DOMContentLoaded', () => {
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
            const res = await apiFetch(`${API_URL}/order-status/${id}`, { 
                method: 'PATCH', 
                body: JSON.stringify({ status, progress }) 
            });
            updateSyncIndicator(false);
            if (res.ok) {
                showToast('Order status updated');
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

