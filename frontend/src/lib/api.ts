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

const inFlightGetRequests = new Map<string, Promise<any>>();

export function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const base = getApiBase();
  const fullUrl = url.startsWith('/') ? `${base}${url}` : url;
  const isGet = (!options.method || options.method === 'GET') && !options.body && !options.signal;

  if (isGet) {
    const existing = inFlightGetRequests.get(fullUrl);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const exec = async (): Promise<T> => {

  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/admin') || url.startsWith('/api/admin')) {
      headers['X-Portal'] = 'admin';
    } else if (pathname.startsWith('/employee') || url.startsWith('/api/employee')) {
      headers['X-Portal'] = 'employee';
    } else if (pathname.startsWith('/dashboard') || url.startsWith('/api/customer')) {
      headers['X-Portal'] = 'customer';
    }
  }

  if (_csrfToken) {
    headers['X-CSRF-Token'] = _csrfToken;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    // If the browser tab is hidden in the background, Chrome throttles timers and TCP.
    // Avoid aborting while the user is simply tabbed out.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    try {
      controller.abort(new DOMException('Request timed out after 60000ms', 'AbortError'));
    } catch {
      controller.abort();
    }
  }, 60000);

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
      // If transient connection drop (e.g. server restarting), retry with backoff
      if (fetchErr.name !== 'AbortError' && (!options.method || options.method === 'GET')) {
        try {
          await new Promise(resolve => setTimeout(resolve, 600));
          response = await fetch(fullUrl, {
            ...options,
            headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
            credentials: 'include',
            signal: controller.signal,
          });
        } catch {
          try {
            await new Promise(resolve => setTimeout(resolve, 1200));
            response = await fetch(fullUrl, {
              ...options,
              headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
              credentials: 'include',
              signal: controller.signal,
            });
          } catch (retryErr) {
            clearTimeout(timeout);
            throw retryErr;
          }
        }
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
        const isLoggingOut = typeof window !== 'undefined' && Boolean((window as any).__stitch_auth_store?.getState?.().isLoggingOut);
        if (isLoggingOut) {
          // Deliberate logout teardown guard: suppress throwing error to prevent Next.js dev overlay crash
          return {} as T;
        }

        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem('stitch-session-active');
            sessionStorage.removeItem('stitch-admin-tab');
            sessionStorage.removeItem('stitch-employee-tab');
            sessionStorage.removeItem('stitch-auth');
            localStorage.removeItem('stitch-auth');

            const authStore = (window as any).__stitch_auth_store;
            if (authStore?.getState && !authStore.getState().isLoggingOut) {
              authStore.getState().logout?.();
            }
          } catch {}

          const pathname = window.location.pathname;
          if (pathname.startsWith('/admin') || pathname.startsWith('/employee') || pathname.startsWith('/dashboard')) {
            window.location.replace('/?auth=login');
          }
        }
      }

      const errorMessage =
        error?.message ||
        error?.error ||
        error?.details ||
        (Array.isArray(error?.errors) ? error.errors.map((e: any) => e.msg || e.message).join(', ') : '') ||
        (typeof error === 'string' ? error : '') ||
        response.statusText ||
        `HTTP ${response.status}`;

      throw new Error(errorMessage);
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
  };

  const reqPromise = exec();

  if (isGet) {
    inFlightGetRequests.set(fullUrl, reqPromise);
    // Attach silent rejection handler directly to the promise returned by .finally()
    // to prevent any unhandled rejection event in Next.js development server
    reqPromise
      .finally(() => {
        inFlightGetRequests.delete(fullUrl);
      })
      .catch(() => {});
  }

  return reqPromise;
}
// There is an error here and it needs to fixed, there is a problem with the fetch api, 
// there is a reason why the system is not switching to the mongodb if the system is opened offline
// Convenience methods
export const api = {
  get: <T = unknown>(url: string, options?: RequestInit) => apiFetch<T>(url, options),

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

  delete: <T = unknown>(url: string, body?: unknown) =>
    apiFetch<T>(url, {
      method: 'DELETE',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    }),

  download: async (url: string, filename: string) => {
    const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;
    const isInternal = url.startsWith('/') || fullUrl.startsWith(API_BASE);

    // If external URL (e.g. Cloudinary/S3), do not send credentials or CSRF headers that trigger CORS preflight blocks
    if (!isInternal) {
      try {
        const extResponse = await fetch(fullUrl);
        if (extResponse.ok) {
          const blob = await extResponse.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
          return;
        }
      } catch {
        // Fallback for cross-origin restricted assets: open in new tab directly
        window.open(fullUrl, '_blank');
        return;
      }
    }

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
