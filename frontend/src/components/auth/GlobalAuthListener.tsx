'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { completeGoogleSignIn, isGoogleAuthPending } from '@/lib/googleAuth';
import { useUIStore } from '@/stores/useUIStore';
import { showToast } from '@/components/ui/Toast';

/**
 * Thin UI adapter for the Google sign-in module (lib/googleAuth.ts).
 * All Firebase logic lives in that module; this file only reacts to the outcome.
 */
export default function GlobalAuthListener() {
  const router = useRouter();

  useEffect(() => {
    // If the browser just redirected back from Google OAuth, immediately raise the welcome overlay
    if (isGoogleAuthPending()) {
      useUIStore.getState().triggerWelcome('Welcome', 'Signing in...');
    }

    return completeGoogleSignIn((outcome) => {
      if (outcome.status === 'needs-password') {
        useUIStore.getState().closeWelcome();
        useUIStore.getState().setGoogleSetupData({
          token: outcome.setupToken,
          email: outcome.email,
          username: outcome.suggestedUsername,
        });
        useUIStore.getState().setAuthOpen(true);
        return;
      }

      if (outcome.status === 'error') {
        useUIStore.getState().closeWelcome();
        showToast(outcome.message, 'error');
        return;
      }

      useUIStore.getState().triggerWelcome(outcome.user.username || 'Customer', outcome.user.role || 'customer');
      if (outcome.user.role === 'admin') router.replace('/admin');
      else if (outcome.user.role === 'employee') router.replace('/employee');
      else router.replace('/');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
