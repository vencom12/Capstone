'use client';

import type { Product } from '@/lib/types';
import { useBasketStore } from '@/stores/useBasketStore';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';
import GlassButton from '@/components/ui/GlassButton';

interface ProductCardProps {
  product: Product;
  onQuickView: (product: Product) => void;
}

export default function ProductCard({ product, onQuickView }: ProductCardProps) {
  const { items, addItem } = useBasketStore();
  const { favorites, toggleFavorite } = useProductStore();
  const { isAuthenticated } = useAuthStore();

  const productId = product.id || product._id || '';
  const isFav = favorites.some((f) => (f.id || f._id) === productId);

  // Available stock calculation
  const availableStock = product.availableStock !== undefined ? product.availableStock : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
  const isOutOfStock = product.isOutOfStock !== undefined ? product.isOutOfStock : availableStock <= 0;

  const handleAddToBasket = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      showToast('Please login to add items to your basket', 'info');
      return;
    }
    if (isOutOfStock) {
      showToast(`Sorry, "${product.name}" is currently out of stock.`, 'error');
      return;
    }

    const existing = items.find((i) => i.productId === productId);
    const existingQty = existing ? existing.quantity : 0;
    if (existingQty + 1 > availableStock) {
      showToast(`Sorry, you cannot add more. Only ${availableStock} units of "${product.name}" can be made with current stock.`, 'error');
      return;
    }

    addItem({
      productId,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
    });
    showToast(`Added ${product.name} to basket`, 'success');
  };

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
      onClick={() => onQuickView(product)}
      className="group bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-[20px] overflow-hidden cursor-pointer transition-all duration-300 hover:border-white/20 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col animate-[fadeIn_0.5s_ease-out]"
    >
      {/* Image */}
      <div
        className="h-[140px] md:h-[180px] bg-white/5 flex items-center justify-center relative overflow-hidden"
      >
        {product.imageUrl ? (
          <img 
            src={product.imageUrl} 
            alt={product.name} 
            loading="lazy" 
            decoding="async" 
            className="absolute inset-0 w-full h-full object-cover object-center" 
          />
        ) : (
          <span className="text-text-dim text-xs tracking-wider font-semibold z-10 relative">STITCH PREVIEW</span>
        )}
        
        {/* Out of Stock badge */}
        {isOutOfStock && (
          <span className="absolute top-3 left-3 bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-[0_4px_12px_rgba(239,68,68,0.5)]">
            Out of Stock
          </span>
        )}

        {/* Favorite button */}
        <button
          suppressHydrationWarning
          onClick={handleFavorite}
          className={`absolute top-3 right-3 bg-black/30 border-none p-2 rounded-full cursor-pointer backdrop-blur-[4px] transition-all duration-200 ${
            isFav ? 'text-danger' : 'text-text-dim hover:text-danger'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      {/* Details */}
      <div className="p-4 md:p-6 flex flex-col flex-1">
        <span className="inline-block w-fit px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase tracking-wider mb-2">
          {product.tag || 'Design'}
        </span>
        <div className="flex justify-between items-baseline mb-1">
          <h3 className="font-semibold text-sm md:text-base line-clamp-1">{product.name}</h3>
          <span className="text-primary font-bold text-sm md:text-lg">${product.price.toFixed(2)}</span>
        </div>
        <p className="text-text-dim text-[0.75rem] md:text-[0.85rem] leading-relaxed mb-4 line-clamp-2">
          {product.description || 'Professional embroidery design.'}
        </p>
        <GlassButton
          variant={isOutOfStock ? "secondary" : "primary"}
          fullWidth
          size="md"
          onClick={handleAddToBasket}
          className="mt-auto"
          disabled={isOutOfStock}
        >
          {isOutOfStock ? "Out of Stock" : "Add to Basket"}
        </GlassButton>
      </div>
    </div>
  );
}
