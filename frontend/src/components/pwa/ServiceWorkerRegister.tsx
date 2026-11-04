'use client';

import { useEffect } from 'react';
import { usePWAStore, type PWAPlatform } from '@/stores/usePWAStore';

/**
 * ServiceWorkerRegister:
 * Registers /sw.js, listens for PWA installability events (beforeinstallprompt, appinstalled),
 * and tracks standalone display mode and device platform.
 */
export default function ServiceWorkerRegister() {
  const { setDeferredPrompt, setIsInstalled, setPlatform } = usePWAStore();

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

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            if (process.env.NODE_ENV === 'development') {
              console.log('[PWA] Service Worker registered with scope:', reg.scope);
            }
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
  }, [setDeferredPrompt, setIsInstalled, setPlatform]);

  return null;
}
