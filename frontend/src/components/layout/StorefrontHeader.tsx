'use client';

import { useState, useEffect } from 'react';
import { useProductStore } from '@/stores/useProductStore';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { toggleTheme } from '@/lib/theme';

interface StorefrontHeaderProps {
  onMenuToggle?: () => void;
}

export default function StorefrontHeader({ onMenuToggle }: StorefrontHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, getCategories } = useProductStore();
  const basketCount = useBasketStore((s) => s.getCount());
  const { isAuthenticated, user, logout } = useAuthStore();
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileUserMenuOpen, setIsMobileUserMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');
  const categories = getCategories();

  const handleBasketClick = () => {
    if (pathname === '/') {
      useUIStore.getState().toggleBasket();
    } else {
      router.push('/dashboard?tab=basket');
    }
  };

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
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
    setMounted(true);
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res && res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
      }).catch(() => {});
    });
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isCategoryOpen && !target.closest('.category-dropdown-container')) {
        setIsCategoryOpen(false);
      }
      if (isUserMenuOpen && !target.closest('.user-menu-container')) {
        setIsUserMenuOpen(false);
      }
      if (isMobileUserMenuOpen && !target.closest('.mobile-user-menu-container')) {
        setIsMobileUserMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isCategoryOpen, isUserMenuOpen, isMobileUserMenuOpen]);

  return (
    <header className="fixed top-0 inset-x-0 w-full shrink-0 z-[2000] bg-bg-header/95 backdrop-blur-[16px] border-b border-border-glass transition-all duration-300">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5 lg:py-0 lg:h-[var(--header-height)] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 lg:gap-6">
        {/* Row 1 on Mobile, or Left Brand area on Desktop */}
        <div className="flex items-center justify-between w-full lg:w-auto lg:min-w-[220px] min-w-0">
          {/* Brand Logo & Title Area */}
          <Link href="/" onClick={handleLogoClick} className="flex items-center gap-2.5 min-w-0 no-underline cursor-pointer group">
            {businessLogoUrl ? (
              <img src={businessLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/10 shrink-0" />
            ) : (
              <div className="bg-primary w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
            )}
            <h1 className="font-black text-lg sm:text-xl text-text-main tracking-tight m-0 truncate">
              Stitch-Opt
            </h1>
          </Link>

          {/* Right Actions on Mobile: Theme, Auth, Basket (Embedded directly into Row 1) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 lg:hidden">
            <button
              suppressHydrationWarning
              onClick={() => toggleTheme()}
              className="w-9 h-9 rounded-lg text-text-dim hover:text-text-main hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0 border-none bg-transparent"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            </button>

            {isAuthenticated ? (
              <div className="relative mobile-user-menu-container">
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setIsMobileUserMenuOpen(!isMobileUserMenuOpen)}
                  className="p-0.5 rounded-full border border-primary/30 shrink-0 bg-transparent cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                  aria-label="User account"
                >
                  <span className="w-8 h-8 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-xs">
                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </button>

                {/* Mobile Account Dropdown Menu */}
                <div className={`
                  absolute top-[calc(100%+8px)] right-0 w-[220px] bg-bg-card/95 backdrop-blur-2xl border border-border-glass rounded-2xl p-2 z-[3000] shadow-2xl origin-top-right transition-all duration-200
                  ${isMobileUserMenuOpen ? 'opacity-100 scale-100 translate-y-0 visible' : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'}
                `}>
                  <Link
                    href={user?.role === 'admin' ? '/admin?tab=settings' : '/dashboard?tab=settings'}
                    onClick={() => setIsMobileUserMenuOpen(false)}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass/40 hover:border-primary/40 mb-1.5 flex items-center justify-between gap-2 no-underline transition-all cursor-pointer group/user block"
                    title="Account Settings"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-text-main truncate group-hover/user:text-primary transition-colors">
                        {user?.username}
                      </div>
                      <div className="text-[0.7rem] text-text-dim truncate mt-0.5">{user?.email}</div>
                      {user?.role && user.role !== 'customer' && (
                        <span className="inline-block mt-1 text-[0.62rem] px-2 py-0.5 rounded-md bg-primary/20 text-primary font-bold uppercase tracking-wider">
                          {user.role}
                        </span>
                      )}
                    </div>
                    <div className="text-text-dim group-hover/user:text-primary transition-all pr-0.5 flex items-center gap-1 shrink-0">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover/user:rotate-45 transition-transform duration-300">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover/user:translate-x-0.5">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </Link>

                  {user?.role === 'admin' ? (
                    <Link
                      href="/admin"
                      onClick={() => setIsMobileUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                    >
                      Admin Panel →
                    </Link>
                  ) : user?.role === 'employee' ? (
                    <Link
                      href="/employee"
                      onClick={() => setIsMobileUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                    >
                      Staff Dashboard →
                    </Link>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href="/dashboard?tab=tracking"
                        onClick={() => setIsMobileUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /></svg>
                        My Orders
                      </Link>

                      <Link
                        href="/dashboard?tab=favs"
                        onClick={() => setIsMobileUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                        Saved Favorites
                      </Link>
                    </div>
                  )}

                  <div className="h-[1px] bg-border-glass my-1.5" />

                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => {
                      setIsMobileUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 border-none bg-transparent cursor-pointer transition-all"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Log Out
                  </button>
                </div>
              </div>
            ) : (
              <button
                suppressHydrationWarning
                onClick={() => useUIStore.getState().setAuthOpen(true, 'login', 'customer')}
                className="px-3 py-1.5 rounded-lg bg-primary text-white font-bold text-xs active:scale-95 transition-all border-none cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
              >
                Sign In
              </button>
            )}

            <button
              suppressHydrationWarning
              onClick={handleBasketClick}
              className="w-9 h-9 rounded-lg bg-transparent border-none text-text-main hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center relative shrink-0"
              title="View My Basket"
              aria-label="View My Basket"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
              {mounted && basketCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-[0.6rem] w-4 h-4 rounded-full flex items-center justify-center font-bold shadow-sm">
                  {basketCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Middle: Unified Search Capsule with Integrated Category Selector */}
        <div className="w-full lg:flex-1 lg:max-w-[560px] lg:mx-auto relative">
          <div className="w-full relative flex items-center bg-bg-surface border border-border-glass rounded-xl shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-all">
            {/* Integrated Category Dropdown Trigger */}
            <div className="shrink-0 relative category-dropdown-container">
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                className="flex items-center gap-1.5 sm:gap-2 bg-transparent hover:bg-white/5 text-text-main px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-l-xl text-xs sm:text-[0.82rem] font-bold outline-none cursor-pointer active:scale-95 transition-all whitespace-nowrap border-none border-r border-border-glass/60"
                aria-label="Filter by category"
              >
                <span className="max-w-[90px] sm:max-w-none truncate">
                  {selectedCategory === 'All' ? 'All Products' : selectedCategory}
                </span>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={`transition-transform duration-200 text-text-dim ${isCategoryOpen ? 'rotate-180 text-primary' : ''}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {/* Category Dropdown Options */}
              <div
                className={`
                  absolute top-[calc(100%+8px)] left-0 w-[190px] bg-bg-card/95 backdrop-blur-[25px] border border-border-glass rounded-xl p-1.5 z-[3000] shadow-2xl max-h-[260px] overflow-y-auto
                  transition-all duration-200 origin-top-left
                  ${isCategoryOpen ? 'opacity-100 scale-100 translate-y-0 visible' : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'}
                `}
              >
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    suppressHydrationWarning
                    onClick={() => {
                      setSelectedCategory(c);
                      setIsCategoryOpen(false);
                    }}
                    className={`
                      w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer border-none flex items-center justify-between truncate
                      ${selectedCategory === c
                        ? 'bg-primary text-white font-bold shadow-sm'
                        : 'bg-transparent text-text-main hover:bg-primary/10 hover:text-primary font-medium'
                      }
                    `}
                  >
                    <span className="truncate">{c === 'All' ? 'All Products' : c}</span>
                    {selectedCategory === c && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 ml-1">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Integrated Search Input Field */}
            <div className="relative flex-1 min-w-0 flex items-center">
              <input
                suppressHydrationWarning
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none px-3.5 py-2 sm:py-2.5 text-xs sm:text-[0.90rem] text-text-main placeholder:text-text-dim/70 outline-none flex-1 min-w-0 rounded-r-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setSearchQuery('')}
                  className="p-1 mr-1 text-text-dim hover:text-text-main rounded-md hover:bg-white/10 cursor-pointer border-none bg-transparent"
                  title="Clear search"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
              <div className="pr-3.5 text-text-dim pointer-events-none flex items-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Actions (Story Link, Theme, Auth, Basket) - visible only on lg:flex */}
        <div className="hidden lg:flex items-center gap-2.5 justify-end shrink-0 lg:min-w-[220px]">
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-xs font-bold text-text-dim hover:text-text-main px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent"
          >
            Atelier Story
          </button>

          <div className="h-4 w-[1px] bg-border-glass/60 shrink-0 mx-0.5" />

          <button
            type="button"
            suppressHydrationWarning
            onClick={() => toggleTheme()}
            className="w-9 h-9 rounded-xl text-text-dim hover:text-text-main hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center border-none bg-transparent shrink-0"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
          </button>

          {isAuthenticated ? (
            <div className="relative user-menu-container">
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-border-glass hover:bg-white/10 text-text-main transition-all cursor-pointer group"
                aria-label="User account menu"
              >
                <span className="w-7 h-7 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-xs">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
                <span className="text-xs font-bold max-w-[120px] truncate">{user?.username}</span>
                <svg
                  width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`transition-transform duration-200 text-text-dim group-hover:text-text-main ${isUserMenuOpen ? 'rotate-180' : ''}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {/* Account Dropdown Menu */}
              <div className={`
                absolute top-[calc(100%+8px)] right-0 w-[240px] bg-bg-card/95 backdrop-blur-2xl border border-border-glass rounded-2xl p-2 z-[3000] shadow-2xl origin-top-right transition-all duration-200
                ${isUserMenuOpen ? 'opacity-100 scale-100 translate-y-0 visible' : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'}
              `}>
                <Link
                  href={user?.role === 'admin' ? '/admin?tab=settings' : '/dashboard?tab=settings'}
                  onClick={() => setIsUserMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass/40 hover:border-primary/40 mb-1.5 flex items-center justify-between gap-2 no-underline transition-all cursor-pointer group/user block"
                  title="Account Settings"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs text-text-main truncate group-hover/user:text-primary transition-colors">
                      {user?.username}
                    </div>
                    <div className="text-[0.7rem] text-text-dim truncate mt-0.5">{user?.email}</div>
                    {user?.role && user.role !== 'customer' && (
                      <span className="inline-block mt-1 text-[0.62rem] px-2 py-0.5 rounded-md bg-primary/20 text-primary font-bold uppercase tracking-wider">
                        {user.role}
                      </span>
                    )}
                  </div>
                  <div className="text-text-dim group-hover/user:text-primary transition-all pr-0.5 flex items-center gap-1 shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover/user:rotate-45 transition-transform duration-300">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover/user:translate-x-0.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>

                {user?.role === 'admin' ? (
                  <Link
                    href="/admin"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                  >
                    Admin Panel →
                  </Link>
                ) : user?.role === 'employee' ? (
                  <Link
                    href="/employee"
                    onClick={() => setIsUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                  >
                    Staff Dashboard →
                  </Link>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href="/dashboard?tab=tracking"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /></svg>
                      My Orders
                    </Link>

                    <Link
                      href="/dashboard?tab=favs"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                      Saved Favorites
                    </Link>
                  </div>
                )}

                <div className="h-[1px] bg-border-glass my-1.5" />

                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 border-none bg-transparent cursor-pointer transition-all"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Log Out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                suppressHydrationWarning
                onClick={() => useUIStore.getState().setAuthOpen(true, 'login', 'customer')}
                className="px-4 py-2 rounded-lg text-text-dim hover:text-text-main font-bold text-xs hover:bg-bg-surface no-underline whitespace-nowrap bg-transparent border border-border-glass cursor-pointer transition-all active:scale-95"
              >
                Login
              </button>
              <button
                suppressHydrationWarning
                onClick={() => useUIStore.getState().setAuthOpen(true, 'register')}
                className="px-4 py-2 rounded-lg bg-primary text-white font-bold text-xs no-underline whitespace-nowrap border-none cursor-pointer hover:opacity-90 transition-opacity shadow-sm active:scale-95"
              >
                Sign Up
              </button>
            </div>
          )}

          <button
            suppressHydrationWarning
            onClick={handleBasketClick}
            className="w-10 h-10 rounded-lg text-text-main hover:bg-white/5 active:scale-95 transition-all cursor-pointer relative shrink-0 bg-transparent border-none flex items-center justify-center"
            title="View My Basket"
            aria-label="View My Basket"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
            {mounted && basketCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-white text-[0.6rem] w-4 h-4 rounded-full flex items-center justify-center font-bold shadow-sm">
                {basketCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
