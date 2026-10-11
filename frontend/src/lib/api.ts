 /**
 * API Client — Typed fetch wrapper for the Express backend
 * Replaces: apiFetch() from legacy core.js
 */

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || 
                        hostname === '127.0.0.1' || 
                        hostname === '[::1]' || 
                        hostname === '::1';
    if (isLocalhost) {
      if (window.location.port === '5001') {
        return window.location.origin;
      }
      return `${window.location.protocol}//${hostname}:5001`;
    }
    // In production (e.g. on Render or custom domain), the Express backend and frontend are hosted together
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
};

export const API_BASE = typeof window !== 'undefined' ? getApiBase() : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001');

let _csrfToken: string | null = null;

async function refreshCSRFToken(): Promise<string | null> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/auth/csrf-token`, { credentials: 'include' });
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
  const base = getApiBase();
  const fullUrl = url.startsWith('/') ? `${base}${url}` : url;

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
  const timeout = setTimeout(() => {
    try {
      controller.abort(new DOMException('Request timed out after 30000ms', 'AbortError'));
    } catch {
      controller.abort();
    }
  }, 30000);

  if (options.signal) {
    if (options.signal.aborted) {
      try {
        controller.abort(options.signal.reason);
      } catch {
        controller.abort();
      }
    } else {
      options.signal.addEventListener('abort', () => {
        try {
          controller.abort(options.signal?.reason);
        } catch {
          controller.abort();
        }
      }, { once: true });
    }
  }

  try {
    let response: Response;
    try {
      response = await fetch(fullUrl, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
        credentials: 'include',
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      // If transient connection drop (e.g. server restarting), retry once after 800ms
      if (fetchErr.name !== 'AbortError' && (!options.method || options.method === 'GET')) {
        await new Promise(resolve => setTimeout(resolve, 800));
        response = await fetch(fullUrl, {
          ...options,
          headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
          credentials: 'include',
          signal: controller.signal,
        });
      } else {
        clearTimeout(timeout);
        throw fetchErr;
      }
    }

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

      // Security Auto-Eject: On 401 Unauthorized (invalid, missing, or expired token)
      if (response.status === 401 && !url.includes('/api/auth/login')) {
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem('stitch-session-active');
            sessionStorage.removeItem('stitch-admin-tab');
            sessionStorage.removeItem('stitch-employee-tab');
            sessionStorage.removeItem('stitch-auth');
            localStorage.removeItem('stitch-auth');

            const authStore = (window as any).__stitch_auth_store;
            if (authStore?.getState) {
              authStore.getState().logout?.();
            }
          } catch {}

          const pathname = window.location.pathname;
          if (pathname.startsWith('/admin') || pathname.startsWith('/employee') || pathname.startsWith('/dashboard')) {
            window.location.replace('/?auth=login');
          }
        }
      }

      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const text = await response.text();
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      throw new Error('The server sent an unexpected response. Please try again.');
    }
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}
// There is an error here and it needs to fixed, there is a problem with the fetch api, 
// there is a reason why the system is not switching to the mongodb if the system is opened offline
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
  },

  getBlob: async (url: string): Promise<Blob> => {
    const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;
    const response = await fetch(fullUrl, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': _csrfToken || '',
      },
      credentials: 'include',
    });

    if (!response.ok) throw new Error(`Failed to load document: ${response.statusText}`);
    return await response.blob();
  }
};
