'use client';

import { useState, useEffect } from 'react';
import type { Product, ProductVariant } from '@/lib/types';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { showToast } from '@/components/ui/Toast';
import InlineError from '@/components/ui/InlineError';
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
  const [capacityData, setCapacityData] = useState<{ activeOrders: number; estimatedMinutes: number } | null>(null);

  // Custom Embroidery Lettering / Personalization state (Exclusive Cursive Script Font)
  const [isPersonalized, setIsPersonalized] = useState<boolean>(false);
  const [customText, setCustomText] = useState<string>('');
  const [threadColor, setThreadColor] = useState<{ name: string; hex: string }>({
    name: 'Metallic Gold',
    hex: '#d4af37',
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [monogramError, setMonogramError] = useState<string | null>(null);
  
  // Studio Machine Standard: One default formal cursive script
  const DEFAULT_FONT = {
    name: 'Classic Cursive Script',
    fontCss: "'Brush Script MT', 'Segoe Script', 'Great Vibes', cursive",
  };

  const THREAD_COLORS = [
    { name: 'Metallic Gold', hex: '#d4af37' },
    { name: 'Pure White', hex: '#ffffff' },
    { name: 'Obsidian Black', hex: '#1c1917' },
    { name: 'Silver Platinum', hex: '#e2e8f0' },
    { name: 'Royal Navy', hex: '#1e3a8a' },
    { name: 'Crimson Red', hex: '#b91c1c' },
    { name: 'Emerald Green', hex: '#047857' },
    { name: 'Rose Blush', hex: '#fb7185' },
  ];

  // Sync state when product opens
  useEffect(() => {
    if (product) {
      setQuantity(1);
      setIsPersonalized(false);
      setCustomText('');
      setActionError(null);
      setMonogramError(null);
      setThreadColor({ name: 'Metallic Gold', hex: '#d4af37' });
      if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        setSelectedVariant(product.variants[0]);
        setSelectedColor(product.variants[0].color || '');
        setSelectedSize(product.variants[0].size || '');
      } else {
        setSelectedVariant(null);
        setSelectedColor('');
        setSelectedSize('');
      }
      
      // Fetch real live shop queue load from backend capacity API
      import('@/lib/api').then(({ api }) => {
        api.get<{ activeOrders: number; activeMachines: number; estimatedMinutes: number }>('/api/customer/capacity')
          .then((res) => {
            if (res) {
              setCapacityData({
                activeOrders: res.activeOrders ?? 0,
                estimatedMinutes: res.estimatedMinutes ?? 15,
              });
            }
          })
          .catch(() => {});
      });
    }
  }, [product, isOpen]);

  if (!product) return null;

  const productId = product.id || product._id || '';
  const effectivePrice = selectedVariant?.priceOverride ?? product.price;

  // Unified pooled stock: supplies are acquired in assorted mixed colors, so all variants share the product stock pool
  const overallStock = product.availableStock !== undefined ? product.availableStock : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
  const effectiveStock = overallStock;
  const isOutOfStock = effectiveStock <= 0;

  // Check if product actually has defined sizes across variants
  const hasVariants = Boolean(product.variants && Array.isArray(product.variants) && product.variants.length > 0);
  const availableSizes = hasVariants 
    ? [...new Set(product.variants!.map((v: any) => v.size).filter(Boolean))] 
    : [];
  const hasSizes = availableSizes.length > 0;



  const handleAdd = () => {
    setActionError(null);
    setMonogramError(null);

    if (!isAuthenticated) {
      setActionError('Please sign in to add items to your basket.');
      showToast('Please sign in to add items to your basket', 'info');
      setAuthOpen(true, 'login');
      return false;
    }
    if (isOutOfStock) {
      const err = `Sorry, "${product.name}" is currently out of stock.`;
      setActionError(err);
      showToast(err, 'error');
      return false;
    }

    const trimmedCustomText = customText.trim();
    if (isPersonalized && !trimmedCustomText) {
      setMonogramError('Please enter the name or monogram text to embroider.');
      setActionError('Personalization text is required before adding to basket.');
      showToast('Please enter the name or monogram text to embroider.', 'error');
      return false;
    }

    const existing = items.find(
      (i) =>
        i.productId === productId &&
        i.selectedVariant === selectedVariant?.name &&
        i.selectedSize === selectedSize &&
        (i.personalization?.text || '') === (isPersonalized ? trimmedCustomText : '')
    );
    const existingQty = existing ? existing.quantity : 0;
    if (existingQty + quantity > effectiveStock) {
      const err = `Sorry, only ${effectiveStock} units available for ${selectedVariant?.name ? `variant "${selectedVariant.name}"` : `"${product.name}"`}.`;
      setActionError(err);
      showToast(err, 'error');
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
      personalization: isPersonalized && trimmedCustomText
        ? {
            text: trimmedCustomText,
            font: DEFAULT_FONT.name,
            threadColor: threadColor.name,
            threadHex: threadColor.hex,
          }
        : undefined,
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
        <div className="bg-bg-surface/50 flex flex-col items-center justify-center p-6 relative border-r border-border-glass max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:h-[220px] max-[900px]:p-4 max-[650px]:h-[180px]">
          <div className="w-full max-w-[320px] aspect-square rounded-[24px] overflow-hidden bg-bg-surface shadow-sm border border-border-glass max-[900px]:max-w-[180px] max-[650px]:max-w-[140px] relative">
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
              ₱{(effectivePrice * quantity).toFixed(2)}
              {quantity > 1 && <span className="text-xs text-text-dim font-sans ml-2">(₱{effectivePrice.toFixed(2)} each)</span>}
            </div>
            <span className="text-xs text-text-dim font-medium">Stock: {effectiveStock} available</span>
          </div>

          <p className="text-text-dim leading-relaxed text-[0.88rem] m-0 max-[650px]:text-[0.8rem] line-clamp-3">
            {product.description || 'Professional embroidery design optimized for high-speed production.'}
          </p>

          {/* Live Shop Wait Time Indicator (Direct, grounded in active machine queue) */}
          <div className="flex items-center gap-2 text-xs text-text-dim">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>
              Estimated Wait Time:{' '}
              <strong className="text-text-main font-semibold">
                {capacityData ? (
                  capacityData.estimatedMinutes <= 15
                    ? '~10–15 mins'
                    : capacityData.estimatedMinutes >= 60
                      ? `~${Math.floor(capacityData.estimatedMinutes / 60)}h ${capacityData.estimatedMinutes % 60 > 0 ? `${capacityData.estimatedMinutes % 60}m` : ''}`.trim()
                      : `~${capacityData.estimatedMinutes} mins`
                ) : (
                  'Checking wait time...'
                )}
              </strong>
            </span>
          </div>

          {/* Variants & Swatches (Only shown if product has variants) */}
          {hasVariants && (
            <div className="flex flex-col gap-2 border-t border-border-glass pt-3">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Color / Variant: <span className="text-primary font-bold normal-case ml-1">{selectedVariant?.name}</span>
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
                          ? 'bg-primary/20 border-primary text-primary shadow-sm scale-105'
                          : 'bg-bg-surface border-border-glass text-text-main hover:border-primary/40'
                      }`}
                    >
                      {variant.color && (
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20 inline-block shadow-sm shrink-0"
                          style={{ backgroundColor: variant.color }}
                        />
                      )}
                      <span>{variant.name}</span>
                      {variant.priceOverride && (
                        <span className="text-[10px] text-primary/80 font-mono">
                          ₱{variant.priceOverride}
                        </span>
                      )}
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
                        ? 'bg-primary/20 border-primary text-primary shadow-sm'
                        : 'bg-bg-surface border-border-glass text-text-dim hover:text-text-main'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Embroidery Personalization (Lettering / Monogram) */}
          <div className="flex flex-col gap-2.5 border-t border-border-glass pt-3 bg-white/[0.02] -mx-2 px-3 py-3 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-main flex items-center gap-1.5 cursor-pointer">
                <span>🪡</span>
                <span>Custom Embroidery Lettering</span>
              </label>
              <button
                type="button"
                onClick={() => setIsPersonalized(!isPersonalized)}
                className={`text-[0.72rem] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  isPersonalized
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-white/5 border-border-glass text-text-dim hover:text-text-main'
                }`}
              >
                {isPersonalized ? '✓ Included' : '+ Add Name/Text'}
              </button>
            </div>

            {isPersonalized && (
              <div className="flex flex-col gap-3 pt-1 animate-[fadeIn_0.2s_ease-out]">
                {/* Text input */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[0.7rem] text-text-dim">
                    <span>Name or Monogram Text</span>
                    <span>{customText.length}/25</span>
                  </div>
                  <input
                    type="text"
                    maxLength={25}
                    value={customText}
                    onChange={(e) => {
                      setCustomText(e.target.value);
                      if (monogramError) setMonogramError(null);
                      if (actionError) setActionError(null);
                    }}
                    placeholder="e.g. Dr. Rafael Santos or R.S."
                    className={`w-full bg-bg-surface border ${
                      monogramError ? 'border-rose-500/60 ring-1 ring-rose-500/30' : 'border-border-glass'
                    } focus:border-primary p-2.5 rounded-xl text-xs text-text-main placeholder:text-text-dim/40 outline-none transition-all font-medium`}
                  />
                  <InlineError message={monogramError} className="mt-1" />
                </div>

                {/* Live Stitch Typography Preview */}
                {customText.trim() && (
                  <div className="p-3 rounded-xl bg-black/40 border border-border-glass flex flex-col items-center justify-center text-center">
                    <span className="text-[0.65rem] uppercase tracking-wider text-text-dim mb-1">
                      Stitch Preview ({threadColor.name} • Cursive Script)
                    </span>
                    <span
                      className="text-lg font-bold tracking-wide transition-all"
                      style={{
                        color: threadColor.hex,
                        fontFamily: DEFAULT_FONT.fontCss,
                        textShadow: '0 0 10px rgba(0,0,0,0.5)',
                      }}
                    >
                      {customText}
                    </span>
                    <span className="text-[0.65rem] text-text-dim/70 mt-1 italic">
                      Standard computerized cursive embroidery lettering
                    </span>
                  </div>
                )}

                {/* Thread Color Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider flex items-center justify-between">
                    <span>Thread Color</span>
                    <span className="text-text-main normal-case font-medium">{threadColor.name}</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {THREAD_COLORS.map((tc) => {
                      const isSelected = threadColor.name === tc.name;
                      return (
                        <button
                          key={tc.name}
                          type="button"
                          onClick={() => setThreadColor(tc)}
                          title={tc.name}
                          className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                            isSelected
                              ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg-surface scale-110 border-white'
                              : 'border-white/20 hover:scale-105'
                          }`}
                          style={{ backgroundColor: tc.hex }}
                        >
                          {isSelected && (
                            <span
                              className={`text-[10px] font-bold ${
                                tc.hex === '#ffffff' || tc.hex === '#e2e8f0'
                                  ? 'text-black'
                                  : 'text-white'
                              }`}
                            >
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

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
                onClick={() => setQuantity((q) => Math.min(Math.max(1, effectiveStock), q + 1))}
                className="w-8 h-8 rounded-lg bg-white/5 border border-border-glass text-text-main hover:bg-white/10 flex items-center justify-center font-bold cursor-pointer transition-all"
              >
                +
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 mt-auto pt-4">
            <div className="flex gap-3 max-[650px]:gap-2">
              <GlassButton
                variant="secondary"
                onClick={handleAddToBasket}
                className="flex-1 py-3"
                disabled={isOutOfStock}
              >
                {isOutOfStock ? 'Variant Out of Stock' : 'Add to Basket'}
              </GlassButton>
              <GlassButton
                variant="primary"
                onClick={handleBuyNow}
                className="flex-1 py-3 font-bold shadow-sm"
                disabled={isOutOfStock}
              >
                {isOutOfStock ? 'Variant Out of Stock' : 'Buy Now'}
              </GlassButton>
            </div>
            <InlineError message={actionError} className="text-center" />
          </div>
        </div>
      </div>
    </GlassModal>
  );
}
