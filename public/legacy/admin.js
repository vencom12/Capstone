const API_URL = '/api/admin';
const AUTH_API_URL = '/api/auth';
const SOCKET_URL = window.location.origin;

// Export to window for inline scripts
window.API_URL = API_URL;
window.AUTH_API_URL = AUTH_API_URL;

// --- Toast Notifications (Moved to top for error handler) ---
function showToast(message) {
    const container = document.getElementById('toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #333; color: white; padding: 12px 24px; border-radius: 8px; z-index: 10000;';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}
window.showToast = showToast;

// Global Error Handler for remote debugging
window.onerror = function(msg, url, line, col, error) {
    console.error('GLOBAL ERROR:', msg, 'at', line, ':', col, 'in', url);
    const source = url ? url.split('/').pop() : 'Unknown';
    showToast(`Runtime Error: ${msg} (${source}:${line})`);
    return false;
};

// Utility: Debounce function
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

let _csrfToken = null;

// --- Key Objects (Hoisted or defined early for window export) ---
const UI = {
    toggleModal: (id) => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
    }
};

const AuthManager = {
    SESSION_KEY: 'stitch_admin_session',
    async login(email, password, rememberMe = false, portal = 'admin') {
        try {
            const response = await apiFetch(`${AUTH_API_URL}/login`, {
                method: 'POST',
                body: JSON.stringify({ email, password, rememberMe, portal })
            });
            const data = await response.json();
            if (response.ok) {
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem(this.SESSION_KEY, JSON.stringify({ user: data.user }));
                return { success: true };
            } else {
                return { success: false, message: data.message || 'Login failed' };
            }
        } catch (err) { 
            return { success: false, message: 'Connection error' }; 
        }
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

const State = {
    _cache: { 
        orders: [], users: [], inventory: [], products: [], analytics: null, 
         pagination: { currentPage: 1, totalPages: 1, totalOrders: 0 }
    },
    async getDashboardState() {
        if (this._syncPromise) return this._syncPromise;

        this._syncPromise = (async () => {
            console.log('[State] Fetching state...');
            try {
                const page = this._cache.pagination.currentPage || 1;
                const response = await apiFetch(`${API_URL}/dashboard-state?page=${page}`);
                if (response.ok) {
                    const data = await response.json();
                    this._cache = { ...this._cache, ...data };
                    return data;
                }
            } catch (err) { console.error('Admin state error:', err); }
            return null;
        })();

        try {
            return await this._syncPromise;
        } finally {
            this._syncPromise = null;
        }
    }
};

// --- Window Exports ---
window.UI = UI;
window.AuthManager = AuthManager;
window.State = State;
window.showToast = showToast;

window.downloadReceipt = (receiptId) => {
    window.location.href = `/api/customer/receipt/${receiptId}/download`;
};

// Helper: Secure API fetch wrapper
async function apiFetch(url, options = {}) {
    // Refresh token if missing
    if (!_csrfToken && url.includes('/api/')) {
        await refreshCSRFToken();
    }

    const performFetch = async () => {
        const defaultHeaders = { 
            'X-Requested-With': 'XMLHttpRequest'
        };
        if (_csrfToken) {
            defaultHeaders['X-CSRF-Token'] = _csrfToken;
        }
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
        return response;
    }

    // If CSRF mismatch, refresh and retry once
    if (response.status === 403) {
        try {
            const clone = response.clone();
            const data = await clone.json();
            if (data.message && data.message.includes('CSRF')) {
                console.log('CSRF mismatch detected, refreshing token and retrying...');
                await refreshCSRFToken();
                response = await performFetch();
            }
        } catch (e) { /* Not JSON or other error */ }
    }
    
    return response;
}

async function refreshCSRFToken() {
    try {
        const res = await fetch(`${AUTH_API_URL}/csrf-token`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            _csrfToken = data.csrfToken;
        }
    } catch (e) { console.error('CSRF Refresh failed', e); }
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

// --- UI Rendering ---
function updateUI() {
    _updateUIInternal();
}

const _updateUIInternal = debounce(() => {
    let { orders, users, inventory, products, analytics } = State._cache;

    // Apply Search Filtering/Sorting
    const orderSearch = document.getElementById('admin-orders-search')?.value.toLowerCase();
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

    const staffSearch = document.getElementById('admin-staff-search')?.value.toLowerCase();
    if (staffSearch) {
        users = users.filter(u => 
            u.username.toLowerCase().includes(staffSearch) || 
            u.email.toLowerCase().includes(staffSearch) ||
            u.role.toLowerCase().includes(staffSearch)
        ).sort((a, b) => {
            const aMatch = a.username.toLowerCase().startsWith(staffSearch) || a.email.toLowerCase().startsWith(staffSearch);
            const bMatch = b.username.toLowerCase().startsWith(staffSearch) || b.email.toLowerCase().startsWith(staffSearch);
            return bMatch - aMatch;
        });
    }

    const productSearch = document.getElementById('admin-products-search')?.value.toLowerCase();
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

    const historySearch = document.getElementById('admin-history-search')?.value.toLowerCase();
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

    // 1. Update Stats
    if (analytics) {
        const revEl = document.getElementById('overview-revenue');
        if (revEl) revEl.innerText = `$${parseFloat(analytics.revenue || 0).toFixed(2)}`;
        
        // Low stock indicators (midnight/gold)
        const midnight = inventory.find(i => i.name.toLowerCase().includes('midnight'))?.count || 0;
        const gold = inventory.find(i => i.name.toLowerCase().includes('gold'))?.count || 0;
        const midEl = document.getElementById('inv-midnight');
        const goldEl = document.getElementById('inv-gold');
        if (midEl) midEl.innerText = `${midnight} Cones`;
        if (goldEl) goldEl.innerText = `${gold} Cones`;
    }

    const orderTable = document.getElementById('admin-order-table-body');
    if (orderTable) {
        orderTable.innerHTML = orders.length === 0
            ? '<tr><td colspan="8" style="text-align:center; padding:40px;">No orders found.</td></tr>'
            : orders.map(order => `
                <tr onclick="if(!event.target.closest('input, button')) viewReceipt('${order.transactionId?.transactionID}')" style="cursor: pointer;">
                    <td style="color: var(--primary); font-weight: 600;">${order.orderId}</td>
                    <td>${order.client || 'Guest'}</td>
                    <td>${formatOrderDesign(order)}</td>
                    <td style="font-weight: 600;">$${parseFloat(order.totalAmount || 0).toFixed(2)}</td>
                    <td><span class="status-pill">${order.status}</span></td>
                    <td style="font-size: 0.85rem; color: var(--text-dim);">${new Date(order.date || order.createdAt).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn" onclick="event.stopPropagation(); openEditOrder('${order._id}')" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); padding: 6px 12px; font-size: 0.75rem;">Edit</button>
                            ${order.receiptRef ? `<button class="btn" onclick="event.stopPropagation(); downloadReceipt('${order.receiptRef.receiptID}')" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 6px 12px; font-size: 0.75rem;">Download Receipt</button>` : ''}
                        </div>
                    </td>
                </tr>`).join('');
    }

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
                    <td><button class="btn" onclick="deleteUser('${user._id}')" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px 14px; font-size: 0.8rem;">Delete</button></td>
                </tr>`).join('');
    }

    const historyTable = document.getElementById('admin-history-table-body');
    if (historyTable) {
        historyTable.innerHTML = historyOrders.length === 0
            ? '<tr><td colspan="5" style="text-align:center; padding:40px;">No historical records.</td></tr>'
            : historyOrders.map(o => `
                <tr onclick="viewReceipt('${o.transactionId?.transactionID}')" style="cursor: pointer;">
                    <td style="color: var(--primary); font-weight: 600;">${o.orderId}</td>
                    <td>${o.client}</td>
                    <td>$${parseFloat(o.totalAmount || 0).toFixed(2)}</td>
                    <td><span class="status-pill">${o.status}</span></td>
                    <td>${o.receiptRef ? `<button class="btn" onclick="event.stopPropagation(); downloadReceipt('${o.receiptRef.receiptID}')" style="background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 4px 8px; font-size: 0.75rem;">Download Receipt</button>` : 'N/A'}</td>
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
                <div style="display: flex; gap: 8px;">
                    <button class="btn" onclick="editProduct('${p._id}')" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); padding: 8px 16px; font-size: 0.8rem;">Edit</button>
                    <button class="btn" onclick="deleteProduct('${p._id}')" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 16px; font-size: 0.8rem;">Delete</button>
                </div>
            </div>`).join('');
    }

    updateAITip();
    updatePaginationUI();
    updateCharts();
}, 250);

function updatePaginationUI() {
    const { pagination } = State._cache;
    const indicator = document.getElementById('orders-page-indicator');
    if (indicator) {
        indicator.innerText = `Page ${pagination.currentPage} of ${pagination.totalPages}`;
    }
}

function formatOrderDesign(order) {
    if (order.items && order.items.length > 0) return order.items.map(i => i.name).join(', ');
    return order.design || 'Custom';
}

// --- Initialization & Socket ---
async function refreshDashboardState() {
    updateSyncIndicator(true);
    const data = await State.getDashboardState();
    if (data) {
        updateUI(); // Render tables immediately
    }
    updateSyncIndicator(false);
    
    // Background tasks: Only run if we actually have a session
    if (AuthManager.isAuthenticated()) {
        updateCharts(); // This handles its own internal fetch
    }
}

function initSocket() {
    if (typeof io === 'undefined') {
        console.warn('[Admin] Socket.IO client not found, retrying...');
        setTimeout(initSocket, 500);
        return;
    }
    const socket = io(SOCKET_URL, { 
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    socket.on('connect', () => console.log('[Socket] Admin connection established.'));
    
    socket.on('dataChanged', (data) => {
        console.log('[Socket] Delta received:', data.action, data.entity);
        const { action, entity, payload } = data;
        
        // Granular state update instead of full refresh when possible
        if (entity === 'ORDER' && action === 'UPDATE') {
            State._cache.orders = State._cache.orders.map(o => {
                if (payload.ids && payload.ids.includes(o._id)) {
                    return { ...o, status: payload.status, progress: payload.progress };
                }
                return o;
            });
            updateUI();
        } else {
            // Fallback to full refresh for complex changes
            refreshDashboardState();
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn('[Socket] Disconnected:', reason);
        if (reason === 'io server disconnect') socket.connect();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initSocket();
    initCharts(); // Initialize charts on load
    
    // Ensure CSRF token is present before first state fetch
    if (!_csrfToken) await refreshCSRFToken();
    
    if (AuthManager.isAuthenticated()) {
        refreshDashboardState();
    }

    // Pagination Listeners
    document.getElementById('prev-orders-btn')?.addEventListener('click', () => {
        if (State._cache.pagination.currentPage > 1) {
            State._cache.pagination.currentPage--;
            refreshDashboardState();
        }
    });

    document.getElementById('next-orders-btn')?.addEventListener('click', () => {
        if (State._cache.pagination.currentPage < State._cache.pagination.totalPages) {
            State._cache.pagination.currentPage++;
            refreshDashboardState();
        }
    });
});

// --- Analytics & Charts ---
let charts = {};
function initCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded yet. Skipping chart initialization.');
        return;
    }
    
    // Destroy existing charts to prevent "Canvas already in use" error
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    charts = {};

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
            data: { labels: [], datasets: [{ data: [], backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
    const ctxTopOrdered = document.getElementById('topOrderedChart')?.getContext('2d');
    if (ctxTopOrdered) {
        charts.topOrdered = new Chart(ctxTopOrdered, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Orders', data: [], backgroundColor: '#10b981' }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
    const ctxTopLiked = document.getElementById('topLikedChart')?.getContext('2d');
    if (ctxTopLiked) {
        charts.topLiked = new Chart(ctxTopLiked, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Likes', data: [], backgroundColor: '#f59e0b' }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
    const ctxTraffic = document.getElementById('trafficChart')?.getContext('2d');
    if (ctxTraffic) {
        charts.traffic = new Chart(ctxTraffic, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Visits', data: [], borderColor: '#8b5cf6', tension: 0.4, fill: true, backgroundColor: 'rgba(139, 92, 246, 0.1)' }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

async function updateCharts() {
    try {
        const res = await apiFetch(`${API_URL}/analytics`);
        if (!res.ok) return;
        const data = await res.json();
        State._cache.analytics = data; // Save to cache for updateUI
        
        if (charts.trends && data.orderTrends) {
            charts.trends.data.labels = data.orderTrends.map(t => `${t._id.month}/${t._id.year}`);
            charts.trends.data.datasets[0].data = data.orderTrends.map(t => t.revenue);
            charts.trends.update();
        }
        if (charts.dist && data.statusDistribution) {
            charts.dist.data.labels = data.statusDistribution.map(d => d._id);
            charts.dist.data.datasets[0].data = data.statusDistribution.map(d => d.count);
            charts.dist.update();
        }

        // Update Stat Cards
        const visitsEl = document.getElementById('analytics-total-visits');
        if (visitsEl) visitsEl.innerText = (data.totalVisits || 0).toLocaleString();
        
        const avgEl = document.getElementById('analytics-avg-order');
        if (avgEl) avgEl.innerText = `$${parseFloat(data.avgOrderValue || 0).toFixed(2)}`;

        const peakEl = document.getElementById('analytics-peak-season');
        if (peakEl && data.orderTrends && data.orderTrends.length > 0) {
            const sorted = [...data.orderTrends].sort((a, b) => b.revenue - a.revenue);
            peakEl.innerText = `${sorted[0]._id.month}/${sorted[0]._id.year}`;
        } else if (peakEl) {
            peakEl.innerText = 'N/A';
        }

        // Update Charts
        if (charts.topOrdered && data.topOrdered) {
            charts.topOrdered.data.labels = data.topOrdered.map(d => d._id);
            charts.topOrdered.data.datasets[0].data = data.topOrdered.map(d => d.count);
            charts.topOrdered.update();
        }
        
        if (charts.topLiked) {
            if (data.topLiked && data.topLiked.length > 0) {
                charts.topLiked.data.labels = data.topLiked.map(d => d._id);
                charts.topLiked.data.datasets[0].data = data.topLiked.map(d => d.count);
            } else {
                charts.topLiked.data.labels = ['No data yet'];
                charts.topLiked.data.datasets[0].data = [0];
            }
            charts.topLiked.update();
        }

        if (charts.traffic) {
            if (data.traffic && data.traffic.length > 0) {
                charts.traffic.data.labels = data.traffic.map(d => d._id);
                charts.traffic.data.datasets[0].data = data.traffic.map(d => d.count);
            } else {
                charts.traffic.data.labels = ['No data yet'];
                charts.traffic.data.datasets[0].data = [0];
            }
            charts.traffic.update();
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

window.createProduct = async () => {
    const formEl = document.getElementById('create-product-form');
    if (!formEl) return;

    const productId = formEl.dataset.editId;
    const method = productId ? 'PATCH' : 'POST';
    const url = productId ? `${API_URL}/products/${productId}` : `${API_URL}/products`;

    const formData = new FormData();
    formData.append('name', document.getElementById('product-name').value);
    formData.append('price', document.getElementById('product-price').value);
    formData.append('tag', document.getElementById('product-tag').value);
    formData.append('description', document.getElementById('product-desc').value);
    
    const imgFile = document.getElementById('product-image-file').files[0];
    if (imgFile) formData.append('image', imgFile);

    updateSyncIndicator(true);
    const res = await apiFetch(url, { 
        method, 
        body: formData
    });
    updateSyncIndicator(false);

    if (res.ok) {
        showToast(productId ? 'Product updated' : 'Product published');
        UI.toggleModal('create-product-modal');
        formEl.reset();
        delete formEl.dataset.editId;
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

window.editProduct = (id) => {
    const p = State._cache.products.find(prod => prod._id === id);
    if (!p) return;
    
    // Populate modal for editing
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-tag').value = p.tag;
    document.getElementById('product-desc').value = p.description || '';
    
    const form = document.getElementById('create-product-form');
    if (form) form.dataset.editId = id;
    
    const titleEl = document.querySelector('#create-product-modal h2');
    if (titleEl) titleEl.innerText = 'Edit Design';
    
    UI.toggleModal('create-product-modal');
};

window.deleteProduct = async (id) => {
    if (!confirm('Delete this design?')) return;
    updateSyncIndicator(true);
    const res = await apiFetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
    updateSyncIndicator(false);
    if (res.ok) {
        showToast('Product deleted');
        refreshDashboardState();
    }
};

// --- Initialization ---
// Initialize page forms and extra UI components
document.addEventListener('DOMContentLoaded', () => {
    // Search listeners
    ['admin-orders-search', 'admin-products-search', 'admin-staff-search', 'admin-history-search'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => updateUI());
    });

    // Product and Staff form logic
    
    // Create Product Form
    const productForm = document.getElementById('create-product-form');
    if (productForm) {
        productForm.onsubmit = async (e) => {
            e.preventDefault();
            window.createProduct();
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
        if (btn.dataset.value === order.status) {
            btn.classList.add('btn-primary');
            btn.style.background = 'var(--primary)';
            btn.style.color = 'white';
        } else {
            btn.classList.remove('btn-primary');
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.color = 'var(--text-dim)';
        }
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
            
            // Optimistic Update
            State._prevCache = JSON.parse(JSON.stringify(State._cache));
            State._cache.orders = State._cache.orders.map(o => 
                selectedIds.includes(o._id) ? { ...o, status } : o
            );
            updateUI();

            updateSyncIndicator(true);
            const res = await apiFetch(`${API_URL}/orders/batch-status`, {
                method: 'POST',
                body: JSON.stringify({ ids: selectedIds, status })
            });
            updateSyncIndicator(false);
            
            if (res.ok) {
                showToast('Orders updated');
                refreshDashboardState();
            } else {
                // Rollback
                State._cache = State._prevCache;
                updateUI();
                const data = await res.json();
                showToast(`Failed to update: ${data.message || 'Server error'}`);
            }
        };
    }

    // Pagination Listeners
    const prevBtn = document.getElementById('prev-orders-btn');
    const nextBtn = document.getElementById('next-orders-btn');
    if (prevBtn) {
        prevBtn.onclick = () => {
            if (State._cache.pagination.currentPage > 1) {
                State._cache.pagination.currentPage--;
                refreshDashboardState();
            }
        };
    }
    if (nextBtn) {
        nextBtn.onclick = () => {
            if (State._cache.pagination.currentPage < State._cache.pagination.totalPages) {
                State._cache.pagination.currentPage++;
                refreshDashboardState();
            }
        };
    }

    // Status button group listener
    const statusGroup = document.getElementById('status-button-group');
    if (statusGroup) {
        statusGroup.addEventListener('click', (e) => {
            const btn = e.target.closest('.status-btn');
            if (btn) {
                document.querySelectorAll('.status-btn').forEach(b => {
                    b.classList.remove('btn-primary');
                    b.style.background = 'rgba(255,255,255,0.05)';
                    b.style.color = 'var(--text-dim)';
                });
                btn.classList.add('btn-primary');
                btn.style.background = 'var(--primary)';
                btn.style.color = 'white';
                document.getElementById('edit-order-status').value = btn.dataset.value;
            }
        });
    }

    // Edit order form submit
    const editOrderForm = document.getElementById('edit-order-form');
    if (editOrderForm) {
        editOrderForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = editOrderForm.dataset.orderId;
            const status = document.getElementById('edit-order-status').value;

            if (!status) return showToast('Please select a status');

            updateSyncIndicator(true);
            const res = await apiFetch(`${API_URL}/orders/batch-status`, { 
                method: 'POST', 
                body: JSON.stringify({ ids: [id], status }) 
            });
            updateSyncIndicator(false);
            if (res.ok) {
                showToast('Order updated successfully');
                UI.toggleModal('edit-order-modal');
                refreshDashboardState();
            } else {
                const data = await res.json();
                showToast(data.message || 'Update failed');
            }
        };
    }
});

// --- Receipt Viewer ---

window.viewReceipt = async (transactionID) => {
    if (!transactionID || transactionID === 'undefined') return showToast('No transaction found for this order');
    
    UI.toggleModal('receipt-modal');
    const content = document.getElementById('receipt-content');
    content.innerHTML = '<p style="text-align: center; padding: 20px;">Fetching receipt details...</p>';
    
    try {
        const res = await apiFetch(`/api/payments/receipt/${transactionID}`);
        if (!res.ok) throw new Error('Failed to fetch receipt');
        const data = await res.json();
        
        content.innerHTML = `
            <div style="background: rgba(255,255,255,0.03); border-radius: 16px; padding: 24px; border: 1px solid var(--border-glass);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid var(--border-glass); padding-bottom: 16px;">
                    <span style="color: var(--text-dim);">Transaction ID:</span>
                    <span style="font-family: monospace; color: var(--primary);">${data.transactionID}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <span style="color: var(--text-dim);">Order ID:</span>
                    <span>${data.orderID}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <span style="color: var(--text-dim);">Date:</span>
                    <span>${new Date(data.timestamp).toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
                    <span style="color: var(--text-dim);">Client:</span>
                    <span>${data.client || 'Guest'}</span>
                </div>
                
                <h4 style="margin-bottom: 12px; color: var(--text-main);">Items</h4>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
                    ${data.items && data.items.length > 0 ? data.items.map(item => `
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                            <span>${item.name} x${item.quantity}</span>
                            <span>$${(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    `).join('') : '<p style="font-size: 0.85rem; color: var(--text-dim);">No item details available.</p>'}
                </div>
                
                <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-glass); padding-top: 16px; font-weight: 700; font-size: 1.1rem;">
                    <span>Total Amount:</span>
                    <span style="color: var(--primary);">$${parseFloat(data.amount || 0).toFixed(2)}</span>
                </div>
                <div style="text-align: center; margin-top: 16px;">
                    <span class="status-pill" style="text-transform: uppercase; font-size: 0.7rem;">${data.status}</span>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<p style="color: #ef4444; text-align: center;">Error: ${err.message}</p>`;
    }
};

window.UI = UI;
window.AuthManager = AuthManager;
window.State = State;
window.apiFetch = apiFetch;
window.showToast = showToast;
window.refreshDashboardState = refreshDashboardState;




