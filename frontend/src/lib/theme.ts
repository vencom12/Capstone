export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'stitch_theme';

/**
 * Reads the user's stored theme preference from localStorage.
 * Defaults to 'dark' if none is stored or if running on server.
 */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // LocalStorage might be disabled or blocked
  }
  return 'dark';
}

/**
 * Applies the given theme to <html data-theme="..."> and saves it in localStorage.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage errors in restricted iframes / private browsing
  }
}

/**
 * Toggles between 'light' and 'dark', saves the choice, and returns the newly active theme.
 */
export function toggleTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next: Theme = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
}
