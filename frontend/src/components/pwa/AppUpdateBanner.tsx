'use client';

import { useState } from 'react';
import { usePWAStore } from '@/stores/usePWAStore';

export default function AppUpdateBanner() {
  const { isUpdateAvailable, updateApp } = usePWAStore();
  const [dismissed, setDismissed] = useState(false);

  if (!isUpdateAvailable || dismissed) return null;

  return (
    <aside
      aria-label="App update announcement"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[99999] max-w-[92vw] sm:max-w-md w-full animate-in fade-in slide-in-from-bottom-3 duration-300 pointer-events-auto"
    >
      <div className="bg-bg-card/95 backdrop-blur-xl border border-primary/40 shadow-2xl rounded-2xl p-3 px-4 flex items-center justify-between gap-3 text-xs text-text-main">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
          </span>
          <div className="min-w-0">
            <span className="font-bold text-text-main truncate block">New Update Available!</span>
            <span className="text-[11px] text-text-dim truncate block">
              A fresh release is ready with new fixes and improvements.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => updateApp()}
            className="px-3 py-1.5 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 active:scale-95 transition-all cursor-pointer shadow-sm shadow-primary/20 text-xs"
          >
            Update
          </button>
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => setDismissed(true)}
            className="p-1 text-text-dim hover:text-text-main rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-xs"
            title="Dismiss notice"
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      </div>
    </aside>
  );
}
