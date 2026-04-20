const API_URL = '/api';

async function fetchAPI(endpoint, options = {}) {
  const config = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_URL}${endpoint}`, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `Request failed (${response.status})` }));
    throw new Error(error.message || 'Request failed');
  }

  if (response.status === 204) return null;
  return response.json();
}

// ── Auth ──
export const authAPI = {
  login: (email, password) => fetchAPI('/auth/login', { method: 'POST', body: { email, password } }),
  register: (username, email, password) => fetchAPI('/auth/register', { method: 'POST', body: { username, email, password } }),
  logout: () => fetchAPI('/auth/logout', { method: 'POST' }),
  updateProfile: (data) => fetchAPI('/auth/profile', { method: 'PUT', body: data }),
};

// ── Orders ──
export const ordersAPI = {
  getAll: () => fetchAPI('/orders'),
  create: (data) => fetchAPI('/orders', { method: 'POST', body: data }),
  update: (id, data) => fetchAPI(`/orders/${id}`, { method: 'PUT', body: data }),
  delete: (id) => fetchAPI(`/orders/${id}`, { method: 'DELETE' }),
  batchStatus: (orderIds, status) => fetchAPI('/orders/batch-status', { method: 'POST', body: { orderIds, status } }),
};

// ── Products ──
export const productsAPI = {
  getAll: () => fetchAPI('/products'),
  create: (data) => fetchAPI('/products', { method: 'POST', body: data }),
  update: (id, data) => fetchAPI(`/products/${id}`, { method: 'PUT', body: data }),
  delete: (id) => fetchAPI(`/products/${id}`, { method: 'DELETE' }),
};

// ── Favorites ──
export const favoritesAPI = {
  getAll: () => fetchAPI('/favorites'),
  add: (id) => fetchAPI(`/favorites/${id}`, { method: 'POST' }),
  remove: (id) => fetchAPI(`/favorites/${id}`, { method: 'DELETE' }),
};

// ── Inventory ──
export const inventoryAPI = {
  getAll: () => fetchAPI('/inventory'),
  update: (item, count) => fetchAPI(`/inventory/${item}`, { method: 'PATCH', body: { count } }),
};

// ── Dashboard ──
export const dashboardAPI = {
  getState: () => fetchAPI('/dashboard-state'),
};

// ── Admin ──
export const adminAPI = {
  getUsers: () => fetchAPI('/admin/users'),
  createUser: (data) => fetchAPI('/admin/users', { method: 'POST', body: data }),
  updateUser: (id, data) => fetchAPI(`/admin/users/${id}`, { method: 'PUT', body: data }),
  deleteUser: (id) => fetchAPI(`/admin/users/${id}`, { method: 'DELETE' }),
  getAnalytics: () => fetchAPI('/admin/analytics'),
};

// ── Analytics ──
export const analyticsAPI = {
  logVisit: (path) => fetchAPI('/analytics/visit', { method: 'POST', body: { path } }).catch(() => {}),
  logProductView: (id) => fetchAPI(`/analytics/product-view/${id}`, { method: 'POST' }).catch(() => {}),
};

export default fetchAPI;
