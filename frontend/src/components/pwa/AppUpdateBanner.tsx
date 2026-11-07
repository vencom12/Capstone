'use client';

import { useEffect } from 'react';
import { usePWAStore } from '@/stores/usePWAStore';

export default function AppUpdateBanner() {
  const { isUpdateAvailable, updateApp } = usePWAStore();

  useEffect(() => {
    if (!isUpdateAvailable) return;

    const trySilentUpdate = () => {
      // Wait if the user is actively typing in an input, textarea, or select
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return false;
      }
      updateApp();
      return true;
    };

    if (trySilentUpdate()) return;

    const interval = window.setInterval(() => {
      if (trySilentUpdate()) {
        window.clearInterval(interval);
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [isUpdateAvailable, updateApp]);

  // Silent update only — no visible notification banner
  return null;
}
