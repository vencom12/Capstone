import { authApi } from './api';
import type { User } from '@/types';

export type Role = 'customer' | 'admin' | 'employee';

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Fetches the current session from the server.
 * Returns null if the cookie is absent or expired.
 */
export async function getSession(): Promise<User | null> {
  try {
    const { user } = await authApi.me();
    // me() only returns id + role, so username needs a separate field
    // We'll store username in sessionStorage as a supplement
    const cached = getStoredUser();
    return { ...user, username: cached?.username ?? '' };
  } catch {
    return null;
  }
}

// ─── Login / Logout ───────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
  rememberMe: boolean
): Promise<User> {
  const { user } = await authApi.login(email, password, rememberMe);
  storeUser(user, rememberMe);
  return user;
}

export async function logout(): Promise<void> {
  await authApi.logout();
  clearStoredUser();
}

// ─── Client-side user cache ───────────────────────────────────────────────────
// We use sessionStorage (cleared when tab closes) normally,
// and localStorage when rememberMe is true — mirroring the server cookie.

function storeUser(user: User, persistent: boolean): void {
  const data = JSON.stringify(user);
  if (persistent) {
    localStorage.setItem('stitch_user', data);
  } else {
    sessionStorage.setItem('stitch_user', data);
    localStorage.removeItem('stitch_user');
  }
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      sessionStorage.getItem('stitch_user') ||
      localStorage.getItem('stitch_user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function clearStoredUser(): void {
  sessionStorage.removeItem('stitch_user');
  localStorage.removeItem('stitch_user');
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

/** Returns the home path for a given role */
export function roleHome(role: Role): string {
  const map: Record<Role, string> = {
    customer: '/dashboard',
    admin: '/admin',
    employee: '/employee',
  };
  return map[role] ?? '/login';
}

/** Returns true if the user's role matches the required role */
export function checkAccess(user: User | null, requiredRole: Role): boolean {
  return user?.role === requiredRole;
}
