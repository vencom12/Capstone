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
    // If returning from Google redirect, immediately trigger the welcome transition so the landing page never flashes
    if (isGoogleAuthPending()) {
      useUIStore.getState().triggerWelcome('Signing in...', 'authenticating');
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

      if (outcome.user.role === 'admin') {
        useUIStore.getState().triggerWelcome(outcome.user.username || 'Staff', outcome.user.role);
        router.replace('/admin');
      } else if (outcome.user.role === 'employee') {
        useUIStore.getState().triggerWelcome(outcome.user.username || 'Staff', outcome.user.role);
        router.replace('/employee');
      } else {
        useUIStore.getState().closeWelcome();
        showToast(`Welcome back, ${outcome.user.username || 'Customer'}!`, 'success');
        router.replace('/');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
