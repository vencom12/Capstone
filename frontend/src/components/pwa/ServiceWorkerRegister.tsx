'use client';

import { useEffect, useRef } from 'react';
import { usePWAStore, type PWAPlatform } from '@/stores/usePWAStore';
import { CLIENT_BUILD_VERSION } from '@/lib/buildVersion';
import { API_BASE } from '@/lib/api';

/**
 * ServiceWorkerRegister:
 * Registers /sw.js, listens for PWA installability events,
 * tracks standalone display mode, and detects when a new release update is ready
 * via both Service Worker lifecycle events and live /api/version polling.
 */
export default function ServiceWorkerRegister() {
  const {
    setDeferredPrompt,
    setIsInstalled,
    setPlatform,
    setIsUpdateAvailable,
    setWaitingWorker,
  } = usePWAStore();
  const initialServerVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detect device platform
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    const isAndroid = /android/.test(ua);
    const detectedPlatform: PWAPlatform = isIos ? 'ios' : isAndroid ? 'android' : 'desktop';
    setPlatform(detectedPlatform);

    // Detect if already installed/running in standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
    }

    // Capture beforeinstallprompt event (Chromium, Android Chrome, Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // Capture appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    let swReg: ServiceWorkerRegistration | null = null;

    const checkServerVersion = async () => {
      try {
        if (swReg) {
          swReg.update().catch(() => {});
        }
        const res = await fetch(`${API_BASE}/api/version?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverVersion = data?.version;
        if (!serverVersion || serverVersion === 'latest') return;

        if (!initialServerVersionRef.current) {
          initialServerVersionRef.current = serverVersion;
        }

        const isLocalDev =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1';

        const versionChangedSinceMount =
          initialServerVersionRef.current &&
          initialServerVersionRef.current !== serverVersion;

        const bundleOutdatedInProd =
          !isLocalDev &&
          CLIENT_BUILD_VERSION &&
          CLIENT_BUILD_VERSION !== serverVersion;

        if (versionChangedSinceMount || bundleOutdatedInProd) {
          const alreadyUpdatedTo = sessionStorage.getItem('stitch_updated_to_version');
          if (alreadyUpdatedTo !== serverVersion) {
            sessionStorage.setItem('stitch_updated_to_version', serverVersion);
            setIsUpdateAvailable(true);
          }
        }
      } catch {
        // Ignore transient offline errors
      }
    };

    const registerSW = () => {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          swReg = reg;

          if (reg.waiting) {
            setWaitingWorker(reg.waiting);
            setIsUpdateAvailable(true);
          }

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setWaitingWorker(newWorker);
                  setIsUpdateAvailable(true);
                }
              });
            }
          });

          checkServerVersion();
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    };

    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW, { once: true });
    }

    // Check for updates every 30 seconds and on window focus / visibility change
    const pollInterval = window.setInterval(checkServerVersion, 30000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkServerVersion();
      }
    };

    window.addEventListener('focus', checkServerVersion);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(pollInterval);
      window.removeEventListener('focus', checkServerVersion);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [setDeferredPrompt, setIsInstalled, setPlatform, setIsUpdateAvailable, setWaitingWorker]);

  return null;
}
