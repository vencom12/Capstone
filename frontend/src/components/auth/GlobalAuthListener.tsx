'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { getRedirectResult } from 'firebase/auth';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { showToast } from '@/components/ui/Toast';

export default function GlobalAuthListener() {
  const router = useRouter();

  useEffect(() => {
    // This effect MUST run exactly once on mount with [] deps.
    // Using getState() avoids Zustand rehydration re-triggering this effect.
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

        const { loginWithGoogle } = useAuthStore.getState();

        const res = await loginWithGoogle({
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          phoneNumber: user.phoneNumber || '',
          uid: user.uid,
        });

        if (res.success && res.needsPassword && res.setupToken) {
          // First-time Google user: open AuthModal to set initial password
          useUIStore.getState().setGoogleSetupData({
            token: res.setupToken,
            email: res.email || user.email,
            username: res.suggestedUsername || '',
          });
          useUIStore.getState().setAuthOpen(true);
          return;
        }

        if (res.success) {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('stitch-session-active', 'true');
          }
          showToast(`Welcome, ${res.user?.username || user.displayName || 'Customer'}!`, 'success');
          if (res.user?.role === 'admin') {
            router.replace('/admin');
          } else if (res.user?.role === 'employee') {
            router.replace('/employee');
          } else {
            router.replace('/');
            router.refresh();
          }
        } else {
          console.error('[Google Auth] Backend login error:', res.message);
          showToast(res.message || 'Google sign-in failed on server.', 'error');
        }
      })
      .catch((error) => {
        if (error.code && error.code !== 'auth/null-user') {
          console.error('[Google Auth] Redirect Auth Error:', error);
          if (error.code === 'auth/unauthorized-domain') {
            showToast('Domain is not authorized in Firebase Console.', 'error');
          } else {
            showToast(error.message || 'Error completing Google sign-in.', 'error');
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
