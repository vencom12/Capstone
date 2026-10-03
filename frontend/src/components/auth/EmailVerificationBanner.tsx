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

  // Don't show banner if not authenticated, not a customer, already verified, or dismissed
  if (!isAuthenticated || !user || user.role !== 'customer' || user.isEmailVerified || dismissed) {
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
    <div className="w-full bg-amber-500/10 border-b border-amber-500/20 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-amber-400 text-base">⚠️</span>
          <span className="text-amber-200/90 font-medium">
            Your email <strong className="text-white font-bold">{user.email}</strong> is not verified yet.
          </span>
          <span className="text-amber-200/60 text-xs hidden sm:inline">
            Verify to place orders.
          </span>
        </div>

        <div className="flex items-center gap-2">
          {cooldown > 0 ? (
            <span className="text-amber-300/70 text-xs font-medium">
              Resend in <span className="font-mono font-bold text-amber-200">{cooldown}s</span>
            </span>
          ) : (
            <button
              onClick={handleResend}
              disabled={isResending}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs font-bold 
                cursor-pointer hover:bg-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResending ? 'Sending...' : 'Resend Email'}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-amber-300/50 hover:text-amber-200 bg-transparent border-none cursor-pointer transition-colors"
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
