const API_URL = '/api/customer'; // Point to customer-specific endpoints
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
    async login(email, password, rememberMe = false, portal = 'customer') {
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

// --- State Management ---
const State = {
    _cache: { orders: [], products: [], favorites: [], transactions: [], walletBalance: 0, searchQuery: '', selectedCategory: 'All' },
    _getBasketKey: () => {
        const session = AuthManager.getSession();
        if (session && session.user) {
            const userId = session.user.id || session.user._id;
            if (userId) return 'stitch_basket_' + userId;
        }
        return null; // No basket for unauthenticated users
    },
    getBasket: () => {
        const key = State._getBasketKey();
        if (!key) return [];
        return JSON.parse(localStorage.getItem(key) || '[]');
    },
    setBasket: (basket) => {
        const key = State._getBasketKey();
        if (!key) return;
        localStorage.setItem(key, JSON.stringify(basket));
        window.dispatchEvent(new Event('basketUpdated'));
        if (typeof updateBasketUI === 'function') updateBasketUI();
    },
    async getDashboardState() {
        try {
            const response = await apiFetch(`${API_URL}/dashboard-state`);
            if (response.ok) {
                const data = await response.json();
                // Ensure data is isolated - if guest, favorites MUST be empty
                if (!AuthManager.isAuthenticated()) {
                    data.favorites = [];
                    data.orders = [];
                    data.transactions = [];
                }
                this._cache = { ...this._cache, ...data };
                return data;
            } else if (response.status === 401 || response.status === 403) {
                // GUEST MODE: Fetch products from public endpoint
                const publicRes = await fetch('/api/products');
                if (publicRes.ok) {
                    const products = await publicRes.json();
                    this._cache.products = products;
                    this._cache.favorites = [];
                    this._cache.orders = [];
                    this._cache.transactions = [];
                    return { products };
                }
            }
        } catch (err) { console.error('Dashboard state error:', err); }
        return null;
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
                            <span style="font-size: 0.8rem; color: var(--text-dim);">$${item.price.toFixed(2)}</span>
                            <div class="quantity-editor" style="display: flex; align-items: center; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 2px 4px; border: 1px solid var(--border-glass);">
                                <input type="number" value="${item.quantity}" min="1" max="99" 
                                    onchange="Actions.updateQuantity('${item.id || item._id}', this.value)"
                                    style="width: 40px; background: none; border: none; color: white; text-align: center; font-size: 0.85rem; outline: none; padding: 4px 0;">
                            </div>
                        </div>
                    </div>
                    <button class="btn" onclick="Actions.removeFromBasket('${item.id || item._id}')" style="padding: 4px 8px; font-size: 0.7rem; color: #ef4444; background: rgba(239,68,68,0.1);">Remove</button>
                </div>
            </div>`).join('');
    });
}

function updateUI() {
    const basket = State.getBasket();
    const orders = State._cache.orders || [];
    const products = State._cache.products || [];
    const favorites = State._cache.favorites || [];
    const transactions = State._cache.transactions || [];
    const walletBalance = State._cache.walletBalance || 0;
    const session = AuthManager.getSession();

    // 1. Update Profile Info
    if (session) {
        document.querySelectorAll('.profile-name').forEach(el => el.innerText = session.user.username);
        const walletEl = document.getElementById('profile-wallet');
        if (walletEl) walletEl.innerText = `$${walletBalance.toFixed(2)}`;
    }

    // 2. Update Catalog (Storefront & Shop)
    const searchQuery = (State._cache.searchQuery || '').toLowerCase();
    const selectedCategory = State._cache.selectedCategory || 'All';
    
    let filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery) || (p.description && p.description.toLowerCase().includes(searchQuery));
        const matchesCategory = selectedCategory === 'All' || p.tag === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const favIds = favorites.map(f => f._id.toString());
    const productGrids = document.querySelectorAll('.product-grid, #storefront-grid');
    productGrids.forEach(grid => {
        grid.innerHTML = filteredProducts.length === 0 
            ? `<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-dim);">
                <p>${products.length === 0 ? 'No designs found.' : 'No designs match your search.'}</p>
               </div>`
            : filteredProducts.map(p => {
                const isFav = favIds.includes(p._id.toString());
                return `
                <div class="product-card glass animate-fade">
                    <div class="product-image" style="background-image: url('${p.imageUrl}'); background-size: cover; background-position: center; position: relative;">
                        <button class="fav-toggle-btn" 
                            data-id="${p._id.toString()}" 
                            data-fav="${isFav}" 
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
                        <button class="btn btn-primary add-to-basket" 
                            data-id="${p._id.toString()}"
                            data-name="${p.name}"
                            data-price="${p.price}"
                            onclick="Actions.addToBasketById('${p._id.toString()}')">
                            Add to Basket
                        </button>
                    </div>
                </div>`;
            }).join('');
    });

    // 3. Update Tracking
    const trackingList = document.querySelector('#section-tracking .tracking-container') || document.getElementById('section-tracking');
    if (trackingList) {
        if (orders.length === 0) {
            trackingList.innerHTML = '<div style="text-align: center; padding: 60px; color: var(--text-dim);"><p>No active orders.</p></div>';
        } else {
            trackingList.innerHTML = `
                <div class="tracking-container" style="display: flex; flex-direction: column; gap: 20px;">
                    ${orders.map(order => `
                        <div class="glass animate-fade" style="padding: 32px;">
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
                    `).join('')}
                </div>`;
        }
    }

    // 4. Update Favorites
    updateFavoritesGrid();

    // 5. Update History (Transactions)
    const historyTable = document.querySelector('#section-history tbody');
    if (historyTable) {
        historyTable.innerHTML = transactions.length === 0
            ? '<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-dim);">No transactions found.</td></tr>'
            : transactions.map(tx => `
                <tr>
                    <td>${tx.transactionID}</td>
                    <td>${tx.orderID}</td>
                    <td>$${tx.amount.toFixed(2)}</td>
                    <td><span class="status-pill ${tx.status}">${tx.status}</span></td>
                    <td>
                        <button class="btn btn-secondary view-receipt-btn" data-id="${tx.transactionID}" style="padding: 6px 12px; font-size: 0.8rem;">View</button>
                    </td>
                </tr>`).join('');
    }

    updateBasketUI();
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
                document.getElementById('checkout-wallet-balance').innerText = `$${data.walletBalance.toFixed(2)}`;
                showToast('Wallet topped up');
                if (this.selectedMethod === 'wallet') this.selectMethod('wallet');
            }
        } finally { updateSyncIndicator(false); }
    },

    async placeOrder() {
        const address = document.getElementById('checkout-address').value;
        const deliveryTime = document.getElementById('checkout-time').value;
        const notes = document.getElementById('checkout-notes').value;

        updateSyncIndicator(true);
        try {
            const res = await apiFetch(`${API_URL}/order/submit`, {
                method: 'POST',
                body: JSON.stringify({ items: this.currentBasket, totalAmount: this.total, paymentMethod: this.selectedMethod, address, deliveryTime, notes })
            });
            if (res.ok) {
                showToast((await res.json()).message);
                this.close();
                State.setBasket([]);
                silentCacheSync();
            } else showToast((await res.json()).message || 'Order failed');
        } finally { updateSyncIndicator(false); }
    }
};

// --- Initialization & UI Helpers ---
async function refreshDashboardState() {
    updateSyncIndicator(true);
    await State.getDashboardState();
    updateUI();
    updateSyncIndicator(false);
}

function silentCacheSync() {
    State.getDashboardState().then(() => updateUI());
}

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
    const socket = io(SOCKET_URL, { credentials: 'include' });
    socket.on('ordersUpdated', () => silentCacheSync());
    socket.on('transactionsUpdated', () => silentCacheSync());
    socket.on('dataChanged', (data) => {
        if (data.type === 'wallet') {
            State._cache.walletBalance = data.balance;
            updateUI();
        }
        silentCacheSync();
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    if (AuthManager.isAuthenticated()) {
        refreshDashboardState();
    } else if (window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('Capstone/')) {
        State.getDashboardState().then(() => updateUI());
    }
});

const Actions = {
    addToBasketById: (id) => {
        const products = State._cache.products || [];
        const product = products.find(p => p._id.toString() === id.toString());
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
                name: item.name, 
                price: parseFloat(item.price),
                imageUrl: item.imageUrl,
                quantity: parseInt(quantity), 
                id: Date.now()
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

async function viewReceipt(id) {
    updateSyncIndicator(true);
    try {
        const res = await apiFetch(`${API_URL}/receipt/${id}`);
        if (!res.ok) return showToast('Could not fetch receipt');
        const r = await res.json();
        
        // Simulating a receipt modal with a formatted alert for now
        // In a real app, this would open a printable window or a styled modal
        const itemsList = r.items.map(i => `${i.name} x ${i.quantity}`).join('\n');
        alert(`RECEIPT - ${r.transactionID}\nDate: ${new Date(r.timestamp).toLocaleString()}\nTotal: $${r.amount.toFixed(2)}\nStatus: ${r.status}\n\nItems:\n${itemsList}`);
    } catch (e) { showToast('Error loading receipt'); }
    finally { updateSyncIndicator(false); }
}

// --- Event Delegation ---
document.addEventListener('click', (e) => {
    // Basket additions
    const basketBtn = e.target.closest('.add-to-basket');
    if (basketBtn) {
        e.preventDefault(); e.stopPropagation();
        const id = basketBtn.dataset.id;
        if (!id) return; // Robustness: Skip if ID is missing (should not happen with fixed buttons)
        
        const products = State._cache.products || [];
        const product = products.find(p => (p._id || p.id)?.toString() === id.toString());
        
        if (product) {
            Actions.addToBasket(product);
        } else {
            const name = basketBtn.dataset.name;
            const price = basketBtn.dataset.price;
            if (name && price) Actions.addToBasket({ _id: id, name, price: parseFloat(price) });
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

// Search listener
document.addEventListener('input', (e) => {
    if (e.target.id === 'product-search' || e.target.id === 'shop-search' || e.target.id === 'storefront-search') {
        State._cache.searchQuery = e.target.value;
        updateUI();
    }
});

window.Actions = Actions;
window.CheckoutManager = CheckoutManager;
window.AuthManager = AuthManager;
window.State = State;
window.apiFetch = apiFetch;
window.showToast = showToast;
window.silentCacheSync = silentCacheSync;
window.refreshDashboardState = refreshDashboardState;
window.updateUI = updateUI;

