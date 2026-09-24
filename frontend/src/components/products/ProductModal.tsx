'use client';

import { useState, useEffect } from 'react';
import type { Product, ProductVariant } from '@/lib/types';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { showToast } from '@/components/ui/Toast';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onBuyNow?: () => void;
  initialMode?: 'basket' | 'buy_now';
}

export default function ProductModal({ 
  product, 
  isOpen, 
  onClose,
  onBuyNow,
  initialMode = 'basket'
}: ProductModalProps) {
  const { items, addItem } = useBasketStore();
  const { isAuthenticated } = useAuthStore();
  const { setAuthOpen } = useUIStore();

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [queueLoadCount, setQueueLoadCount] = useState<number>(3);

  // Sync state when product opens
  useEffect(() => {
    if (product) {
      setQuantity(1);
      if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        setSelectedVariant(product.variants[0]);
        setSelectedColor(product.variants[0].color || '');
        setSelectedSize(product.variants[0].size || '');
      } else {
        setSelectedVariant(null);
        setSelectedColor('');
        setSelectedSize('');
      }
      
      // Fetch current business queue load for dynamic finishing time estimate
      import('@/lib/api').then(({ api }) => {
        api.get<any>('/api/customer/dashboard-state').then((res) => {
          if (res && res.orders) {
            const activeQueue = res.orders.filter((o: any) => o.status === 'In Queue' || o.status === 'In Production').length;
            setQueueLoadCount(activeQueue);
          }
        }).catch(() => {});
      });
    }
  }, [product, isOpen]);

  if (!product) return null;

  const productId = product.id || product._id || '';
  const effectivePrice = selectedVariant?.priceOverride ?? product.price;

  // Available stock calculation
  const availableStock = product.availableStock !== undefined ? product.availableStock : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
  const isOutOfStock = product.isOutOfStock !== undefined ? product.isOutOfStock : availableStock <= 0;

  // Check if product actually has defined sizes across variants
  const hasVariants = Boolean(product.variants && Array.isArray(product.variants) && product.variants.length > 0);
  const availableSizes = hasVariants 
    ? [...new Set(product.variants!.map((v: any) => v.size).filter(Boolean))] 
    : [];
  const hasSizes = availableSizes.length > 0;

  // Calculate dynamic finishing / turnaround time based on business order load
  const getEstimatedFinishingTime = () => {
    if (queueLoadCount <= 3) {
      return { time: '1–2 Business Days', status: 'Optimal Production Load', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    } else if (queueLoadCount <= 8) {
      return { time: '2–3 Business Days', status: 'Standard Production Load', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' };
    } else {
      return { time: '4–5 Business Days', status: 'High Queue Demand', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    }
  };

  const estTimeInfo = getEstimatedFinishingTime();

  const handleAdd = () => {
    if (!isAuthenticated) {
      showToast('Please sign in to add items to your basket', 'info');
      setAuthOpen(true, 'login');
      return false;
    }
    if (isOutOfStock) {
      showToast(`Sorry, "${product.name}" is currently out of stock.`, 'error');
      return false;
    }

    const existing = items.find((i) => i.productId === productId && i.selectedVariant === selectedVariant?.name);
    const existingQty = existing ? existing.quantity : 0;
    if (existingQty + quantity > availableStock) {
      showToast(`Sorry, only ${availableStock} units available for "${product.name}".`, 'error');
      return false;
    }

    addItem({
      productId,
      name: product.name,
      price: effectivePrice,
      quantity,
      imageUrl: selectedVariant?.imageUrl || product.imageUrl,
      selectedVariant: selectedVariant?.name,
      selectedColor: selectedColor || selectedVariant?.color,
      selectedSize: selectedSize || undefined,
    });

    return true;
  };

  const handleAddToBasket = () => {
    if (handleAdd()) {
      showToast(`Added ${quantity}x ${product.name} to basket`, 'success');
      onClose();
    }
  };

  const handleBuyNow = () => {
    if (handleAdd()) {
      onClose();
      if (onBuyNow) {
        onBuyNow();
      }
    }
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[850px]" noPadding>
      <div className="grid grid-cols-[1fr_1.15fr] max-[900px]:grid-cols-1">
        {/* Image & Preview Section */}
        <div className="bg-white/[0.02] flex flex-col items-center justify-center p-6 relative border-r border-border-glass max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:h-[220px] max-[900px]:p-4 max-[650px]:h-[180px]">
          <div className="w-full max-w-[320px] aspect-square rounded-[24px] overflow-hidden bg-black/30 shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-border-glass max-[900px]:max-w-[180px] max-[650px]:max-w-[140px] relative">
            {(selectedVariant?.imageUrl || product.imageUrl) ? (
              <img
                src={selectedVariant?.imageUrl || product.imageUrl}
                alt={product.name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-dim text-xs tracking-wider">
                STITCH PREVIEW
              </div>
            )}

            {isOutOfStock && (
              <span className="absolute top-3 left-3 bg-red-500/90 text-white text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider backdrop-blur-sm">
                Out of Stock
              </span>
            )}
          </div>
        </div>

        {/* Product Customization & Info Section */}
        <div className="p-6 flex flex-col gap-4 text-left max-[650px]:p-4 max-[650px]:gap-3">
          <div>
            <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              {product.tag || 'Design'}
            </span>
            <h2 className="text-2xl font-extrabold leading-tight m-0 text-text-main max-[650px]:text-lg">
              {product.name}
            </h2>
          </div>

          <div className="flex justify-between items-center">
            <div className="text-2xl font-extrabold text-primary font-mono max-[650px]:text-xl">
              ${(effectivePrice * quantity).toFixed(2)}
              {quantity > 1 && <span className="text-xs text-text-dim font-sans ml-2">(${effectivePrice.toFixed(2)} each)</span>}
            </div>
            <span className="text-xs text-text-dim font-medium">Stock: {availableStock} units</span>
          </div>

          <p className="text-text-dim leading-relaxed text-[0.88rem] m-0 max-[650px]:text-[0.8rem] line-clamp-3">
            {product.description || 'Professional embroidery design optimized for high-speed production.'}
          </p>

          {/* Dynamic Order Load & Finishing Time Badge */}
          <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-semibold ${estTimeInfo.color}`}>
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <span>Est. Finishing Time: <strong className="underline">{estTimeInfo.time}</strong></span>
            </div>
            <span className="text-[10px] opacity-80 uppercase tracking-wider font-bold hidden sm:inline">{estTimeInfo.status}</span>
          </div>

          {/* Variants & Swatches (Only shown if product has variants) */}
          {hasVariants && (
            <div className="flex flex-col gap-2 border-t border-border-glass pt-3">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Variant / Option: <span className="text-primary font-bold normal-case ml-1">{selectedVariant?.name}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {product.variants!.map((variant, idx) => {
                  const isSelected = selectedVariant?.name === variant.name;
                  return (
                    <button
                      key={idx}
                      type="button"
                      suppressHydrationWarning
                      onClick={() => {
                        setSelectedVariant(variant);
                        if (variant.color) setSelectedColor(variant.color);
                        if (variant.size) setSelectedSize(variant.size);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-primary/20 border-primary text-primary shadow-[0_0_12px_rgba(99,102,241,0.3)] scale-105'
                          : 'bg-bg-surface border-border-glass text-text-main hover:border-white/30'
                      }`}
                    >
                      {variant.color && (
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20 inline-block shadow-sm shrink-0"
                          style={{ backgroundColor: variant.color }}
                        />
                      )}
                      <span>{variant.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size Selector (Only shown if variants explicitly specify sizes) */}
          {hasSizes && (
            <div className="flex flex-col gap-2 border-t border-border-glass pt-3">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Select Size: <span className="text-primary font-bold normal-case ml-1">{selectedSize}</span>
              </label>
              <div className="flex gap-2">
                {availableSizes.map((s: any) => (
                  <button
                    key={s}
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setSelectedSize(s)}
                    className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      selectedSize === s
                        ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(99,102,241,0.3)]'
                        : 'bg-bg-surface border-border-glass text-text-dim hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity Stepper */}
          <div className="flex items-center justify-between border-t border-border-glass pt-3">
            <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Quantity / Count</span>
            <div className="flex items-center gap-3 bg-bg-surface border border-border-glass p-1 rounded-xl">
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg bg-white/5 border border-border-glass text-text-main hover:bg-white/10 flex items-center justify-center font-bold cursor-pointer transition-all"
              >
                -
              </button>
              <span className="font-mono font-bold text-sm w-6 text-center">{quantity}</span>
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                className="w-8 h-8 rounded-lg bg-white/5 border border-border-glass text-text-main hover:bg-white/10 flex items-center justify-center font-bold cursor-pointer transition-all"
              >
                +
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-auto pt-4 max-[650px]:gap-2">
            <GlassButton
              variant="secondary"
              onClick={handleAddToBasket}
              className="flex-1 py-3"
              disabled={isOutOfStock}
            >
              Add to Basket
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleBuyNow}
              className="flex-1 py-3 font-bold shadow-[0_4px_16px_rgba(99,102,241,0.4)]"
              disabled={isOutOfStock}
            >
              ⚡ Buy Now
            </GlassButton>
          </div>
        </div>
      </div>
    </GlassModal>
  );
}
