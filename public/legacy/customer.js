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
    async validateSession() {
        const response = await apiFetch(`${AUTH_API_URL}/me`);
        if (!response.ok) {
            localStorage.removeItem(this.SESSION_KEY);
            sessionStorage.removeItem(this.SESSION_KEY);
            return false;
        }
        const data = await response.json();
        const storage = localStorage.getItem(this.SESSION_KEY) ? localStorage : sessionStorage;
        storage.setItem(this.SESSION_KEY, JSON.stringify({ user: data.user }));
        return true;
    }
};

// --- State Management ---
const State = {
    _cache: { orders: [], products: [], favorites: [], transactions: [], walletBalance: 0 },
    getBasket: () => JSON.parse(localStorage.getItem('stitch_basket') || '[]'),
    setBasket: (basket) => {
        localStorage.setItem('stitch_basket', JSON.stringify(basket));
        window.dispatchEvent(new Event('basketUpdated'));
    },
    async getDashboardState() {
        try {
            const response = await apiFetch(`${API_URL}/dashboard-state`);
            if (response.ok) {
                const data = await response.json();
                this._cache = { ...this._cache, ...data };
                return data;
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
    const basketCount = document.getElementById('basket-count');
    const headerBasketCount = document.getElementById('header-basket-count');
    if (basketCount) basketCount.innerText = `${basket.length} Items`;
    if (headerBasketCount) headerBasketCount.innerText = basket.length;

    const basketItems = document.getElementById('basket-items-list');
    if (basketItems) {
        basketItems.innerHTML = basket.length === 0 
            ? '<div style="text-align:center;color:var(--text-dim)"><p>Basket is empty</p></div>'
            : basket.map(item => `
                <div class="basket-item" style="display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>${item.name}</span>
                        <span>$${(parseFloat(item.price) * (item.quantity || 1)).toFixed(2)}</span>
                    </div>
                </div>
            `).join('');
    }
}

function updateUI() {
    const products = State._cache.products || [];
    const favorites = State._cache.favorites || [];
    const favIds = favorites.map(f => f._id);

    const grid = document.getElementById('storefront-grid');
    if (grid) {
        grid.innerHTML = products.map(p => {
            const isFav = favIds.includes(p._id);
            return `
            <div class="product-card glass animate-fade">
                <div class="product-image" style="background-image: url('${p.imageUrl}'); background-size: cover;">
                    <button class="fav-toggle-btn" data-id="${p._id}" data-fav="${isFav}" style="color: ${isFav ? '#ef4444' : 'white'}">
                        <svg width="20" height="20" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    </button>
                </div>
                <div class="product-details">
                    <h3>${p.name}</h3>
                    <p>$${p.price.toFixed(2)}</p>
                    <button class="btn btn-primary add-to-basket" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}">Add to Basket</button>
                </div>
            </div>`;
        }).join('');
    }
    updateBasketUI();
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
function silentCacheSync() {
    State.getDashboardState().then(() => { if (typeof updateUI === 'function') updateUI(); });
}

const Actions = {
    addToBasket: (item, quantity = 1) => {
        if (!AuthManager.isAuthenticated()) return showToast('Please login');
        const basket = State.getBasket();
        const existing = basket.find(b => b.name === item.name);
        if (existing) existing.quantity += parseInt(quantity);
        else basket.push({ ...item, quantity: parseInt(quantity), id: Date.now() });
        State.setBasket(basket);
        showToast(`Added ${item.name}`);
    },
    checkout: () => {
        const basket = State.getBasket();
        if (basket.length === 0) return showToast('Basket is empty');
        CheckoutManager.open(basket);
    }
};

window.Actions = Actions;
window.CheckoutManager = CheckoutManager;
window.AuthManager = AuthManager;
window.State = State;
window.apiFetch = apiFetch;
window.showToast = showToast;
window.silentCacheSync = silentCacheSync;
