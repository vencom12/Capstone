'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Product, ProductVariant, ProductReviewsResponse, BasketItem } from '@/lib/types';
import { api } from '@/lib/api';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { useProductStore } from '@/stores/useProductStore';
import { showToast } from '@/components/ui/Toast';
import InlineError from '@/components/ui/InlineError';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import OptimizedImage from '@/components/ui/OptimizedImage';
import ProductImagePlaceholder from '@/components/ui/ProductImagePlaceholder';
import { isValidProductImage } from '@/lib/imageOptimizer';
import QuantityInput from '@/components/ui/QuantityInput';
import {
  MAX_CHARS_PER_LINE,
  resolveProductGarmentSize,
  sanitizeSingleLineText,
  sanitizeBulkMultilineText,
  calculateLetteringCost,
  parseBulkLetteringLines,
} from '@/lib/letteringPricing';

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onBuyNow?: (expressItem?: BasketItem) => void;
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
  const [variantError, setVariantError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [capacityData, setCapacityData] = useState<{
    activeOrders: number;
    estimatedMinutes: number;
    queueWaitMinutes?: number;
    readyLabel?: string;
    estimatedReadyDate?: string;
    queuedBulkPieces?: number;
    maxBulkPiecesPerPeriod?: number;
    batchThrottlePeriod?: string;
    preOrderPrepDays?: number;
  } | null>(null);
  const [letteringRates, setLetteringRates] = useState<{ smallRate: number; bigRate: number; preOrderPrepDays: number }>({
    smallRate: 7,
    bigRate: 10,
    preOrderPrepDays: 3,
  });
  // Unified lettering state: actively detects single vs. multiline bulk input
  const [preOrderAccepted, setPreOrderAccepted] = useState<boolean>(false);

  // Dynamic verified customer reviews state (Amazon/Shopee Standard)
  const [activeModalTab, setActiveModalTab] = useState<'configure' | 'reviews'>('configure');
  const [reviewsData, setReviewsData] = useState<ProductReviewsResponse | null>(null);
  const [isLoadingReviews, setIsLoadingReviews] = useState<boolean>(false);
  const [selectedStarFilter, setSelectedStarFilter] = useState<'all' | number>('all');
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [imageFit, setImageFit] = useState<'cover' | 'contain'>('cover');
  const [customActiveImage, setCustomActiveImage] = useState<string | null>(null);
  const [isOrderSubmitted, setIsOrderSubmitted] = useState<boolean>(false);

  // Real-time live stock tracking and concurrent purchase alerts
  const [liveStockAlert, setLiveStockAlert] = useState<{ message: string; type: 'sold_out' | 'decreased' } | null>(null);
  const prevStockMapRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) {
      setLiveStockAlert(null);
      prevStockMapRef.current = {};
    }
  }, [isOpen]);

  // Keep selectedVariant and effective stock actively synchronized when product updates via WebSocket
  useEffect(() => {
    if (!product || !isOpen) return;

    if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
      if (selectedVariant) {
        const freshVariant = product.variants.find(
          (v: any) => v && v.name && v.name.trim().toLowerCase() === selectedVariant.name.trim().toLowerCase()
        );
        if (freshVariant) {
          const oldStock = selectedVariant.availableStock !== undefined ? selectedVariant.availableStock : (selectedVariant.stock ?? 0);
          const newStock = freshVariant.availableStock !== undefined ? freshVariant.availableStock : (freshVariant.stock ?? 0);

          if (oldStock !== newStock || freshVariant.priceOverride !== selectedVariant.priceOverride) {
            setSelectedVariant(freshVariant);
            if (newStock < oldStock) {
              const boughtCount = oldStock - newStock;
              if (newStock <= 0) {
                setLiveStockAlert({
                  message: `Someone just bought ${boughtCount} ${freshVariant.name} (now sold out)`,
                  type: 'sold_out',
                });
              } else {
                setLiveStockAlert({
                  message: `Someone just bought ${boughtCount} ${freshVariant.name}`,
                  type: 'decreased',
                });
              }
            }
          }
        }
      }
    } else {
      const currentStock = product.availableStock !== undefined ? product.availableStock : (product.count ?? 0);
      const prevStock = prevStockMapRef.current[product.id];
      if (prevStock !== undefined && currentStock < prevStock) {
        const boughtCount = prevStock - currentStock;
        if (currentStock <= 0) {
          setLiveStockAlert({
            message: `Someone just bought ${boughtCount} ${product.name} (now sold out)`,
            type: 'sold_out',
          });
        } else {
          setLiveStockAlert({
            message: `Someone just bought ${boughtCount} ${product.name}`,
            type: 'decreased',
          });
        }
      }
      prevStockMapRef.current[product.id] = currentStock;
    }
  }, [product, isOpen, selectedVariant]);

  useEffect(() => {
    if (!isOpen) {
      setIsOrderSubmitted(false);
    }
  }, [isOpen]);

  // Collect distinct gallery photos from product and its variants
  const galleryItems = useMemo(() => {
    if (!product) return [];
    const items: Array<{ imageUrl: string; label: string; variant?: ProductVariant }> = [];
    if (isValidProductImage(product.imageUrl)) {
      items.push({ imageUrl: product.imageUrl!, label: product.name });
    }
    if (product.variants && Array.isArray(product.variants)) {
      product.variants.forEach((v) => {
        if (isValidProductImage(v.imageUrl) && !items.some((i) => i.imageUrl === v.imageUrl)) {
          items.push({ imageUrl: v.imageUrl!, label: v.name, variant: v });
        }
      });
    }
    return items;
  }, [product]);

  // Split variants into in-stock and out-of-stock options
  const { inStockVariants, outOfStockVariants } = useMemo(() => {
    if (!product?.variants || !Array.isArray(product.variants)) {
      return { inStockVariants: [] as ProductVariant[], outOfStockVariants: [] as ProductVariant[] };
    }
    const inStock: ProductVariant[] = [];
    const outOfStock: ProductVariant[] = [];
    product.variants.forEach((v) => {
      const stock = v.availableStock !== undefined ? v.availableStock : (v.stock ?? 0);
      if (stock > 0) inStock.push(v);
      else outOfStock.push(v);
    });
    return { inStockVariants: inStock, outOfStockVariants: outOfStock };
  }, [product?.variants]);

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
  interface StudioThreadColor {
    name: string;
    hex: string;
    isAvailable?: boolean;
  }

  const THREAD_COLORS: StudioThreadColor[] = [
    { name: 'Metallic Gold', hex: '#d4af37', isAvailable: true },
    { name: 'Pure White', hex: '#ffffff', isAvailable: true },
    { name: 'Obsidian Black', hex: '#1c1917', isAvailable: true },
    { name: 'Silver Platinum', hex: '#e2e8f0', isAvailable: true },
    { name: 'Royal Navy', hex: '#1e3a8a', isAvailable: true },
    { name: 'Crimson Red', hex: '#b91c1c', isAvailable: true },
    { name: 'Emerald Green', hex: '#047857', isAvailable: true },
    { name: 'Rose Blush', hex: '#fb7185', isAvailable: true },
  ];

  const [availableColors, setAvailableColors] = useState<StudioThreadColor[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('stitch_thread_colors_sync');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.colors && Array.isArray(parsed.colors) && parsed.colors.length > 0) {
            return parsed.colors;
          }
        }
      } catch (_) {}
    }
    return THREAD_COLORS;
  });

  const [threadColor, setThreadColor] = useState<{ name: string; hex: string }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('stitch_thread_colors_sync');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.colors && Array.isArray(parsed.colors) && parsed.colors.length > 0) {
            const firstActive = parsed.colors.find((c: any) => c.isAvailable !== false);
            if (firstActive) {
              return { name: firstActive.name, hex: firstActive.hex };
            }
          }
        }
      } catch (_) {}
    }
    return { name: 'Obsidian Black', hex: '#1c1917' };
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [monogramError, setMonogramError] = useState<string | null>(null);
  
  // Studio Machine Standard: One default formal cursive script
  const DEFAULT_FONT = {
    name: 'Classic Cursive Script',
    fontCss: "'Brush Script MT', 'Segoe Script', 'Great Vibes', cursive",
  };

  // Sync available studio thread colors from admin settings in real time
  const applyThreadColorConfig = (colors: any, notifyIfSwitched = false) => {
    let list = colors;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch (e) {}
    }
    if (!Array.isArray(list) || list.length === 0) return;

    const mapped: StudioThreadColor[] = list.map((c: any) => ({
      name: typeof c === 'string' ? c : String(c.name || ''),
      hex: typeof c === 'string' ? '#ffffff' : String(c.hex || '#ffffff'),
      isAvailable: typeof c === 'object' && c !== null ? c.isAvailable !== false : true,
    })).filter(c => c.name);

    setAvailableColors(mapped);

    // If currently selected color became unavailable, auto-switch to first available color
    setThreadColor((prevSelected) => {
      const match = mapped.find((c) => c.name === prevSelected.name);
      if (!match || match.isAvailable === false) {
        const firstActive = mapped.find((c) => c.isAvailable !== false);
        if (firstActive) {
          // Strictly only notify if:
          // 1. notifyIfSwitched is true (only passed by explicit live admin events, NEVER on reload/initial fetch)
          // 2. The modal is currently open AND user has enabled personalization
          // 3. The color switched was actually marked unavailable
          if (notifyIfSwitched && isOpen && isPersonalized && match && match.isAvailable === false) {
            showToast(`"${prevSelected.name}" thread is temporarily unavailable. Switched to ${firstActive.name}.`, 'warning');
          }
          return { name: firstActive.name, hex: firstActive.hex };
        }
      }
      return prevSelected;
    });
  };

  useEffect(() => {
    const fetchLatestColors = (shouldNotify = false) => {
      api.get<any>('/api/customer/settings')
        .then((res) => {
          if (res?.availableThreadColors) {
            applyThreadColorConfig(res.availableThreadColors, shouldNotify);
          }
          if (res) {
            setLetteringRates((prev) => ({
              smallRate: Number(res.smallGarmentLetterRate) || prev.smallRate || 7,
              bigRate: Number(res.bigGarmentLetterRate) || prev.bigRate || 10,
              preOrderPrepDays: res.preOrderPrepDays !== undefined ? Number(res.preOrderPrepDays) : prev.preOrderPrepDays,
            }));
          }
        })
        .catch(() => {});
    };

    // Immediate silent fetch on mount/reload (never notify)
    fetchLatestColors(false);

    const handleSettingsEvent = (e: any) => {
      if (e.detail?.availableThreadColors) {
        // Admin updated thread colors: notify if active customization affected
        applyThreadColorConfig(e.detail.availableThreadColors, true);
      } else {
        fetchLatestColors(false);
      }
    };

    const handleDataChanged = () => {
      fetchLatestColors(false);
    };

    const handleFocus = () => {
      fetchLatestColors(false);
      useProductStore.getState().fetchProducts();
    };

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('stitch_app_events');
      bc.onmessage = (event) => {
        if (event.data?.type === 'SETTINGS_UPDATED' && event.data?.availableThreadColors) {
          // Live cross-tab admin update: notify if active customization affected
          applyThreadColorConfig(event.data.availableThreadColors, true);
        }
      };
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'stitch_thread_colors_sync' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.colors) {
            // Live cross-tab storage change: notify if active customization affected
            applyThreadColorConfig(parsed.colors, true);
          }
        } catch (_) {}
      }
    };

    window.addEventListener('settingsUpdated', handleSettingsEvent);
    window.addEventListener('dataChanged', handleDataChanged);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);

    // Silent background poll while modal is open (checks settings and latest product stock)
    let interval: NodeJS.Timeout | null = null;
    if (isOpen) {
      interval = setInterval(() => {
        fetchLatestColors(false);
        useProductStore.getState().fetchProducts();
      }, 3000);
    }

    return () => {
      if (bc) bc.close();
      window.removeEventListener('settingsUpdated', handleSettingsEvent);
      window.removeEventListener('dataChanged', handleDataChanged);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      if (interval) clearInterval(interval);
    };
  }, [isOpen, isPersonalized, product]);

  const currentProductId = product?.id || (product as any)?._id || null;
  const lastProductIdRef = useRef<string | null>(null);

  // Sync state when product opens (resets ONLY when opening a different product, preserving user inputs when navigating back from checkout)
  useEffect(() => {
    if (product) {
      const isNewProduct = lastProductIdRef.current !== currentProductId;
      if (isNewProduct) {
        lastProductIdRef.current = currentProductId;
        setQuantity(1);
        setIsPersonalized(false);
        setCustomText('');
        setPreOrderAccepted(false);
        setActionError(null);
        setMonogramError(null);
        setCustomActiveImage(null);
        setIsZoomed(false);
        setImageFit('cover');
        const defaultColor = availableColors.find(c => c.isAvailable !== false) || availableColors[0] || { name: 'Metallic Gold', hex: '#d4af37' };
        setThreadColor({ name: defaultColor.name, hex: defaultColor.hex });
        if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
          const firstInStock = product.variants.find((v: any) => {
            const s = v.availableStock !== undefined ? v.availableStock : (v.stock ?? 0);
            return s > 0;
          });
          const initialVariant = firstInStock || product.variants[0];
          setSelectedVariant(initialVariant);
          setSelectedColor(initialVariant.color || '');
          setSelectedSize(initialVariant.size || '');
        } else {
          setSelectedVariant(null);
          setSelectedColor('');
          setSelectedSize('');
        }
        setVariantError(null);
      }
      
      // Fetch real live shop queue load from backend capacity API
      import('@/lib/api').then(({ api }) => {
        api.get<any>('/api/customer/capacity')
          .then((res) => {
            if (res) {
              setCapacityData({
                activeOrders: res.activeOrders ?? 0,
                estimatedMinutes: res.estimatedMinutes ?? 15,
                queueWaitMinutes: res.queueWaitMinutes ?? 0,
                readyLabel: res.readyLabel || 'Today during mall hours',
                estimatedReadyDate: res.estimatedReadyDate || null,
                queuedBulkPieces: res.queuedBulkPieces ?? 0,
                maxBulkPiecesPerPeriod: res.maxBulkPiecesPerPeriod ?? 50,
                batchThrottlePeriod: res.batchThrottlePeriod || 'week',
                preOrderPrepDays: res.preOrderPrepDays ?? 3,
              });
            }
          })
          .catch(() => {});
      });
    }
  }, [product, isOpen, currentProductId]);

    // Lettering extra pricing rule:
  // Uses Admin-configured Garment Size ('small' | 'big') and Admin-configured Small/Big rates.
  const garmentSize = resolveProductGarmentSize(product);
  const isBig = garmentSize === 'big';

  const bulkSummary = useMemo(() => {
    return parseBulkLetteringLines(customText, isBig, letteringRates);
  }, [customText, isBig, letteringRates]);

  const isMultiLine = isPersonalized && bulkSummary.lineCount > 1;

  const lettering = useMemo(() => {
    if (!product || !isPersonalized) {
      return {
        extraCost: 0,
        extraLettersCount: 0,
        ratePerLetter: isBig ? letteringRates.bigRate : letteringRates.smallRate,
        explanation: '',
      };
    }
    if (bulkSummary.lineCount > 1) {
      return {
        extraCost: bulkSummary.averageExtraCostPerUnit,
        extraLettersCount: bulkSummary.totalExtraLetters,
        ratePerLetter: bulkSummary.ratePerLetter,
        explanation:
          bulkSummary.totalExtraCost > 0
            ? `+₱${bulkSummary.totalExtraCost.toFixed(2)} across ${bulkSummary.lineCount} lines (${bulkSummary.totalExtraLetters} extra letters × ₱${bulkSummary.ratePerLetter})`
            : 'All first words included in base price (₱0 extra).',
      };
    }
    return calculateLetteringCost(customText, isBig, letteringRates);
  }, [product, isPersonalized, customText, isBig, letteringRates, bulkSummary]);

  // Estimated completion timeframe for Bulk / Pre-Order (must be above early return to satisfy Rules of Hooks)
  const estimatedPreOrderScheduleLabel = useMemo(() => {
    const bulkRate = capacityData?.maxBulkPiecesPerPeriod || 50;
    const period = capacityData?.batchThrottlePeriod || 'week';
    const queuedBulk = capacityData?.queuedBulkPieces || 0;
    const prepDays = capacityData?.preOrderPrepDays ?? letteringRates.preOrderPrepDays ?? 3;
    const totalPieces = queuedBulk + quantity;
    const periodsNeeded = Math.max(1, Math.ceil(totalPieces / Math.max(1, bulkRate)));
    if (period === 'week') {
      if (periodsNeeded <= 1 && prepDays <= 4) {
        return `Estimated ready in ~${Math.max(3, prepDays)}–7 days`;
      }
      return `Estimated ready in ~${periodsNeeded}–${periodsNeeded + 1} weeks (${bulkRate} pcs/week workshop schedule)`;
    }
    const totalDays = prepDays + periodsNeeded;
    return `Estimated ready in ~${totalDays}–${totalDays + 2} days`;
  }, [capacityData, quantity, letteringRates.preOrderPrepDays]);

  const productId = product ? (product.id || product._id || '') : '';
  const effectivePrice = product ? (selectedVariant?.priceOverride ?? product.price ?? 0) : 0;
  const totalExtraLetteringCost =
    isMultiLine
      ? bulkSummary.totalExtraCost
      : isPersonalized
      ? lettering.extraCost * quantity
      : 0;
  const finalUnitPrice =
    isMultiLine && quantity > 0
      ? effectivePrice + bulkSummary.totalExtraCost / quantity
      : effectivePrice + (isPersonalized ? lettering.extraCost : 0);
  const totalOrderPrice = effectivePrice * quantity + totalExtraLetteringCost;

  // Check if product actually has defined variants
  const hasVariants = Boolean(product?.variants && Array.isArray(product.variants) && product.variants.length > 0);
  const availableSizes = hasVariants 
    ? [...new Set(product!.variants!.map((v: any) => v.size).filter(Boolean))] 
    : [];
  const hasSizes = availableSizes.length > 0;

  // Variant-driven stock:
  const selectedVariantStock = selectedVariant
    ? (selectedVariant.availableStock !== undefined ? selectedVariant.availableStock : (selectedVariant.stock ?? 0))
    : (hasVariants
        ? (product?.variants || []).reduce((sum: number, v: any) => sum + (v.availableStock !== undefined ? v.availableStock : (v.stock ?? 0)), 0)
        : (product?.availableStock !== undefined ? product.availableStock : (product?.count ?? 0)));
  const effectiveStock = selectedVariantStock;
  const isOutOfStock = effectiveStock <= 0;

  // Existing quantity in basket for this product + variant
  const existingVariantBasketQty = items
    .filter((i) => i.productId === productId && (!selectedVariant || i.selectedVariant === selectedVariant?.name))
    .reduce((sum, i) => sum + i.quantity, 0);

  const remainingOnHandForVariant = Math.max(0, effectiveStock - existingVariantBasketQty);
  const requiresPreOrder = hasVariants
    ? Boolean(selectedVariant && quantity > remainingOnHandForVariant)
    : quantity > remainingOnHandForVariant;
  const preOrderShortage = requiresPreOrder ? Math.max(1, quantity - remainingOnHandForVariant) : 0;

  // Dynamic highly-accurate pickup readiness calculation (respects Pacific Mall Lucena store hours 10 AM - 8 PM)
  const calculatedReadyTime = useMemo(() => {
    const letters = isMultiLine
      ? bulkSummary.lines.reduce((s, l) => s + l.sanitizedLine.replace(/\s+/g, '').length, 0)
      : (customText.replace(/\s+/g, '').length || 5);
    const stitchMins = isMultiLine
      ? Math.max(2, Math.ceil(bulkSummary.lineCount * 1.0 + letters * 0.2))
      : Math.max(1, Math.ceil((1.0 + letters * 0.2) * quantity));

    if (requiresPreOrder) {
      const prepDays = capacityData?.preOrderPrepDays ?? letteringRates.preOrderPrepDays ?? 3;
      return {
        label: `In ~${prepDays} to 5 days (Pre-Order)`,
        detail: 'Workshop preparation and materials schedule',
        stitchMins,
        totalMinutesNeeded: 0,
      };
    }

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const openMins = 10 * 60; // 10:00 AM
    const closeMins = 20 * 60; // 8:00 PM

    // Plain retail item without embroidery: 2-5 mins packaging
    if (!isPersonalized) {
      if (currentMins >= openMins && currentMins < closeMins - 10) {
        return {
          label: 'Today in 2 to 5 mins (Packaging)',
          detail: 'Direct counter packaging at Pacific Mall Lucena',
          stitchMins: 0,
          totalMinutesNeeded: 5,
        };
      }
      if (currentMins >= closeMins - 10) {
        return {
          label: 'Tomorrow at 10:05 AM (Store Opening)',
          detail: 'Store closes at 8:00 PM • Ready at store opening',
          stitchMins: 0,
          totalMinutesNeeded: 5,
        };
      }
      return {
        label: 'Today at 10:05 AM (Store Opening)',
        detail: 'Store opens at 10:00 AM • Ready shortly after opening',
        stitchMins: 0,
        totalMinutesNeeded: 5,
      };
    }

    // Personalized item: exact letters + queue backlog + machine stitching
    const queueWait = capacityData?.queueWaitMinutes ?? (capacityData?.activeOrders ? capacityData.activeOrders * 4 : 0);
    const totalMinutesNeeded = queueWait + stitchMins;

    let cur = new Date(now);
    let curH = cur.getHours();
    let curM = cur.getMinutes();
    let curDayMins = curH * 60 + curM;

    if (curDayMins < openMins) {
      cur.setHours(10, 0, 0, 0);
    } else if (curDayMins >= closeMins) {
      cur.setDate(cur.getDate() + 1);
      cur.setHours(10, 0, 0, 0);
    } else if (curDayMins >= 12 * 60 && curDayMins < 12 * 60 + 15) {
      cur.setHours(12, 15, 0, 0);
    }

    let remaining = Math.max(2, totalMinutesNeeded);
    while (remaining > 0) {
      const h = cur.getHours();
      const m = cur.getMinutes();
      const minOfDay = h * 60 + m;

      if (minOfDay < openMins) {
        cur.setHours(10, 0, 0, 0);
        continue;
      }
      if (minOfDay >= closeMins) {
        cur.setDate(cur.getDate() + 1);
        cur.setHours(10, 0, 0, 0);
        continue;
      }
      if (minOfDay >= 12 * 60 && minOfDay < 12 * 60 + 15) {
        cur.setHours(12, 15, 0, 0);
        continue;
      }

      let availableBlock = minOfDay < 12 * 60 ? (12 * 60 - minOfDay) : (closeMins - minOfDay);
      const consumed = Math.min(remaining, availableBlock);
      cur.setMinutes(cur.getMinutes() + consumed);
      remaining -= consumed;
    }

    const isSameDay = cur.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = cur.toDateString() === tomorrow.toDateString();

    const timeStr = cur.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const readyText = isSameDay
      ? `Today at ${timeStr}`
      : isTomorrow
      ? `Tomorrow at ${timeStr}`
      : `${cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${timeStr}`;

    const queueDesc = capacityData?.activeOrders && capacityData.activeOrders > 0
      ? `${capacityData.activeOrders} active orders ahead in workshop queue (~${queueWait} mins queue + ~${stitchMins} mins stitching)`
      : `Workshop queue clear (~${stitchMins} mins stitching)`;

    return {
      label: readyText,
      detail: queueDesc,
      stitchMins,
      totalMinutesNeeded,
    };
  }, [requiresPreOrder, isPersonalized, isMultiLine, bulkSummary, customText, quantity, capacityData, letteringRates]);

  const validateAndBuildBasketItem = (): BasketItem | null => {
    if (!product) return null;
    setActionError(null);
    setMonogramError(null);

    if (!hasVariants) {
      const err = `${product.name} currently has no variants configured.`;
      setActionError(err);
      showToast(err, 'error');
      return null;
    }

    if (hasVariants && !selectedVariant) {
      const err = 'Please select a color/variant for this product.';
      setVariantError(err);
      setActionError(err);
      return null;
    }

    const trimmedCustomText = sanitizeSingleLineText(customText).trim();
    if (isPersonalized) {
      if (!trimmedCustomText) {
        setMonogramError('Please enter text to embroider or click "Remove Lettering".');
        setActionError('Please enter your embroidery text.');
        showToast('Please enter text to embroider or click "Remove Lettering".', 'error');
        return null;
      }
      const chosenColor = availableColors.find((c) => c.name === threadColor.name);
      if (chosenColor && chosenColor.isAvailable === false) {
        const err = `Thread color "${threadColor.name}" is temporarily unavailable. Please choose another color.`;
        setActionError(err);
        showToast(err, 'error');
        return null;
      }
    }

    if (requiresPreOrder && !preOrderAccepted) {
      const err = `Quantity (${quantity} pcs) exceeds ready stock (${remainingOnHandForVariant} available). Please accept Pre-Order terms to proceed.`;
      setActionError(err);
      showToast('Please accept Pre-Order terms to proceed.', 'warning');
      return null;
    }

    const isBulkPersonalization = isPersonalized && bulkSummary.lineCount > 1;
    const resolvedQuantity = isBulkPersonalization ? bulkSummary.lineCount : quantity;
    const resolvedUnitPrice =
      isBulkPersonalization && resolvedQuantity > 0
        ? effectivePrice + bulkSummary.totalExtraCost / resolvedQuantity
        : finalUnitPrice;

    return {
      id: `express-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId,
      name: product.name,
      price: resolvedUnitPrice,
      baseUnitPrice: effectivePrice,
      garmentSize,
      quantity: resolvedQuantity,
      imageUrl: selectedVariant?.imageUrl || product.imageUrl,
      selectedVariant: selectedVariant?.name,
      selectedColor: selectedColor || selectedVariant?.color,
      selectedSize: selectedSize || undefined,
      isPreOrder: requiresPreOrder,
      preOrderShortage: requiresPreOrder ? preOrderShortage : 0,
      personalization: isPersonalized
        ? isBulkPersonalization
          ? {
              text: bulkSummary.namesList.join('\n'),
              namesList: bulkSummary.namesList,
              isBulkList: true,
              font: DEFAULT_FONT.name,
              threadColor: threadColor.name,
              threadHex: threadColor.hex,
              extraLetteringCost: bulkSummary.averageExtraCostPerUnit,
              totalExtraLetteringCost: bulkSummary.totalExtraCost,
              extraLettersCount: bulkSummary.totalExtraLetters,
              garmentSize,
              isPreOrder: requiresPreOrder,
              preOrderShortage: requiresPreOrder ? preOrderShortage : 0,
            }
          : trimmedCustomText
          ? {
              text: trimmedCustomText,
              namesList: [trimmedCustomText],
              isBulkList: false,
              font: DEFAULT_FONT.name,
              threadColor: threadColor.name,
              threadHex: threadColor.hex,
              extraLetteringCost: lettering.extraCost,
              totalExtraLetteringCost: lettering.extraCost * resolvedQuantity,
              extraLettersCount: lettering.extraLettersCount,
              garmentSize,
              isPreOrder: requiresPreOrder,
              preOrderShortage: requiresPreOrder ? preOrderShortage : 0,
            }
          : undefined
        : undefined,
    };
  };

  const handleAddToBasket = () => {
    const item = validateAndBuildBasketItem();
    if (!item || !product) return;

    addItem({
      productId: item.productId,
      name: item.name,
      price: item.price,
      baseUnitPrice: item.baseUnitPrice,
      garmentSize: item.garmentSize,
      quantity: item.quantity,
      imageUrl: item.imageUrl,
      selectedVariant: item.selectedVariant,
      selectedColor: item.selectedColor,
      selectedSize: item.selectedSize,
      isPreOrder: item.isPreOrder,
      preOrderShortage: item.preOrderShortage,
      personalization: item.personalization,
    });

    setIsOrderSubmitted(true);
    showToast(
      item.isPreOrder
        ? `Added ${item.quantity}x ${product.name} (Pre-Order) to your basket!`
        : `Added ${item.quantity}x ${product.name} to your basket!`,
      'success'
    );
    setTimeout(() => {
      onClose();
    }, 400);
  };

  const handleBuyNow = () => {
    const item = validateAndBuildBasketItem();
    if (!item) return;

    if (!isAuthenticated) {
      setActionError('Please sign in to place your order.');
      showToast('Please sign in to continue with checkout', 'info');
      setAuthOpen(true, 'login');
      return;
    }

    setIsOrderSubmitted(true);
    setTimeout(() => {
      onClose();
      if (onBuyNow) {
        onBuyNow(item);
      }
    }, 350);
  };

  // 4-Step Customer Product Ordering Progress (Style/Variant -> Lettering -> Quantity -> Order/Basket)
  const isOrderStep1Done = !hasVariants || Boolean(selectedVariant);
  const isOrderStep2Done =
    !isPersonalized || (Boolean(customText.trim()) && !monogramError);
  const isOrderStep3Done = quantity >= 1 && (!requiresPreOrder || preOrderAccepted);
  // Step 4 is ONLY marked done when the customer clicks Add to Basket or Buy Now!
  const isOrderStep4Done = isOrderSubmitted;

  const orderActiveStep = !isOrderStep1Done ? 1 : !isOrderStep2Done ? 2 : !isOrderStep3Done ? 3 : 4;
  const isOrderFullyConfigured = isOrderStep1Done && isOrderStep2Done && isOrderStep3Done;
  const orderPercentage = (isOrderStep4Done || isOrderFullyConfigured) ? 100 : Math.round(((orderActiveStep - 1) / 3) * 100);

  const orderTrackFillPercent = (isOrderStep4Done || isOrderFullyConfigured)
    ? 100
    : orderActiveStep === 1
    ? 0
    : orderActiveStep === 2
    ? 33
    : 66;

  const orderSteps = [
    { id: 1, label: 'Style & Color', shortLabel: 'Style', done: isOrderStep1Done },
    { id: 2, label: 'Embroidery Text', shortLabel: 'Lettering', done: isOrderStep2Done },
    { id: 3, label: 'Quantity', shortLabel: 'Quantity', done: isOrderStep3Done },
    { id: 4, label: 'Order / Basket', shortLabel: 'Finish', done: isOrderStep4Done },
  ];

  if (!product) return null;

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[850px]" noPadding>
      <div className="grid grid-cols-[1fr_1.15fr] max-[700px]:grid-cols-1 md:h-[640px] md:max-h-[calc(100vh-3.5rem)]">
        {/* Full-Bleed Image & Preview Section */}
        <div className="relative w-full h-full md:h-[640px] md:max-h-[calc(100vh-3.5rem)] max-[700px]:h-[260px] max-[700px]:max-h-[35vh] max-[700px]:min-h-0 bg-bg-surface flex items-center justify-center overflow-hidden border-r border-border-glass max-[700px]:border-r-0 max-[700px]:border-b group select-none">
          {isValidProductImage(activeImage) ? (
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
                categoryTag={product.tag}
                size="modal"
                className={`w-full h-full transition-transform duration-300 ease-out ${
                  imageFit === 'contain' ? 'object-contain p-4' : 'object-cover'
                } ${isZoomed ? 'scale-135' : 'scale-100 group-hover:scale-105'}`}
              />
            </div>
          ) : (
            <ProductImagePlaceholder
              name={product.name}
              tag={product.tag}
              size="modal"
              className="w-full h-full"
            />
          )}

          {/* Top-Left Floating Overlay Badge */}
          <div className="absolute top-3 left-3 pointer-events-none z-10">
            {isOutOfStock ? (
              <span className="bg-danger/90 text-white text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider backdrop-blur-md shadow-md">
                Out of Stock
              </span>
            ) : effectiveStock <= 5 ? (
              <span className="bg-bg-surface/95 text-text-main border border-border-glass text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider backdrop-blur-md shadow-md">
                Only {effectiveStock} Left
              </span>
            ) : (
              <span className="bg-bg-surface/95 text-text-main border border-border-glass text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider backdrop-blur-md shadow-sm">
                {product.tag || 'Handcrafted'}
              </span>
            )}
          </div>

          {/* Bottom-Right View Mode & Zoom Control Toggle (Separated from top close button) */}
          {isValidProductImage(activeImage) && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 pointer-events-auto z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setImageFit(imageFit === 'cover' ? 'contain' : 'cover');
              }}
              className="w-8 h-8 rounded-lg bg-bg-surface/90 hover:bg-bg-surface border border-border-glass text-text-main hover:text-primary flex items-center justify-center backdrop-blur-md cursor-pointer transition-all active:scale-95 shadow-md"
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
              className={`w-8 h-8 rounded-lg bg-bg-surface/90 hover:bg-bg-surface border border-border-glass text-text-main hover:text-primary flex items-center justify-center backdrop-blur-md cursor-pointer transition-all active:scale-95 shadow-md ${
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
          )}

          {/* Bottom-Left Floating Variant Thumbnails Gallery */}
          {galleryItems.length > 1 && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 z-20 pointer-events-auto max-w-[calc(100%-85px)] overflow-x-auto no-scrollbar">
              <div className="bg-bg-surface/90 backdrop-blur-md border border-border-glass p-1 rounded-xl shadow-lg flex items-center gap-1.5">
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
                          : 'border-border-glass hover:border-primary/40 opacity-70 hover:opacity-100'
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
        <div className="p-6 flex flex-col gap-4 text-left max-[700px]:p-4 max-[700px]:gap-3 md:h-[640px] md:max-h-[calc(100vh-3.5rem)] md:overflow-y-auto touch-scroll">
          <div>
            <h2 className="text-2xl font-extrabold leading-tight m-0 text-text-main max-[700px]:text-lg">
              {product.name}
            </h2>
            {((reviewsData?.averageRating ?? (product as any).rating)) ? (
              <button
                type="button"
                onClick={() => setActiveModalTab('reviews')}
                className="flex items-center gap-2 mt-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-border-glass cursor-pointer transition-colors text-left"
                title="View verified buyer reviews"
              >
                <div className="flex items-center text-amber-400 text-xs">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className={i < Math.round((reviewsData?.averageRating ?? (product as any).rating) || 0) ? 'text-amber-400' : 'text-text-dim/20'}>★</span>
                  ))}
                </div>
                <span className="text-xs font-bold text-text-main font-mono">
                  {((reviewsData?.averageRating ?? (product as any).rating) || 0).toFixed(1)}
                </span>
                <span className="text-[0.72rem] text-text-dim">
                  · {reviewsData?.totalReviews ?? (product as any).reviewCount ?? 0} {(reviewsData?.totalReviews ?? (product as any).reviewCount ?? 0) === 1 ? 'review' : 'reviews'}
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
          <div className="flex border-b border-border-glass gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveModalTab('configure')}
              className={`pb-2 px-3 text-xs font-semibold transition-all border-b-2 cursor-pointer ${
                activeModalTab === 'configure'
                  ? 'border-text-main text-text-main'
                  : 'border-transparent text-text-dim hover:text-text-main'
              }`}
            >
              Customization & Order
            </button>
            <button
              type="button"
              onClick={() => setActiveModalTab('reviews')}
              className={`pb-2 px-3 text-xs font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeModalTab === 'reviews'
                  ? 'border-text-main text-text-main'
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
              {/* Real-time Concurrent Stock Alert Banner (Single Line) */}
              {liveStockAlert && (
                <div className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 transition-all animate-in fade-in slide-in-from-top-1 duration-200 mb-2.5 text-xs ${
                  liveStockAlert.type === 'sold_out'
                    ? 'bg-danger/15 border-danger/40 text-danger'
                    : 'bg-primary/15 border-primary/40 text-text-main'
                }`}>
                  <span className="truncate font-medium">{liveStockAlert.message}</span>
                  <button
                    type="button"
                    onClick={() => setLiveStockAlert(null)}
                    className="text-text-dim hover:text-text-main text-xs p-0.5 leading-none cursor-pointer shrink-0"
                    title="Dismiss"
                    aria-label="Dismiss alert"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 4-Step Ordering Progress Bar with Checkpoints */}
              <div className="pt-1 pb-3 border-b border-border-glass mb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-text-main">
                      Step {orderActiveStep} of 4:
                    </span>
                    <span className="text-[11px] text-text-dim font-medium">
                      {orderSteps[orderActiveStep - 1]?.label || 'Customize'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-primary/10 border border-primary/25 px-2 py-0.5 rounded-full">
                    <span className="font-mono font-bold text-[11px] text-primary">
                      {orderPercentage}%
                    </span>
                  </div>
                </div>

                {/* Checkpoints & Connecting Progress Line (Finish checkpoint sits precisely on the end of the bar) */}
                <div className="relative flex items-center justify-between px-3 pt-1 pb-0.5">
                  {/* Connected Track: Bounded strictly between center of node 1 (x=24px) and center of node 4 (x=calc(100%-24px)) */}
                  <div className="absolute left-[24px] right-[24px] top-4 -translate-y-1/2 h-1 bg-bg-surface border border-border-glass rounded-full overflow-hidden z-0">
                    <div 
                      className={`h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500 ease-out z-0 ${
                        isOrderStep4Done ? 'shadow-[0_0_12px_var(--color-primary-glow)] animate-pulse' : 'shadow-[0_0_6px_var(--color-primary-glow)]'
                      }`}
                      style={{
                        width: `${orderTrackFillPercent}%`
                      }}
                    />
                  </div>

                  {/* 4 Checkpoints */}
                  {orderSteps.map((s) => {
                    const isCompleted = s.done;
                    const isCurrent = orderActiveStep === s.id && !s.done;

                    return (
                      <div key={s.id} className="relative z-10 flex flex-col items-center">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                            isCompleted
                              ? 'bg-primary text-white shadow-[0_0_8px_var(--color-primary-glow)] scale-105'
                              : isCurrent
                              ? 'bg-bg-card border-2 border-primary text-primary shadow-[0_0_10px_var(--color-primary-glow)] ring-2 ring-primary/25 scale-110'
                              : 'bg-bg-surface border border-border-glass text-text-dim'
                          }`}
                          title={`Step ${s.id}: ${s.label}`}
                        >
                          {isCompleted ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <span>{s.id}</span>
                          )}
                        </div>
                        <span
                          className={`text-[9px] mt-1 font-semibold tracking-tight uppercase whitespace-nowrap transition-colors ${
                            isCompleted
                              ? 'text-primary font-bold'
                              : isCurrent
                              ? 'text-primary font-black'
                              : 'text-text-dim/60'
                          }`}
                        >
                          {s.shortLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between items-baseline">
            <div className="text-2xl font-bold text-text-main font-mono max-[700px]:text-xl tracking-tight">
              ₱{totalOrderPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {quantity > 1 && (
                <span className="text-xs text-text-dim font-sans font-normal ml-2">
                  (₱{finalUnitPrice.toFixed(2)} avg/unit)
                </span>
              )}
              {isPersonalized && totalExtraLetteringCost > 0 && (
                <span className="block text-[11px] font-sans font-normal text-text-dim mt-0.5">
                  Includes +₱{totalExtraLetteringCost.toFixed(2)} total for additional lettering after 1st word
                </span>
              )}
            </div>
            {isOutOfStock && (
              <span className="px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/30 text-primary font-semibold text-xs tracking-wider uppercase">
                Pre-Order Available
              </span>
            )}
          </div>

          <p className="text-text-dim leading-relaxed text-[0.88rem] m-0 max-[700px]:text-[0.8rem] line-clamp-3">
            {product.description || 'Professional embroidery design optimized for high-speed production.'}
          </p>

          {/* Variants & Swatches (Only shown if product has variants) */}
          {hasVariants ? (
            <div className="flex flex-col gap-2.5 border-t border-border-glass pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                  Color / Variant:
                </label>
                {selectedVariant && (
                  <span className="text-xs text-text-main font-semibold">{selectedVariant.name}</span>
                )}
              </div>

              {/* In-Stock Available Options */}
              {inStockVariants.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {inStockVariants.map((variant, idx) => {
                    const isSelected = selectedVariant?.name === variant.name;
                    const vStock = variant.availableStock !== undefined ? variant.availableStock : (variant.stock ?? 0);
                    return (
                      <button
                        key={idx}
                        type="button"
                        suppressHydrationWarning
                        onClick={() => {
                          setSelectedVariant(variant);
                          setVariantError(null);
                          setCustomActiveImage(null);
                          if (variant.color) setSelectedColor(variant.color);
                          if (variant.size) setSelectedSize(variant.size);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all select-none cursor-pointer ${
                          isSelected
                            ? 'bg-white/10 border-text-main text-text-main shadow-sm ring-1 ring-white/20'
                            : 'bg-white/5 border-border-glass text-text-dim hover:text-text-main hover:border-white/20'
                        }`}
                      >
                        {variant.color && (
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/20 inline-block shadow-sm shrink-0"
                            style={{ backgroundColor: variant.color }}
                          />
                        )}
                        <span>{variant.name}</span>
                        <span className="text-[10px] text-text-dim font-mono">
                          ({vStock} left)
                        </span>
                        {variant.priceOverride && variant.priceOverride !== product.price && (
                          <span className="text-[10px] text-text-dim font-mono">
                            ₱{variant.priceOverride}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-text-dim italic">All color options are currently out of stock.</div>
              )}

              {/* Compact Out of Stock Notice */}
              {outOfStockVariants.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mr-1">Sold out:</span>
                  {outOfStockVariants.map((variant, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedVariant(variant);
                        setVariantError(null);
                        if (variant.imageUrl) setCustomActiveImage(variant.imageUrl);
                      }}
                      title={`${variant.name} is sold out — click to preview photo`}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] transition-all cursor-pointer ${
                        selectedVariant?.name === variant.name
                          ? 'bg-white/10 border-white/30 text-text-main'
                          : 'bg-white/[0.02] border-border-glass text-text-dim/60 hover:text-text-dim hover:border-white/15'
                      }`}
                    >
                      {variant.color && (
                        <span
                          className="w-2 h-2 rounded-full opacity-40 inline-block shrink-0"
                          style={{ backgroundColor: variant.color }}
                        />
                      )}
                      <span>{variant.name}</span>
                    </button>
                  ))}
                </div>
              )}
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
                Select Size: <span className="text-text-main font-semibold normal-case ml-1">{selectedSize}</span>
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
                        ? 'bg-white/10 border-text-main text-text-main shadow-sm'
                        : 'bg-white/5 border-border-glass text-text-dim hover:text-text-main'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Embroidery Personalization (Lettering / Monogram / Multi-Line Bulk Paste) */}
          <div className="flex flex-col gap-2.5 border-t border-border-glass pt-3 bg-bg-surface/50 -mx-2 px-3 py-3 rounded-xl border border-border-glass">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text-main flex items-center gap-2 cursor-pointer">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim">
                  <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                  <path d="M2 2l7.586 7.586"/>
                  <circle cx="11" cy="11" r="2"/>
                </svg>
                <span>Custom Embroidery Lettering</span>
              </label>
              <button
                type="button"
                disabled={!hasVariants}
                onClick={() => {
                  if (!hasVariants) return;
                  if (isPersonalized) {
                    setIsPersonalized(false);
                    setCustomText('');
                    setMonogramError(null);
                    setActionError(null);
                    setQuantity(1);
                  } else {
                    setIsPersonalized(true);
                    setMonogramError(null);
                  }
                }}
                className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                  !hasVariants
                    ? 'opacity-40 cursor-not-allowed bg-bg-surface border border-border-glass text-text-dim'
                    : isPersonalized
                      ? 'bg-primary text-white hover:bg-accent shadow-sm hover:shadow-md border-none'
                      : 'bg-bg-surface hover:bg-bg-surface/80 border border-border-glass text-text-main hover:text-primary hover:border-primary/40'
                }`}
                title={isPersonalized ? 'Click to remove lettering customization' : 'Click to add custom embroidery text'}
              >
                {!hasVariants ? (
                  'Unavailable'
                ) : isPersonalized ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    <span>Remove Lettering</span>
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <span>Add Custom Lettering</span>
                  </>
                )}
              </button>
            </div>

            {!isPersonalized && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-bg-surface border border-border-glass text-xs mt-1">
                <span className="text-[0.72rem] text-text-dim font-medium">
                  Estimated Ready for Pick-up:
                </span>
                <strong className="text-text-main font-mono text-xs font-bold">
                  {calculatedReadyTime.label}
                </strong>
              </div>
            )}

            {isPersonalized && (
              <div className="flex flex-col gap-3 pt-1 animate-[fadeIn_0.2s_ease-out]">
                {/* Unified Studio Readiness & Estimated Completion Card */}
                <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-bg-surface border border-border-glass text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.72rem] text-text-dim font-medium">
                      Estimated Ready for Pick-up:
                    </span>
                    <strong className="text-text-main font-mono text-xs font-bold">
                      {calculatedReadyTime.label}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border-glass/40 text-[0.68rem] text-text-dim">
                    <span>
                      {calculatedReadyTime.detail}
                    </span>
                    <span className="font-mono text-text-main font-semibold">
                      Stitching time: ~{calculatedReadyTime.stitchMins} {calculatedReadyTime.stitchMins === 1 ? 'min' : 'mins'}
                    </span>
                  </div>
                </div>

                {/* Combined Lettering Editor & Line Breakdown Container */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[0.7rem] text-text-dim">
                    <span className="font-semibold flex items-center gap-1.5">
                      {isMultiLine ? (
                        <span className="text-primary font-bold">
                          {bulkSummary.lineCount} Names Detected (1 line = 1 piece)
                        </span>
                      ) : (
                        <span>Name or Text (Max {MAX_CHARS_PER_LINE} chars/line)</span>
                      )}
                    </span>
                    {isMultiLine ? (
                      <span className="font-mono font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                        {bulkSummary.lineCount} lines = {bulkSummary.lineCount} qty
                      </span>
                    ) : (
                      <span className={`font-mono ${(customText.split('\n')[0] || '').length >= MAX_CHARS_PER_LINE ? 'text-primary font-bold' : ''}`}>
                        {(customText.split('\n')[0] || '').length}/{MAX_CHARS_PER_LINE}
                      </span>
                    )}
                  </div>

                  {/* Single Unified Combined Box */}
                  <div
                    className={`rounded-xl border ${
                      monogramError
                        ? 'border-danger/70 bg-danger/[0.03] ring-1 ring-danger/30'
                        : 'border-border-glass bg-bg-surface focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20'
                    } overflow-hidden transition-all flex flex-col`}
                  >
                    {/* Multiline Text Input */}
                    <textarea
                      rows={Math.max(2, Math.min(5, (customText.match(/\n/g) || []).length + 2))}
                      maxLength={2000}
                      aria-label="Custom embroidery text"
                      id="customText"
                      name="customText"
                      value={customText}
                      onChange={(e) => {
                        const sanitized = sanitizeBulkMultilineText(e.target.value);
                        setCustomText(sanitized);
                        const parsed = parseBulkLetteringLines(sanitized, isBig, letteringRates);
                        if (parsed.lineCount > 1) {
                          setQuantity(parsed.lineCount);
                        } else if (parsed.lineCount === 1 && quantity < 1) {
                          setQuantity(1);
                        }
                        if (monogramError) setMonogramError(null);
                        if (actionError) setActionError(null);
                      }}
                      onBlur={() => {
                        if (isPersonalized && !customText.trim()) {
                          setMonogramError('Please enter text to embroider or click "Remove Lettering"');
                        }
                      }}
                      placeholder={`Type a name (e.g. Juan), or press Enter / paste multiple names for bulk:\nJuan\nMaria C\nPedro Penduko`}
                      className="w-full bg-transparent border-0 p-3 text-xs text-text-main placeholder:text-text-dim/40 outline-none font-mono leading-relaxed resize-y focus:ring-0"
                    />

                    {/* Integrated Per-Line Breakdown inside the same box */}
                    {isMultiLine && bulkSummary.lines.length > 0 && (
                      <div className="border-t border-border-glass/60 bg-black/[0.04] p-2.5 flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-text-dim pb-1 border-b border-border-glass/40">
                          <span>Line Breakdown ({isBig ? `Big Garment • ₱${letteringRates.bigRate}/extra letter` : `Small Garment • ₱${letteringRates.smallRate}/extra letter`})</span>
                          <span>Extra Fee</span>
                        </div>
                        {bulkSummary.lines.map((line) => (
                          <div key={line.lineIndex} className="flex items-center justify-between text-[11px] py-0.5 border-b border-border-glass/20 last:border-b-0">
                            <div className="flex items-center gap-1.5 min-w-0 pr-2">
                              <span className="text-[10px] font-mono text-text-dim w-4 shrink-0">{line.lineIndex}.</span>
                              <span className="font-semibold text-text-main truncate">{line.sanitizedLine}</span>
                              <span className="text-[9px] font-mono text-text-dim/60 shrink-0">({line.charCount}/20)</span>
                            </div>
                            <span className={`font-mono text-[11px] font-bold shrink-0 ${line.extraCost > 0 ? 'text-primary' : 'text-text-dim'}`}>
                              {line.extraCost > 0
                                ? `+₱${line.extraCost.toFixed(2)} (${line.extraLettersCount} ltr)`
                                : 'Free (₱0)'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Integrated Bottom Bar inside the same box */}
                    <div className="border-t border-border-glass/50 bg-white/[0.02] px-3 py-1.5 flex items-center justify-between text-[10px] text-text-dim">
                      <span>
                        {isMultiLine
                          ? 'Each line is capped at 20 characters • Auto-syncs order quantity'
                          : 'First word is included free. Press Enter to add more names for bulk orders.'}
                      </span>
                      {totalExtraLetteringCost > 0 ? (
                        <span className="font-mono font-bold text-primary shrink-0 pl-2">
                          {isMultiLine
                            ? `Total Extra: +₱${totalExtraLetteringCost.toFixed(2)}`
                            : `Extra (${lettering.extraLettersCount} ltr): +₱${totalExtraLetteringCost.toFixed(2)}`}
                        </span>
                      ) : isMultiLine ? (
                        <span className="font-mono font-bold text-text-dim shrink-0 pl-2">
                          Included in price
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <InlineError message={monogramError} className="mt-0.5" variant="field" />
                </div>

                {/* Thread Color Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider flex items-center justify-between">
                    <span>Thread Color</span>
                    <span className="text-text-main normal-case font-medium">{threadColor.name}</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableColors.map((tc) => {
                      const isSelected = threadColor.name === tc.name;
                      const isAvailable = tc.isAvailable !== false;
                      return (
                        <button
                          key={tc.name}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            if (isAvailable) {
                              setThreadColor({ name: tc.name, hex: tc.hex });
                            }
                          }}
                          title={isAvailable ? tc.name : `${tc.name} (Temporarily Out of Stock)`}
                          className={`relative w-7 h-7 rounded-full border flex items-center justify-center transition-all overflow-hidden ${
                            !isAvailable
                              ? 'cursor-not-allowed border-dashed border-border-glass scale-90'
                              : isSelected
                              ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg-surface scale-110 border-primary cursor-pointer'
                              : 'border-border-glass hover:scale-105 cursor-pointer'
                          }`}
                          style={{
                            backgroundColor: tc.hex,
                            ...(isAvailable ? {} : { opacity: 0.35, filter: 'grayscale(90%)' })
                          }}
                        >
                          {!isAvailable && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                              <div className="w-[150%] h-[2px] bg-white/90 shadow-[0_0_3px_rgba(0,0,0,0.8)] rotate-45 transform" />
                            </div>
                          )}

                          {isSelected && isAvailable && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={tc.hex === '#ffffff' || tc.hex === '#e2e8f0' ? 'text-black' : 'text-white'}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quantity Stepper & Direct Typing */}
          <div className="flex flex-col gap-2 border-t border-border-glass pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-text-dim uppercase tracking-wider">Quantity</span>
                <span className="text-[10px] text-text-dim/70 leading-snug">
                  {isMultiLine
                    ? `Auto-synced to ${bulkSummary.lineCount} pasted ${bulkSummary.lineCount === 1 ? 'line' : 'lines'}`
                    : 'Type directly or step for bulk & pre-orders'}
                </span>
              </div>
              <QuantityInput
                value={!hasVariants ? 0 : quantity}
                onChange={(q) => {
                  setQuantity(q);
                  if (actionError) setActionError(null);
                }}
                min={1}
                max={1000}
                disabled={!hasVariants || isMultiLine}
                size="md"
                showPresets={hasVariants && !isMultiLine}
                presets={[10, 25, 50, 100]}
                ariaLabel={`Quantity for ${product.name}`}
              />
            </div>

            {/* Stock Exceeded / Pre-Order Warning & Acknowledgment Banner (Never mentions "supplier") */}
            {requiresPreOrder && (
              <div className="mt-1 p-3 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-2 text-xs">
                <div className="flex items-start gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-primary shrink-0 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-text-main text-xs">
                      Pre-Order Required ({remainingOnHandForVariant} in stock)
                    </span>
                    <span className="text-[11px] text-text-dim leading-relaxed">
                      Ordering <strong>{quantity} pcs</strong> exceeds ready stock by <strong>{preOrderShortage} pcs</strong>. This order will be queued as a <strong>Pre-Order (full payment upfront)</strong>.
                    </span>
                    <span className="text-[11px] font-mono font-bold text-primary mt-0.5">
                      {estimatedPreOrderScheduleLabel}
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-2 pt-1.5 border-t border-border-glass cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={preOrderAccepted}
                    onChange={(e) => {
                      setPreOrderAccepted(e.target.checked);
                      if (e.target.checked && actionError) setActionError(null);
                    }}
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-text-main">
                    I accept the extended workshop production &amp; preparation wait time for this Pre-Order.
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 mt-auto pt-4 pb-2">
            {!hasVariants ? (
              <GlassButton
                variant="secondary"
                fullWidth
                disabled
                className="py-3 font-bold opacity-60 cursor-not-allowed text-xs uppercase tracking-wider"
              >
                Unavailable
              </GlassButton>
            ) : (
              <div className="flex gap-3 max-[700px]:gap-2">
                <GlassButton
                  variant="secondary"
                  onClick={handleAddToBasket}
                  className="flex-1 py-3 text-xs font-semibold cursor-pointer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 shrink-0">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                  {requiresPreOrder ? 'Pre-Order to Basket' : 'Add to Basket'}
                </GlassButton>
                <GlassButton
                  variant="primary"
                  onClick={handleBuyNow}
                  className="flex-1 py-3 text-xs font-bold shadow-md cursor-pointer"
                >
                  {requiresPreOrder ? 'Pre-Order Now →' : 'Buy Now →'}
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
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/5 border border-border-glass text-text-dim text-[9px] font-bold leading-none shrink-0">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>Verified</span>
                                </span>
                                {review.isFeatured && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[9px] font-bold leading-none shrink-0">
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
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-primary shrink-0">
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
                              <span>Management</span>
                              <span className="text-[0.65rem] text-text-dim ml-auto font-normal">
                                {review.merchantReplyAt
                                  ? new Date(review.merchantReplyAt).toLocaleDateString(undefined, {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : null}
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
