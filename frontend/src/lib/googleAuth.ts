/**
 * MODULE: Google Sign-In (full-window redirect)
 * ---------------------------------------------
 * The ONLY place that talks to Firebase for Google sign-in.
 * UI components must call `startGoogleSignIn()` / `completeGoogleSignIn()`
 * and nothing else. Do not call signInWithRedirect / getRedirectResult /
 * onAuthStateChanged anywhere outside this file.
 *
 * Flow:
 *   1. startGoogleSignIn()     -> marks "pending" and navigates the whole tab to Google
 *   2. Google -> /__/auth/handler -> back to the app
 *   3. completeGoogleSignIn()  -> module-level singleton that safely catches the redirect result,
 *                                 survives React StrictMode double-mounts, and exchanges
 *                                 tokens with backend via POST /api/auth/google
 */
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
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

function isPending(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === 'true';
  } catch {
    return false;
  }
}

function describeFirebaseError(err: any): string {
  if (err?.code === 'auth/unauthorized-domain') {
    return `Domain "${window.location.hostname}" is not authorized in Firebase Console > Authentication > Settings > Authorized domains.`;
  }
  return err?.message || 'Google sign-in failed.';
}

/** Step 1: send the whole tab to Google. */
export async function startGoogleSignIn(): Promise<{ ok: false; message: string } | void> {
  setPending(true);
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    setPending(false);
    console.error('[GoogleAuth] Redirect start failed:', err);
    return { ok: false, message: describeFirebaseError(err) };
  }
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
  setPending(false);

  try {
    console.log('[GoogleAuth] Exchanging Firebase user with backend:', user.email);
    const outcome = await exchangeWithBackend(user);
    notifyListeners(outcome);
  } catch (err: any) {
    console.error('[GoogleAuth] Exchange error:', err);
    notifyListeners({
      status: 'error',
      message: err?.message || 'Failed to complete Google sign-in.',
    });
  } finally {
    isExchanging = false;
  }
}

function initSingletonAuthWatcher() {
  if (hasStartedRedirectCheck || typeof window === 'undefined') return;
  hasStartedRedirectCheck = true;

  console.log('[GoogleAuth] Initializing module auth watcher...');

  // 1. Primary: Consume the redirect result (strictly once per page lifecycle)
  getRedirectResult(auth)
    .then((result) => {
      if (result?.user) {
        console.log('[GoogleAuth] Redirect result found:', result.user.email);
        processUser(result.user);
      } else {
        console.log('[GoogleAuth] No redirect result on current origin.');
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

  // 2. Safety Net: Observer detection (for cases where user is already persisted in indexedDB)
  onAuthStateChanged(auth, (user) => {
    if (user && !useAuthStore.getState().isAuthenticated && !finalOutcome && !isExchanging) {
      const pending = isPending();
      console.log('[GoogleAuth] Observer detected Firebase user:', user.email, 'pending:', pending);
      // Process if we initiated a redirect or if auth redirect query parameters exist
      if (pending || (typeof window !== 'undefined' && (window.location.search.includes('apiKey=') || window.location.hash.includes('access_token')))) {
        processUser(user);
      }
    }
  });
}

/**
 * Step 3: Call in RootLayout / GlobalAuthListener on app mount.
 * Guaranteed to deliver the outcome even if React unmounts/remounts during StrictMode.
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
