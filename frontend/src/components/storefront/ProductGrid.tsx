'use client';

import type { Product } from '@/types';
import ProductCard from './ProductCard';
import Spinner from '@/components/ui/Spinner';

interface ProductGridProps {
  products: Product[];
  loading?: boolean;
  onAddToCart: (product: Product) => void;
  onToggleFavorite?: (id: string) => void;
  favorites?: string[];
}

export default function ProductGrid({ products, loading, onAddToCart, onToggleFavorite, favorites = [] }: ProductGridProps) {
  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-20 text-center glass-card">
        <p className="text-slate-500 italic">No products found matching your search.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((product) => (
        <div key={product._id} className="animate-[slideUp_0.4s_ease-out]">
          <ProductCard
            product={product}
            onAddToCart={onAddToCart}
            onToggleFavorite={onToggleFavorite}
            isFavorite={favorites.includes(product._id)}
          />
        </div>
      ))}
    </div>
  );
}
