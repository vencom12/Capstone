'use client';

import { useState, useEffect } from 'react';
import { useProductStore } from '@/stores/useProductStore';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import Link from 'next/link';

interface StorefrontHeaderProps {
  onMenuToggle?: () => void;
}

export default function StorefrontHeader({ onMenuToggle }: StorefrontHeaderProps) {
  const { searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, getCategories } = useProductStore();
  const basketCount = useBasketStore((s) => s.getCount());
  const { isAuthenticated, user, logout } = useAuthStore();
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const categories = getCategories();

  useEffect(() => {
    setMounted(true);
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
    <header className="sticky top-0 w-full shrink-0 h-[var(--header-height)] z-[2000] flex items-center justify-between px-10 bg-bg-header backdrop-blur-[15px] border-b border-r border-border-glass transition-all duration-300 rounded-tr-[20px] rounded-br-[20px] rounded-tl-none rounded-bl-none mt-0 ml-0
      max-[1250px]:grid max-[1250px]:grid-cols-2 max-[1250px]:h-auto max-[1250px]:px-4 max-[1250px]:py-4 max-[1250px]:gap-y-4">
      
      {/* Brand & Hamburger Area - Stays Top Left */}
      <div className="flex items-center gap-3 max-[1250px]:justify-start">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="bg-gradient-to-br from-primary to-secondary w-8 h-8 rounded-lg flex items-center justify-center text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </div>
          <h1 className="font-extrabold text-xl bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent tracking-tight m-0 max-[400px]:hidden">
            Stitch-Opt
          </h1>
        </Link>
      </div>

      {/* Middle: Search Bar (Desktop) / Second Row (Tablet) */}
      <div className="flex-1 max-w-[500px] mx-10 relative flex items-center gap-2 
        max-[1250px]:col-span-2 max-[1250px]:max-w-none max-[1250px]:mx-0 max-[1250px]:order-3">
        
        {/* Animated Custom Category Dropdown (Visible on Mobile only) */}
        <div className="hidden max-[650px]:block shrink-0 relative category-dropdown-container">
          <button 
            suppressHydrationWarning
            onClick={() => setIsCategoryOpen(!isCategoryOpen)}
            className="flex items-center gap-2 bg-bg-surface border border-border-glass text-text-main px-4 py-3 rounded-xl text-sm font-bold outline-none cursor-pointer hover:bg-white/5 transition-all whitespace-nowrap"
          >
            {selectedCategory === 'All' ? 'All Designs' : selectedCategory}
            <svg 
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform duration-300 ${isCategoryOpen ? 'rotate-180' : ''}`}
            >
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>

          {/* Animated Options Menu */}
          <div className={`
            absolute top-[calc(100%+8px)] left-0 w-[180px] bg-bg-dark/95 backdrop-blur-xl border border-border-glass rounded-2xl overflow-hidden z-[3000] shadow-[0_20px_40px_rgba(0,0,0,0.4)]
            transition-all duration-300 origin-top-left
            ${isCategoryOpen ? 'opacity-100 scale-100 translate-y-0 visible' : 'opacity-0 scale-95 -translate-y-2 invisible'}
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
                  w-full text-left px-4 py-3 text-sm font-medium transition-all hover:bg-white/10
                  ${selectedCategory === c ? 'text-primary bg-primary/10' : 'text-text-dim'}
                `}
              >
                {c === 'All' ? 'All Designs' : c}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative flex-1">
          <input
            suppressHydrationWarning
            type="text"
            placeholder="Search designs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-surface border border-border-glass px-5 py-3 pr-10 rounded-xl text-text-main outline-none text-[0.95rem] transition-all focus:border-primary"
          />
          <svg className="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {/* Right: Actions (Theme, Auth, Basket) */}
      <div className="flex items-center gap-3 justify-end max-[1250px]:order-2">
        <button
          suppressHydrationWarning
          onClick={() => {
            const html = document.documentElement;
            const current = html.getAttribute('data-theme');
            html.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
          }}
          className="p-2 rounded-xl text-text-dim hover:bg-white/5 transition-all cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
        </button>

        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <Link href={user?.role === 'admin' ? '/admin' : user?.role === 'employee' ? '/employee' : '/dashboard'} className="p-1 rounded-full border border-primary/30">
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-xs">
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            </Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <button 
              suppressHydrationWarning
              onClick={() => useUIStore.getState().setAuthOpen(true, 'login')}
              className="px-4 py-2 rounded-xl text-text-dim font-bold text-xs hover:bg-white/5 no-underline whitespace-nowrap bg-transparent border-none cursor-pointer"
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

        <div className="relative cursor-pointer hover:opacity-80 shrink-0" onClick={() => useUIStore.getState().setBasketOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-main"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
          {mounted && basketCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-primary text-white text-[0.6rem] w-4 h-4 rounded-full flex items-center justify-center font-bold">{basketCount}</span>}
        </div>
      </div>
    </header>
  );
}
