'use client';

import { useEffect } from 'react';
import { usePWAStore, type PWAPlatform } from '@/stores/usePWAStore';

/**
 * ServiceWorkerRegister:
 * Registers /sw.js, listens for PWA installability events,
 * tracks standalone display mode, and detects when a new release update is ready.
 */
export default function ServiceWorkerRegister() {
  const {
    setDeferredPrompt,
    setIsInstalled,
    setPlatform,
    setIsUpdateAvailable,
    setWaitingWorker,
  } = usePWAStore();

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

    // Register Service Worker with release update detection
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            // Check if there is already a worker waiting to activate
            if (reg.waiting) {
              setWaitingWorker(reg.waiting);
              setIsUpdateAvailable(true);
            }

            // Listen for newly installed updates
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

            // Check for updates on window focus or visibility change
            const checkForUpdate = () => {
              try {
                reg.update().catch(() => {});
              } catch {}
            };

            window.addEventListener('focus', checkForUpdate);
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState === 'visible') {
                checkForUpdate();
              }
            });
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [setDeferredPrompt, setIsInstalled, setPlatform, setIsUpdateAvailable, setWaitingWorker]);

  return null;
}
