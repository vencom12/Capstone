'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useProductStore } from '@/stores/useProductStore';
import { useUIStore } from '@/stores/useUIStore';
import { SidebarCategoriesSkeleton } from '@/components/ui/Skeletons';

export default function Sidebar() {
  const { selectedCategory, setSelectedCategory, getCategories, isSyncing } = useProductStore();
  const { toggleBasket, isBasketOpen, isSidebarOpen, setSidebarOpen } = useUIStore();
  const categories = getCategories();

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');

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

      <aside
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`
          h-full bg-bg-sidebar backdrop-blur-[12px] border-r border-border-glass flex flex-col p-5 px-3 transition-all duration-300 overflow-y-auto shrink-0 z-[2000]
          w-[230px] max-[1250px]:w-[200px]
          max-[1024px]:fixed max-[1024px]:left-0 max-[1024px]:top-0 max-[1024px]:w-[280px] max-[1024px]:p-4 max-[1024px]:shadow-2xl
          ${isSidebarOpen ? 'max-[1024px]:translate-x-0' : 'max-[1024px]:-translate-x-full'}
        `}
      >
        {/* Mobile / Tablet Header Inside Sidebar */}
        <div className="hidden max-[1024px]:flex items-center justify-between pb-4 border-b border-border-glass mb-4 shrink-0">
          <Link href="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2.5 no-underline cursor-pointer">
            {businessLogoUrl ? (
              <img src={businessLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/10 shrink-0" />
            ) : (
              <div className="bg-gradient-to-br from-primary to-secondary w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 font-bold">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
            )}
            <span className="font-extrabold text-[1.1rem] bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent tracking-tight">
              Stitch-Opt
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 rounded-full bg-white/5 border border-border-glass text-text-dim hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all"
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
                ? 'bg-primary/20 border-primary text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                : 'bg-white/5 border-border-glass text-text-main hover:bg-white/10'
              }
            `}
          >
            <div className="flex items-center gap-2.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
              <span>My Basket</span>
            </div>
            {isBasketOpen && <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />}
          </button>
        </div>

        {/* Hero Content */}
        <div className="mb-5 px-1">
          <h2 className="text-lg font-extrabold mb-1.5 leading-tight tracking-tight">
            Intelligence in Every Stitch.
          </h2>
          <p className="text-text-dim text-[0.78rem] leading-relaxed opacity-80 m-0">
            Explore our curated catalog of professional embroidery designs optimized for high-speed production.
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
                        ? 'bg-gradient-to-r from-primary to-secondary border-transparent text-white font-semibold shadow-[0_10px_20px_-5px_rgba(99,102,241,0.5)]'
                        : 'bg-bg-surface border-border-glass text-text-dim hover:bg-white/[0.08] hover:border-white/20 hover:translate-x-1 hover:text-white'
                      }
                    `}
                  >
                    {category === 'All' ? 'All Designs' : category}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

