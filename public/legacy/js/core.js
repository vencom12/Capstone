/**
 * Stitch-Opt Core JavaScript
 * Unified logic for Auth, API, and Global UI
 */

const CORE_CONFIG = {
    AUTH_API: '/api/auth',
    SESSION_KEY: 'stitch_session'
};

let _csrfToken = null;
let _syncCount = 0;

/**
 * Global API Fetch Wrapper
 */
async function apiFetch(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);

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
            await refreshCSRFToken();
            return await performFetch();
        }
        
        if (response.status === 401 && !url.includes('/logout')) {
            console.warn('[Core] Unauthorized access. Logging out...');
            AuthManager.logout();
        }

        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function refreshCSRFToken() {
    try {
        const res = await fetch(`${CORE_CONFIG.AUTH_API}/csrf-token`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            _csrfToken = data.csrfToken;
            return _csrfToken;
        }
    } catch (e) { console.error('[Core] CSRF Refresh failed', e); }
    return null;
}

/**
 * Global UI Utilities
 */
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast show ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

const updateSyncIndicator = (isStarting) => {
    _syncCount += isStarting ? 1 : -1;
    if (_syncCount < 0) _syncCount = 0;
    const el = document.getElementById('global-sync-indicator');
    if (el) {
        if (_syncCount > 0) el.classList.add('is-syncing');
        else el.classList.remove('is-syncing');
    }
};

/**
 * Global Auth Manager
 */
const AuthManager = {
    SESSION_KEY: CORE_CONFIG.SESSION_KEY,
    
    async login(email, password, rememberMe = false, portal = '') {
        try {
            const response = await apiFetch(`${CORE_CONFIG.AUTH_API}/login`, {
                method: 'POST',
                body: JSON.stringify({ email, password, rememberMe, portal })
            });
            if (!response.ok) return { success: false, message: (await response.json()).message || 'Login failed' };
            const data = await response.json();
            const storage = rememberMe ? localStorage : sessionStorage;
            storage.setItem(this.SESSION_KEY, JSON.stringify({ user: data.user }));
            return { success: true, user: data.user };
        } catch (err) { return { success: false, message: 'Connection error' }; }
    },

    async register(username, email, password, role = 'customer', phoneNumber, address) {
        try {
            const response = await apiFetch(`${CORE_CONFIG.AUTH_API}/register`, {
                method: 'POST',
                body: JSON.stringify({ username, email, password, role, phoneNumber, address })
            });
            if (!response.ok) return { success: false, message: (await response.json()).message || 'Registration failed' };
            const data = await response.json();
            localStorage.setItem(this.SESSION_KEY, JSON.stringify({ user: data.user }));
            return { success: true, user: data.user };
        } catch (err) { return { success: false, message: 'Connection error' }; }
    },

    async logout() {
        try { await apiFetch(`${CORE_CONFIG.AUTH_API}/logout`, { method: 'POST' }); } catch (e) { }
        // Clear user-specific basket before wiping session
        const session = this.getSession();
        if (session && session.user) {
            const userId = session.user.id || session.user._id;
            if (userId) localStorage.removeItem('stitch_basket_' + userId);
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

    /**
     * Prompt user to log in via the auth modal.
     * Portal-specific files can override this if needed (e.g., customer.js does).
     */
    async promptLogin() {
        // Default: redirect to index with login action
        window.location.href = 'index.html?action=login';
    }
};

/**
 * Utility: Debounce
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

const isSyncing = () => _syncCount > 0;

// Export to window
window.AuthManager = AuthManager;
window.apiFetch = apiFetch;
window.showToast = showToast;
window.updateSyncIndicator = updateSyncIndicator;
window.isSyncing = isSyncing;
window.debounce = debounce;

