'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBasketStore } from '@/stores/useBasketStore';
import { useUIStore } from '@/stores/useUIStore';
import Link from 'next/link';

interface DashboardSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onMobileToggle?: () => void;
}

export default function DashboardSidebar({ activeTab, setActiveTab, onMobileToggle }: DashboardSidebarProps) {
  const { user, logout } = useAuthStore();
  const { toggleBasket, isBasketOpen, isSidebarOpen, setSidebarOpen } = useUIStore();
  const basketCount = useBasketStore((s) => s.getCount());
  const [mounted, setMounted] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');

  useEffect(() => {
    setMounted(true);
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res && res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
      }).catch(() => {});
    });
  }, []);

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
    if (isLeftSwipe && window.innerWidth <= 650) {
      setSidebarOpen(false);
    }
  };

  const navItems = [
    {
      id: 'shop', label: 'Shop Designs', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /><path d="M2 7h20" /><path d="M22 7l-3 5H5l-3-5" /></svg>
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
          className="fixed inset-0 bg-black/60 z-[1999] hidden max-[650px]:block backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`
        h-full bg-bg-sidebar backdrop-blur-[12px] border-r border-border-glass flex flex-col transition-all duration-300 shrink-0 z-[2000]
        w-[260px] max-[1100px]:w-[80px] max-[650px]:w-[280px]
        max-[650px]:fixed max-[650px]:left-0 max-[650px]:top-0
        ${isSidebarOpen ? 'max-[650px]:translate-x-0' : 'max-[650px]:-translate-x-full'}
      `}>
        {/* Header / Logo */}
        <div className="p-4 pt-5 pb-2">
          <Link href="/" className="flex items-center gap-2.5 no-underline cursor-pointer max-[1100px]:justify-center max-[650px]:justify-start">
            {businessLogoUrl ? (
              <img src={businessLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/10 shrink-0" />
            ) : (
              <div className="bg-gradient-to-br from-primary to-secondary w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
            )}
            <span className="font-extrabold text-[1.1rem] bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent tracking-tight max-[1100px]:hidden max-[650px]:inline">
              Stitch-Opt
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <ul className="list-none p-0 m-0 mt-4 flex flex-col px-3 gap-1">
          {/* Basket Toggle */}
          <li className="mb-2">
            <button
              onClick={toggleBasket}
              className={`
              w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer
              transition-all duration-300 border font-bold text-[0.95rem]
              max-[1100px]:justify-center max-[1100px]:px-0 max-[650px]:justify-start max-[650px]:px-3
              ${isBasketOpen
                  ? 'bg-primary/20 text-white border-primary shadow-[0_4px_15px_rgba(99,102,241,0.3)]'
                  : 'bg-white/5 text-text-main border-border-glass hover:bg-white/10'}
            `}
            >
              <div className="shrink-0 relative">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
                {mounted && basketCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-primary text-[0.6rem] text-white w-4 h-4 rounded-full flex items-center justify-center border border-bg-sidebar">
                    {basketCount}
                  </span>
                )}
              </div>
              <span className="max-[1100px]:hidden max-[650px]:inline whitespace-nowrap">My Basket</span>
            </button>
          </li>

          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => {
                  setActiveTab(item.id);
                  if (window.innerWidth <= 650) setSidebarOpen(false);
                }}
                className={`
                w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer
                transition-all duration-300 border font-medium text-[0.95rem]
                max-[1100px]:justify-center max-[1100px]:px-0 max-[650px]:justify-start max-[650px]:px-3
                ${activeTab === item.id
                    ? 'bg-gradient-to-r from-primary to-secondary text-white border-transparent shadow-[0_4px_15px_rgba(99,102,241,0.3)]'
                    : 'bg-transparent text-text-dim border-transparent hover:bg-white/5 hover:text-text-main'}
              `}
              >
                <div className="shrink-0">{item.icon}</div>
                <span className="max-[1100px]:hidden max-[650px]:inline whitespace-nowrap">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* User Profile */}
        <div className="mt-auto p-3 pb-10 border-t border-border-glass">
          <button
            onClick={() => {
              setActiveTab('settings');
              if (window.innerWidth <= 650) setSidebarOpen(false);
            }}
            className={`
              w-full flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition-all duration-300
              max-[1100px]:justify-center max-[650px]:justify-start
              ${activeTab === 'settings'
                ? 'bg-primary/20 border-primary shadow-[0_4px_15px_rgba(99,102,241,0.3)]'
                : 'bg-white/5 border-border-glass hover:bg-white/10'}
            `}
            title="Account Settings"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold shrink-0 relative">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-bg-sidebar border-2 border-bg-sidebar flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </div>
            </div>
            <div className="flex flex-col overflow-hidden max-[1100px]:hidden max-[650px]:flex">
              <span className="text-[0.9rem] font-bold text-text-main whitespace-nowrap truncate text-left">{user?.username || 'User'}</span>
              <span className="text-[0.7rem] text-text-dim text-left">Account Settings</span>
            </div>
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 mt-2 rounded-xl text-danger hover:bg-danger/10 transition-all duration-200 cursor-pointer max-[1100px]:justify-center max-[650px]:justify-start"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            <span className="max-[1100px]:hidden max-[650px]:inline whitespace-nowrap text-[0.9rem] font-medium">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
