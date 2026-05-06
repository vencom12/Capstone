const API_URL = '/api/customer'; // Point to customer-specific endpoints
const AUTH_API_URL = '/api/auth';
const SOCKET_URL = window.location.origin;

// Global Error Handler for remote debugging
window.onerror = function(msg, url, line, col, error) {
    console.error('GLOBAL ERROR:', msg, 'at', line, ':', col);
    if (typeof showToast === 'function') showToast(`Runtime Error: ${msg} (Line ${line})`);
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

// Helper: Secure API fetch wrapper
async function apiFetch(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const performFetch = async () => {
        const defaultHeaders = { 'X-Requested-With': 'XMLHttpRequest' };
        if (_csrfToken) defaultHeaders['X-CSRF-Token'] = _csrfToken;
        if (options.body && !(options.body instanceof FormData)) {
            defaultHeaders['Content-Type'] = 'application/json';
        }
        return fetch(url, {
            ...options,
            headers: { ...defaultHeaders, ...(options.headers || {}) },
            credentials: 'include',
            signal: controller.signal
        });
    };

    try {
        let response = await performFetch();
        clearTimeout(id);

        if (response.status === 403) {
            // CSRF mismatch? Refresh and retry ONCE
            await refreshCSRFToken();
            return await performFetch();
        }
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function refreshCSRFToken() {
    try {
        const res = await fetch(`${AUTH_API_URL}/csrf-token`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            _csrfToken = data.csrfToken;
            return _csrfToken;
        }
    } catch (e) { console.error('CSRF Refresh failed', e); }
    return null;
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
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
    }
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
    SESSION_KEY: 'stitch_customer_session',
    async login(email, password, rememberMe = false, portal = 'customer', phoneNumber, address) {
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
    async register(username, email, password, role = 'customer', phoneNumber, address) {
        try {
            const response = await apiFetch(`${AUTH_API_URL}/register`, {
                method: 'POST',
                body: JSON.stringify({ username, email, password, role, phoneNumber, address })
            });
            if (!response.ok) return { success: false, message: (await response.json()).message || 'Registration failed' };
            const data = await response.json();
            localStorage.setItem(this.SESSION_KEY, JSON.stringify({ user: data.user }));
            return { success: true };
        } catch (err) { return { success: false, message: 'Connection error' }; }
    },
    async logout() {
        try { await apiFetch(`${AUTH_API_URL}/logout`, { method: 'POST' }); } catch (e) {}
        // Clear user-specific basket before wiping session
        const session = this.getSession();
        if (session && session.user && session.user.id) {
            localStorage.removeItem('stitch_basket_' + session.user.id);
        }
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
    },
    promptLogin() {
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.classList.add('active');
            // If there's an error message from a previous attempt, hide it
            const errorEl = document.getElementById('login-error');
            if (errorEl) errorEl.style.display = 'none';
        } else {
            // Fallback if modal isn't on current page (e.g. user.html might not have index.html's modal)
            window.location.href = 'index.html?action=login';
        }
    }
};

const UI = {
    toggleModal: (id) => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
        }
    }
};
window.UI = UI;

// --- State Management ---
const State = {
    _cache: { orders: [], products: [], favorites: [], transactions: [], walletBalance: 0, searchQuery: '', selectedCategory: 'All' },
    _syncPromise: null,
    _prevBalance: null, // For rollbacks
    getBasket() {
        const session = AuthManager.getSession();
        const key = session ? 'stitch_basket_' + (session.user.id || session.user._id) : 'stitch_basket_guest';
        const saved = localStorage.getItem(key);
        try {
            const rawBasket = saved ? JSON.parse(saved) : [];
            // Hydrate the minimal stored data with full product details from cache
            return rawBasket.map(item => {
                const product = (State._cache.products || []).find(p => (p._id || p.id)?.toString() === item.productId);
                return {
                    ...item,
                    name: product?.name || item.name || 'Unknown Product',
                    price: product?.price || item.price || 0,
                    imageUrl: product?.imageUrl || item.imageUrl || ''
                };
            });
        } catch (e) {
            console.error('Basket parse error', e);
            return [];
        }
    },
    setBasket(basket) {
        const session = AuthManager.getSession();
        const userId = session ? (session.user.id || session.user._id) : 'guest';
        const key = 'stitch_basket_' + userId;
        
        // Minimize data before storing to avoid QuotaExceededError
        const minimizedBasket = basket.map(item => ({
            id: item.id,
            productId: item.productId || item._id,
            quantity: item.quantity,
            // Keep name/price as fallback but STRIP imageUrl which is often large (Base64)
            name: item.name,
            price: item.price
        }));

        try {
            localStorage.setItem(key, JSON.stringify(minimizedBasket));
            window.dispatchEvent(new Event('basketUpdated'));
            if (typeof updateBasketUI === 'function') updateBasketUI();
        } catch (e) {
            console.error('LocalStorage error:', e);
            if (e.name === 'QuotaExceededError') {
                showToast('Storage full! Please clear your basket or browser cache.');
            }
        }
    },
    async getDashboardState() {
        if (this._syncPromise) return this._syncPromise;

        this._syncPromise = (async () => {
            console.log('[State] Fetching state...');
            try {
                const response = await apiFetch(`${API_URL}/dashboard-state`);
                if (response && response.ok) {
                    const data = await response.json();
                    this._cache = { ...this._cache, ...data };
                    return data;
                }
            } catch (err) {
                console.error('[State] Fetch failed:', err);
            }
            return null;
        })();

        try {
            return await this._syncPromise;
        } finally {
            this._syncPromise = null;
        }
    }
};

