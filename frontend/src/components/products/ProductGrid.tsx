'use client';

import type { Product } from '@/lib/types';
import { useProductStore } from '@/stores/useProductStore';
import ProductCard from './ProductCard';

interface ProductGridProps {
  onQuickView: (product: Product) => void;
  products?: Product[];
}

// Skeleton card for loading state
function SkeletonCard() {
  return (
    <div className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-[20px] overflow-hidden animate-pulse">
      <div className="h-[180px] bg-white/5" />
      <div className="p-6 flex flex-col gap-3">
        <div className="h-4 w-16 bg-white/10 rounded-full" />
        <div className="flex justify-between">
          <div className="h-5 w-24 bg-white/10 rounded" />
          <div className="h-5 w-16 bg-white/10 rounded" />
        </div>
        <div className="h-3 w-full bg-white/10 rounded" />
        <div className="h-10 w-full bg-white/10 rounded-xl mt-2" />
      </div>
    </div>
  );
}

export default function ProductGrid({ onQuickView, products: customProducts }: ProductGridProps) {
  const { isSyncing, getFilteredProducts } = useProductStore();
  const filteredProducts = customProducts || getFilteredProducts();

  // Loading skeletons
  if (isSyncing && filteredProducts.length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (filteredProducts.length === 0) {
    return (
      <div className="col-span-full text-center py-16 text-text-dim">
        <svg className="mx-auto mb-4 text-primary opacity-50" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p className="text-lg font-medium">No designs found</p>
        <p className="text-sm mt-1">Try adjusting your search or category filter.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {filteredProducts.map((product) => (
        <ProductCard
          key={product.id || product._id}
          product={product}
          onQuickView={onQuickView}
        />
      ))}
    </div>
  );
}
