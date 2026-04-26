'use client';
import Link from 'next/link';
import type { User } from '@/types';

interface HeaderProps {
  user?: User | null;
  title?: string;
  basketCount?: number;
  onBasketOpen?: () => void;
}

export default function Header({ user, title, basketCount = 0, onBasketOpen }: HeaderProps) {
  return (
    <header className="glass-card px-6 py-4 flex items-center justify-between mb-0 rounded-b-none border-b border-white/5">
      {/* Left: Title or logo */}
      <div className="flex items-center gap-3">
        <Link href="/" className="text-xl font-bold gradient-text tracking-tight">
          StitchOpt
        </Link>
        {title && (
          <>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300 font-medium">{title}</span>
          </>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Basket button (for storefront) */}
        {onBasketOpen && (
          <button
            id="basket-toggle-btn"
            onClick={onBasketOpen}
            className="relative p-2.5 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:border-indigo-500 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-9H5.4M7 13L5.4 5M7 13l-2.3 2.3A1 1 0 006 17h12M17 17a2 2 0 100 4 2 2 0 000-4zM9 17a2 2 0 100 4 2 2 0 000-4z"/>
            </svg>
            {basketCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center">
                {basketCount > 9 ? '9+' : basketCount}
              </span>
            )}
          </button>
        )}

        {user ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300">
              {user.username?.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-slate-300 hidden sm:block">{user.username}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost py-2 px-4 text-sm">Login</Link>
            <Link href="/register" className="btn-primary py-2 px-4 text-sm">Sign Up</Link>
          </div>
        )}
      </div>
    </header>
  );
}
