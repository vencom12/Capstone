'use client';

import { useState, useEffect } from 'react';
import type { Product, ProductVariant, ProductReviewsResponse } from '@/lib/types';
import { api } from '@/lib/api';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { showToast } from '@/components/ui/Toast';
import InlineError from '@/components/ui/InlineError';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import OptimizedImage from '@/components/ui/OptimizedImage';

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

  // Dynamic verified customer reviews state (Amazon/Shopee Standard)
  const [activeModalTab, setActiveModalTab] = useState<'configure' | 'reviews'>('configure');
  const [reviewsData, setReviewsData] = useState<ProductReviewsResponse | null>(null);
  const [isLoadingReviews, setIsLoadingReviews] = useState<boolean>(false);
  const [selectedStarFilter, setSelectedStarFilter] = useState<'all' | number>('all');

  useEffect(() => {
    if (!isOpen || !product?.id) {
      setReviewsData(null);
      setActiveModalTab('configure');
      setSelectedStarFilter('all');
      return;
    }

    let isMounted = true;
    setIsLoadingReviews(true);
    api.get<ProductReviewsResponse>(`/api/customer/products/${product.id}/reviews`)
      .then((data) => {
        if (isMounted && data) {
          setReviewsData(data);
        }
      })
      .catch((err) => {
        console.warn('Failed to load product reviews:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingReviews(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, product?.id]);

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
        // Automatically select the first IN-STOCK variant; if all are out of stock, select none
        const firstInStock = product.variants.find((v) => (v.availableStock !== undefined ? v.availableStock : (v.stock ?? 0)) > 0);
        if (firstInStock) {
          setSelectedVariant(firstInStock);
          setSelectedColor(firstInStock.color || '');
          setSelectedSize(firstInStock.size || '');
        } else {
          setSelectedVariant(null);
          setSelectedColor('');
          setSelectedSize('');
        }
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

  // Check if product actually has defined variants
  const hasVariants = Boolean(product.variants && Array.isArray(product.variants) && product.variants.length > 0);
  const availableSizes = hasVariants 
    ? [...new Set(product.variants!.map((v: any) => v.size).filter(Boolean))] 
    : [];
  const hasSizes = availableSizes.length > 0;

  // Variant-driven stock:
  // If product has 0 variants, it has strictly 0 stock and cannot be purchased.
  // If product has variants, stock is determined by the selected variant's availableStock!
  const selectedVariantStock = selectedVariant
    ? (selectedVariant.availableStock !== undefined ? selectedVariant.availableStock : (selectedVariant.stock ?? 0))
    : 0;
  const effectiveStock = hasVariants ? selectedVariantStock : 0;
  const isOutOfStock = !hasVariants || effectiveStock <= 0;



  const handleAdd = () => {
    setActionError(null);
    setMonogramError(null);

    if (isOutOfStock) {
      const err = `${product.name} is out of stock`;
      setActionError(err);
      showToast(err, 'error');
      return false;
    }

    const trimmedCustomText = customText.trim();
    if (isPersonalized && !trimmedCustomText) {
      setMonogramError('Please enter text to embroider.');
      setActionError('Personalization text is required.');
      showToast('Please enter text to embroider.', 'error');
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
      const err = `Only ${effectiveStock} in stock`;
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
    if (!handleAdd()) {
      return;
    }

    if (!isAuthenticated) {
      setActionError('Please sign in to proceed with checkout and place your order.');
      showToast('Please sign in to proceed with checkout', 'info');
      setAuthOpen(true, 'login');
      return;
    }

    onClose();
    if (onBuyNow) {
      onBuyNow();
    }
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[850px]" noPadding>
      <div className="grid grid-cols-[1fr_1.15fr] max-[900px]:grid-cols-1">
        {/* Image & Preview Section */}
        <div className="bg-bg-surface/50 flex flex-col items-center justify-center p-6 relative border-r border-border-glass max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:h-[220px] max-[900px]:p-4 max-[650px]:h-[180px]">
          <div className="w-full max-w-[320px] aspect-square rounded-[24px] overflow-hidden bg-bg-surface shadow-sm border border-border-glass max-[900px]:max-w-[180px] max-[650px]:max-w-[140px] relative">
            {(selectedVariant?.imageUrl || product.imageUrl) ? (
              <OptimizedImage
                src={selectedVariant?.imageUrl || product.imageUrl}
                alt={product.name}
                width={640}
                quality={85}
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
            {((reviewsData?.averageRating ?? (product as any).rating)) ? (
              <button
                type="button"
                onClick={() => setActiveModalTab('reviews')}
                className="flex items-center gap-2 mt-1.5 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/20 cursor-pointer transition-colors text-left"
                title="View verified buyer reviews"
              >
                <div className="flex items-center text-amber-400 text-xs">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className={i < Math.round((reviewsData?.averageRating ?? (product as any).rating) || 0) ? 'text-amber-400' : 'text-text-dim/30'}>★</span>
                  ))}
                </div>
                <span className="text-xs font-bold text-amber-300">
                  {((reviewsData?.averageRating ?? (product as any).rating) || 0).toFixed(1)}
                </span>
                <span className="text-[0.72rem] text-text-dim hover:text-text-main underline decoration-dotted">
                  ({reviewsData?.totalReviews ?? (product as any).reviewCount ?? 0} Verified Reviews)
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-text-dim font-medium">
                  Precision Machine Embroidery · Quality Inspected
                </span>
              </div>
            )}
          </div>

          {/* Navigation Tabs: Customization vs Reviews */}
          <div className="flex border-b border-border-glass gap-1 pt-1">
            <button
              type="button"
              onClick={() => setActiveModalTab('configure')}
              className={`pb-2 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                activeModalTab === 'configure'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-dim hover:text-text-main'
              }`}
            >
              Customization & Order
            </button>
            <button
              type="button"
              onClick={() => setActiveModalTab('reviews')}
              className={`pb-2 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeModalTab === 'reviews'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-dim hover:text-text-main'
              }`}
            >
              <span>Ratings & Reviews</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-text-main font-mono">
                {reviewsData?.totalReviews ?? (product as any).reviewCount ?? 0}
              </span>
            </button>
          </div>

          {activeModalTab === 'configure' ? (
            <>

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
          {hasVariants ? (
            <div className="flex flex-col gap-2 border-t border-border-glass pt-3">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Color / Variant:{' '}
                {selectedVariant ? (
                  <span className="text-primary font-bold normal-case ml-1">{selectedVariant.name}</span>
                ) : (
                  <span className="text-rose-400 font-bold normal-case ml-1">None available (All Options Out of Stock)</span>
                )}
              </label>
              <div className="flex flex-wrap gap-2">
                {product.variants!.map((variant, idx) => {
                  const isSelected = selectedVariant?.name === variant.name;
                  const vStock = variant.availableStock !== undefined ? variant.availableStock : (variant.stock ?? 0);
                  const isVarOutOfStock = vStock <= 0;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isVarOutOfStock}
                      title={isVarOutOfStock ? `${variant.name} (Out of Stock)` : `${variant.name} (${vStock} available)`}
                      suppressHydrationWarning
                      onClick={() => {
                        if (isVarOutOfStock) return;
                        setSelectedVariant(variant);
                        if (variant.color) setSelectedColor(variant.color);
                        if (variant.size) setSelectedSize(variant.size);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all select-none ${
                        isVarOutOfStock
                          ? 'opacity-35 grayscale bg-white/[0.02] border-white/10 text-text-dim cursor-not-allowed pointer-events-none line-through shadow-none'
                          : isSelected
                            ? 'bg-primary/20 border-primary text-primary shadow-sm scale-105 cursor-pointer'
                            : 'bg-bg-surface border-border-glass text-text-main hover:border-primary/40 cursor-pointer'
                      }`}
                    >
                      {variant.color && (
                        <span
                          className={`w-3.5 h-3.5 rounded-full border border-white/20 inline-block shadow-sm shrink-0 ${isVarOutOfStock ? 'opacity-40' : ''}`}
                          style={{ backgroundColor: variant.color }}
                        />
                      )}
                      <span>{variant.name}</span>
                      {isVarOutOfStock ? (
                        <span className="text-[10px] text-rose-400 font-semibold no-underline">
                          (Out of stock)
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-dim font-mono">
                          ({vStock} left)
                        </span>
                      )}
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
          ) : (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>This product currently has no variants configured and is out of stock.</span>
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
            {actionError && (
              <div className="flex flex-col items-center gap-1 mt-1">
                <InlineError error={actionError} className="w-full text-center" />
                {!isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => setAuthOpen(true, 'login')}
                    className="text-xs font-bold text-primary hover:underline bg-transparent border-none cursor-pointer py-1"
                  >
                    Click here to Sign In or Create an Account →
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ============================================================ */
        /* VERIFIED REVIEWS & RATINGS TAB (Amazon/Shopee Gold Standard) */
        /* ============================================================ */
        <div className="flex flex-col gap-4">
          {isLoadingReviews ? (
            <div className="p-8 flex flex-col items-center justify-center gap-2 text-center text-text-dim text-xs">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Loading verified customer ratings...</span>
            </div>
          ) : (
            <>
              {/* Rating Breakdown Header Card */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-border-glass flex flex-col sm:flex-row gap-4 items-center sm:items-start justify-between">
                <div className="flex flex-col items-center sm:items-start gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-text-main font-mono">
                      {reviewsData?.averageRating ? reviewsData.averageRating.toFixed(1) : '—'}
                    </span>
                    <span className="text-xs text-text-dim font-bold">/ 5.0</span>
                  </div>
                  <div className="flex items-center text-amber-400 text-sm">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={
                          i < Math.round(reviewsData?.averageRating || 0)
                            ? 'text-amber-400'
                            : 'text-text-dim/30'
                        }
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-[0.72rem] text-text-dim">
                    {reviewsData?.totalReviews
                      ? `Based on ${reviewsData.totalReviews} verified purchase${reviewsData.totalReviews > 1 ? 's' : ''}`
                      : 'No reviews yet'}
                  </span>
                </div>

                {/* Amazon/Shopee Star Histogram */}
                <div className="flex-1 w-full max-w-[240px] flex flex-col gap-1">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = reviewsData?.distribution?.[star as 1 | 2 | 3 | 4 | 5] || 0;
                    const total = reviewsData?.totalReviews || 0;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const isSelected = selectedStarFilter === star;

                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setSelectedStarFilter(isSelected ? 'all' : star)}
                        className={`w-full flex items-center gap-2 text-[0.7rem] py-0.5 px-1 rounded transition-colors cursor-pointer border ${
                          isSelected
                            ? 'bg-primary/15 border-primary/40 text-text-main'
                            : 'bg-transparent border-transparent hover:bg-white/5 text-text-dim'
                        }`}
                        title={`Filter by ${star} star reviews`}
                      >
                        <span className="w-6 font-bold flex items-center gap-0.5 shrink-0">
                          <span>{star}</span>
                          <span className="text-amber-400 text-[10px]">★</span>
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-12 text-right font-mono text-[0.65rem] shrink-0 text-text-dim">
                          {count} ({pct}%)
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Verified Authenticity Guarantee Banner */}
              <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-[0.72rem] text-emerald-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>
                  <strong>100% Authentic Feedback:</strong> Ratings can only be submitted by verified customers who completed an order of this embroidery item.
                </span>
              </div>

              {/* Star Filter Pills */}
              {reviewsData && reviewsData.totalReviews > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider mr-1">
                    Filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedStarFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[0.7rem] font-bold border cursor-pointer transition-all ${
                      selectedStarFilter === 'all'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
                    }`}
                  >
                    All ({reviewsData.totalReviews})
                  </button>
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = reviewsData.distribution?.[star as 1 | 2 | 3 | 4 | 5] || 0;
                    if (count === 0 && selectedStarFilter !== star) return null;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setSelectedStarFilter(selectedStarFilter === star ? 'all' : star)}
                        className={`px-2 py-1 rounded-lg text-[0.7rem] font-bold border cursor-pointer transition-all ${
                          selectedStarFilter === star
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
                        }`}
                      >
                        {star} ★ ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Reviews List Feed */}
              <div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto pr-1">
                {(() => {
                  const list = (reviewsData?.reviews || []).filter((r) =>
                    selectedStarFilter === 'all' ? true : r.rating === selectedStarFilter
                  );

                  if (list.length === 0) {
                    return (
                      <div className="p-8 rounded-xl bg-white/[0.02] border border-border-glass text-center flex flex-col items-center gap-2">
                        <span className="text-text-dim text-xs">
                          {selectedStarFilter === 'all'
                            ? 'No customer reviews recorded yet for this design.'
                            : `No ${selectedStarFilter}-star reviews found.`}
                        </span>
                        <span className="text-[0.7rem] text-text-dim/70">
                          Order this stitch today and be the first to share your verified review!
                        </span>
                      </div>
                    );
                  }

                  return list.map((review) => {
                    const initial = (review.customerName || 'V').trim().charAt(0).toUpperCase();
                    const highlightMatch = review.message?.match(/^\[Highlights:\s*(.+?)\]\s*/i);
                    const highlights = highlightMatch
                      ? highlightMatch[1].split(',').map((s) => s.trim())
                      : [];
                    const cleanMessage = highlightMatch
                      ? review.message.replace(/^\[Highlights:\s*(.+?)\]\s*/i, '').trim()
                      : review.message;

                    return (
                      <div
                        key={review.id}
                        className="p-3.5 rounded-xl bg-white/[0.03] border border-border-glass flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 text-primary font-bold text-xs flex items-center justify-center">
                              {initial}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-text-main">
                                {review.customerName || 'Verified Customer'}
                              </span>
                              <span className="text-[0.65rem] text-text-dim">
                                {review.createdAt
                                  ? new Date(review.createdAt).toLocaleDateString(undefined, {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : 'Verified Purchase'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[0.65rem] font-bold">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Verified</span>
                          </div>
                        </div>

                        {/* Stars & Order Tag */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-amber-400 text-xs">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span
                                key={i}
                                className={i < review.rating ? 'text-amber-400' : 'text-text-dim/30'}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                          {review.orderId && (
                            <span className="text-[0.65rem] font-mono text-text-dim">
                              Order #{review.orderId}
                            </span>
                          )}
                        </div>

                        {/* Quality Highlight Tags */}
                        {highlights.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {highlights.map((h, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[0.65rem] font-medium"
                              >
                                {h}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Review Content */}
                        {cleanMessage && (
                          <p className="text-xs text-text-main/90 leading-relaxed m-0">
                            {cleanMessage}
                          </p>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Return to Order Button */}
              <div className="pt-2 border-t border-border-glass">
                <button
                  type="button"
                  onClick={() => setActiveModalTab('configure')}
                  className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-light text-white font-bold text-xs cursor-pointer border-none shadow-sm transition-all"
                >
                  Return to Customization & Order →
                </button>
              </div>
            </>
          )}
        </div>
      )}
        </div>
      </div>
    </GlassModal>
  );
}