// Helper: Format order design field to show all items
function formatOrderDesign(order) {
    if (order.items && order.items.length > 0) {
        return order.items.map(i => `${i.name}${i.quantity > 1 ? ' ×' + i.quantity : ''}`).join(', ');
    }
    return order.design || 'Custom Design';
}

function updateBasketUI() {
    const basket = State.getBasket();
    const headerBasketCount = document.getElementById('header-basket-count');
    const mobileBasketCount = document.getElementById('mobile-basket-count');
    const basketTotal = document.getElementById('basket-total');
    const checkoutBtn = document.getElementById('checkout-btn');
    const guestMsg = document.getElementById('checkout-guest-msg');
    const basketItemLists = document.querySelectorAll('#basket-items-list');

    const count = basket.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const total = basket.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

    if (headerBasketCount) headerBasketCount.innerText = count;
    if (mobileBasketCount) mobileBasketCount.innerText = count;
    if (basketTotal) basketTotal.innerText = `$${total.toFixed(2)}`;

    if (basket.length === 0) {
        basketItemLists.forEach(list => {
            list.innerHTML = '<div style="text-align:center; padding: 20px; opacity: 0.5;"><p>Basket is empty</p></div>';
        });
        if (checkoutBtn) {
            checkoutBtn.style.opacity = '0.5';
            checkoutBtn.style.pointerEvents = 'none';
        }
        return;
    }

    const isGuest = !AuthManager.isAuthenticated();
    if (checkoutBtn) {
        checkoutBtn.style.opacity = '1';
        checkoutBtn.style.pointerEvents = 'auto';
        if (isGuest) {
            checkoutBtn.innerText = 'Login to Checkout';
            checkoutBtn.onclick = () => AuthManager.promptLogin();
            if (guestMsg) guestMsg.style.display = 'block';
        } else {
            checkoutBtn.innerText = 'Checkout Now';
            checkoutBtn.onclick = () => Actions.checkout();
            if (guestMsg) guestMsg.style.display = 'none';
        }
    }

    basketItemLists.forEach(list => {
        list.innerHTML = basket.map(item => `
            <div class="basket-item animate-fade" style="display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px; margin-bottom: 12px;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 600;">${item.name}</span>
                        <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px;">
                            <span style="font-size: 0.8rem; color: var(--text-dim);">$${parseFloat(item.price || 0).toFixed(2)}</span>
                            <div class="quantity-editor" style="display: flex; align-items: center; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 2px 4px; border: 1px solid var(--border-glass);">
                                <input type="number" value="${item.quantity}" min="1" max="99" 
                                    onchange="Actions.updateQuantity('${item.id || item._id}', this.value)"
                                    style="width: 40px; background: none; border: none; color: white; text-align: center; font-size: 0.85rem; outline: none; padding: 4px 0;">
                            </div>
                        </div>
                    </div>
                    <button class="btn" onclick="Actions.removeFromBasket('${item.id || item._id}')" style="padding: 4px 8px; font-size: 0.7rem; color: #ef4444; background: rgba(239,68,68,0.1);">Remove</button>
                </div>`).join('');
    });
}

function updateUI() {
    _updateUIInternal();
}

