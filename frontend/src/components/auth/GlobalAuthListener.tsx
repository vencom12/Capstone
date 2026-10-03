'use client';

import { useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { getRedirectResult } from 'firebase/auth';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';

export default function GlobalAuthListener() {
  const { loginWithGoogle } = useAuthStore();

  useEffect(() => {
    let isMounted = true;
    
    // Check if the user is returning to the app from Google OAuth redirect
    getRedirectResult(auth)
      .then(async (result) => {
        if (!isMounted || !result || !result.user) return;
        const user = result.user;
        
        if (!user.email) {
          showToast('No email associated with this Google account.', 'error');
          return;
        }

        console.log('[Google Auth] Redirect result received:', user.email, user.displayName, user.phoneNumber);
        showToast('Completing Google Sign-In...', 'info');

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
          showToast(`Welcome back, ${res.user?.username || user.displayName || 'Customer'}!`, 'success');
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

    return () => {
      isMounted = false;
    };
  }, [loginWithGoogle]);

  return null;
}
