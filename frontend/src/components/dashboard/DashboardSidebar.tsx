'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBasketStore } from '@/stores/useBasketStore';
import { useUIStore } from '@/stores/useUIStore';
import Link from 'next/link';
import TermsAndPoliciesModal from '@/components/ui/TermsAndPoliciesModal';
import CustomerHelpModal from '@/components/dashboard/CustomerHelpModal';

interface DashboardSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onMobileToggle?: () => void;
  onOpenAddressBook?: () => void;
}

export default function DashboardSidebar({ 
  activeTab, 
  setActiveTab, 
  onMobileToggle,
  onOpenAddressBook 
}: DashboardSidebarProps) {
  const { user, logout } = useAuthStore();
  const { isSidebarOpen, setSidebarOpen } = useUIStore();
  const basketCount = useBasketStore((s) => s.getCount());
  const [mounted, setMounted] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    setMounted(true);
    if (typeof document !== 'undefined') {
      const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      setCurrentTheme(theme);
    }
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res && res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
      }).catch(() => {});
    });
  }, []);

  const toggleTheme = () => {
    if (typeof document === 'undefined') return;
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    setCurrentTheme(nextTheme);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    if (isLeftSwipe && window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  const closeMobileDrawer = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  // Primary desktop / wide screen nav items
  const desktopNavItems = [
    {
      id: 'shop', label: 'Shop Designs', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /><path d="M2 7h20" /><path d="M22 7l-3 5H5l-3-5" /></svg>
      )
    },
    {
      id: 'basket', label: 'My Basket', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
      )
    },
    {
      id: 'tracking', label: 'Order Tracking', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
      )
    },
    {
      id: 'history', label: 'My Transactions', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
      )
    },
    {
      id: 'favs', label: 'My Favorites', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
      )
    }
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1999] hidden max-md:block backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`
        h-full bg-bg-sidebar backdrop-blur-[12px] border-r border-border-glass flex flex-col transition-all duration-300 shrink-0 z-[2000]
        w-[260px] max-[1100px]:w-[80px] max-md:w-[290px]
        max-md:fixed max-md:left-0 max-md:top-0
        ${isSidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}
      `}>
        {/* Header / Logo */}
        <div className="p-4 pt-5 pb-3 border-b border-border-glass/40 flex items-center justify-between shrink-0">
          <Link href="/" className="flex items-center gap-2.5 no-underline cursor-pointer min-w-0 max-[1100px]:justify-center max-md:justify-start">
            {businessLogoUrl ? (
              <img src={businessLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/10 shrink-0" />
            ) : (
              <div className="bg-primary w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 font-bold shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
            )}
            <span className="font-black text-[1.1rem] text-text-main tracking-tight max-[1100px]:hidden max-md:inline truncate">
              Stitch-Opt
            </span>
          </Link>

          {/* Close button for mobile drawer */}
          <button
            suppressHydrationWarning
            onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 rounded-full bg-white/5 border border-border-glass text-text-dim hover:text-white hover:bg-white/10 hidden max-md:flex items-center justify-center cursor-pointer transition-all shrink-0"
            aria-label="Close navigation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* ============================================================ */}
        {/* MOBILE DRAWER CONTENT (Only rendered on mobile view <= 768px) */}
        {/* Curated: Receipts, Saved, Addresses, Help, Policies, Theme, Sign out */}
        {/* ============================================================ */}
        <div className="hidden max-md:flex flex-col flex-1 overflow-y-auto px-3.5 py-3 space-y-4">
          {/* Quick Account Profile Card */}
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-border-glass flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-base shrink-0">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-text-main truncate">{user?.username || 'Customer'}</span>
                {user?.isEmailVerified && (
                  <span className="text-[0.65rem] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                    Verified
                  </span>
                )}
              </div>
              <p className="text-[0.75rem] text-text-dim truncate m-0">{user?.email || 'Customer Account'}</p>
            </div>
          </div>

          {/* Drawer Section 1: Customer Activity & Shortcuts */}
          <div>
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim/70 px-2 block mb-1.5">
              Activity & Records
            </span>
            <div className="flex flex-col gap-1">
              {/* Receipts / Transactions */}
              <button
                onClick={() => {
                  setActiveTab('history');
                  closeMobileDrawer();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer text-left transition-all ${
                  activeTab === 'history'
                    ? 'bg-primary text-white border-primary/40 font-semibold shadow-sm'
                    : 'bg-transparent text-text-main border-transparent hover:bg-white/5'
                }`}
              >
                <div className="shrink-0 text-current">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.9rem] font-medium leading-tight">Receipts & Invoices</div>
                  <div className={`text-[0.72rem] ${activeTab === 'history' ? 'text-white/80' : 'text-text-dim'}`}>Orders archive & VAT receipts</div>
                </div>
                <span className="text-xs opacity-60">→</span>
              </button>

              {/* Saved / Favorites */}
              <button
                onClick={() => {
                  setActiveTab('favs');
                  closeMobileDrawer();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer text-left transition-all ${
                  activeTab === 'favs'
                    ? 'bg-primary text-white border-primary/40 font-semibold shadow-sm'
                    : 'bg-transparent text-text-main border-transparent hover:bg-white/5'
                }`}
              >
                <div className="shrink-0 text-current">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.9rem] font-medium leading-tight">Saved Favorites</div>
                  <div className={`text-[0.72rem] ${activeTab === 'favs' ? 'text-white/80' : 'text-text-dim'}`}>Your curated designs</div>
                </div>
                <span className="text-xs opacity-60">→</span>
              </button>
            </div>
          </div>

          {/* Drawer Section 2: Support & Studio Policies */}
          <div>
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim/70 px-2 block mb-1.5">
              Support & Guidelines
            </span>
            <div className="flex flex-col gap-1">
              {/* In-Dashboard Help & FAQs Modal Trigger */}
              <button
                type="button"
                onClick={() => {
                  setIsHelpOpen(true);
                  closeMobileDrawer();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent bg-transparent text-text-main hover:bg-white/5 cursor-pointer text-left transition-all"
              >
                <div className="shrink-0 text-text-dim">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.9rem] font-medium leading-tight">Help & FAQs</div>
                  <div className="text-[0.72rem] text-text-dim">Ordering guide, digitizing & support</div>
                </div>
                <span className="text-xs opacity-60">→</span>
              </button>

              {/* Studio Policies & Terms */}
              <button
                type="button"
                onClick={() => {
                  setIsTermsOpen(true);
                  closeMobileDrawer();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent bg-transparent text-text-main hover:bg-white/5 cursor-pointer text-left transition-all"
              >
                <div className="shrink-0 text-text-dim">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.9rem] font-medium leading-tight">Studio Policies</div>
                  <div className="text-[0.72rem] text-text-dim">Terms of service & privacy</div>
                </div>
                <span className="text-xs opacity-60">→</span>
              </button>
            </div>
          </div>

          {/* Drawer Section 3: Preferences & Session */}
          <div className="pt-2 border-t border-border-glass/60 flex flex-col gap-1.5">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border-glass/40 bg-white/[0.02] hover:bg-white/5 cursor-pointer transition-all text-text-main"
            >
              <div className="flex items-center gap-3">
                <div className="text-text-dim">
                  {currentTheme === 'light' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  )}
                </div>
                <span className="text-[0.88rem] font-medium">Theme</span>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-lg bg-white/10 font-bold uppercase tracking-wider text-text-dim">
                {currentTheme === 'light' ? 'Light' : 'Dark'}
              </span>
            </button>

            {/* Logout / Sign out */}
            <button
              onClick={() => {
                closeMobileDrawer();
                logout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-danger/20 text-danger hover:bg-danger/10 cursor-pointer transition-all text-left"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span className="text-[0.9rem] font-semibold">Sign Out</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* DESKTOP SIDEBAR NAVIGATION (Rendered on tablet & desktop > 768px) */}
        {/* ============================================================ */}
        <div className="max-md:hidden flex flex-col flex-1">
          <ul className="list-none p-0 m-0 mt-4 flex flex-col px-3 gap-1">
            {desktopNavItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer
                  transition-all duration-300 border font-medium text-[0.95rem]
                  max-[1100px]:justify-center max-[1100px]:px-0
                  ${activeTab === item.id
                      ? 'bg-primary text-white border-primary/40 font-semibold shadow-sm'
                      : 'bg-transparent text-text-dim border-transparent hover:bg-white/5 hover:text-text-main'}
                `}
                >
                  <div className="shrink-0 relative">
                    {item.icon}
                    {item.id === 'basket' && mounted && basketCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-primary text-[0.6rem] text-white w-4 h-4 rounded-full flex items-center justify-center font-bold border border-bg-sidebar shadow-sm">
                        {basketCount}
                      </span>
                    )}
                  </div>
                  <span className="max-[1100px]:hidden whitespace-nowrap flex-1 text-left">{item.label}</span>
                  {item.id === 'basket' && mounted && basketCount > 0 && (
                    <span className={`max-[1100px]:hidden text-[0.7rem] px-2 py-0.5 rounded-full font-bold ${
                      activeTab === 'basket' ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary border border-primary/30'
                    }`}>
                      {basketCount}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Desktop User Profile Footer */}
          <div className="mt-auto p-3 pb-8 border-t border-border-glass">
            <button
              onClick={() => setActiveTab('settings')}
              className={`
                w-full flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition-all duration-300
                max-[1100px]:justify-center
                ${activeTab === 'settings'
                  ? 'bg-primary/20 border-primary shadow-sm'
                  : 'bg-white/5 border-border-glass hover:bg-white/10'}
              `}
              title="Account Settings"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold shrink-0 relative">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-bg-sidebar border-2 border-bg-sidebar flex items-center justify-center">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </div>
              </div>
              <div className="flex flex-col overflow-hidden max-[1100px]:hidden">
                <span className="text-[0.9rem] font-bold text-text-main whitespace-nowrap truncate text-left">{user?.username || 'User'}</span>
                <span className="text-[0.7rem] text-text-dim text-left">Account Settings</span>
              </div>
            </button>

            <button
              onClick={() => setIsHelpOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 mt-2 rounded-xl text-text-dim hover:text-text-main hover:bg-white/5 transition-all duration-200 cursor-pointer max-[1100px]:justify-center"
              title="Help & FAQs"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary/80">
                <circle cx="12" cy="12" r="10"/><path d="9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span className="max-[1100px]:hidden whitespace-nowrap text-[0.82rem] font-medium">Help & FAQs</span>
            </button>

            <button
              onClick={() => setIsTermsOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-text-dim hover:text-text-main hover:bg-white/5 transition-all duration-200 cursor-pointer max-[1100px]:justify-center"
              title="Terms & Studio Policies"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary/80">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="max-[1100px]:hidden whitespace-nowrap text-[0.82rem] font-medium">Terms & Policies</span>
            </button>

            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-danger hover:bg-danger/10 transition-all duration-200 cursor-pointer max-[1100px]:justify-center"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              <span className="max-[1100px]:hidden whitespace-nowrap text-[0.9rem] font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      <TermsAndPoliciesModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />

      <CustomerHelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </>
  );
}
