export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'stitch_theme';

/**
 * Reads the user's stored theme preference from localStorage.
 * Defaults to 'dark' if none is stored or if running on server.
 */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // LocalStorage might be disabled or blocked
  }
  return 'light';
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
  if (typeof document === 'undefined') return 'light';
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
