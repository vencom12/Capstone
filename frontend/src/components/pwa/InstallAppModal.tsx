'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { usePWAStore, type PWAPlatform } from '@/stores/usePWAStore';

export default function InstallAppModal() {
  const {
    isInstallModalOpen,
    setIsInstallModalOpen,
    platform,
    deferredPrompt,
    promptInstall,
    isInstalled,
  } = usePWAStore();

  const [activeTab, setActiveTab] = useState<PWAPlatform>(
    platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'desktop'
  );

  if (!isInstallModalOpen) return null;

  return (
    <GlassModal
      isOpen={isInstallModalOpen}
      onClose={() => setIsInstallModalOpen(false)}
      title="Install App"
      maxWidth="max-w-[480px]"
    >
      <div className="space-y-4 pt-1">
        {/* Header Preview */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-border-glass">
          <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md border border-white/10 flex items-center justify-center bg-[#090d16]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="App Icon" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm text-text-main leading-tight truncate">
              Edz Towels & Caps Embroidery
            </h4>
            <p className="text-xs text-text-dim mt-0.5">
              Full screen, lightning-fast ordering, and live push notifications.
            </p>
          </div>
        </div>

        {/* If deferred prompt is available, offer direct 1-click install */}
        {deferredPrompt && !isInstalled && (
          <button
            type="button"
            onClick={() => {
              promptInstall();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Install App Now</span>
          </button>
        )}

        {/* Platform Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 border border-border-glass text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`flex-1 py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
              activeTab === 'android'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            Android
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={`flex-1 py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
              activeTab === 'ios'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            iPhone / iPad
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('desktop')}
            className={`flex-1 py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            PC / Mac
          </button>
        </div>

        {/* Tab 1: Android Instructions */}
        {activeTab === 'android' && (
          <div className="space-y-2.5 text-xs text-text-main/90">
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-border-glass/40">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                1
              </span>
              <p className="m-0 leading-relaxed">
                Open this website in <strong>Google Chrome</strong> on your phone.
              </p>
            </div>
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-border-glass/40">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                2
              </span>
              <p className="m-0 leading-relaxed">
                Tap the <strong>three dots menu (⋮)</strong> in the top-right corner of Chrome.
              </p>
            </div>
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-border-glass/40">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                3
              </span>
              <p className="m-0 leading-relaxed">
                Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>. The app icon will appear on your home screen.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: iOS Safari Instructions */}
        {activeTab === 'ios' && (
          <div className="space-y-2.5 text-xs text-text-main/90">
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-border-glass/40">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                1
              </span>
              <div className="leading-relaxed">
                Open this website in <strong>Safari</strong>, then tap the <strong>Share</strong> button{' '}
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/10 text-primary align-middle mx-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </span>{' '}
                at the bottom of your screen.
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-border-glass/40">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                2
              </span>
              <p className="m-0 leading-relaxed">
                Scroll down the share sheet and tap <strong>Add to Home Screen</strong> (+).
              </p>
            </div>
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-border-glass/40">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                3
              </span>
              <p className="m-0 leading-relaxed">
                Tap <strong>Add</strong> in the top-right corner to complete installation.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Desktop Chrome/Edge Instructions */}
        {activeTab === 'desktop' && (
          <div className="space-y-2.5 text-xs text-text-main/90">
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-border-glass/40">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                1
              </span>
              <p className="m-0 leading-relaxed">
                In <strong>Chrome</strong> or <strong>Edge</strong>, look at the right side of the address bar.
              </p>
            </div>
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-border-glass/40">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                2
              </span>
              <p className="m-0 leading-relaxed">
                Click the <strong>Install</strong> icon (screen with down arrow) or open the browser menu and select <strong>Install Edz Embroidery</strong>.
              </p>
            </div>
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-border-glass/40">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                3
              </span>
              <p className="m-0 leading-relaxed">
                Confirm <strong>Install</strong>. The app will launch in its own standalone desktop window.
              </p>
            </div>
          </div>
        )}

        {/* Benefits footer */}
        <div className="pt-2 border-t border-border-glass/40 flex items-center justify-between text-[11px] text-text-dim">
          <span>✓ Works offline</span>
          <span>✓ Full screen view</span>
          <span>✓ Live status updates</span>
        </div>
      </div>
    </GlassModal>
  );
}
