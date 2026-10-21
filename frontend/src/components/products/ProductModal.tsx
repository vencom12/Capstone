'use client';

import { useState, useEffect, useMemo } from 'react';
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
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [imageFit, setImageFit] = useState<'cover' | 'contain'>('cover');
  const [customActiveImage, setCustomActiveImage] = useState<string | null>(null);

  // Collect distinct gallery photos from product and its variants
  const galleryItems = useMemo(() => {
    if (!product) return [];
    const items: Array<{ imageUrl: string; label: string; variant?: ProductVariant }> = [];
    if (product.imageUrl) {
      items.push({ imageUrl: product.imageUrl, label: product.name });
    }
    if (product.variants && Array.isArray(product.variants)) {
      product.variants.forEach((v) => {
        if (v.imageUrl && !items.some((i) => i.imageUrl === v.imageUrl)) {
          items.push({ imageUrl: v.imageUrl, label: v.name, variant: v });
        }
      });
    }
    return items;
  }, [product]);

  const activeImage = customActiveImage || selectedVariant?.imageUrl || product?.imageUrl || '';

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
        console.warn('Product reviews notice (using fallback):', err?.message || err);
        if (isMounted) {
          setReviewsData({
            success: true,
            productId: product.id,
            averageRating: null,
            totalReviews: 0,
            distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            reviews: []
          });
        }
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
      setCustomActiveImage(null);
      setIsZoomed(false);
      setImageFit('cover');
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
      <div className="grid grid-cols-[1fr_1.15fr] max-[700px]:grid-cols-1">
        {/* Full-Bleed Image & Preview Section */}
        <div className="relative w-full h-full min-h-[440px] max-[700px]:h-[260px] max-[700px]:max-h-[35vh] max-[700px]:min-h-0 bg-black/40 flex items-center justify-center overflow-hidden border-r border-border-glass max-[700px]:border-r-0 max-[700px]:border-b group select-none">
          {activeImage ? (
            <div
              onClick={() => setIsZoomed(!isZoomed)}
              className="w-full h-full flex items-center justify-center cursor-zoom-in relative overflow-hidden"
              title={isZoomed ? "Click to zoom out" : "Click to zoom in"}
            >
              <OptimizedImage
                src={activeImage}
                alt={product.name}
                width={800}
                quality={90}
                className={`w-full h-full transition-all duration-500 ease-out ${
                  imageFit === 'contain' ? 'object-contain p-4' : 'object-cover'
                } ${isZoomed ? 'scale-135' : 'scale-100 group-hover:scale-105'}`}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-dim text-xs tracking-wider font-semibold">
              STITCH PREVIEW
            </div>
          )}

          {/* Top-Left Floating Overlay Badge */}
          <div className="absolute top-3 left-3 pointer-events-none z-10">
            {isOutOfStock ? (
              <span className="bg-red-500/90 text-white text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider backdrop-blur-md shadow-md">
                Out of Stock
              </span>
            ) : effectiveStock <= 5 ? (
              <span className="bg-amber-500/90 text-white text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider backdrop-blur-md shadow-md">
                Only {effectiveStock} Left
              </span>
            ) : (
              <span className="bg-black/60 text-text-main border border-white/10 text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider backdrop-blur-md shadow-sm">
                {product.tag || 'Handcrafted'}
              </span>
            )}
          </div>

          {/* Bottom-Right View Mode & Zoom Control Toggle (Separated from top close button) */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 pointer-events-auto z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setImageFit(imageFit === 'cover' ? 'contain' : 'cover');
              }}
              className="w-8 h-8 rounded-lg bg-black/70 hover:bg-black/90 border border-white/20 text-white/90 hover:text-white flex items-center justify-center backdrop-blur-md cursor-pointer transition-all active:scale-95 shadow-lg"
              title={imageFit === 'cover' ? 'Fit entire image' : 'Fill frame'}
              aria-label="Toggle image fit"
            >
              {imageFit === 'cover' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsZoomed(!isZoomed);
              }}
              className={`w-8 h-8 rounded-lg bg-black/70 hover:bg-black/90 border border-white/20 text-white/90 hover:text-white flex items-center justify-center backdrop-blur-md cursor-pointer transition-all active:scale-95 shadow-lg ${
                isZoomed ? 'text-primary border-primary/50 bg-primary/20' : ''
              }`}
              title={isZoomed ? 'Reset zoom' : 'Zoom inspection'}
              aria-label="Zoom photo"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
          </div>

          {/* Bottom-Left Floating Variant Thumbnails Gallery */}
          {galleryItems.length > 1 && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 z-20 pointer-events-auto max-w-[calc(100%-85px)] overflow-x-auto no-scrollbar">
              <div className="bg-black/70 backdrop-blur-md border border-white/15 p-1 rounded-xl shadow-2xl flex items-center gap-1.5">
                {galleryItems.map((item, idx) => {
                  const isSelected = activeImage === item.imageUrl;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomActiveImage(item.imageUrl);
                        if (item.variant) {
                          setSelectedVariant(item.variant);
                          if (item.variant.color) setSelectedColor(item.variant.color);
                          if (item.variant.size) setSelectedSize(item.variant.size);
                        }
                      }}
                      className={`relative w-9 h-9 rounded-lg overflow-hidden border transition-all cursor-pointer shrink-0 ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/40 scale-105 opacity-100'
                          : 'border-white/15 hover:border-white/40 opacity-60 hover:opacity-100'
                      }`}
                      title={item.label}
                    >
                      <img src={item.imageUrl} alt={item.label} className="w-full h-full object-cover" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Product Customization & Info Section */}
        <div className="p-6 flex flex-col gap-4 text-left max-[700px]:p-4 max-[700px]:gap-3">
          <div>
            <span className="inline-block px-2.5 py-1 bg-primary/10 text-primary rounded-md text-xs font-bold uppercase tracking-wider mb-2">
              {product.tag || 'Design'}
            </span>
            <h2 className="text-2xl font-extrabold leading-tight m-0 text-text-main max-[700px]:text-lg">
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
                  ({reviewsData?.totalReviews ?? (product as any).reviewCount ?? 0} Verified {(reviewsData?.totalReviews ?? (product as any).reviewCount ?? 0) === 1 ? 'Review' : 'Reviews'})
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
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-text-main font-mono">
                {reviewsData?.totalReviews ?? (product as any).reviewCount ?? 0}
              </span>
            </button>
          </div>

          {activeModalTab === 'configure' ? (
            <>

          <div className="flex justify-between items-center">
            <div className="text-2xl font-extrabold text-primary font-mono max-[700px]:text-xl">
              ₱{(effectivePrice * (isOutOfStock ? 1 : quantity)).toFixed(2)}
              {quantity > 1 && !isOutOfStock && <span className="text-xs text-text-dim font-sans ml-2">(₱{effectivePrice.toFixed(2)} each)</span>}
            </div>
            {isOutOfStock ? (
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold text-xs uppercase tracking-wider">
                Out of Stock
              </span>
            ) : (
              <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                effectiveStock <= 5 
                  ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400' 
                  : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
              }`}>
                {effectiveStock <= 5 ? `Only ${effectiveStock} left` : `In Stock (${effectiveStock} available)`}
              </span>
            )}
          </div>

          <p className="text-text-dim leading-relaxed text-[0.88rem] m-0 max-[700px]:text-[0.8rem] line-clamp-3">
            {product.description || 'Professional embroidery design optimized for high-speed production.'}
          </p>

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
                        setCustomActiveImage(null);
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
            <div className="p-3 rounded-xl bg-white/5 border border-border-glass text-text-dim text-xs flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
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
          <div className="flex flex-col gap-2.5 border-t border-border-glass pt-3 bg-white/[0.02] -mx-2 px-3 py-3 rounded-xl border border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-main flex items-center gap-1.5 cursor-pointer">
                <span>🪡</span>
                <span>Custom Embroidery Lettering</span>
              </label>
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => {
                  if (isOutOfStock) return;
                  setIsPersonalized(!isPersonalized);
                }}
                className={`text-[0.72rem] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                  isOutOfStock
                    ? 'opacity-40 cursor-not-allowed bg-white/5 border-border-glass text-text-dim'
                    : isPersonalized
                      ? 'bg-primary/20 border-primary text-primary cursor-pointer'
                      : 'bg-white/5 border-border-glass text-text-dim hover:text-text-main cursor-pointer'
                }`}
              >
                {isOutOfStock ? 'Unavailable' : isPersonalized ? '✓ Included' : '+ Add Name/Text'}
              </button>
            </div>

            {isPersonalized && (
              <div className="flex flex-col gap-3 pt-1 animate-[fadeIn_0.2s_ease-out]">
                {/* Estimated Stitching Time (Applies only when personalizing) */}
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-border-glass text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0 inline-block"></span>
                    <span className="text-[0.72rem] text-text-dim font-medium">
                      Estimated artisan stitching:
                    </span>
                  </div>
                  <strong className="text-text-main font-mono text-xs font-bold">
                    {(() => {
                      const letters = customText.replace(/\s+/g, '').length || 5;
                      const mins = Math.max(1, Math.ceil(1.0 + (letters * 0.20)));
                      return `~${mins} ${mins === 1 ? 'min' : 'mins'}`;
                    })()}
                  </strong>
                </div>

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
                    } focus:border-primary p-2.5 rounded-lg text-xs text-text-main placeholder:text-text-dim/40 outline-none transition-all font-medium`}
                  />
                  <InlineError message={monogramError} className="mt-1" />
                </div>

                {/* Live Stitch Typography Preview */}
                {customText.trim() && (
                  <div className="p-3 rounded-xl bg-black/40 border border-border-glass flex flex-col items-center justify-center text-center">
                    <span className="text-[0.65rem] uppercase tracking-wider text-text-dim mb-1">
                      Stitch Preview ({threadColor.name} • Standard Artisan Script)
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
                    <span className="text-[0.65rem] text-text-dim/70 mt-1">
                      Standard font &amp; size • Hand-guided sewing machine embroidery
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
            <div className={`flex items-center gap-3 bg-bg-surface border border-border-glass p-1 rounded-xl ${isOutOfStock ? 'opacity-40 pointer-events-none' : ''}`}>
              <button
                type="button"
                disabled={isOutOfStock || quantity <= 1}
                suppressHydrationWarning
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg bg-white/5 border border-border-glass text-text-main hover:bg-white/10 flex items-center justify-center font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                -
              </button>
              <span className="font-mono font-bold text-sm w-6 text-center">{isOutOfStock ? 0 : quantity}</span>
              <button
                type="button"
                disabled={isOutOfStock || quantity >= effectiveStock}
                suppressHydrationWarning
                onClick={() => setQuantity((q) => Math.min(effectiveStock, q + 1))}
                className="w-8 h-8 rounded-lg bg-white/5 border border-border-glass text-text-main hover:bg-white/10 flex items-center justify-center font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                +
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 mt-auto pt-4">
            {isOutOfStock ? (
              <GlassButton
                variant="secondary"
                fullWidth
                disabled
                className="py-3 font-bold opacity-60 cursor-not-allowed bg-white/5 border-border-glass text-text-dim"
              >
                Out of Stock
              </GlassButton>
            ) : (
              <div className="flex gap-3 max-[700px]:gap-2">
                <GlassButton
                  variant="secondary"
                  onClick={handleAddToBasket}
                  className="flex-1 py-3"
                >
                  Add to Basket
                </GlassButton>
                <GlassButton
                  variant="primary"
                  onClick={handleBuyNow}
                  className="flex-1 py-3 font-bold shadow-sm"
                >
                  Buy Now
                </GlassButton>
              </div>
            )}
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
              {/* Shopee-Style Rating Breakdown Header Card */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-border-glass flex flex-col sm:flex-row gap-4 items-center justify-between">
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
                      ? `${reviewsData.totalReviews} verified rating${reviewsData.totalReviews > 1 ? 's' : ''}`
                      : 'No reviews yet'}
                  </span>
                </div>

                {/* Shopee-Style Satisfaction Metric / Trust Meter */}
                {reviewsData && reviewsData.totalReviews > 0 && (
                  <div className="flex-1 w-full max-w-[280px] flex flex-col gap-2">
                    {(() => {
                      const fiveStar = reviewsData.distribution?.[5] || 0;
                      const fourStar = reviewsData.distribution?.[4] || 0;
                      const positiveCount = fiveStar + fourStar;
                      const positivePct = Math.round((positiveCount / reviewsData.totalReviews) * 100);
                      
                      return (
                        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-text-dim flex items-center gap-1.5 font-medium text-[0.72rem]">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim shrink-0">
                                <path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
                              </svg>
                              <span>Positive Reviews</span>
                            </span>
                            <span className="font-mono font-bold text-text-main text-xs">{positivePct}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-white/60 rounded-full transition-all duration-500"
                              style={{ width: `${positivePct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[0.65rem] text-text-dim/80 pt-0.5">
                            <span>Verified Orders</span>
                            <span>Quality Stitching</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Star Filter Pills (Shown only when there are multiple rating tiers to filter) */}
              {(() => {
                if (!reviewsData || reviewsData.totalReviews <= 1) return null;
                const distinctTiers = [5, 4, 3, 2, 1].filter(
                  (star) => (reviewsData.distribution?.[star as 1 | 2 | 3 | 4 | 5] || 0) > 0
                );
                if (distinctTiers.length <= 1) return null;

                return (
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
                    {distinctTiers.map((star) => {
                      const count = reviewsData.distribution?.[star as 1 | 2 | 3 | 4 | 5] || 0;
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
                );
              })()}

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
                        className="p-3.5 rounded-xl bg-white/[0.03] border border-border-glass flex flex-col gap-2.5 transition-all hover:border-white/20"
                      >
                        {/* Top Line: Avatar + Customer Name + Verified Badge + Stars */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                              {initial}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-text-main truncate">
                                  {review.customerName || 'Verified Customer'}
                                </span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold leading-none shrink-0">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>Verified</span>
                                </span>
                                {review.isFeatured && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-bold leading-none shrink-0">
                                    <span>★</span>
                                    <span>Featured</span>
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[0.65rem] text-text-dim mt-0.5">
                                <span>
                                  {review.createdAt
                                    ? new Date(review.createdAt).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })
                                    : 'Verified Purchase'}
                                </span>
                                {review.orderId && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-text-dim/80">#{review.orderId}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Stars */}
                          <div className="flex items-center text-amber-400 text-xs shrink-0">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span
                                key={i}
                                className={i < review.rating ? 'text-amber-400' : 'text-text-dim/30'}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Customer Quote / Review Content */}
                        {cleanMessage && (
                          <div className="pl-2.5 border-l-2 border-primary/40 py-0.5">
                            <p className="text-xs text-text-main leading-relaxed m-0 italic">
                              "{cleanMessage}"
                            </p>
                          </div>
                        )}

                        {/* Quality Highlight Tags (Option B: Compact Top 3 with +Count) */}
                        {highlights.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            {highlights.slice(0, 3).map((h, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:text-text-main text-[0.65rem] font-medium transition-colors"
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-400 shrink-0">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>{h}</span>
                              </span>
                            ))}
                            {highlights.length > 3 && (
                              <span
                                className="text-[0.62rem] text-text-dim/70 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/5 cursor-default"
                                title={highlights.slice(3).join(', ')}
                              >
                                +{highlights.length - 3} more
                              </span>
                            )}
                          </div>
                        )}

                        {/* Official Store Response (Merchant Public Reply) */}
                        {review.merchantReply && (
                          <div className="mt-2 p-3 rounded-xl bg-primary/10 border border-primary/25 flex flex-col gap-1 text-xs">
                            <div className="flex items-center gap-1.5 text-primary font-bold text-[0.72rem]">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              <span>Official Store Response — Eds Towels &amp; Caps</span>
                              <span className="text-[0.65rem] text-text-dim ml-auto font-normal">
                                {review.merchantReplyAt
                                  ? new Date(review.merchantReplyAt).toLocaleDateString(undefined, {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : 'Store Owner'}
                              </span>
                            </div>
                            <p className="m-0 text-text-main text-[0.78rem] leading-relaxed italic">
                              "{review.merchantReply}"
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Clear High-Intent CTA from Reviews Tab */}
              <div className="pt-2 border-t border-border-glass">
                <button
                  type="button"
                  onClick={() => setActiveModalTab('configure')}
                  className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-light text-white font-bold text-xs cursor-pointer border-none shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <span>Choose Color &amp; Preview Embroidery</span>
                  <span className="font-mono opacity-90">• ₱{effectivePrice.toFixed(2)}</span>
                  <span>→</span>
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
