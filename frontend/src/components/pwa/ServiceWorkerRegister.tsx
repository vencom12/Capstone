'use client';

import { useEffect } from 'react';

/**
 * ServiceWorkerRegister:
 * Registers /sw.js in production or when supported by the browser,
 * fulfilling PWA installability requirements and providing offline asset caching.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            // Silently verify registration
            if (process.env.NODE_ENV === 'development') {
              console.log('[PWA] Service Worker registered with scope:', reg.scope);
            }
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }
  }, []);

  return null;
}
