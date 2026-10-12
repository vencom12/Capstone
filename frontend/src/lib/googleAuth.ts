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
 *   2. Google -> /__/auth/handler (same-origin proxy) -> back to the app
 *   3. completeGoogleSignIn()  -> reads the result once, exchanges it for our
 *                                 backend session cookie via POST /api/auth/google
 *
 * Dependencies (keep these working and this module keeps working):
 *   - lib/firebase.ts                 authDomain = window.location.host
 *   - middleware/firebaseAuthProxy.js /__/auth proxy (prod), next.config.ts (dev)
 *   - POST /api/auth/google           controllers/postgres/authController.googleAuth
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
    /* storage unavailable (private mode) - redirect result path still works */
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

/** Step 1: send the whole tab to Google. Resolves only if navigation fails. */
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

/**
 * Step 3: call once on app mount. Invokes `onOutcome` at most once, and only
 * when the user actually came back from a Google sign-in started by this app.
 * Returns an unsubscribe function.
 */
export function completeGoogleSignIn(onOutcome: (outcome: GoogleSignInOutcome) => void): () => void {
  let settled = false;
  let active = true;

  const finish = async (user: FirebaseUser) => {
    if (settled || !active) return;
    settled = true;
    setPending(false);
    try {
      const outcome = await exchangeWithBackend(user);
      if (active) onOutcome(outcome);
    } catch (err: any) {
      if (active) onOutcome({ status: 'error', message: err?.message || 'Failed to complete Google sign-in.' });
    }
  };

  // Primary: the redirect result (only non-null right after returning from Google).
  getRedirectResult(auth)
    .then((result) => {
      if (result?.user) finish(result.user);
    })
    .catch((err) => {
      setPending(false);
      if (err?.code && err.code !== 'auth/null-user' && active && !settled) {
        settled = true;
        console.error('[GoogleAuth] Redirect result error:', err);
        onOutcome({ status: 'error', message: describeFirebaseError(err) });
      }
    });

  // Safety net: some browsers surface the user via the observer instead.
  // Gated on the pending flag so a plain page reload never auto-logs anyone in.
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user && isPending() && !useAuthStore.getState().isAuthenticated) finish(user);
  });

  return () => {
    active = false;
    unsubscribe();
  };
}
