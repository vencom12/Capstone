'use client';

import { useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { getRedirectResult } from 'firebase/auth';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';

export default function GlobalAuthListener() {
  useEffect(() => {
    // This effect MUST run exactly once on mount with [] deps.
    // Using useAuthStore.getState() instead of the hook value avoids
    // Zustand rehydration changing the function reference and re-triggering
    // this effect, which would cause getRedirectResult to return null
    // (Firebase only returns the redirect credential once).

    getRedirectResult(auth)
      .then(async (result) => {
        if (!result || !result.user) return;
        const user = result.user;

        if (!user.email) {
          showToast('No email associated with this Google account.', 'error');
          return;
        }

        console.log('[Google Auth] Redirect result received:', user.email, user.displayName, user.phoneNumber);
        showToast('Completing Google Sign-In...', 'info');

        // Use getState() to get the latest store action without hook dependency
        const { loginWithGoogle } = useAuthStore.getState();

        const res = await loginWithGoogle({
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          phoneNumber: user.phoneNumber || '',
          uid: user.uid,
        });

        if (res.success) {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('stitch-session-active', 'true');
          }
          showToast(`Welcome, ${res.user?.username || user.displayName || 'Customer'}!`, 'success');
        } else {
          console.error('[Google Auth] Backend login error:', res.message);
          showToast(res.message || 'Google sign-in failed on server.', 'error');
        }
      })
      .catch((error) => {
        if (error.code && error.code !== 'auth/null-user') {
          console.error('[Google Auth] Redirect Auth Error:', error);
          showToast(error.message || 'Error completing Google sign-in.', 'error');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // MUST be [] — runs exactly once on mount

  return null;
}
