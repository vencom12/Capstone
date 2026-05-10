const API_URL = '/api/employee';
const AUTH_API_URL = '/api/auth';
const SOCKET_URL = window.location.origin;

// Helper: Secure API fetch wrapper
async function apiFetch(url, options = {}) {
    const performFetch = async () => {
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
    };

    let response = await performFetch();
    
    if (response.status === 401) {
        if (!url.includes('/logout')) {
            console.warn('Unauthorized access detected, redirecting to login...');
            AuthManager.logout();
        }
    }
    return response;
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
        localStorage.removeItem(this.SESSION_KEY);
        sessionStorage.removeItem(this.SESSION_KEY);
        // Clear server session without waiting/looping
        fetch(`${AUTH_API_URL}/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
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
    let { orders, products, machine } = State._cache;

    // Apply Search Filtering/Sorting
    const orderSearch = document.getElementById('employee-orders-search')?.value.toLowerCase();
    if (orderSearch) {
        orders = orders.filter(o => 
            o.orderId.toLowerCase().includes(orderSearch) || 
            (o.client && o.client.toLowerCase().includes(orderSearch)) ||
            (o.status && o.status.toLowerCase().includes(orderSearch))
        ).sort((a, b) => {
            const aMatch = a.orderId.toLowerCase().startsWith(orderSearch) || (a.client && a.client.toLowerCase().startsWith(orderSearch));
            const bMatch = b.orderId.toLowerCase().startsWith(orderSearch) || (b.client && b.client.toLowerCase().startsWith(orderSearch));
            return bMatch - aMatch;
        });
    }

    const productSearch = document.getElementById('employee-products-search')?.value.toLowerCase();
    if (productSearch) {
        products = products.filter(p => 
            p.name.toLowerCase().includes(productSearch) || 
            p.tag.toLowerCase().includes(productSearch)
        ).sort((a, b) => {
            const aMatch = a.name.toLowerCase().startsWith(productSearch);
            const bMatch = b.name.toLowerCase().startsWith(productSearch);
            return bMatch - aMatch;
        });
    }

    const historySearch = document.getElementById('employee-history-search')?.value.toLowerCase();
    let historyOrders = orders.filter(o => ['Order Delivered', 'Order Canceled', 'Completed'].includes(o.status));
    if (historySearch) {
        historyOrders = historyOrders.filter(o => 
            o.orderId.toLowerCase().includes(historySearch) || 
            (o.client && o.client.toLowerCase().includes(historySearch))
        ).sort((a, b) => {
            const aMatch = a.orderId.toLowerCase().startsWith(historySearch) || (a.client && a.client.toLowerCase().startsWith(historySearch));
            const bMatch = b.orderId.toLowerCase().startsWith(historySearch) || (b.client && b.client.toLowerCase().startsWith(historySearch));
            return bMatch - aMatch;
        });
    }

    // 1. Machine Status
    const statusEl = document.getElementById('workbench-status');
    const progressEl = document.getElementById('workbench-progress');
    if (statusEl) {
        statusEl.innerText = machine.status;
        statusEl.style.background = machine.status === 'RUNNING' ? 'var(--primary)' : 'var(--accent)';
    }
    if (progressEl) progressEl.style.width = `${machine.progress}%`;

    // 2. Active Orders Table
    if (tableBody) {
        const activeOrders = orders.filter(o => !['Order Delivered', 'Order Canceled'].includes(o.status));
        tableBody.innerHTML = activeOrders.length === 0
            ? '<tr><td colspan="5" style="text-align:center; padding:40px;">No active orders in queue.</td></tr>'
            : activeOrders.map(order => {
                const dateObj = new Date(order.date || order.createdAt);
                const dateStr = dateObj.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return `
                <tr>
                    <td data-label="Order ID">
                        <div class="order-id-main">${order.orderId}</div>
                        <span class="status-pill-small">${order.status}</span>
                    </td>
                    <td data-label="Client">
                        <div class="timestamp-sub">${dateStr}, ${timeStr}</div>
                        <div class="client-name">${order.client || 'Guest'}</div>
                    </td>
                    <td data-label="Design" class="design-cell" title="${formatOrderDesign(order)}">
                        ${formatOrderDesign(order)}
                    </td>
                    <td data-label="Total" class="price-cell">$${parseFloat(order.totalAmount || 0).toFixed(2)}</td>
                    <td data-label="Action">
                        <button class="btn" onclick="openEditOrder('${order._id}')" 
                            style="background: rgba(99, 102, 241, 0.1); color: var(--primary); border: 1px solid rgba(99, 102, 241, 0.2); padding: 6px 12px; font-size: 0.8rem;">
                            Process
                        </button>
                    </td>
                </tr>`;
            }).join('');
    }

    // 3. Inventory/Catalog
    const productList = document.getElementById('product-list-container');
    if (productList) {
        if (products.length === 0 && _syncCount > 0) {
            productList.innerHTML = `
                <div class="stat-card glass animate-fade" style="display: flex; align-items: center; gap: 20px; padding: 15px; height: 112px;">
                    <div class="skeleton" style="width: 80px; height: 80px; border-radius: 12px;"></div>
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                        <div class="skeleton" style="width: 120px; height: 20px;"></div>
                        <div class="skeleton" style="width: 90px; height: 14px;"></div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div class="skeleton" style="width: 80px; height: 35px; border-radius: 8px;"></div>
                        <div class="skeleton" style="width: 80px; height: 35px; border-radius: 8px;"></div>
                    </div>
                </div>
            `;
        } else {
            productList.innerHTML = products.map(p => `
                <div class="stat-card glass animate-fade" style="display: flex; align-items: center; gap: 20px; padding: 15px; position: relative;">
                    <div style="width: 80px; height: 80px; border-radius: 12px; background-image: url('${p.imageUrl}'); background-size: cover; background-position: center;"></div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0;">${p.name}</h4>
                        <p style="color: var(--text-dim); font-size: 0.85rem;">${p.tag} • $${p.price.toFixed(2)}</p>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="btn" onclick="openEditProduct('${p._id}')" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); padding: 8px 16px; font-size: 0.8rem;">Customize</button>
                        <button class="btn" onclick="deleteProduct('${p._id}')" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 16px; font-size: 0.8rem;">Delete</button>
                    </div>
                </div>`).join('');
        }
    }

    // 4. History Table
    const historyTable = document.getElementById('employee-history-table-body');
    if (historyTable) {
        historyTable.innerHTML = historyOrders.length === 0
            ? '<tr><td colspan="5" style="text-align:center; padding:40px;">No historical orders found.</td></tr>'
            : historyOrders.map(o => `
                <tr>
                    <td data-label="Order ID" style="color: var(--primary); font-weight: 600;">${o.orderId}</td>
                    <td data-label="Client">${o.client}</td>
                    <td data-label="Design">${formatOrderDesign(o)}</td>
                    <td data-label="Status"><span class="status-pill">${o.status}</span></td>
                    <td data-label="Date">${new Date(o.date || o.createdAt).toLocaleDateString()}</td>
                </tr>`).join('');
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
        const socket = io(SOCKET_URL, { withCredentials: true });
        socket.on('ordersUpdated', () => {
            refreshDashboardState();
            showToast('Incoming Transmission: Orders Synchronized', 'success');
        });
        socket.on('dataChanged', (data) => {
            console.log('[Socket] Data changed:', data.entity, data.action);
            if (data.entity === 'PRODUCT' || data.entity === 'INVENTORY') {
                refreshDashboardState();
                if (data.action === 'CREATE') {
                    showToast(`New ${data.entity.toLowerCase()} added in real-time`);
                }
            }
        });
        socket.on('machineUpdate', (data) => {
            State._cache.machine = data;
            updateUI();
        });
    };
    document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', async () => {
    initSocket();
    
    // Search listeners
    ['employee-orders-search', 'employee-products-search', 'employee-history-search'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => updateUI());
    });

    if (AuthManager.isAuthenticated()) {
        refreshDashboardState();
    }
});

// --- Actions ---
window.openCreateProduct = () => {
    const form = document.getElementById('create-product-form');
    if (form) {
        form.reset();
        delete form.dataset.editId;
    }
    const titleEl = document.querySelector('#create-product-modal h2');
    if (titleEl) titleEl.innerText = 'Create New Design';
    UI.toggleModal('create-product-modal');
};

window.openEditProduct = (id) => {
    const p = State._cache.products.find(prod => prod._id === id);
    if (!p) return;
    
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-tag').value = p.tag;
    document.getElementById('product-desc').value = p.description || '';
    
    const form = document.getElementById('create-product-form');
    if (form) form.dataset.editId = id;
    
    const titleEl = document.querySelector('#create-product-modal h2');
    if (titleEl) titleEl.innerText = 'Customize Design';
    
    UI.toggleModal('create-product-modal');
};

window.deleteProduct = async (id) => {
    if (!confirm('Delete this design?')) return;
    updateSyncIndicator(true);
    const res = await apiFetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
    updateSyncIndicator(false);
    if (res.ok) {
        showToast('Design deleted');
        refreshDashboardState();
    }
};

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

// Initialize Form Actions
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

    const productForm = document.getElementById('create-product-form');
    if (productForm) {
        console.log('[Employee] Product form found and listener attached');
        productForm.onsubmit = async (e) => {
            e.preventDefault();
            console.log('[Employee] Product form submitted');
            const id = productForm.dataset.editId;
            const formData = new FormData();
            formData.append('name', document.getElementById('product-name').value);
            formData.append('price', document.getElementById('product-price').value);
            formData.append('tag', document.getElementById('product-tag').value);
            formData.append('description', document.getElementById('product-desc').value);
            
            const imgFile = document.getElementById('product-image-file').files[0];
            if (imgFile) formData.append('image', imgFile);

            updateSyncIndicator(true);
            const url = id ? `${API_URL}/products/${id}` : `${API_URL}/products`;
            const method = id ? 'PATCH' : 'POST';
            
            const res = await apiFetch(url, {
                method,
                body: formData
            });
            updateSyncIndicator(false);

            if (res.ok) {
                showToast(id ? 'Design updated' : 'Design created');
                UI.toggleModal('create-product-modal');
                productForm.reset();
                delete productForm.dataset.editId;
                refreshDashboardState();
            } else {
                let errMsg = 'Unknown error';
                try {
                    const errData = await res.json();
                    errMsg = errData.error || errData.message || 'Unknown error';
                } catch (e) {
                    errMsg = await res.text().catch(() => 'Unknown error');
                }
                showToast(`Error ${res.status}: ${errMsg}`);
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
