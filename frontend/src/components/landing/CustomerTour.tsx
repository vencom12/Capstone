'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useAuthStore } from '@/stores/useAuthStore';

export default function CustomerTour() {
  const { isCustomerTourOpen, setCustomerTourOpen } = useUIStore();
  const { user } = useAuthStore();

  const [mounted, setMounted] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Synchronize open state with entrance/exit transitions
  useEffect(() => {
    if (isCustomerTourOpen) {
      setIsRendered(true);
      setIsExiting(false);
      // Trigger smooth entrance animation on next animation frame
      const frame = requestAnimationFrame(() => {
        setIsAnimatingIn(true);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      setIsAnimatingIn(false);
      setIsRendered(false);
    }
  }, [isCustomerTourOpen]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setIsAnimatingIn(false);
    try {
      localStorage.setItem('eds_customer_welcome_seen', 'true');
    } catch {
      // ignore
    }
    // Smooth 320ms exit dissolve before unmounting
    setTimeout(() => {
      setCustomerTourOpen(false);
      setIsExiting(false);
      setIsRendered(false);
    }, 320);
  }, [isExiting, setCustomerTourOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isRendered) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRendered, handleClose]);

  if (!mounted || !isRendered) return null;

  const displayName = user?.username ? user.username : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Eds Towels & Caps"
      className={`
        fixed inset-0 z-[100010] flex items-center justify-center p-4 sm:p-6 select-none
        transition-all duration-300 ease-out
        ${isAnimatingIn && !isExiting ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}
      onClick={handleClose}
    >
      {/* Smooth Frosted Glass Backdrop */}
      <div 
        className={`
          absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300 ease-out
          ${isAnimatingIn && !isExiting ? 'opacity-100' : 'opacity-0'}
        `}
      />

      {/* Main Welcome Card */}
      <div
        className={`
          relative w-full max-w-[480px] bg-bg-card border border-border-glass rounded-3xl p-6 sm:p-8
          shadow-[0_25px_70px_rgba(0,0,0,0.55)] flex flex-col items-center text-center overflow-hidden
          transition-all duration-350 cubic-bezier(0.16, 1, 0.3, 1)
          ${
            isAnimatingIn && !isExiting
              ? 'opacity-100 scale-100 translate-y-0 blur-0'
              : 'opacity-0 scale-[0.94] translate-y-3 blur-[2px]'
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Ambient Radial Crest Glow */}
        <div 
          className="absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-44 rounded-full bg-primary/20 blur-3xl pointer-events-none" 
        />

        {/* Top Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-bg-surface hover:bg-primary hover:text-white text-text-dim border border-border-glass flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
          aria-label="Close welcome"
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Artisan Brand Crest Icon */}
        <div className="relative mb-4 mt-1">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/35 flex items-center justify-center text-primary shadow-[0_0_25px_var(--color-primary-glow)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
        </div>

        {/* Studio Eyebrow Kicker */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-bold tracking-[0.16em] uppercase">
            Artisan Studio • Pacific Mall Lucena
          </span>
        </div>

        {/* Welcome Greeting */}
        <h2 className="text-2xl sm:text-3xl font-black text-text-main tracking-tight m-0 mb-2">
          {displayName ? `Welcome, ${displayName}!` : 'Welcome to Eds Towels & Caps!'}
        </h2>

        {/* Brief Intro */}
        <p className="text-xs sm:text-sm text-text-dim leading-relaxed m-0 mb-6 max-w-[380px]">
          Your account is ready. Discover custom machine embroidery with live previews, real-time inventory, and convenient in-store counter pickup.
        </p>

        {/* 3 Core Highlights in an Ultra-clean Grid */}
        <div className="w-full flex flex-col gap-2.5 mb-6 text-left">
          <div className="p-3 rounded-2xl bg-bg-surface/70 border border-border-glass flex items-center gap-3 transition-colors hover:border-primary/30">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-text-main">Live Catalog &amp; Real-Time Stock</span>
              <span className="text-[11px] text-text-dim truncate">Caps, towels, and clothing with live available stock counts.</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-bg-surface/70 border border-border-glass flex items-center gap-3 transition-colors hover:border-primary/30">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-text-main">Custom Embroidery &amp; Lettering</span>
              <span className="text-[11px] text-text-dim truncate">Free first word on all items with 8 artisan thread colors.</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-bg-surface/70 border border-border-glass flex items-center gap-3 transition-colors hover:border-primary/30">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-text-main">Fast Pickup &amp; Live Tracking</span>
              <span className="text-[11px] text-text-dim truncate">Pick up at Pacific Mall Lucena with your secure claim code.</span>
            </div>
          </div>
        </div>

        {/* Start Exploring Button */}
        <button
          type="button"
          onClick={handleClose}
          className="w-full py-3.5 px-6 rounded-xl bg-primary hover:bg-secondary text-white font-bold text-sm shadow-[0_8px_25px_var(--color-primary-glow)] hover:shadow-[0_10px_30px_rgba(185,28,28,0.45)] transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 group hover:scale-[1.01] active:scale-[0.99]"
        >
          <span>Start Exploring</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-200 group-hover:translate-x-1">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
