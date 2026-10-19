'use client';

import { useState, useEffect, useRef } from 'react';
import type { Product } from '@/lib/types';
import OptimizedImage from '@/components/ui/OptimizedImage';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';

interface ProductCardProps {
  product: Product;
  onQuickView: (product: Product) => void;
  index?: number;
  isVisible?: boolean;
}

export default function ProductCard({ product, onQuickView, index = 0 }: ProductCardProps) {
  const { favorites, toggleFavorite } = useProductStore();
  const { isAuthenticated } = useAuthStore();

  const cardRef = useRef<HTMLDivElement>(null);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasEntered(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.05,
        rootMargin: '50px 0px 50px 0px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showCard = hasEntered;

  const productId = product.id || product._id || '';
  const isFav = favorites.some((f) => (f.id || f._id) === productId);

  // Available stock calculation
  const availableStock = product.availableStock !== undefined ? product.availableStock : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
  const isOutOfStock = product.isOutOfStock !== undefined ? product.isOutOfStock : availableStock <= 0;

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      showToast('Please login to save favorites', 'info');
      return;
    }
    toggleFavorite(productId);
  };

  return (
    <div
      ref={cardRef}
      onClick={() => onQuickView(product)}
      style={{
        transitionDelay: showCard ? `${(index % 4) * 120}ms` : '0ms',
      }}
      className={`group bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md flex flex-col hover:border-primary/40 hover:-translate-y-1 transition-all duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        showCard
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-12 scale-[0.92] pointer-events-none'
      }`}
    >
      {/* Image */}
      <div
        className="h-[160px] sm:h-[190px] md:h-[220px] bg-bg-surface flex items-center justify-center relative overflow-hidden"
      >
        {product.imageUrl ? (
          <OptimizedImage
            src={product.imageUrl}
            alt={product.name}
            width={480}
            quality={80}
            className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
          />
        ) : (
          <span className="text-text-dim text-xs tracking-wider font-semibold z-10 relative">STITCH PREVIEW</span>
        )}
        
        {/* Out of Stock badge */}
        {isOutOfStock && (
          <span className="absolute top-3 left-3 bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider shadow-sm">
            Out of Stock
          </span>
        )}

        {/* Low Stock badge */}
        {!isOutOfStock && availableStock > 0 && availableStock <= 5 && (
          <span className="absolute top-3 left-3 bg-amber-500/90 text-white text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider shadow-sm backdrop-blur-[2px]">
            Only {availableStock} left
          </span>
        )}

        {/* Favorite button */}
        <button
          suppressHydrationWarning
          onClick={handleFavorite}
          className={`absolute top-3 right-3 bg-bg-card/85 hover:bg-bg-card border border-border-glass p-2 rounded-xl cursor-pointer backdrop-blur-md shadow-sm transition-all duration-200 active:scale-95 z-10 ${
            isFav ? 'text-danger' : 'text-text-dim hover:text-danger'
          }`}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {/* Floating Quick View glass pill on hover */}
        <div className="absolute inset-x-0 bottom-3 flex justify-center items-center pointer-events-none px-3 z-10">
          <span className="opacity-0 translate-y-2.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-out bg-bg-card/95 hover:bg-primary text-text-main hover:text-white border border-border-glass hover:border-primary text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-1.5 select-none pointer-events-auto cursor-pointer group/pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary group-hover/pill:text-white transition-colors">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Quick View</span>
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="p-3.5 sm:p-4 flex flex-col flex-1 justify-between gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-block px-2 py-0.5 bg-primary/10 text-primary rounded-md text-[10px] font-bold uppercase tracking-wider">
            {product.tag || 'Design'}
          </span>
          <span className="text-primary font-bold text-sm sm:text-base">₱{product.price.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-sm sm:text-[0.95rem] text-text-main line-clamp-1 group-hover:text-primary transition-colors m-0">
            {product.name}
          </h3>
          <span className="text-text-dim/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all text-xs shrink-0 select-none">
            →
          </span>
        </div>
      </div>
    </div>
  );
}