const _updateUIInternal = debounce(() => {
    const basket = State.getBasket();
    const orders = State._cache.orders || [];
    const products = State._cache.products || [];
    const favorites = State._cache.favorites || [];
    const transactions = State._cache.transactions || [];
    const walletBalance = State._cache.walletBalance || 0;
    const session = AuthManager.getSession();

    // 1. Update Profile Info
    if (session) {
        const username = session.user.username;
        document.querySelectorAll('.profile-name').forEach(el => {
            if (el.innerText !== username) el.innerText = username;
        });
        
        const walletEl = document.getElementById('profile-wallet');
        if (walletEl) {
            const formattedBalance = `$${walletBalance.toFixed(2)}`;
            if (walletEl.innerText !== formattedBalance) walletEl.innerText = formattedBalance;
        }
    }

    // 2. Simple Catalog Rendering
    const searchQuery = (State._cache.searchQuery || '').toLowerCase();
    const selectedCategory = State._cache.selectedCategory || 'All';
    
    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery) || (p.description && p.description.toLowerCase().includes(searchQuery));
        const matchesCategory = selectedCategory === 'All' || p.tag === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const favIds = favorites.map(f => (f._id || f.id)?.toString());
    const productGrids = document.querySelectorAll('.product-grid, #storefront-grid');
    
    productGrids.forEach(grid => {
        if (filteredProducts.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-dim);">
                <p>No designs found.</p>
               </div>`;
        } else {
            grid.innerHTML = filteredProducts.map(p => {
                const idStr = (p._id || p.id).toString();
                const isFav = favIds.includes(idStr);
                return `
                <div class="product-card glass animate-fade">
                    <div class="product-image" style="background-image: url('${p.imageUrl}'); background-size: cover; background-position: center; position: relative;">
                        <button class="fav-toggle-btn" data-id="${idStr}" data-fav="${isFav}" 
                            style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.3); border: none; padding: 8px; border-radius: 50%; color: ${isFav ? '#ef4444' : 'var(--text-dim)'}; cursor: pointer; backdrop-filter: blur(4px);">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        </button>
                    </div>
                    <div class="product-details">
                        <span class="product-tag">${p.tag || 'Design'}</span>
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                            <h3 style="font-weight: 600;">${p.name}</h3>
                            <span style="color: var(--primary); font-weight: 700; font-size: 1.1rem;">$${p.price.toFixed(2)}</span>
                        </div>
                        <p style="color: var(--text-dim); font-size: 0.85rem; line-height: 1.5; margin-bottom: 20px;">${p.description || 'Professional embroidery design.'}</p>
                        <button class="btn btn-primary add-to-basket" data-id="${idStr}" data-name="${p.name}" data-price="${p.price}" data-image="${p.imageUrl || ''}">Add to Basket</button>
                    </div>
                </div>`;
            }).join('');
        }
    });

    // --- Product Pagination ---
    const productPaginationContainer = document.getElementById('product-pagination');
    if (productPaginationContainer && State._cache.productPagination) {
        const { currentPage, totalPages } = State._cache.productPagination;
        if (totalPages > 1) {
            productPaginationContainer.innerHTML = `
                <div class="pagination-controls" style="display: flex; justify-content: center; gap: 10px; margin-top: 30px;">
                    <button class="btn btn-secondary ${currentPage === 1 ? 'disabled' : ''}" 
                        onclick="changeProductPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
                        Previous
                    </button>
                    <span style="display: flex; align-items: center; padding: 0 15px; color: var(--text-dim);">
                        Page ${currentPage} of ${totalPages}
                    </span>
                    <button class="btn btn-secondary ${currentPage === totalPages ? 'disabled' : ''}" 
                        onclick="changeProductPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
                        Next
                    </button>
                </div>
            `;
        } else {
            productPaginationContainer.innerHTML = '';
        }
    }
    
    // Global helper if not already defined
    if (!window.changeProductPage) {
        window.changeProductPage = async (page) => {
            State._cache.productPagination.currentPage = page;
            const data = await State.getDashboardState();
            if (data) _updateUIInternal();
        };
    }

    // 3. Update Tracking
    const trackingList = document.querySelector('#tracking-list-container');
    if (trackingList) {
        if (orders.length === 0) {
            trackingList.innerHTML = '<div style="text-align: center; padding: 60px; color: var(--text-dim);"><p>No active orders.</p></div>';
        } else {
            trackingList.innerHTML = orders.map(order => `
                <div class="glass animate-fade" style="padding: 32px; margin-bottom: 24px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                        <div>
                            <h3 style="margin-bottom: 4px;">Order #${order.orderId}</h3>
                            <p style="color: var(--text-dim); font-size: 0.9rem;">${formatOrderDesign(order)}</p>
                        </div>
                        <span class="status-pill">${order.status}</span>
                    </div>
                    <div style="height: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
                        <div style="width: ${order.progress}%; height: 100%; background: var(--primary); box-shadow: 0 0 10px var(--primary-glow);"></div>
                    </div>
                    <p style="text-align: right; color: var(--text-dim); font-size: 0.85rem;">${order.progress}% Processed</p>
                </div>
            `).join('');
        }
    }

    // 4. Update Favorites
    updateFavoritesGrid();

    // 5. Update History (Transactions)
    const historyDateFilter = State._cache.historyDateFilter;
    let displayTransactions = transactions;
    if (historyDateFilter) {
        displayTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
            return txDate === historyDateFilter;
        });
    }

    const historyTable = document.querySelector('#transaction-table-body');
    if (historyTable) {
        historyTable.innerHTML = displayTransactions.length === 0
            ? `<tr><td colspan="6" style="text-align:center; padding: 40px; color: var(--text-dim);">
                ${historyDateFilter ? 'No transactions found on this date.' : 'No transactions found.'}
               </td></tr>`
            : displayTransactions.map(tx => {
                const receipt = (State._cache.receipts || []).find(r => r.transactionID === tx.transactionID || r.orderID === tx.orderID);
                return `
                <tr>
                    <td data-label="Transaction ID" style="font-family: monospace; font-size: 0.85rem; color: var(--primary);">${tx.transactionID}</td>
                    <td data-label="Date">${new Date(tx.timestamp).toLocaleDateString()}</td>
                    <td data-label="Description">${tx.orderID ? (tx.orderID.startsWith('ORD-') ? 'Order Purchase' : 'Wallet Top-up') : 'N/A'}</td>
                    <td data-label="Amount" style="font-weight: 600;">$${tx.amount.toFixed(2)}</td>
                    <td data-label="Status"><span class="status-pill ${tx.status}">${tx.status}</span></td>
                    <td data-label="Actions">
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary" onclick="viewReceipt('${tx.transactionID}')" style="padding: 6px 12px; font-size: 0.75rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2);">View</button>
                            ${receipt ? `<button class="btn" onclick="downloadReceipt('${receipt.receiptID}')" style="padding: 6px 12px; font-size: 0.75rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #10b981;">Download</button>` : ''}
                        </div>
                    </td>
                </tr>`;
            }).join('');
    }

    updateBasketUI();
}, 200);


// Add date filter listener
document.getElementById('history-date-filter')?.addEventListener('change', (e) => {
    State._cache.historyDateFilter = e.target.value;
    updateUI();
});

function downloadReceipt(receiptId) {
    window.location.href = `${API_URL}/receipt/${receiptId}/download`;
}

async function viewReceipt(transactionID) {
    if (!transactionID) return showToast('No transaction found');
    
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
                    <span>${data.orderID || 'N/A'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <span style="color: var(--text-dim);">Date:</span>
                    <span>${new Date(data.timestamp).toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
                    <span style="color: var(--text-dim);">Method:</span>
                    <span style="text-transform: capitalize;">${data.paymentMethod || 'Wallet'}</span>
                </div>
                
                <h4 style="margin-bottom: 12px; color: var(--text-main);">Items</h4>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
                    ${data.items && data.items.length > 0 ? data.items.map(item => `
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                            <span>${item.name} x${item.quantity}</span>
                            <span>$${(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    `).join('') : '<p style="font-size: 0.85rem; color: var(--text-dim);">No item details (Top-up or Legacy Order).</p>'}
                </div>
                
                <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-glass); padding-top: 16px; font-weight: 700; font-size: 1.1rem;">
                    <span>Total Amount:</span>
                    <span style="color: var(--primary);">$${parseFloat(data.amount || 0).toFixed(2)}</span>
                </div>
                <div style="text-align: center; margin-top: 16px;">
                    <span class="status-pill verified" style="text-transform: uppercase; font-size: 0.7rem;">${data.status}</span>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<p style="color: #ef4444; text-align: center;">Error: ${err.message}</p>`;
    }
}

function updateFavoritesGrid() {
    const favorites = State._cache.favorites || [];
    const favsGrid = document.querySelector('#section-favs .product-grid');
    if (favsGrid) {
        favsGrid.innerHTML = favorites.length === 0
            ? '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-dim);"><p>Your favorites will appear here.</p></div>'
            : favorites.map(p => `
                <div class="product-card glass animate-fade">
                    <div class="product-image" style="background-image: url('${p.imageUrl}'); background-size: cover; background-position: center; position: relative;">
                         <button class="fav-toggle-btn" 
                            data-id="${p._id.toString()}" 
                            data-fav="true" 
                            style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.3); border: none; padding: 8px; border-radius: 50%; color: #ef4444; cursor: pointer; backdrop-filter: blur(4px);">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        </button>
                    </div>
                    <div class="product-details">
                        <h3 style="font-weight:600;">${p.name}</h3>
                        <p style="color:var(--primary); font-weight:700;">$${parseFloat(p.price).toFixed(2)}</p>
                        <button class="btn btn-primary add-to-basket" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}">Add to Basket</button>
                    </div>
                </div>`).join('');
    }
}
// --- Checkout Manager ---
const CheckoutManager = {
    currentBasket: [],
    total: 0,
    selectedMethod: null,
    isVerified: false,

    async open(basket) {
        this.currentBasket = basket;
        this.total = basket.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        this.selectedMethod = null;
        this.isVerified = false;

        const modal = document.getElementById('checkout-modal');
        if (!modal) return;

        document.getElementById('checkout-address').value = AuthManager.getSession()?.user.address || '';
        document.getElementById('checkout-total-price').innerText = `$${this.total.toFixed(2)}`;
        document.getElementById('checkout-wallet-balance').innerText = `$${(State._cache.walletBalance || 0).toFixed(2)}`;
        
        const summaryList = document.getElementById('checkout-summary-list');
        summaryList.innerHTML = basket.map(item => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem;">
                <span>${item.name} × ${item.quantity}</span>
                <span>$${(item.price * item.quantity).toFixed(2)}</span>
            </div>
        `).join('');

        this.updateVerificationUI();
        modal.style.display = 'flex';
    },

    close() {
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.style.display = 'none';
        
        // Restore previous panel: Re-open the basket drawer when checkout is closed
        const toggle = document.getElementById('nav-drawer-toggle');
        if (toggle) toggle.checked = true;
    },

    async selectMethod(method) {
        this.selectedMethod = method;
        document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('active'));
        const btn = document.getElementById(`pay-btn-${method === 'wallet' ? 'wallet' : 'cash'}`);
        if (btn) btn.classList.add('active');

        updateSyncIndicator(true);
        try {
            const response = await apiFetch(`${API_URL}/payment/validate`, {
                method: 'POST',
                body: JSON.stringify({ method, total: this.total })
            });
            this.isVerified = response.ok;
            if (!response.ok) showToast((await response.json()).message || 'Verification failed');
            else showToast('Payment method verified.');
        } catch (e) {
            this.isVerified = false;
            showToast('Validation unavailable');
        } finally {
            updateSyncIndicator(false);
            this.updateVerificationUI();
        }
    },

    updateVerificationUI() {
        const badge = document.getElementById('checkout-verification-badge');
        const placeBtn = document.getElementById('place-order-btn');
        if (this.isVerified) {
            badge.innerText = 'Verified'; badge.className = 'status-badge verified';
            placeBtn.style.opacity = '1'; placeBtn.style.pointerEvents = 'auto';
        } else {
            badge.innerText = 'Pending'; badge.className = 'status-badge pending';
            placeBtn.style.opacity = '0.5'; placeBtn.style.pointerEvents = 'none';
        }
    },

    async topup() {
        const amountInput = document.getElementById('topup-amount').value;
        if (!/^\d+(\.\d+)?$/.test(amountInput) || parseFloat(amountInput) <= 0) return showToast('Invalid amount');
        
        updateSyncIndicator(true);
        try {
            const response = await apiFetch(`${API_URL}/wallet/topup`, {
                method: 'POST',
                body: JSON.stringify({ amount: parseFloat(amountInput) })
            });
            if (response.ok) {
                const data = await response.json();
                State._cache.walletBalance = data.walletBalance;
                
                // Refresh all UI elements including sidebar balance
                updateUI();
                
                // Specific checkout elements
                const checkoutBalance = document.getElementById('checkout-wallet-balance');
                if (checkoutBalance) checkoutBalance.innerText = `$${data.walletBalance.toFixed(2)}`;
                
                // Clear input
                document.getElementById('topup-amount').value = '';
                
                showToast('Wallet topped up successfully');
                
                // CRITICAL: Re-verify payment if wallet is selected
                if (this.selectedMethod === 'wallet') {
                    await this.selectMethod('wallet');
                }
            } else {
                const errorData = await response.json();
                showToast(errorData.message || 'Top-up failed');
            }
        } catch (err) {
            console.error('Top-up error:', err);
            showToast('Connection error during top-up');
        } finally { 
            updateSyncIndicator(false); 
        }
    },    async placeOrder() {
        const placeBtn = document.getElementById('place-order-btn');
        const originalText = placeBtn ? placeBtn.innerText : 'Place Order';
        
        const address = document.getElementById('checkout-address').value;
        const deliveryTime = document.getElementById('checkout-time').value;
        const notes = document.getElementById('checkout-notes').value;

        if (!this.selectedMethod) {
            return showToast('Please select a payment method first.');
        }

        // --- Immediate Feedback Phase ---
        if (placeBtn) {
            placeBtn.disabled = true;
            placeBtn.innerText = 'Processing...';
            placeBtn.style.opacity = '0.7';
        }
        updateSyncIndicator(true);

        try {
            // Filter basket items to ONLY include what the server validation (Joi) expects
            const cleanedItems = this.currentBasket.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity
            }));

            const res = await apiFetch(`${API_URL}/order/submit`, {
                method: 'POST',
                body: JSON.stringify({ 
                    items: cleanedItems, 
                    totalAmount: this.total, 
                    paymentMethod: this.selectedMethod, 
                    address, 
                    deliveryTime, 
                    notes 
                })
            });
            
            let data;
            try {
                data = await res.json();
            } catch (e) {
                data = { message: 'Server returned invalid format.' };
            }

            if (res.ok) {
                // Success: Close modal and clear basket IMMEDIATELY
                this.close();
                State.setBasket([]);
                showToast(data.message || 'Order placed successfully!');
                
                // Refresh data in background - Debounced sync will handle multiple events
                silentCacheSync();

                // Navigate to receipts section
                const rcpNav = document.getElementById('nav-receipts');
                if (rcpNav) rcpNav.checked = true;
                
                return; // Exit early to avoid finally block resetting indicator too soon
            } else {
                showToast(data.message || 'Order failed. Please try again.');
            }
        } catch (err) {
            console.error('placeOrder error:', err);
            showToast(err.message || 'Connection error. Please try again.');
        } finally { 
            if (placeBtn) {
                placeBtn.disabled = false;
                placeBtn.innerText = originalText;
                placeBtn.style.opacity = '1';
            }
            updateSyncIndicator(false); 
        }
    }
};

// --- Initialization & UI Helpers ---
async function refreshDashboardState() {
    updateSyncIndicator(true);
    
    // Pattern: Stale While Revalidate
    // 1. Immediately update UI with whatever is in the current cache
    updateUI();

    // 2. Fetch fresh data in the background
    try {
        const data = await State.getDashboardState();
        if (data) {
            // 3. Update UI again once fresh data arrives
            updateUI();
        }
    } catch (e) {
        console.error('Refresh failed', e);
    } finally {
        updateSyncIndicator(false);
    }
}

const silentCacheSync = debounce(() => {
    State.getDashboardState().then(() => updateUI());
}, 300);

// --- Socket.IO Integration ---
function initSocket() {
    if (typeof io === 'undefined') {
        const script = document.createElement('script');
        script.src = "/socket.io/socket.io.js";
        script.onload = () => setupSocketListeners();
        document.head.appendChild(script);
    } else {
        setupSocketListeners();
    }
}

function setupSocketListeners() {
    const socket = io(SOCKET_URL, { 
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
    });

    socket.on('connect', () => console.log('[Socket] Customer connection established.'));

    socket.on('dataChanged', (data) => {
        console.log('[Socket] Delta received:', data.action, data.entity);
        const { action, entity, payload } = data;

        if (entity === 'WALLET' && action === 'UPDATE') {
            State._cache.walletBalance = payload.balance;
            updateUI();
        } else if (entity === 'ORDER' && action === 'UPDATE') {
            State._cache.orders = State._cache.orders.map(o => {
                if (payload.ids && payload.ids.includes(o._id)) {
                    return { ...o, status: payload.status, progress: payload.progress };
                }
                return o;
            });
            updateUI();
        } else {
            silentCacheSync();
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn('[Socket] Disconnected:', reason);
        if (reason === 'io server disconnect') socket.connect();
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    
    // Pagination Listeners
    const prevBtn = document.getElementById('prev-cust-orders-btn');
    const nextBtn = document.getElementById('next-cust-orders-btn');
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
    refreshCSRFToken();
    if (AuthManager.isAuthenticated()) {
        refreshDashboardState();
    } else if (window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('Capstone/')) {
        State.getDashboardState().then(() => updateUI());
    }
});

const Actions = {
    addToBasketById: (id) => {
        const products = State._cache.products || [];
        const product = products.find(p => (p._id || p.id)?.toString() === id.toString());
        if (product) {
            Actions.addToBasket(product);
        } else {
            showToast('Error: Product not found');
        }
    },
    addToBasket: (item, quantity = 1) => {
        if (!AuthManager.isAuthenticated()) {
            AuthManager.promptLogin();
            return;
        }
        const basket = State.getBasket();
        // Use .toString() for safe comparison of ObjectIDs vs Strings
        const itemId = item._id ? item._id.toString() : (item.id ? item.id.toString() : null);
        if (!itemId) return showToast('Error: Product ID missing');

        // Check for existing item using a more robust comparison
        const existing = basket.find(b => 
            (b._id && b._id.toString() === itemId) || 
            (b.id && b.id.toString() === itemId) ||
            (b.productId && b.productId.toString() === itemId)
        );
        
        if (existing) {
            existing.quantity = (parseInt(existing.quantity) || 0) + parseInt(quantity);
        } else {
            basket.push({ 
                _id: itemId,
                productId: itemId, // Redundancy for different lookup methods
                name: item.name || 'Unknown Product', 
                price: parseFloat(item.price || 0),
                imageUrl: item.imageUrl || '',
                quantity: parseInt(quantity), 
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5)
            });
        }
        State.setBasket(basket);
        showToast(`Added ${item.name} to basket`);
    },
    removeFromBasket: (id) => {
        let basket = State.getBasket();
        const idStr = id.toString();
        basket = basket.filter(item => (item.id || item._id)?.toString() !== idStr);
        State.setBasket(basket);
        showToast('Item removed from basket');
    },
    updateQuantity: (id, newQty) => {
        let basket = State.getBasket();
        const idStr = id.toString();
        const item = basket.find(i => (i.id || i._id)?.toString() === idStr);
        if (item) {
            const qty = Math.max(1, parseInt(newQty) || 1);
            item.quantity = qty;
            State.setBasket(basket);
        }
    },
    toggleFavorite: async (productId) => {
        if (!AuthManager.isAuthenticated()) {
            AuthManager.promptLogin();
            return;
        }
        
        const favorites = State._cache.favorites || [];
        const products = State._cache.products || [];
        const pIdStr = productId.toString();
        const isFav = favorites.some(f => (f._id || f.id)?.toString() === pIdStr);
        
        // Optimistic Update
        if (isFav) {
            State._cache.favorites = favorites.filter(f => (f._id || f.id)?.toString() !== pIdStr);
        } else {
            const product = products.find(p => p._id.toString() === pIdStr);
            if (product) State._cache.favorites.push(product);
        }
        // Target specific button for immediate visual feedback without full reload
        const btns = document.querySelectorAll(`.fav-toggle-btn[data-id="${productId}"]`);
        btns.forEach(btn => {
            const svg = btn.querySelector('svg');
            if (isFav) { // Was fav, now removing
                btn.style.color = 'var(--text-dim)';
                btn.dataset.fav = 'false';
                if (svg) svg.setAttribute('fill', 'none');
            } else { // Was not fav, now adding
                btn.style.color = '#ef4444';
                btn.dataset.fav = 'true';
                if (svg) svg.setAttribute('fill', 'currentColor');
            }
        });

        // Only update the favorites grid, NOT the entire product grid
        updateFavoritesGrid();

        try {
            const method = isFav ? 'DELETE' : 'POST';
            const response = await apiFetch(`${API_URL}/favorites/${productId}`, { method });
            if (response.ok) {
                showToast(isFav ? 'Removed from favorites' : 'Added to favorites');
                // Silently sync cache in background without re-rendering
                State.getDashboardState();
            } else {
                // Rollback on error — only revert buttons and favorites grid, not entire UI
                State._cache.favorites = favorites;
                btns.forEach(btn => {
                    const svg = btn.querySelector('svg');
                    if (isFav) { btn.style.color = '#ef4444'; btn.dataset.fav = 'true'; if (svg) svg.setAttribute('fill', 'currentColor'); }
                    else { btn.style.color = 'var(--text-dim)'; btn.dataset.fav = 'false'; if (svg) svg.setAttribute('fill', 'none'); }
                });
                updateFavoritesGrid();
                showToast('Failed to sync favorites');
            }
        } catch (e) { 
            State._cache.favorites = favorites;
            btns.forEach(btn => {
                const svg = btn.querySelector('svg');
                if (isFav) { btn.style.color = '#ef4444'; btn.dataset.fav = 'true'; if (svg) svg.setAttribute('fill', 'currentColor'); }
                else { btn.style.color = 'var(--text-dim)'; btn.dataset.fav = 'false'; if (svg) svg.setAttribute('fill', 'none'); }
            });
            updateFavoritesGrid();
            showToast('Connection error'); 
        }
    },
    checkout: () => {
        const basket = State.getBasket();
        if (basket.length === 0) return showToast('Basket is empty');
        
        // Restore previous panel: Close the basket drawer when checkout starts
        const toggle = document.getElementById('nav-drawer-toggle');
        if (toggle) toggle.checked = false;
        
        CheckoutManager.open(basket);
    }
};

// --- Settings Management ---
async function saveSettings() {
    const username = document.getElementById('settings-username')?.value;
    const email = document.getElementById('settings-email')?.value;
    const address = document.getElementById('settings-address')?.value;
    const phone = document.getElementById('settings-phone')?.value;
    const currentPass = document.getElementById('settings-current-pass')?.value;
    const newPass = document.getElementById('settings-new-pass')?.value;

    updateSyncIndicator(true);
    try {
        const res = await apiFetch(`${API_URL}/settings`, {
            method: 'PATCH',
            body: JSON.stringify({ username, email, address, phoneNumber: phone, currentPassword: currentPass, newPassword: newPass })
        });
        const data = await res.json();
        showToast(data.message);
        if (res.ok) {
            localStorage.setItem(AuthManager.SESSION_KEY, JSON.stringify({ user: data.user }));
            refreshDashboardState();
        }
    } catch (e) { showToast('Connection error'); }
    finally { updateSyncIndicator(false); }
}


// --- Event Delegation ---
document.addEventListener('click', (e) => {
    // Basket additions
    const basketBtn = e.target.closest('.add-to-basket');
    if (basketBtn) {
        e.preventDefault(); e.stopPropagation();
        console.log('Add to basket clicked', basketBtn.dataset.id);
        const id = basketBtn.dataset.id;
        if (!id) return showToast('Error: Product ID missing from button');
        
        const products = State._cache.products || [];
        const product = products.find(p => (p._id || p.id)?.toString() === id.toString());
        
        if (product) {
            Actions.addToBasket(product);
        } else {
            const name = basketBtn.dataset.name;
            const price = basketBtn.dataset.price;
            const imageUrl = basketBtn.dataset.image;
            if (name && price) {
                Actions.addToBasket({ _id: id, name, price: parseFloat(price), imageUrl });
            } else {
                console.warn('Product not in cache and dataset missing', id);
                showToast('Error: Product details not found');
            }
        }
        return;
    }

    // Favorite toggles
    const favBtn = e.target.closest('.fav-toggle-btn');
    if (favBtn) {
        e.preventDefault(); e.stopPropagation();
        const id = favBtn.dataset.id;
        Actions.toggleFavorite(id);
        return;
    }

    // Receipt views
    const receiptBtn = e.target.closest('.view-receipt-btn');
    if (receiptBtn) {
        e.preventDefault();
        viewReceipt(receiptBtn.dataset.id);
        return;
    }

    // Settings save
    if (e.target.id === 'settings-save-btn') {
        e.preventDefault();
        saveSettings();
        return;
    }

    // Category filters
    const catBtn = e.target.closest('.category-btn');
    if (catBtn) {
        e.preventDefault();
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        catBtn.classList.add('active');
        State._cache.selectedCategory = catBtn.dataset.category || 'All';
        updateUI();
        return;
    }
});

// Search & Mobile Category listener
document.addEventListener('input', (e) => {
    if (e.target.id === 'product-search' || e.target.id === 'shop-search' || e.target.id === 'storefront-search') {
        State._cache.searchQuery = e.target.value;
        updateUI();
    }
    if (e.target.id === 'mobile-category-select') {
        State._cache.selectedCategory = e.target.value === 'All Designs' ? 'All' : e.target.value;
        updateUI();
    }
});

// --- Final Export & Auto-Init ---
window.Actions = Actions;
window.CheckoutManager = CheckoutManager;
window.AuthManager = AuthManager;
window.State = State;
window.apiFetch = apiFetch;
window.showToast = showToast;
window.silentCacheSync = silentCacheSync;
window.refreshDashboardState = refreshDashboardState;
window.updateUI = updateUI;
window.downloadReceipt = downloadReceipt;
window.viewReceipt = viewReceipt;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    
    // Initial fetch to populate grid
    refreshDashboardState();

    // Unified Date Filter Listener
    document.getElementById('history-date-filter')?.addEventListener('change', (e) => {
        State._cache.historyDateFilter = e.target.value;
        updateUI();
    });
});
