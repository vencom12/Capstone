'use client';

import type { Product } from '@/lib/types';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProductModal({ product, isOpen, onClose }: ProductModalProps) {
  const addItem = useBasketStore((s) => s.addItem);
  const { isAuthenticated } = useAuthStore();

  if (!product) return null;

  const productId = product.id || product._id || '';

  // Available stock calculation
  const available = (product.count ?? 0) - (product.reservedCount ?? 0);
  const isOutOfStock = available <= 0;

  const handleAddToBasket = () => {
    if (!isAuthenticated) {
      showToast('Please login to add items to your basket', 'info');
      return;
    }
    if (isOutOfStock) {
      showToast('Sorry, this base garment is currently out of stock (insufficient blanks on hand).', 'error');
      return;
    }
    addItem({
      productId,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
    });
    showToast(`Added ${product.name} to basket`, 'success');
    onClose();
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[800px]" noPadding>
      <div className="grid grid-cols-[1fr_1.1fr] max-[900px]:grid-cols-1">
        {/* Image Section */}
        <div className="bg-white/[0.02] flex items-center justify-center p-6 relative border-r border-border-glass max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:border-border-glass max-[900px]:h-[220px] max-[900px]:p-4 max-[650px]:h-[160px] max-[650px]:p-2.5">
          <div className="w-full max-w-[300px] aspect-square rounded-[20px] overflow-hidden bg-black/20 shadow-[0_20px_40px_rgba(0,0,0,0.3)] border border-border-glass max-[900px]:max-w-[180px] max-[650px]:max-w-[140px]">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-dim text-xs tracking-wider">
                STITCH PREVIEW
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="p-6 flex flex-col gap-3 max-[650px]:p-4 max-[650px]:gap-2">
          <span className="inline-block w-fit px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-wider">
            {product.tag || 'Design'}
          </span>

          <h2 className="text-2xl font-extrabold leading-tight m-0 text-text-main max-[650px]:text-lg">
            {product.name}
          </h2>

          <div className="flex gap-4 items-center">
            <div className="text-xl font-bold text-primary max-[650px]:text-lg">
              ${product.price.toFixed(2)}
            </div>
            {isOutOfStock && (
              <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-[0_4px_12px_rgba(239,68,68,0.5)]">
                Out of Stock
              </span>
            )}
          </div>

          <p className="text-text-dim leading-relaxed text-[0.95rem] flex-grow m-0 max-[650px]:text-[0.85rem]">
            {product.description || 'Professional embroidery design optimized for high-speed production.'}
          </p>

          <div className="flex gap-3 mt-3 max-[650px]:gap-2">
            <GlassButton
              variant={isOutOfStock ? "secondary" : "primary"}
              onClick={handleAddToBasket}
              className="flex-1"
              disabled={isOutOfStock}
            >
              {isOutOfStock ? "Out of Stock" : "Add to Basket"}
            </GlassButton>
            <GlassButton
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              Keep Shopping
            </GlassButton>
          </div>
        </div>
      </div>
    </GlassModal>
  );
}
