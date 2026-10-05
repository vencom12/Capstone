'use client';

import { useState, useEffect, useMemo } from 'react';
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
  const { isSyncing, getFilteredProducts, searchQuery, selectedCategory } = useProductStore();
  const filteredProducts = customProducts || getFilteredProducts();

  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Reset to first page whenever search, category, or source list changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory, customProducts, filteredProducts.length]);

  const paginatedProducts = useMemo(() => {
    return filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredProducts, page, pageSize]);

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
    <div className="flex flex-col gap-6 pb-6">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        {paginatedProducts.map((product) => (
          <ProductCard
            key={product.id || product._id}
            product={product}
            onQuickView={onQuickView}
          />
        ))}
      </div>

      <Pagination
        currentPage={page}
        totalItems={filteredProducts.length}
        pageSize={pageSize}
        onPageChange={setPage}
        itemLabel="designs"
      />
    </div>
  );
}
