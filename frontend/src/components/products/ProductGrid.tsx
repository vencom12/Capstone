'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Product } from '@/lib/types';
import { useProductStore } from '@/stores/useProductStore';
import ProductCard from './ProductCard';
import { ProductCardSkeleton } from '@/components/ui/Skeletons';
import Pagination from '@/components/ui/Pagination';

interface ProductGridProps {
  onQuickView: (product: Product) => void;
  products?: Product[];
}

export default function ProductGrid({ onQuickView, products: customProducts }: ProductGridProps) {
  const {
    isSyncing,
    searchQuery: storeSearchQuery,
    setSearchQuery: storeSetSearchQuery,
    selectedCategory: storeSelectedCategory,
    setSelectedCategory: storeSetSelectedCategory,
    getCategories,
    products,
  } = useProductStore();

  // When customProducts is passed (e.g. in Favorites), isolate category and search
  // so Favorites starts clean with 'All', only searches favorites, and doesn't pollute storefront state
  const [localCategory, setLocalCategory] = useState('All');
  const [localSearch, setLocalSearch] = useState('');

  const selectedCategory = customProducts ? localCategory : storeSelectedCategory;
  const setSelectedCategory = customProducts ? setLocalCategory : storeSetSelectedCategory;
  const searchQuery = customProducts ? localSearch : storeSearchQuery;
  const setSearchQuery = customProducts ? setLocalSearch : storeSetSearchQuery;

  const baseProducts = customProducts || products;

  const [page, setPage] = useState(1);
  const pageSize = 12;

  const gridRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  const categories = getCategories();
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: baseProducts.length };
    categories.forEach((cat) => {
      if (cat !== 'All') {
        counts[cat] = baseProducts.filter((p) => {
          const formatted = p.tag ? p.tag.trim().replace(/\b\w/g, (c) => c.toUpperCase()) : 'General';
          return formatted === cat || p.tag === cat;
        }).length;
      }
    });
    return counts;
  }, [categories, baseProducts]);

  const filteredProducts = useMemo(() => {
    return baseProducts.filter((p) => {
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const pTagFormatted = p.tag ? p.tag.trim().replace(/\b\w/g, (c) => c.toUpperCase()) : 'General';
      const matchesCategory =
        selectedCategory === 'All' ||
        pTagFormatted === selectedCategory ||
        p.tag === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [baseProducts, searchQuery, selectedCategory]);

  // Trigger box-per-box staggered cascade on intersection
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: '100px 0px 0px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Re-trigger staggered box cascade ONLY when page, category, or search changes
  useEffect(() => {
    setIsInView(false);
    const timer = setTimeout(() => setIsInView(true), 40);
    return () => clearTimeout(timer);
  }, [page, searchQuery, selectedCategory]);

  // Reset to first page whenever search or category changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory]);

  const paginatedProducts = useMemo(() => {
    return filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredProducts, page, pageSize]);

  return (
    <div ref={gridRef} className="flex flex-col gap-6 pb-6">
      {/* Category Filter & Section Header */}
      {!customProducts ? (
        /* Storefront: Active Filter Badges (Category / Search) */
        (selectedCategory !== 'All' || searchQuery) ? (
          <div className="flex items-center gap-2 flex-wrap text-xs text-text-dim pb-1">
            <span className="font-medium text-text-dim">Active Filters:</span>
            {selectedCategory !== 'All' && (
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setSelectedCategory('All')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 text-xs font-semibold cursor-pointer transition-all"
                title="Clear category filter"
              >
                <span>Category: {selectedCategory}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
            {searchQuery && (
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setSearchQuery('')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 text-xs font-semibold cursor-pointer transition-all"
                title="Clear search"
              >
                <span>Search: &ldquo;{searchQuery}&rdquo;</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
            {(selectedCategory !== 'All' && searchQuery) && (
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => {
                  setSelectedCategory('All');
                  setSearchQuery('');
                }}
                className="text-xs text-text-dim hover:text-text-main underline cursor-pointer bg-transparent border-none p-1"
              >
                Clear all
              </button>
            )}
          </div>
        ) : null
      ) : (
        /* Dashboard Favorites: Filter Saved Designs */
        <div className="flex flex-col gap-2.5 pb-2">
          <div className="flex items-center justify-between gap-2 pb-1 text-xs text-text-dim">
            <span className="font-semibold text-text-dim">Filter Saved Designs</span>
          </div>
          {categories.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5 -mx-1 px-1">
              {categories.map((category) => {
                const isSelected = selectedCategory === category;
                const count = categoryCounts[category] ?? 0;
                return (
                  <button
                    key={category}
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setSelectedCategory(category)}
                    className={`
                      group px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-2 border select-none shrink-0
                      ${isSelected
                        ? 'bg-primary text-white border-primary shadow-[0_4px_16px_rgba(220,38,38,0.35)] scale-[1.02]'
                        : 'bg-white/5 hover:bg-white/10 text-text-dim hover:text-text-main border-border-glass hover:border-white/20'
                      }
                    `}
                  >
                    <span>{category === 'All' ? 'All Products' : category}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold transition-colors ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-white/5 text-text-dim group-hover:bg-white/10 group-hover:text-text-main'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading skeletons */}
      {isSyncing && filteredProducts.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4 md:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        /* Empty state */
        <div className="col-span-full text-center py-16 text-text-dim bg-white/5 border border-border-glass rounded-2xl p-8">
          <svg className="mx-auto mb-4 text-primary opacity-50" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p className="text-lg font-medium text-text-main">No products found</p>
          <p className="text-sm mt-1">Try adjusting your search or category filter.</p>
          {(selectedCategory !== 'All' || searchQuery) && (
            <button
              suppressHydrationWarning
              onClick={() => {
                setSelectedCategory('All');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold border-none cursor-pointer hover:opacity-90 transition-opacity"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        /* Products Grid */
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4 md:gap-5">
            {paginatedProducts.map((product, idx) => (
              <ProductCard
                key={product.id || product._id}
                product={product}
                index={idx}
                isVisible={isInView}
                onQuickView={onQuickView}
              />
            ))}
          </div>

          <Pagination
            currentPage={page}
            totalItems={filteredProducts.length}
            pageSize={pageSize}
            onPageChange={setPage}
            itemLabel="products"
          />
        </>
      )}
    </div>
  );
}
