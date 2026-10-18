'use client';

import { useEffect, useState, useRef } from 'react';
import { useUIStore } from '@/stores/useUIStore';

export default function WelcomeTransition() {
  const welcomeData = useUIStore((state) => state.welcomeData);
  const closeWelcome = useUIStore((state) => state.closeWelcome);

  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<'entering' | 'present' | 'exiting' | 'hidden'>('hidden');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Authorizing session...');
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');
  const [isOffline, setIsOffline] = useState(false);

  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const startTimeRef = useRef<number>(0);
  const isClosingRef = useRef<boolean>(false);

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => {
    setMounted(true);

    const handleOffline = () => {
      setIsOffline(true);
      setStatusText('Network disconnected. Waiting for connection...');
    };
    const handleOnline = () => {
      setIsOffline(false);
      setStatusText('Connection restored. Resuming data sync...');
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimers();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // When welcomeData opens or a new session is triggered
  useEffect(() => {
    if (!welcomeData?.isOpen) {
      setStage('hidden');
      setProgress(0);
      setIsOffline(false);
      isClosingRef.current = false;
      clearTimers();
      return;
    }

    const htmlTheme = document.documentElement.getAttribute('data-theme');
    setCurrentTheme(htmlTheme === 'light' ? 'light' : 'dark');

    if (stage === 'present') {
      return;
    }

    setStage('entering');
    setProgress(25);
    setStatusText('Authorizing session...');
    setIsOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false);
    startTimeRef.current = welcomeData?.startTime || Date.now();
    isClosingRef.current = false;
    clearTimers();

    // Stage 1 (60ms): Present view and step up progress
    const tPresent = setTimeout(() => {
      setStage('present');
      setProgress(55);
      setStatusText('Connecting to workspace...');
    }, 60);

    // Stage 2 (380ms): Step up progress as dashboard initializes
    const tMid = setTimeout(() => {
      if (!isClosingRef.current) {
        setProgress(78);
        setStatusText('Loading operational data...');
      }
    }, 380);

    // Stage 3 (2000ms): Continuous asymptotic progress creep (never looks frozen)
    const tCreep1 = setTimeout(() => {
      if (!isClosingRef.current) {
        setProgress(87);
        setStatusText('Synchronizing workspace data...');
      }
    }, 2000);

    // Stage 4 (3600ms): Steady creep forward
    const tSlow = setTimeout(() => {
      if (!isClosingRef.current) {
        setProgress(93);
        setStatusText('Finalizing workspace setup...');
      }
    }, 3600);

    // Stage 5 (5000ms): Friendly reassurance
    const tReassure = setTimeout(() => {
      if (!isClosingRef.current) {
        setProgress(96);
        setStatusText('Almost ready...');
      }
    }, 5000);

    // Stage 6 (6800ms): Generous silent safety fallback in case of unexpected network stall
    const tSafety = setTimeout(() => {
      if (!isClosingRef.current) {
        triggerExitSequence();
      }
    }, 6800);

    timersRef.current.push(tPresent, tMid, tCreep1, tSlow, tReassure, tSafety);
  }, [welcomeData?.isOpen, welcomeData?.triggerId]);

  // When destination dashboard signals that all initial data has finished loading
  useEffect(() => {
    if (welcomeData?.isOpen && welcomeData?.isReady && !isClosingRef.current) {
      triggerExitSequence();
    }
  }, [welcomeData?.isReady, welcomeData?.isOpen]);

  const triggerExitSequence = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    // Minimum graceful display time (750ms) to ensure branding and username are legible
    const effectiveStart = welcomeData?.startTime || startTimeRef.current || Date.now();
    const elapsed = Date.now() - effectiveStart;
    const remainingDelay = Math.max(0, 750 - elapsed);

    const tFill = setTimeout(() => {
      setProgress(100);
      setStatusText('Workspace Ready');

      // Hold briefly at 100% for visual completion
      const tExit = setTimeout(() => {
        setStage('exiting');

        // Allow 400ms smooth cross-fade dissolve into the fully populated dashboard
        const tDone = setTimeout(() => {
          setStage('hidden');
          isClosingRef.current = false;
          closeWelcome();
        }, 400);

        timersRef.current.push(tDone);
      }, 180);

      timersRef.current.push(tExit);
    }, remainingDelay);

    timersRef.current.push(tFill);
  };

  if (!mounted || stage === 'hidden' || !welcomeData?.isOpen) {
    return null;
  }

  const isDark = currentTheme === 'dark';
  const username = welcomeData.username || 'User';
  const isGenericLoading = username === 'Welcome' || username === 'Authenticating...';
  const role = (welcomeData.role || 'customer').toLowerCase();
  const initial = isGenericLoading ? 'S' : username.charAt(0).toUpperCase();

  // Role visual metadata
  const roleInfo = {
    admin: {
      label: 'Administrator',
      badgeClass: 'bg-primary/15 text-primary border-primary/30',
      dotClass: 'bg-primary',
    },
    employee: {
      label: 'Staff Specialist',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      dotClass: 'bg-emerald-500',
    },
    customer: {
      label: 'Verified Member',
      badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      dotClass: 'bg-sky-400',
    },
  }[role] || {
    label: 'Customer',
    badgeClass: 'bg-primary/15 text-primary border-primary/30',
    dotClass: 'bg-primary',
  };

  const isExiting = stage === 'exiting';
  const isEntering = stage === 'entering';

  return (
    <aside
      aria-label="Welcome greeting"
      aria-live="polite"
      onClick={() => {
        // Fast manual dismiss safeguard if user taps after initial presentation
        const elapsed = Date.now() - (welcomeData?.startTime || startTimeRef.current || Date.now());
        if (stage === 'present' && elapsed > 1200 && !isClosingRef.current) {
          triggerExitSequence();
        }
      }}
      className={`
        fixed inset-0 z-[999999] flex flex-col items-center justify-center p-6
        select-none cursor-default
        transition-all duration-400 ease-out
        ${
          isEntering
            ? 'opacity-0 scale-[0.98]'
            : isExiting
            ? 'opacity-0 scale-[1.02] blur-sm pointer-events-none'
            : 'opacity-100 scale-100 pointer-events-auto'
        }
      `}
      style={{
        backgroundColor: isDark ? '#090d16' : '#f8fafc',
        backgroundImage: isDark
          ? 'radial-gradient(circle at 50% 48%, rgba(185, 28, 28, 0.22) 0%, rgba(9, 13, 22, 0.92) 58%, rgba(9, 13, 22, 1) 100%)'
          : 'radial-gradient(circle at 50% 48%, rgba(185, 28, 28, 0.12) 0%, rgba(248, 250, 252, 0.94) 58%, rgba(248, 250, 252, 1) 100%)',
      }}
    >
      {/* Inline Keyframes for continuous active scanning light shimmer */}
      <style>{`
        @keyframes welcomeShimmerSweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      {/* Ambient background glow orb */}
      <div
        className="absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-primary/20 blur-[100px] pointer-events-none animate-pulse"
        style={{ animationDuration: '3s' }}
      />

      {/* Main Card Content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-sm sm:max-w-md w-full px-4">
        
        {/* Brand Crest & Monogram Avatar */}
        <div className="relative mb-6">
          {/* Subtle outer breathing ring */}
          <div className="absolute inset-0 rounded-full border border-primary/40 animate-ping opacity-25" />
          
          <div
            className={`
              w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center
              border-2 border-primary/50 shadow-2xl relative
              ${
                isDark
                  ? 'bg-gradient-to-b from-slate-800/90 to-slate-900/95 shadow-red-950/50'
                  : 'bg-gradient-to-b from-white to-slate-100 shadow-red-200/50'
              }
            `}
          >
            {/* User initial with artisan typography */}
            <span className="text-3xl sm:text-4xl font-black text-primary tracking-tight">
              {initial}
            </span>

            {/* Micro stitch mark icon on bottom right */}
            <span
              className={`
                absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center
                border border-primary/40 shadow-md
                ${isDark ? 'bg-slate-900 text-primary' : 'bg-white text-primary'}
              `}
              title="Stitch-Opt"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </span>
          </div>
        </div>

        {/* Brand Kicker */}
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[0.68rem] sm:text-xs font-bold tracking-[0.24em] uppercase text-primary">
            Stitch-Opt Studio
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        </div>

        {/* Greeting Eyebrow */}
        <p
          className={`
            text-sm sm:text-base font-medium mb-1
            ${isDark ? 'text-slate-400' : 'text-slate-500'}
          `}
        >
          {isGenericLoading ? 'Authorizing session' : 'Welcome back,'}
        </p>

        {/* Big Personalized Username */}
        <h1
          className={`
            text-3xl sm:text-4xl font-extrabold tracking-tight truncate max-w-full mb-3
            ${isDark ? 'text-white' : 'text-slate-900'}
          `}
        >
          {isGenericLoading ? 'Signing in...' : username}
        </h1>

        {/* Role Pill Badge */}
        {!isGenericLoading && (
          <div
            className={`
              inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border mb-8
              ${roleInfo.badgeClass}
            `}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${roleInfo.dotClass}`} />
            <span>{roleInfo.label}</span>
          </div>
        )}

        {/* Progress & Workspace Status Line */}
        <div className={`w-52 sm:w-64 flex flex-col items-center gap-2.5 ${isGenericLoading ? 'mt-4' : ''}`}>
          <div
            className={`
              w-full h-1.5 rounded-full overflow-hidden relative
              ${isDark ? 'bg-white/10' : 'bg-slate-200'}
            `}
          >
            {/* Main Filled Bar */}
            <div
              className="h-full bg-gradient-to-r from-primary via-red-500 to-rose-400 rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(185,28,28,0.8)] relative overflow-hidden"
              style={{ width: `${progress}%` }}
            >
              {/* Continuous Active Scanning Light Beam (never looks frozen) */}
              <div
                className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none"
                style={{
                  animation: 'welcomeShimmerSweep 1.6s ease-in-out infinite',
                }}
              />
            </div>
          </div>

          {/* Dynamic Status Text */}
          <span
            className={`
              text-[0.7rem] tracking-wider uppercase font-semibold transition-all duration-300 flex items-center gap-1.5
              ${isOffline ? 'text-amber-500' : isDark ? 'text-slate-400' : 'text-slate-600'}
            `}
          >
            {isOffline && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-pulse">
                <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
              </svg>
            )}
            {statusText}
          </span>
        </div>
      </div>
    </aside>
  );
}
