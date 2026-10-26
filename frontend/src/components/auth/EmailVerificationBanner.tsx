'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';

/**
 * EmailVerificationBanner — Shows a dismissible but persistent banner
 * when a logged-in customer's email is not verified.
 * Includes a resend button with cooldown.
 */
export default function EmailVerificationBanner() {
  const { user, isAuthenticated, resendEmailVerification } = useAuthStore();
  const [cooldown, setCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Don't show banner if not authenticated, not a customer, no email registered, already verified, or dismissed
  if (!isAuthenticated || !user || user.role !== 'customer' || !user.email || user.isEmailVerified || dismissed) {
    return null;
  }

  const handleResend = async () => {
    if (isResending || cooldown > 0) return;
    setIsResending(true);
    try {
      const res = await resendEmailVerification();
      if (res.success) {
        setCooldown(res.cooldownSeconds || 60);
        showToast(res.message || 'Verification email sent!', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to resend. Please try again.', 'error');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full bg-white/[0.04] border-b border-border-glass backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-4 h-4 text-text-dim shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-text-main text-xs sm:text-sm font-medium">
            Your email <strong className="text-white font-bold">{user.email}</strong> is not verified yet.
          </span>
          <span className="text-text-dim text-xs hidden sm:inline">
            Verify to receive order status updates.
          </span>
        </div>

        <div className="flex items-center gap-2">
          {cooldown > 0 ? (
            <span className="text-text-dim text-xs font-medium">
              Resend in <span className="font-mono font-bold text-text-main">{cooldown}s</span>
            </span>
          ) : (
            <button
              onClick={handleResend}
              disabled={isResending}
              className="px-3 py-1 rounded-lg bg-white/[0.08] border border-border-glass text-text-main text-xs font-semibold 
                cursor-pointer hover:bg-white/[0.14] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResending ? 'Sending...' : 'Resend Email'}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-text-dim hover:text-text-main bg-transparent border-none cursor-pointer transition-colors"
            aria-label="Dismiss banner"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
