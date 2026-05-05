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
        localStorage.removeItem(this.SESSION_KEY);
        sessionStorage.removeItem(this.SESSION_KEY);
        localStorage.removeItem('stitch_basket'); // Clear basket on logout
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
    _cache: { orders: [], products: [], favorites: [], transactions: [], walletBalance: 0, searchQuery: '', selectedCategory: 'All' },
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
                // Ensure data is isolated - if guest, favorites MUST be empty
                if (!AuthManager.isAuthenticated()) {
                    data.favorites = [];
                    data.orders = [];
                    data.transactions = [];
                }
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
    const mobileBasketCount = document.getElementById('mobile-basket-count');
    const basketTotal = document.getElementById('basket-total');
    const checkoutBtn = document.getElementById('checkout-btn');

    const count = basket.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const total = basket.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

    if (basketCount) basketCount.innerText = `${count} Items`;
    if (headerBasketCount) headerBasketCount.innerText = count;
    if (mobileBasketCount) mobileBasketCount.innerText = count;
    if (basketTotal) basketTotal.innerText = `$${total.toFixed(2)}`;

    if (checkoutBtn) {
        if (basket.length > 0) {
            checkoutBtn.style.opacity = '1';
            checkoutBtn.style.pointerEvents = 'auto';
            checkoutBtn.onclick = () => Actions.checkout();
        } else {
            checkoutBtn.style.opacity = '0.5';
            checkoutBtn.style.pointerEvents = 'none';
        }
    }

    const basketItemLists = document.querySelectorAll('#basket-items-list');
    basketItemLists.forEach(list => {
        list.innerHTML = basket.length === 0 
            ? '<div style="text-align:center;color:var(--text-dim)"><p>Basket is empty</p></div>'
            : basket.map(item => `
                <div class="basket-item animate-fade" style="display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-weight: 600;">${item.name}</span>
                            <span style="font-size: 0.8rem; color: var(--text-dim);">${item.quantity} × $${parseFloat(item.price).toFixed(2)}</span>
                        </div>
                        <span style="font-weight: 700; color: var(--primary);">$${(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
                    </div>
                </div>
            `).join('');
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
                        <button class="fav-toggle-btn" data-id="${p._id}" data-fav="${isFav}" style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.3); border: none; padding: 8px; border-radius: 50%; color: ${isFav ? 'var(--primary)' : 'var(--text-dim)'}; cursor: pointer; backdrop-filter: blur(4px);">
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
                        <button class="btn btn-primary add-to-basket" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}" style="width: 100%; padding: 12px;">Add to Basket</button>
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
                         <button class="fav-toggle-btn" data-id="${p._id}" data-fav="true" style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.3); border: none; padding: 8px; border-radius: 50%; color: var(--primary); cursor: pointer; backdrop-filter: blur(4px);">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        </button>
                    </div>
                    <div class="product-details">
                        <h3 style="font-weight:600;">${p.name}</h3>
                        <p style="color:var(--primary); font-weight:700;">$${parseFloat(p.price).toFixed(2)}</p>
                        <button class="btn btn-primary add-to-basket" data-id="${p._id}" data-name="${p.name}" data-price="${p.price}" style="width:100%; margin-top:10px;">Add to Basket</button>
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
    addToBasket: (item, quantity = 1) => {
        if (!AuthManager.isAuthenticated()) {
            if (typeof openAuth === 'function') openAuth('login');
            return showToast('Please login to add to basket');
        }
        const basket = State.getBasket();
        // Use .toString() for safe comparison of ObjectIDs vs Strings
        const itemId = item._id ? item._id.toString() : null;
        if (!itemId) return showToast('Error: Product ID missing');

        const existing = basket.find(b => (b._id && b._id.toString() === itemId) || (b.id && b.id.toString() === itemId));
        if (existing) {
            existing.quantity += parseInt(quantity);
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
    toggleFavorite: async (productId) => {
        if (!AuthManager.isAuthenticated()) return showToast('Please login to save favorites');
        
        const favorites = State._cache.favorites || [];
        const products = State._cache.products || [];
        const isFav = favorites.some(f => f._id.toString() === productId.toString());
        
        // Optimistic Update
        if (isFav) {
            State._cache.favorites = favorites.filter(f => f._id.toString() !== productId.toString());
        } else {
            const product = products.find(p => p._id.toString() === productId.toString());
            if (product) State._cache.favorites.push(product);
        }
        // Target specific button for immediate visual feedback without full reload
        const btns = document.querySelectorAll(`.fav-toggle-btn[data-id="${productId}"]`);
        btns.forEach(btn => {
            const svg = btn.querySelector('svg');
            if (isFav) { // Was fav, now removing
                btn.style.color = 'var(--text-dim)';
                if (svg) svg.setAttribute('fill', 'none');
            } else { // Was not fav, now adding
                btn.style.color = 'var(--primary)';
                if (svg) svg.setAttribute('fill', 'currentColor');
            }
        });

        // Only update the favorites grid
        updateFavoritesGrid();

        try {
            const method = isFav ? 'DELETE' : 'POST';
            const response = await apiFetch(`${API_URL}/favorites/${productId}`, { method });
            if (response.ok) {
                showToast(isFav ? 'Removed from favorites' : 'Added to favorites');
                // Silently sync in background to ensure server consistency
                State.getDashboardState(); 
            } else {
                // Rollback on error
                State._cache.favorites = favorites;
                updateUI();
                showToast('Failed to sync favorites');
            }
        } catch (e) { 
            State._cache.favorites = favorites;
            updateUI();
            showToast('Connection error'); 
        }
    },
    checkout: () => {
        const basket = State.getBasket();
        if (basket.length === 0) return showToast('Basket is empty');
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
        const product = State._cache.products.find(p => p._id.toString() === id.toString());
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

