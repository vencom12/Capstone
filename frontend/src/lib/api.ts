import type {
  User, Order, Product, InventoryItem, DashboardState, AnalyticsReport
} from '@/types';

// Base fetch with credentials (sends HttpOnly cookie automatically)
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `API error ${res.status}`);
  return data as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string, rememberMe: boolean) =>
    apiFetch<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe }),
    }),

  register: (username: string, email: string, password: string) =>
    apiFetch<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  logout: () =>
    apiFetch<{ message: string }>('/api/auth/logout', { method: 'POST' }),

  me: () =>
    apiFetch<{ user: User }>('/api/auth/me'),

  updateProfile: (username: string, email: string) =>
    apiFetch<{ user: User }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ username, email }),
    }),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  getState: () => apiFetch<DashboardState>('/api/dashboard-state'),
};

// ─── Products ─────────────────────────────────────────────────────────────────

export const productsApi = {
  getAll: () => apiFetch<Product[]>('/api/products'),

  create: (data: Omit<Product, '_id' | 'views' | 'createdAt'>) =>
    apiFetch<Product>('/api/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Product>) =>
    apiFetch<Product>(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<{ message: string }>(`/api/products/${id}`, { method: 'DELETE' }),

  trackView: (id: string) =>
    fetch(`/api/analytics/product-view/${id}`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {}), // fire-and-forget
};

// ─── Orders ───────────────────────────────────────────────────────────────────

export const ordersApi = {
  getAll: () => apiFetch<Order[]>('/api/orders'),

  create: (data: Omit<Order, '_id' | 'date' | 'userId'>) =>
    apiFetch<Order>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Order>) =>
    apiFetch<Order>(`/api/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<{ message: string }>(`/api/orders/${id}`, { method: 'DELETE' }),

  batchStatus: (orderIds: string[], status: string) =>
    apiFetch<{ message: string }>('/api/orders/batch-status', {
      method: 'POST',
      body: JSON.stringify({ orderIds, status }),
    }),
};

// ─── Inventory ────────────────────────────────────────────────────────────────

export const inventoryApi = {
  getAll: () => apiFetch<InventoryItem[]>('/api/inventory'),

  update: (item: string, count: number) =>
    apiFetch<InventoryItem>(`/api/inventory/${item}`, {
      method: 'PATCH',
      body: JSON.stringify({ count }),
    }),
};

// ─── Favorites ────────────────────────────────────────────────────────────────

export const favoritesApi = {
  getAll: () => apiFetch<Product[]>('/api/favorites'),
  add: (id: string) => apiFetch<{ message: string }>(`/api/favorites/${id}`, { method: 'POST' }),
  remove: (id: string) => apiFetch<{ message: string }>(`/api/favorites/${id}`, { method: 'DELETE' }),
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
  getUsers: () => apiFetch<User[]>('/api/admin/users'),

  createUser: (data: { username: string; email: string; password: string; role: string }) =>
    apiFetch<{ user: User }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (id: string, data: Partial<User & { password?: string }>) =>
    apiFetch<User>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteUser: (id: string) =>
    apiFetch<{ message: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }),

  getAnalytics: () => apiFetch<AnalyticsReport>('/api/admin/analytics'),
};
