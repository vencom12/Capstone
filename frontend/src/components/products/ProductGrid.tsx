'use client';

import type { Product } from '@/lib/types';
import { useProductStore } from '@/stores/useProductStore';
import ProductCard from './ProductCard';
import { ProductCardSkeleton } from '@/components/ui/Skeletons';

interface ProductGridProps {
  onQuickView: (product: Product) => void;
  products?: Product[];
}

export default function ProductGrid({ onQuickView, products: customProducts }: ProductGridProps) {
  const { isSyncing, getFilteredProducts } = useProductStore();
  const filteredProducts = customProducts || getFilteredProducts();

  // Loading skeletons
  if (isSyncing && filteredProducts.length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
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
