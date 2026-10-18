/**
 * MODULE: Google Sign-In Architecture
 * ------------------------------------
 * The ONLY place in the entire frontend that interfaces with the Firebase Auth SDK.
 * UI components must call `startGoogleSignIn()` / `completeGoogleSignIn()`
 * and nothing else.
 *
 * Environment Strategy:
 *   - Production (HTTPS e.g. capstone-btr7.onrender.com):
 *     Executes Full-Window Redirect (`signInWithRedirect`). Served through the
 *     same-origin reverse proxy (`middleware/firebaseAuthProxy.js`) to guarantee
 *     mobile browser compatibility and bypass third-party cookie restrictions.
 *
 *   - Local Development (plain HTTP http://localhost:3000):
 *     Modern browsers (Chrome 115+, Safari 16+, Firefox 109+) enforce Third-Party
 *     Storage Partitioning (CHIPS). Because localhost runs on plain HTTP, pointing
 *     authDomain to localhost triggers ERR_SSL_PROTOCOL_ERROR, while pointing it to
 *     firebaseapp.com causes the browser to block the cross-origin iframe from reading
 *     the redirect token. Therefore, on local HTTP dev, `startGoogleSignIn` seamlessly
 *     uses `signInWithPopup` in memory without cross-origin iframe drops.
 *
 * Both environments route through the identical backend provisioning pipeline
 * (POST /api/auth/google) and update `useAuthStore`.
 */
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signInWithPopup,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { User } from '@/lib/types';

const PENDING_KEY = 'stitch-google-auth-pending';

export type GoogleSignInOutcome =
  | { status: 'signed-in'; user: User }
  | { status: 'needs-password'; setupToken: string; email: string; suggestedUsername: string }
  | { status: 'error'; message: string };

function setPending(on: boolean) {
  try {
    if (on) sessionStorage.setItem(PENDING_KEY, 'true');
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable (private mode) */
  }
}

export function isGoogleAuthPending(): boolean {
  if (isExchanging) return true;
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(PENDING_KEY) === 'true') return true;
    if (window.location.search.includes('apiKey=') || window.location.hash.includes('access_token')) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function isPending(): boolean {
  return isGoogleAuthPending();
}

function describeFirebaseError(err: any): string {
  if (err?.code === 'auth/unauthorized-domain') {
    return `Domain "${window.location.hostname}" is not authorized in Firebase Console > Authentication > Settings > Authorized domains.`;
  }
  return err?.message || 'Google sign-in failed.';
}

async function exchangeWithBackend(user: FirebaseUser): Promise<GoogleSignInOutcome> {
  if (!user.email) return { status: 'error', message: 'No email associated with this Google account.' };

  const res = await useAuthStore.getState().loginWithGoogle({
    email: user.email,
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    phoneNumber: user.phoneNumber || '',
    uid: user.uid,
  });

  if (res.success && res.needsPassword && res.setupToken) {
    return {
      status: 'needs-password',
      setupToken: res.setupToken,
      email: res.email || user.email,
      suggestedUsername: res.suggestedUsername || '',
    };
  }
  if (res.success && res.user) return { status: 'signed-in', user: res.user };
  return { status: 'error', message: res.message || 'Google sign-in failed on server.' };
}

// ---------------------------------------------------------------------------
// Module-level Singleton State
// Survives React 18/19 StrictMode double-mounting in dev without dropping results
// ---------------------------------------------------------------------------
let hasStartedRedirectCheck = false;
let isExchanging = false;
let finalOutcome: GoogleSignInOutcome | null = null;
const listeners = new Set<(outcome: GoogleSignInOutcome) => void>();

function notifyListeners(outcome: GoogleSignInOutcome) {
  finalOutcome = outcome;
  listeners.forEach((listener) => {
    try {
      listener(outcome);
    } catch (e) {
      console.error('[GoogleAuth] Listener execution error:', e);
    }
  });
}

async function processUser(user: FirebaseUser) {
  if (finalOutcome || isExchanging) return;
  isExchanging = true;

  try {
    console.log('[GoogleAuth] Processing user with backend:', user.email);
    const outcome = await exchangeWithBackend(user);
    notifyListeners(outcome);
  } catch (err: any) {
    console.error('[GoogleAuth] Backend exchange error:', err);
    notifyListeners({
      status: 'error',
      message: err?.message || 'Failed to complete Google sign-in.',
    });
  } finally {
    setPending(false);
    isExchanging = false;
  }
}

function initSingletonAuthWatcher() {
  if (hasStartedRedirectCheck || typeof window === 'undefined') return;
  hasStartedRedirectCheck = true;

  // 1. Primary: Consume the redirect result (strictly once per page lifecycle)
  getRedirectResult(auth)
    .then((result) => {
      if (result?.user) {
        console.log('[GoogleAuth] Redirect result received:', result.user.email);
        processUser(result.user);
      }
    })
    .catch((err) => {
      setPending(false);
      if (err?.code && err.code !== 'auth/null-user') {
        console.error('[GoogleAuth] getRedirectResult failed:', err);
        notifyListeners({
          status: 'error',
          message: describeFirebaseError(err),
        });
      }
    });

  // 2. Safety Net: Observer detection
  onAuthStateChanged(auth, (user) => {
    if (user && !useAuthStore.getState().isAuthenticated && !finalOutcome && !isExchanging) {
      const pending = isPending();
      if (pending || window.location.search.includes('apiKey=') || window.location.hash.includes('access_token')) {
        console.log('[GoogleAuth] Observer detected pending redirect user:', user.email);
        processUser(user);
      }
    }
  });
}

export function resetGoogleAuthState(): void {
  hasStartedRedirectCheck = false;
  isExchanging = false;
  finalOutcome = null;
  setPending(false);
}

/**
 * Step 1: Trigger Google Sign-In.
 * Automatically chooses the optimal, browser-secure strategy based on environment:
 * - Production (HTTPS): Full-window redirect (signInWithRedirect) via same-origin reverse proxy.
 * - Local Dev (HTTP localhost): In-memory popup (signInWithPopup) to avoid Chrome's cross-origin iframe storage blocks.
 */
export async function startGoogleSignIn(): Promise<{ ok: false; message: string } | void> {
  resetGoogleAuthState();
  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.protocol === 'http:');

  if (isLocalDev) {
    try {
      console.log('[GoogleAuth] Local environment detected: launching in-memory Google authentication...');
      const result = await signInWithPopup(auth, googleProvider);
      if (result?.user) {
        await processUser(result.user);
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        return;
      }
      console.error('[GoogleAuth] Local authentication error:', err);
      const outcome: GoogleSignInOutcome = {
        status: 'error',
        message: describeFirebaseError(err),
      };
      notifyListeners(outcome);
      return { ok: false, message: outcome.message };
    }
    return;
  }

  // Production full-window redirect
  setPending(true);
  try {
    console.log('[GoogleAuth] Production environment detected: initiating full-window redirect...');
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    setPending(false);
    console.error('[GoogleAuth] Redirect start failed:', err);
    return { ok: false, message: describeFirebaseError(err) };
  }
}

/**
 * Step 2: Call in RootLayout / GlobalAuthListener on app mount.
 * Guaranteed to deliver the outcome across both redirect and popup outcomes.
 */
export function completeGoogleSignIn(onOutcome: (outcome: GoogleSignInOutcome) => void): () => void {
  initSingletonAuthWatcher();

  // If already resolved, immediately dispatch to this listener
  if (finalOutcome) {
    onOutcome(finalOutcome);
    return () => {};
  }

  listeners.add(onOutcome);
  return () => {
    listeners.delete(onOutcome);
  };
}
