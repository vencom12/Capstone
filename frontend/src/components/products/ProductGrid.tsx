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
    getFilteredProducts,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    getCategories,
    products,
  } = useProductStore();
  const filteredProducts = customProducts || getFilteredProducts();

  const [page, setPage] = useState(1);
  const pageSize = 12;

  const gridRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  const categories = getCategories();
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: products.length };
    categories.forEach((cat) => {
      if (cat !== 'All') {
        counts[cat] = products.filter((p) => {
          const formatted = p.tag ? p.tag.trim().replace(/\b\w/g, (c) => c.toUpperCase()) : 'General';
          return formatted === cat || p.tag === cat;
        }).length;
      }
    });
    return counts;
  }, [categories, products]);

  // Trigger box-per-box staggered cascade on intersection
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
          } else if (entry.boundingClientRect.top > window.innerHeight * 0.85) {
            // When scrolled back up into the shelf scene, reset so it cascades in again on return
            setIsInView(false);
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Re-trigger staggered box cascade when page, category, or search changes
  useEffect(() => {
    setIsInView(false);
    const timer = setTimeout(() => setIsInView(true), 40);
    return () => clearTimeout(timer);
  }, [page, searchQuery, selectedCategory, customProducts, filteredProducts.length]);

  // Reset to first page whenever search, category, or source list changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory, customProducts, filteredProducts.length]);

  const paginatedProducts = useMemo(() => {
    return filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredProducts, page, pageSize]);

  return (
    <div ref={gridRef} className="flex flex-col gap-6 pb-6">
      {/* Category Filter & Section Header */}
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-text-main m-0">
              Curated Atelier Products
            </h2>
            <p className="text-xs sm:text-sm text-text-dim mt-0.5 m-0">
              Explore bespoke embroidery pieces optimized for high-tensile precision.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-text-dim">
            {searchQuery && (
              <button
                suppressHydrationWarning
                onClick={() => setSearchQuery('')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 text-xs font-semibold cursor-pointer transition-all"
                title="Clear search"
              >
                <span>Search: &ldquo;{searchQuery}&rdquo;</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
            <span className="font-mono font-medium px-3 py-1 rounded-full bg-white/5 border border-border-glass text-text-dim">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>

        {/* Horizontal Category Chip Carousel */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5 -mx-1 px-1">
          {categories.map((category) => {
            const isSelected = selectedCategory === category;
            const count = categoryCounts[category] ?? 0;
            return (
              <button
                key={category}
                suppressHydrationWarning
                onClick={() => setSelectedCategory(category)}
                className={`
                  group px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-2 border select-none shrink-0
                  ${isSelected
                    ? 'bg-primary text-white border-primary shadow-[0_4px_16px_rgba(220,38,38,0.35)] scale-[1.02]'
                    : 'bg-white/5 hover:bg-white/10 text-text-dim hover:text-text-main border-border-glass hover:border-white/20'
                  }
                `}
              >
                <span>{category === 'All' ? 'All Products' : category}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-colors ${
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
      </div>

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
