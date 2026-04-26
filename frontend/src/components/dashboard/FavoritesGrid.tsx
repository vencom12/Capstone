'use client';

import type { Product } from '@/types';
import ProductCard from '@/components/storefront/ProductCard';

interface FavoritesGridProps {
  products: Product[];
  onRemove: (id: string) => void;
  onAddToCart: (product: Product) => void;
}

export default function FavoritesGrid({ products, onRemove, onAddToCart }: FavoritesGridProps) {
  if (products.length === 0) {
    return (
      <div className="py-20 text-center glass-card border-dashed">
        <div className="text-4xl mb-4">❤️</div>
        <p className="text-slate-500">You haven't favorited any products yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((product) => (
        <ProductCard
          key={product._id}
          product={product}
          onAddToCart={onAddToCart}
          onToggleFavorite={onRemove}
          isFavorite={true}
        />
      ))}
    </div>
  );
}
