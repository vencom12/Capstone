/**
 * API Client — Typed fetch wrapper for the Express backend
 * Replaces: apiFetch() from legacy core.js
 */

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' && window.location.port === '3000') {
      return 'http://localhost:5001';
    }
    return window.location.origin;
  }
  return '';
};

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || getApiBase();

let _csrfToken: string | null = null;

async function refreshCSRFToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/csrf-token`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      _csrfToken = data.csrfToken;
      return _csrfToken;
    }
  } catch (e) {
    console.error('[API] CSRF Refresh failed', e);
  }
  return null;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;

  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (_csrfToken) {
    headers['X-CSRF-Token'] = _csrfToken;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    let response = await fetch(fullUrl, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // CSRF retry
    if (response.status === 403) {
      await refreshCSRFToken();
      response = await fetch(fullUrl, {
        ...options,
        headers: {
          ...headers,
          'X-CSRF-Token': _csrfToken || '',
          ...(options.headers as Record<string, string> || {}),
        },
        credentials: 'include',
      });
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// Convenience methods
export const api = {
  get: <T = unknown>(url: string) => apiFetch<T>(url),

  post: <T = unknown>(url: string, body: unknown) =>
    apiFetch<T>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: <T = unknown>(url: string, body: unknown) =>
    apiFetch<T>(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  patch: <T = unknown>(url: string, body: unknown) =>
    apiFetch<T>(url, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: <T = unknown>(url: string) =>
    apiFetch<T>(url, { method: 'DELETE' }),

  download: async (url: string, filename: string) => {
    const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;
    const response = await fetch(fullUrl, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': _csrfToken || '',
      },
      credentials: 'include',
    });

    if (!response.ok) throw new Error('Download failed');

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  }
};
