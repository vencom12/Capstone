'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { getRedirectResult, onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { showToast } from '@/components/ui/Toast';

export default function GlobalAuthListener() {
  const router = useRouter();
  const isProcessingRef = useRef(false);

  const processFirebaseUser = async (user: FirebaseUser) => {
    if (!user.email) {
      showToast('No email associated with this Google account.', 'error');
      return;
    }

    if (isProcessingRef.current) return;
    const currentAuth = useAuthStore.getState();
    if (currentAuth.isAuthenticated && currentAuth.user?.email?.toLowerCase() === user.email.toLowerCase()) {
      return;
    }

    isProcessingRef.current = true;
    console.log('[Google Auth] Processing user login:', user.email);

    try {
      const { loginWithGoogle } = useAuthStore.getState();
      const res = await loginWithGoogle({
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        phoneNumber: user.phoneNumber || '',
        uid: user.uid,
      });

      if (res.success && res.needsPassword && res.setupToken) {
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
        showToast(`Welcome back, ${res.user?.username || user.displayName || 'Customer'}!`, 'success');
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
    } catch (err: any) {
      console.error('[Google Auth] Error during processing:', err);
      showToast(err.message || 'Failed to complete Google sign-in.', 'error');
    } finally {
      isProcessingRef.current = false;
    }
  };

  useEffect(() => {
    // 1. Direct Redirect Handler:
    // getRedirectResult is ONLY non-null immediately after returning from a redirect!
    // Running this unconditionally ensures logins are never lost if the browser stripped sessionStorage.
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('stitch-google-auth-pending');
          }
          console.log('[Google Auth] Redirect result received:', result.user.email);
          processFirebaseUser(result.user);
        }
      })
      .catch((error) => {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('stitch-google-auth-pending');
        }
        if (error.code && error.code !== 'auth/null-user') {
          console.error('[Google Auth] Redirect Auth Error:', error);
          if (error.code === 'auth/unauthorized-domain') {
            const domain = typeof window !== 'undefined' ? window.location.hostname : 'your domain';
            showToast(`Domain "${domain}" is not authorized. Add it in Firebase Console > Authentication > Settings > Authorized domains.`, 'error');
          } else {
            showToast(error.message || 'Error completing Google sign-in.', 'error');
          }
        }
      });

    // 2. Auth State Observer:
    // Seamlessly handles logins whether completed via Popup or Redirect
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !useAuthStore.getState().isAuthenticated) {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('stitch-google-auth-pending');
        }
        console.log('[Google Auth] Observer detected Google session:', user.email);
        processFirebaseUser(user);
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
