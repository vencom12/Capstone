'use client';

import { useState, useEffect } from 'react';
import { useProductStore } from '@/stores/useProductStore';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface StorefrontHeaderProps {
  onMenuToggle?: () => void;
}

export default function StorefrontHeader({ onMenuToggle }: StorefrontHeaderProps) {
  const router = useRouter();
  const { searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, getCategories } = useProductStore();
  const basketCount = useBasketStore((s) => s.getCount());
  const { isAuthenticated, user, logout } = useAuthStore();
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');
  const categories = getCategories();

  useEffect(() => {
    setMounted(true);
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res && res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
      }).catch(() => {});
    });
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (isCategoryOpen && !(e.target as HTMLElement).closest('.category-dropdown-container')) {
        setIsCategoryOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isCategoryOpen]);

  return (
    <header className="sticky top-0 w-full shrink-0 z-[2000] bg-bg-header/95 backdrop-blur-[16px] border-b border-border-glass transition-all duration-300">
      <div className="max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 lg:py-0 lg:h-[var(--header-height)] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 lg:gap-6">
        {/* Row 1 on Mobile, or Left Brand area on Desktop */}
        <div className="flex items-center justify-between w-full lg:w-auto min-w-0">
          {/* Brand & Hamburger Area */}
          <div className="flex items-center gap-2.5 min-w-0 shrink">
            <button
              suppressHydrationWarning
              onClick={() => useUIStore.getState().toggleSidebar()}
              className="w-9 h-9 rounded-xl bg-white/5 border border-border-glass text-text-main hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex lg:hidden items-center justify-center shrink-0"
              aria-label="Toggle navigation menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <Link href="/" className="flex items-center gap-2.5 min-w-0 no-underline cursor-pointer group">
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
          </div>

          {/* Right Actions on Mobile: Theme, Auth, Basket (Embedded directly into Row 1) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 lg:hidden">
            <button
              suppressHydrationWarning
              onClick={() => {
                const html = document.documentElement;
                const current = html.getAttribute('data-theme');
                html.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
              }}
              className="w-9 h-9 rounded-xl text-text-dim hover:text-text-main hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0 border-none bg-transparent"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            </button>

            {isAuthenticated ? (
              <Link href={user?.role === 'admin' ? '/admin' : user?.role === 'employee' ? '/employee' : '/dashboard'} className="p-0.5 rounded-full border border-primary/30 shrink-0">
                <span className="w-8 h-8 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-xs">
                  {user?.username?.charAt(0).toUpperCase()}
                </span>
              </Link>
            ) : (
              <button
                suppressHydrationWarning
                onClick={() => useUIStore.getState().setAuthOpen(true, 'login', 'customer')}
                className="px-3 py-1.5 rounded-xl bg-primary text-white font-bold text-xs active:scale-95 transition-all border-none cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
              >
                Sign In
              </button>
            )}

            <button
              suppressHydrationWarning
              onClick={() => router.push('/dashboard?tab=basket')}
              className="w-9 h-9 rounded-xl bg-transparent border-none text-text-main hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center relative shrink-0"
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

        {/* Middle: Search Bar & Category Dropdown */}
        <div className="w-full lg:flex-1 lg:max-w-[520px] relative flex items-center gap-2">
          {/* Animated Custom Category Dropdown */}
          <div className="shrink-0 relative category-dropdown-container">
            <button
              suppressHydrationWarning
              onClick={() => setIsCategoryOpen(!isCategoryOpen)}
              className="flex items-center gap-1.5 sm:gap-2 bg-bg-surface border border-border-glass text-text-main px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold outline-none cursor-pointer hover:bg-white/5 active:scale-95 transition-all whitespace-nowrap"
            >
              <span className="max-w-[85px] sm:max-w-none truncate">
                {selectedCategory === 'All' ? 'All Designs' : selectedCategory}
              </span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`transition-transform duration-300 ${isCategoryOpen ? 'rotate-180' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* Dropdown Options */}
            <div className={`
              absolute top-[calc(100%+8px)] left-0 w-[190px] bg-bg-card/95 backdrop-blur-[25px] border border-border-glass rounded-2xl p-1.5 z-[3000] shadow-xl max-h-[260px] overflow-y-auto
              transition-all duration-300 origin-top-left
              ${isCategoryOpen ? 'opacity-100 scale-100 translate-y-0 visible' : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'}
            `}>
              {categories.map(c => (
                <button
                  key={c}
                  suppressHydrationWarning
                  onClick={() => {
                    setSelectedCategory(c);
                    setIsCategoryOpen(false);
                  }}
                  className={`
                    w-full text-left px-3 py-2 text-xs font-medium rounded-xl transition-all hover:bg-white/10 cursor-pointer border-none bg-transparent block truncate
                    ${selectedCategory === c ? 'text-white bg-primary font-bold shadow-sm' : 'text-text-main hover:text-white'}
                  `}
                >
                  {c === 'All' ? 'All Designs' : c}
                </button>
              ))}
            </div>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <input
              suppressHydrationWarning
              type="text"
              placeholder="Search designs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-surface border border-border-glass px-4 py-2 sm:py-2.5 pr-9 rounded-xl text-text-main outline-none text-xs sm:text-[0.92rem] transition-all focus:border-primary"
            />
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        </div>

        {/* Desktop Actions (Theme, Auth, Basket) - visible only on lg:flex */}
        <div className="hidden lg:flex items-center gap-3 justify-end shrink-0">
          <button
            suppressHydrationWarning
            onClick={() => {
              const html = document.documentElement;
              const current = html.getAttribute('data-theme');
              html.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
            }}
            className="p-2 rounded-xl text-text-dim hover:text-text-main hover:bg-white/5 transition-all cursor-pointer border-none bg-transparent"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
          </button>

          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link href={user?.role === 'admin' ? '/admin' : user?.role === 'employee' ? '/employee' : '/dashboard'} className="p-1 rounded-full border border-primary/30">
                <span className="w-8 h-8 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-xs">
                  {user?.username?.charAt(0).toUpperCase()}
                </span>
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                suppressHydrationWarning
                onClick={() => useUIStore.getState().setAuthOpen(true, 'login', 'customer')}
                className="px-4 py-2 rounded-xl text-text-dim hover:text-text-main font-bold text-xs hover:bg-bg-surface no-underline whitespace-nowrap bg-transparent border border-border-glass cursor-pointer transition-all"
              >
                Login
              </button>
              <button
                suppressHydrationWarning
                onClick={() => useUIStore.getState().setAuthOpen(true, 'register')}
                className="px-4 py-2 rounded-xl bg-primary text-white font-bold text-xs no-underline whitespace-nowrap border-none cursor-pointer hover:opacity-90 transition-opacity"
              >
                Sign Up
              </button>
            </div>
          )}

          <button
            suppressHydrationWarning
            onClick={() => router.push('/dashboard?tab=basket')}
            className="p-2 rounded-xl text-text-main hover:bg-white/5 transition-all cursor-pointer relative shrink-0 bg-transparent border-none"
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
