'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useProductStore } from '@/stores/useProductStore';
import { useUIStore } from '@/stores/useUIStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { SidebarCategoriesSkeleton } from '@/components/ui/Skeletons';

export default function Sidebar() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const { selectedCategory, setSelectedCategory, getCategories, isSyncing } = useProductStore();
  const { toggleBasket, isBasketOpen, isSidebarOpen, setSidebarOpen } = useUIStore();
  const categories = getCategories();

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setSidebarOpen(false);
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
      window.scrollTo(0, 0);
      if (window.location.pathname === '/' && !window.location.search && !window.location.hash) {
        window.location.reload();
      } else {
        window.location.href = '/';
      }
    }
  };

  useEffect(() => {
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
    if (isLeftSwipe && window.innerWidth <= 1024) {
      setSidebarOpen(false);
    }
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    if (window.innerWidth <= 1024) {
      setSidebarOpen(false);
    }
  };

  const handleBasketClick = () => {
    toggleBasket();
    if (window.innerWidth <= 1024) {
      setSidebarOpen(false);
    }
  };

  return (
    <>
      {/* Mobile & Tablet Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1999] hidden max-[1024px]:block backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile-Only Navigation Drawer (Desktop uses horizontal category bar above grid) */}
      <aside
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`
          hidden max-[1024px]:flex fixed inset-y-0 left-0 w-[280px] p-4 bg-bg-sidebar/95 backdrop-blur-[20px] border-r border-border-glass shadow-2xl z-[2000] flex-col overflow-y-auto transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Mobile / Tablet Header Inside Sidebar */}
        <div className="hidden max-[1024px]:flex items-center justify-between pb-4 border-b border-border-glass mb-4 shrink-0">
          <Link href="/" onClick={handleLogoClick} className="flex items-center gap-2.5 no-underline cursor-pointer">
            {businessLogoUrl ? (
              <img src={businessLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/10 shrink-0" />
            ) : (
              <div className="bg-primary w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 font-bold shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
            )}
            <span className="font-black text-[1.1rem] text-text-main tracking-tight">
              Stitch-Opt
            </span>
          </Link>
          <button
            suppressHydrationWarning
            onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 rounded-full bg-white/5 border border-border-glass text-text-dim hover:text-text-main hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all"
            aria-label="Close navigation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Basket Toggle Section */}
        <div className="mb-5 px-1">
          <button
            suppressHydrationWarning
            onClick={handleBasketClick}
            className={`
              w-full flex items-center justify-between px-3.5 py-3 rounded-xl cursor-pointer
              transition-all duration-300 text-[0.88rem] font-bold border
              ${isBasketOpen
                ? 'bg-primary border-primary text-white shadow-sm'
                : 'bg-white/5 border-border-glass text-text-main hover:bg-white/10'
              }
            `}
          >
            <div className="flex items-center gap-2.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
              <span>My Basket</span>
            </div>
            {isBasketOpen && <div className="w-2 h-2 bg-primary rounded-full" />}
          </button>
        </div>

        {/* Hero Content */}
        <div className="mb-5 px-1">
          <h2 className="text-lg font-extrabold mb-1.5 leading-tight tracking-tight">
            Intelligence in Every Stitch.
          </h2>
          <p className="text-text-dim text-[0.78rem] leading-relaxed opacity-80 m-0">
            Explore our curated collection of professional embroidery products optimized for high-speed production.
          </p>
        </div>

        {/* Categories */}
        <div className="flex-1">
          <h3 className="text-[0.8rem] text-text-dim uppercase tracking-wider mb-3 px-2 font-medium">
            Categories
          </h3>
          {isSyncing && categories.length === 0 ? (
            <SidebarCategoriesSkeleton />
          ) : (
            <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
              {categories.map((category) => (
                <li key={category}>
                  <button
                    suppressHydrationWarning
                    onClick={() => handleCategorySelect(category)}
                    className={`
                      w-full flex items-center px-3.5 py-2.5 rounded-xl cursor-pointer
                      transition-all duration-300 text-left text-[0.85rem] border
                      ${selectedCategory === category
                        ? 'bg-primary border-primary/40 text-white font-semibold shadow-sm'
                        : 'bg-bg-surface border-border-glass text-text-dim hover:bg-white/[0.08] hover:border-white/20 hover:translate-x-1 hover:text-text-main'
                      }
                    `}
                  >
                    {category === 'All' ? 'All Products' : category}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* User Account / Navigation Area */}
        <div className="mt-4 pt-4 border-t border-border-glass shrink-0">
          {isAuthenticated ? (
            <div className="flex flex-col gap-2">
              <div className="p-3 rounded-xl bg-white/5 border border-border-glass flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-xs shrink-0">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-text-main truncate">{user?.username}</div>
                  <div className="text-[0.7rem] text-text-dim truncate">{user?.email}</div>
                </div>
              </div>

              {user?.role === 'admin' ? (
                <Link
                  href="/admin"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                >
                  Admin Panel →
                </Link>
              ) : user?.role === 'employee' ? (
                <Link
                  href="/employee"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                >
                  Staff Dashboard →
                </Link>
              ) : (
                <div className="flex flex-col gap-1">
                  <Link
                    href="/dashboard?tab=tracking"
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /></svg>
                    My Orders
                  </Link>

                  <Link
                    href="/dashboard?tab=settings"
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                    Account Settings
                  </Link>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setSidebarOpen(false);
                  logout();
                }}
                className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-danger border border-danger/25 hover:bg-danger/10 bg-transparent cursor-pointer transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Log Out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setSidebarOpen(false);
                  useUIStore.getState().setAuthOpen(true, 'login', 'customer');
                }}
                className="w-full py-2.5 rounded-xl bg-primary text-white font-bold text-xs border-none cursor-pointer hover:bg-primary/90 transition-all shadow-sm"
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setSidebarOpen(false);
                  useUIStore.getState().setAuthOpen(true, 'register');
                }}
                className="w-full py-2 rounded-xl bg-white/5 border border-border-glass text-text-main font-bold text-xs cursor-pointer hover:bg-white/10 transition-all"
              >
                Create Account
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

