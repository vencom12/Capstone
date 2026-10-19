'use client';

import { useState, useEffect, useRef } from 'react';
import { useProductStore } from '@/stores/useProductStore';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import type { Product } from '@/lib/types';
import { isConversationalQuestion } from '@/lib/searchUtils';
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
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');
  const categories = getCategories();

  // Spotlight Inline AI State
  const [isSearchAiOpen, setIsSearchAiOpen] = useState(false);
  const [isSearchAiLoading, setIsSearchAiLoading] = useState(false);
  const [searchAiResult, setSearchAiResult] = useState<{
    query: string;
    reply: string;
    suggestedProducts: Product[];
  } | null>(null);

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

  const fetchSearchAi = async (queryToAsk: string) => {
    const q = queryToAsk.trim();
    if (!q) return;

    setIsSearchFocused(false);
    setIsSearchAiOpen(true);
    setIsSearchAiLoading(true);

    try {
      const data = await api.post<{ success: boolean; reply: string; suggestedProducts: Product[] }>(
        '/api/ai/storefront-chat',
        {
          message: q,
          history: [],
          context: { selectedCategory, searchQuery: q }
        }
      );

      const rawReply = (data?.reply || '').replace(/\[PRODUCTS?:.*?(\]|$)/gi, '').trim();
      setSearchAiResult({
        query: q,
        reply: rawReply || "Hello! I'm here to help you check in-stock products (like our Regular Fans), custom embroidery pricing, or store details at Pacific Mall Lucena! 🧵✨",
        suggestedProducts: data?.suggestedProducts || []
      });
    } catch (err) {
      setSearchAiResult({
        query: q,
        reply: "Sorry, I'm having trouble connecting right now. Please try asking again in a moment! 🧵",
        suggestedProducts: []
      });
    } finally {
      setIsSearchAiLoading(false);
    }
  };

  const handleSearchSubmit = () => {
    // Pure local product search on Enter / Magnifying glass: 0 tokens, 0 AI calls, 0 network requests!
    setIsSearchFocused(false);
    setIsSearchAiOpen(false);
    setSearchAiResult(null);

    // Smooth scroll to product catalog on storefront
    const catalogEl = document.getElementById('products-section') || document.getElementById('product-catalog');
    if (catalogEl) {
      catalogEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleAiButtonClick = () => {
    const query = searchQuery.trim();
    if (query) {
      fetchSearchAi(query);
    } else {
      setIsSearchFocused(false);
      setIsSearchAiLoading(false);
      setIsSearchAiOpen(true);
      setSearchAiResult({
        query: '',
        reply: "Hello! Welcome to Stitch Art! 👋✨\n\nHow can I help you today? Feel free to ask any question about our products, custom embroidery services, live stock, pricing, or workshop details.",
        suggestedProducts: []
      });
    }
  };

  const handleAddToBasket = (product: Product) => {
    if (!isAuthenticated) {
      showToast('Please login to add items to your basket', 'info');
      return;
    }

    const productId = product.id || (product as any)._id || '';
    const availableStock = product.availableStock !== undefined
      ? product.availableStock
      : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
    const isOutOfStock = product.isOutOfStock || availableStock <= 0;

    if (isOutOfStock) {
      showToast(`${product.name} is out of stock`, 'error');
      return;
    }

    const inStockVar = product.variants?.find(v => !v.isOutOfStock && (v.availableStock ?? 0) > 0);

    useBasketStore.getState().addItem({
      productId,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      selectedVariant: inStockVar ? inStockVar.name : undefined,
      selectedColor: inStockVar ? inStockVar.color : undefined,
    });
    showToast(`Added ${product.name}${inStockVar ? ` (${inStockVar.name})` : ''} to basket`, 'success');
  };

  const renderAiReplyText = (text: string) => {
    const clean = text.replace(/\[PRODUCTS?:.*?(\]|$)/gi, '').trim();
    const paragraphs = clean.split('\n\n');
    return paragraphs.map((para, pIdx) => {
      const lines = para.split('\n');
      return (
        <div key={pIdx} className="mb-2 last:mb-0">
          {lines.map((line, lIdx) => {
            const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);
            return (
              <p key={lIdx} className="text-xs sm:text-[0.82rem] leading-relaxed text-text-main/90 m-0 my-0.5">
                {parts.map((part, i) => {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i} className="font-bold text-text-main">{part.slice(2, -2)}</strong>;
                  }
                  if (part.startsWith('*') && part.endsWith('*')) {
                    return <em key={i} className="italic text-text-main">{part.slice(1, -1)}</em>;
                  }
                  return part;
                })}
              </p>
            );
          })}
        </div>
      );
    });
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
      if (!target.closest('.search-container')) {
        setIsSearchFocused(false);
        setIsSearchAiOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isCategoryOpen, isUserMenuOpen, isMobileUserMenuOpen, isSearchFocused, isSearchAiOpen]);

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

        {/* Middle: Unified Search Capsule with Integrated Category Selector & AI Search */}
        <div className="w-full lg:flex-1 lg:max-w-[560px] lg:mx-auto relative search-container">
          <div className="w-full relative flex items-center bg-bg-surface border border-border-glass rounded-xl shadow-sm focus-within:border-border-glass/80 focus-within:ring-2 focus-within:ring-white/5 transition-all">
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
                  className={`transition-transform duration-200 text-text-dim ${isCategoryOpen ? 'rotate-180 text-text-main' : ''}`}
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
                placeholder="Search products or ask a question..."
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchFocused(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchSubmit();
                  } else if (e.key === 'Escape') {
                    setIsSearchFocused(false);
                  }
                }}
                className="w-full bg-transparent border-none px-3.5 py-2 sm:py-2.5 text-xs sm:text-[0.90rem] text-text-main placeholder:text-text-dim/70 outline-none flex-1 min-w-0"
              />
              {/* Clear search query button */}
              {searchQuery && (
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchAiOpen(false);
                    setSearchAiResult(null);
                  }}
                  className="p-1 mr-1 text-text-dim hover:text-text-main rounded-md hover:bg-white/10 cursor-pointer border-none bg-transparent transition-colors"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}

              {/* Permanent AI Store Attendant Trigger (Clean monochrome Sparkles) */}
              <button
                type="button"
                suppressHydrationWarning
                onClick={handleAiButtonClick}
                className="p-1.5 mr-1 text-text-dim hover:text-text-main hover:bg-white/10 rounded-lg border border-border-glass/60 hover:border-border-glass cursor-pointer flex items-center justify-center shrink-0 transition-all active:scale-95"
                title={searchQuery.trim() ? `Ask AI about "${searchQuery.trim()}"` : "Ask AI Store Attendant"}
                aria-label="Ask AI Store Attendant"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                  <path d="M19 4v4m2-2h-4" />
                </svg>
              </button>

              {/* Standard Search Submit Button (0 tokens) */}
              <button
                type="button"
                suppressHydrationWarning
                onClick={handleSearchSubmit}
                className="p-1.5 mr-2 text-text-dim hover:text-text-main hover:bg-white/10 rounded-lg transition-colors border-none bg-transparent cursor-pointer flex items-center justify-center shrink-0 active:scale-95"
                title="Search products (0 tokens)"
                aria-label="Search products"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>
          </div>

          {/* Spotlight Inline AI Answer Dropdown (Perplexity/Spotlight style) */}
          {isSearchAiOpen && (
            <div className="absolute top-[calc(100%+8px)] inset-x-0 bg-bg-card/95 backdrop-blur-2xl border border-border-glass rounded-2xl p-3.5 sm:p-4 shadow-2xl z-[3000] max-h-[75vh] overflow-y-auto animate-[fadeIn_0.15s_ease-out]">
              {/* Header */}
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-border-glass">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-white/10 border border-border-glass flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-main">
                      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                      <path d="M19 4v4m2-2h-4" />
                    </svg>
                  </span>
                  <span className="text-xs font-bold text-text-main">AI Store Attendant</span>
                  <span className="text-[0.62rem] text-text-dim px-2 py-0.5 rounded-full bg-white/5 border border-border-glass">
                    {searchAiResult?.query ? 'Instant Answer' : 'Virtual Concierge'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSearchAiOpen(false)}
                  className="p-1 rounded-md text-text-dim hover:text-text-main hover:bg-white/10 cursor-pointer border-none bg-transparent transition-colors"
                  title="Close (Esc)"
                  aria-label="Close answer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Body: Loading Shimmer or Result */}
              {isSearchAiLoading ? (
                <div className="py-4 px-2 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 text-xs text-text-dim animate-pulse">
                    <span className="animate-spin">🧵</span>
                    <span>Checking live workshop inventory & embroidery specs...</span>
                  </div>
                  <div className="h-3 w-4/5 bg-white/10 rounded animate-pulse" />
                  <div className="h-3 w-3/5 bg-white/10 rounded animate-pulse" />
                </div>
              ) : searchAiResult ? (
                <div className="flex flex-col gap-3">
                  {/* AI Response Text */}
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-border-glass">
                    {renderAiReplyText(searchAiResult.reply)}
                  </div>

                  {/* Suggested Question Chips (shown when opening AI or asking what to help with) */}
                  {(!searchAiResult.query || searchAiResult.query === '') && (
                    <div className="flex flex-col gap-2 pt-0.5">
                      <span className="text-[0.68rem] font-bold text-text-dim uppercase tracking-wider">
                        Suggested Questions
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: "🔍 Check in-stock products", query: "What products are currently available in stock?" },
                          { label: "⏱️ How long does embroidery take?", query: "How long does custom embroidery take?" },
                          { label: "🧵 Can I bring my own garments?", query: "Can I bring my own garments for custom embroidery (BYOG)?" },
                          { label: "💰 Custom embroidery pricing", query: "How much does custom embroidery cost?" },
                          { label: "📍 Store location & workshop hours", query: "Where is your workshop located and what are your store hours?" }
                        ].map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSearchQuery(chip.query);
                              fetchSearchAi(chip.query);
                            }}
                            className="text-[0.75rem] px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-border-glass text-text-main font-medium transition-all active:scale-95 cursor-pointer text-left flex items-center gap-1.5 shadow-xs"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matching Products Grid */}
                  {searchAiResult.suggestedProducts && searchAiResult.suggestedProducts.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[0.68rem] font-bold text-text-dim uppercase tracking-wider">
                        {selectedCategory && selectedCategory !== 'All' && searchAiResult.suggestedProducts.some(p => p.tag && !p.tag.toLowerCase().includes(selectedCategory.toLowerCase()))
                          ? 'Available Workshop Alternatives'
                          : 'In-Stock Recommendations'}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {searchAiResult.suggestedProducts.map((p, pIdx) => {
                          const avail = p.availableStock !== undefined 
                            ? p.availableStock 
                            : Math.max(0, (p.count ?? 0) - (p.reservedCount ?? 0));
                          const oos = p.isOutOfStock || avail <= 0;
                          return (
                            <div 
                              key={p.id ? `search-prod-${p.id}-${pIdx}` : `search-prod-idx-${pIdx}`} 
                              className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-border-glass hover:border-border-glass/80 transition-all"
                            >
                              <div className="w-11 h-11 rounded-lg overflow-hidden bg-white/5 shrink-0">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-text-dim text-[0.6rem]">IMG</div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-text-main m-0 truncate">{p.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-text-main font-bold text-xs">₱{p.price.toFixed(2)}</span>
                                  <span className="text-[0.6rem] text-text-dim">{avail} in stock</span>
                                </div>
                                {p.variants && p.variants.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    {p.variants.filter(v => !v.isOutOfStock && (v.availableStock ?? 0) > 0).map((v, vIdx) => (
                                      <span 
                                        key={vIdx} 
                                        className="text-[0.62rem] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 leading-none"
                                        title={`${v.name}: ${v.availableStock} in stock`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                                        {v.name}: {v.availableStock}
                                      </span>
                                    ))}
                                    {p.variants.filter(v => v.isOutOfStock || (v.availableStock ?? 0) <= 0).length > 0 && (
                                      <span 
                                        className="text-[0.58rem] text-text-dim/80 px-1.5 py-0.5 rounded bg-white/5 border border-border-glass leading-none"
                                        title={`Out of stock: ${p.variants.filter(v => v.isOutOfStock || (v.availableStock ?? 0) <= 0).map(v => v.name).join(', ')}`}
                                      >
                                        +{p.variants.filter(v => v.isOutOfStock || (v.availableStock ?? 0) <= 0).length} out of stock
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddToBasket(p)}
                                disabled={oos}
                                className="shrink-0 px-2.5 py-1 rounded-lg text-[0.68rem] font-bold border border-border-glass bg-white/10 hover:bg-white/20 text-text-main cursor-pointer active:scale-95 transition-all"
                              >
                                {oos ? 'Out' : '🛍️ Add'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Dropdown Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-border-glass/40 text-[0.7rem] text-text-dim">
                    <span>Press <kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[0.62rem] border border-border-glass">Esc</kbd> to close</span>
                    <span className="flex items-center gap-1.5 text-[0.68rem] text-text-dim">
                      <span className={`w-1.5 h-1.5 rounded-full ${searchAiResult.query ? 'bg-emerald-400' : 'bg-primary'}`}></span>
                      <span>{searchAiResult.query ? 'Live Stock Verified' : 'AI Assistant Ready'}</span>
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          )}
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
