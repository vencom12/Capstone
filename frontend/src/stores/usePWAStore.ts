import { create } from 'zustand';
import { showToast } from '@/components/ui/Toast';

export type PWAPlatform = 'ios' | 'android' | 'desktop' | 'unknown';

interface PWAStore {
  deferredPrompt: any | null;
  isInstallable: boolean;
  isInstalled: boolean;
  isInstallModalOpen: boolean;
  isUpdateAvailable: boolean;
  waitingWorker: any | null;
  platform: PWAPlatform;
  setDeferredPrompt: (prompt: any | null) => void;
  setIsInstallable: (val: boolean) => void;
  setIsInstalled: (val: boolean) => void;
  setIsInstallModalOpen: (val: boolean) => void;
  setIsUpdateAvailable: (val: boolean) => void;
  setWaitingWorker: (worker: any | null) => void;
  setPlatform: (platform: PWAPlatform) => void;
  promptInstall: () => Promise<void>;
  updateApp: () => void;
}

export const usePWAStore = create<PWAStore>((set, get) => ({
  deferredPrompt: null,
  isInstallable: false,
  isInstalled: false,
  isInstallModalOpen: false,
  isUpdateAvailable: false,
  waitingWorker: null,
  platform: 'unknown',
  setDeferredPrompt: (prompt) => set({ deferredPrompt: prompt, isInstallable: !!prompt }),
  setIsInstallable: (val) => set({ isInstallable: val }),
  setIsInstalled: (val) => set({ isInstalled: val }),
  setIsInstallModalOpen: (val) => set({ isInstallModalOpen: val }),
  setIsUpdateAvailable: (val) => set({ isUpdateAvailable: val }),
  setWaitingWorker: (worker) => set({ waitingWorker: worker }),
  setPlatform: (platform) => set({ platform }),
  promptInstall: async () => {
    const { deferredPrompt, isInstalled } = get();

    if (isInstalled) {
      showToast({
        type: 'info',
        title: 'App Installed',
        message: 'This application is already installed on your device.',
      });
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          set({ isInstalled: true, deferredPrompt: null, isInstallable: false });
          showToast({
            type: 'success',
            title: 'Installation Started',
            message: 'Adding the app to your device...',
          });
        }
      } catch (err) {
        console.error('Error triggering PWA install prompt:', err);
        set({ isInstallModalOpen: true });
      }
      return;
    }

    // Fallback: If no browser prompt event is available (iOS Safari, Firefox, or already prompted), show the guided visual modal
    set({ isInstallModalOpen: true });
  },
  updateApp: async () => {
    const { waitingWorker } = get();
    try {
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
      }
    } catch {}
    // Reload to mount new service worker bundle
    setTimeout(() => {
      window.location.reload();
    }, 200);
  },
}));
