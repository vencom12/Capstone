'use client';

import { useProductStore } from '@/stores/useProductStore';
import { useUIStore } from '@/stores/useUIStore';

export default function Sidebar() {
  const { selectedCategory, setSelectedCategory, getCategories } = useProductStore();
  const { toggleBasket, isBasketOpen } = useUIStore();
  const categories = getCategories();

  return (
    <aside className="w-[215px] h-full bg-bg-sidebar backdrop-blur-[12px] border border-border-glass rounded-[20px] flex flex-col p-5 px-2.5 transition-all duration-300 overflow-hidden max-[1100px]:w-[190px] max-[1100px]:p-4 max-[1100px]:px-2.5 max-[650px]:hidden shrink-0">
      {/* Basket Toggle Section */}
      <div className="mb-6 px-1.5">
        <button
          suppressHydrationWarning
          onClick={toggleBasket}
          className={`
            w-full flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer
            transition-all duration-300 text-[0.9rem] font-bold border
            ${
              isBasketOpen
                ? 'bg-primary/20 border-primary text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                : 'bg-white/5 border-border-glass text-text-main hover:bg-white/10'
            }
          `}
        >
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
            My Basket
          </div>
          {isBasketOpen && <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />}
        </button>
      </div>

      {/* Hero Content */}
      <div className="mb-5">
        <h2 className="text-xl font-extrabold mb-2 leading-tight tracking-tight">
          Intelligence in Every Stitch.
        </h2>
        <p className="text-text-dim text-[0.8rem] mb-5 leading-relaxed opacity-80">
          Explore our curated catalog of professional embroidery designs optimized for high-speed production.
        </p>
      </div>

      {/* Categories */}
      <div>
        <h3 className="text-[0.9rem] text-text-dim uppercase tracking-wider mb-4 px-2.5 font-medium">
          Categories
        </h3>
        <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
          {categories.map((category) => (
            <li key={category}>
              <button
                suppressHydrationWarning
                onClick={() => setSelectedCategory(category)}
                className={`
                  w-full flex items-center px-4 py-2.5 rounded-xl cursor-pointer
                  transition-all duration-300 text-left text-[0.85rem] border
                  ${
                    selectedCategory === category
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
      </div>
    </aside>
  );
}
