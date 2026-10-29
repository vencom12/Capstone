'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useBasketStore } from '@/stores/useBasketStore';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import GlassModal from '@/components/ui/GlassModal';
import QuantityInput from '@/components/ui/QuantityInput';
import type { BasketItem, ProductVariant } from '@/lib/types';
import {
  MAX_CHARS_PER_LINE,
  resolveProductGarmentSize,
  sanitizeSingleLineText,
  sanitizeBulkMultilineText,
  calculateLetteringCost,
  parseBulkLetteringLines,
} from '@/lib/letteringPricing';

interface BasketViewProps {
  onGoToShop: () => void;
  onOpenCheckout: (selectedItems?: BasketItem[]) => void;
}

interface StudioThreadColor {
  name: string;
  hex: string;
  isAvailable?: boolean;
}

const DEFAULT_THREAD_COLORS: StudioThreadColor[] = [
  { name: 'Metallic Gold', hex: '#d4af37', isAvailable: true },
  { name: 'Pure White', hex: '#ffffff', isAvailable: true },
  { name: 'Obsidian Black', hex: '#1c1917', isAvailable: true },
  { name: 'Silver Platinum', hex: '#e2e8f0', isAvailable: true },
  { name: 'Royal Navy', hex: '#1e3a8a', isAvailable: true },
  { name: 'Crimson Red', hex: '#b91c1c', isAvailable: true },
  { name: 'Emerald Green', hex: '#047857', isAvailable: true },
  { name: 'Rose Blush', hex: '#fb7185', isAvailable: true },
];

export default function BasketView({ onGoToShop, onOpenCheckout }: BasketViewProps) {
  const { items, removeItem, updateQuantity, updateBasketItem, clearBasket } = useBasketStore();
  const { products, toggleFavorite, favorites } = useProductStore();
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [editingItem, setEditingItem] = useState<BasketItem | null>(null);
  const [expandedBulkIds, setExpandedBulkIds] = useState<Record<string, boolean>>({});

  // Admin lettering rates & thread colors
  const [letteringRates, setLetteringRates] = useState<{ smallRate: number; bigRate: number; preOrderPrepDays: number }>({
    smallRate: 7,
    bigRate: 10,
    preOrderPrepDays: 3,
  });
  const [availableColors, setAvailableColors] = useState<StudioThreadColor[]>(DEFAULT_THREAD_COLORS);

  // Edit Item Modal states
  const [editVariantName, setEditVariantName] = useState<string>('');
  const [editSelectedColor, setEditSelectedColor] = useState<string>('');
  const [editSelectedSize, setEditSelectedSize] = useState<string>('');
  const [editImageUrl, setEditImageUrl] = useState<string>('');
  const [editIsPersonalized, setEditIsPersonalized] = useState<boolean>(false);
  const [editLetteringMode, setEditLetteringMode] = useState<'single' | 'bulk'>('single');
  const [editSingleText, setEditSingleText] = useState<string>('');
  const [editBulkText, setEditBulkText] = useState<string>('');
  const [editThreadColor, setEditThreadColor] = useState<{ name: string; hex: string }>({
    name: 'Metallic Gold',
    hex: '#d4af37',
  });
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editPreOrderAccepted, setEditPreOrderAccepted] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Selected item IDs for checkout
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
    setSelectedIds(items.map((i) => i.id));
  }, []);

  // Fetch studio settings (lettering rates & thread colors)
  useEffect(() => {
    api
      .get<any>('/api/customer/settings')
      .then((res) => {
        if (res) {
          setLetteringRates((prev) => ({
            smallRate: Number(res.smallGarmentLetterRate) || prev.smallRate || 7,
            bigRate: Number(res.bigGarmentLetterRate) || prev.bigRate || 10,
            preOrderPrepDays: res.preOrderPrepDays !== undefined ? Number(res.preOrderPrepDays) : prev.preOrderPrepDays,
          }));
          if (Array.isArray(res.availableThreadColors) && res.availableThreadColors.length > 0) {
            const mapped: StudioThreadColor[] = res.availableThreadColors
              .map((c: any) => ({
                name: typeof c === 'string' ? c : String(c.name || ''),
                hex: typeof c === 'string' ? '#ffffff' : String(c.hex || '#ffffff'),
                isAvailable: typeof c === 'object' && c !== null ? c.isAvailable !== false : true,
              }))
              .filter((c: StudioThreadColor) => c.name);
            if (mapped.length > 0) setAvailableColors(mapped);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Sync selected IDs if items list changes
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((i) => i.id === id)));
  }, [items]);

  // Open Edit Modal and populate state from BasketItem
  const openEditModal = (item: BasketItem) => {
    const isBulk = Boolean(
      item.personalization?.isBulkList ||
        (Array.isArray(item.personalization?.namesList) && item.personalization!.namesList!.length > 1)
    );
    const hasPers = Boolean(item.personalization?.text || (item.personalization?.namesList && item.personalization.namesList.length > 0));
    const namesArr =
      Array.isArray(item.personalization?.namesList) && item.personalization!.namesList!.length > 0
        ? item.personalization!.namesList!
        : item.personalization?.text
        ? [sanitizeSingleLineText(item.personalization.text)]
        : [];

    setEditVariantName(item.selectedVariant || '');
    setEditSelectedColor(item.selectedColor || '');
    setEditSelectedSize(item.selectedSize || '');
    setEditImageUrl(item.imageUrl || '');
    setEditIsPersonalized(hasPers);
    setEditLetteringMode(isBulk ? 'bulk' : 'single');
    setEditSingleText( sanitizeSingleLineText(namesArr[0] || item.personalization?.text || '') );
    setEditBulkText( sanitizeBulkMultilineText(namesArr.join('\n')) );
    const tcName =
      typeof item.personalization?.threadColor === 'object'
        ? (item.personalization.threadColor as any)?.name || 'Metallic Gold'
        : item.personalization?.threadColor || 'Metallic Gold';
    const tcHex = item.personalization?.threadHex || '#d4af37';
    setEditThreadColor({ name: tcName, hex: tcHex });
    setEditQuantity(item.quantity);
    setEditPreOrderAccepted(Boolean(item.isPreOrder));
    setEditError(null);
    setEditingItem(item);
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const selectedItems = items.filter((i) => selectedIds.includes(i.id));
  const selectedTotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalItemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const selectedItemCount = selectedItems.reduce((sum, i) => sum + i.quantity, 0);
  const isAllSelected = items.length > 0 && selectedIds.length === items.length;

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((i) => i.id));
    }
  };

  const getAvailableStockForItem = (item: BasketItem) => {
    const product = products.find((p) => (p.id || (p as any)._id) === item.productId);
    if (!product) return 999999;
    if (product.variants && Array.isArray(product.variants) && item.selectedVariant) {
      const v = product.variants.find((variant: any) => variant.name === item.selectedVariant);
      if (v) {
        return v.availableStock !== undefined ? v.availableStock : (v.stock ?? 999999);
      }
    }
    return product.availableStock !== undefined
      ? product.availableStock
      : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
  };

  const handleQuantityChange = (item: BasketItem, newQty: number, availableStock: number) => {
    if (newQty < 1) return;

    // If item is a bulk multi-line list, quantity is tied to the number of lines
    const isBulk = Boolean(
      item.personalization?.isBulkList ||
        (Array.isArray(item.personalization?.namesList) && item.personalization!.namesList!.length > 1)
    );
    if (isBulk) {
      showToast('This item uses a Bulk Name List. Click "Edit Item / Names" to add or remove lines.', 'info');
      openEditModal(item);
      return;
    }

    if (availableStock < 999999 && newQty > availableStock) {
      // Mark as Pre-Order when quantity exceeds current on-hand stock
      updateBasketItem(item.id, {
        quantity: newQty,
        isPreOrder: true,
        preOrderShortage: Math.max(0, newQty - Math.max(0, availableStock)),
      });
      showToast(
        `Quantity (${newQty}) exceeds current on-hand stock (${Math.max(0, availableStock)}). Marked as Pre-Order with extended production schedule.`,
        'warning'
      );
      return;
    }

    updateBasketItem(item.id, {
      quantity: newQty,
      isPreOrder: false,
      preOrderShortage: 0,
    });
  };

  const handleToggleFavoriteItem = (item: BasketItem) => {
    const product = products.find((p) => (p.id || (p as any)._id) === item.productId);
    if (product) {
      const pId = product.id || (product as any)._id;
      toggleFavorite(pId);
    }
  };

  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      showToast('Please select at least one item to proceed to checkout.', 'error');
      return;
    }
    onOpenCheckout(selectedItems);
  };

  // 1. EMPTY STATE
  if (items.length === 0) {
    return (
      <section className="flex flex-col min-h-full animate-[fadeIn_0.3s_ease-out]">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-bold text-text-main m-0 tracking-tight">
              My Basket
            </h1>
            <span className="text-xs bg-white/10 text-text-dim px-2.5 py-0.5 rounded-full font-medium">
              0 items
            </span>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[420px] bg-white/[0.02] border-2 border-dashed border-border-glass rounded-xl">
          <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-5 shadow-inner">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-text-main mb-2">Your Basket is Empty</h2>
          <p className="text-text-dim text-sm max-w-md mb-6 leading-relaxed">
            You haven&apos;t added any personalized caps or luxury towels yet. Explore our custom embroidery products and customize your design!
          </p>
          <button
            onClick={onGoToShop}
            className="px-6 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition-all cursor-pointer border-none shadow-md hover:shadow-lg flex items-center gap-2 group"
          >
            <span>Browse Products</span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </button>
        </div>
      </section>
    );
  }

  // 2. ACTIVE 2-COLUMN BASKET
  return (
    <section className="flex flex-col min-h-full md:h-full animate-[fadeIn_0.3s_ease-out]">
      {/* Header */}
      <header className="mb-4 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg sm:text-xl font-bold text-text-main m-0 tracking-tight">
            My Basket
          </h1>
          <span className="text-xs bg-primary/15 border border-primary/25 text-primary px-2.5 py-0.5 rounded-full font-semibold">
            {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
          </span>
        </div>

        {/* Clear All CTA */}
        <button
          type="button"
          onClick={() => setShowClearConfirm(true)}
          className="text-text-dim hover:text-danger text-xs font-semibold px-3 py-1.5 rounded-lg border border-border-glass hover:border-danger/30 transition-all cursor-pointer bg-white/[0.03] hover:bg-danger/10"
        >
          Clear Basket
        </button>
      </header>

      {/* Main Grid: Clean & Well Proportioned */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-36 lg:pb-8 items-start">
        {/* Left Column: Itemized List Container (8 of 12 cols on desktop) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* Header Row / Select All Controls Bar */}
          <div className="bg-bg-surface/90 border border-border-glass rounded-xl px-4 py-3 flex items-center justify-between backdrop-blur-md">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
              <span className="text-xs sm:text-sm font-bold text-text-main">
                Select All ({items.length} {items.length === 1 ? 'product' : 'products'})
              </span>
            </label>

            <span className="text-xs text-text-dim">
              <strong className="text-primary">{selectedItems.length}</strong> of {items.length} selected ({selectedItemCount} pcs)
            </span>
          </div>

          {/* Items Container */}
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const product = products.find((p) => (p.id || (p as any)._id) === item.productId);
              const isFav = favorites.some((f) => (f.id || (f as any)._id) === item.productId);
              const availableStock = getAvailableStockForItem(item);
              const isBulk = Boolean(
                item.personalization?.isBulkList ||
                  (Array.isArray(item.personalization?.namesList) && item.personalization!.namesList!.length > 1)
              );
              const namesList = Array.isArray(item.personalization?.namesList) ? item.personalization!.namesList! : [];
              const isExpanded = Boolean(expandedBulkIds[item.id]);
              const isItemPreOrder = Boolean(item.isPreOrder || (availableStock < 999999 && item.quantity > availableStock));
              const garmentTier = item.garmentSize || resolveProductGarmentSize(product || { name: item.name });

              return (
                <div
                  key={item.id}
                  className={`bg-bg-surface/70 border rounded-xl p-4 sm:p-4.5 transition-all duration-200 ${
                    isSelected
                      ? 'border-primary/40 bg-bg-surface/90 shadow-sm'
                      : 'border-border-glass opacity-75 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start gap-3.5 sm:gap-4">
                    {/* Item Checkbox */}
                    <div className="pt-2 sm:pt-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="w-4 h-4 rounded accent-primary cursor-pointer"
                      />
                    </div>

                    {/* Thumbnail */}
                    <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-xl bg-bg-surface border border-border-glass overflow-hidden shrink-0 flex items-center justify-center relative">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                      )}
                      {item.selectedColor && (
                        <div
                          className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full border border-white/60 shadow-sm"
                          style={{ backgroundColor: item.selectedColor }}
                          title={`Color: ${item.selectedColor}`}
                        />
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm sm:text-base font-bold text-text-main m-0 truncate">
                              {item.name}
                            </h3>
                            <span
                              className={`text-[0.62rem] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                garmentTier === 'big'
                                  ? 'bg-white/5 text-text-dim border-border-glass'
                                  : 'bg-white/5 text-text-dim border-border-glass'
                              }`}
                            >
                              {garmentTier === 'big' ? 'Big Garment' : 'Small Garment'}
                            </span>
                            {isItemPreOrder && (
                              <span className="text-[0.62rem] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                                Pre-Order Schedule
                              </span>
                            )}
                          </div>

                          {/* Variant & Personalization Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(item);
                              }}
                              className="group/variant flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/50 text-primary hover:text-primary-light text-[0.72rem] px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
                              title="Click to edit variant, thread color, or single/bulk names"
                            >
                              {item.selectedColor && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-white/40 inline-block shadow-xs shrink-0"
                                  style={{ backgroundColor: item.selectedColor }}
                                />
                              )}
                              <span>{item.selectedVariant || 'Standard Option'}</span>
                              {item.selectedSize && <span>• {item.selectedSize}</span>}
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="opacity-70 group-hover/variant:opacity-100 transition-opacity ml-0.5"
                              >
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>

                            {item.personalization?.text && !isBulk && (
                              <span className="bg-primary/10 border border-primary/20 text-primary text-[0.7rem] px-2 py-0.5 rounded-md font-semibold flex items-center gap-1.5">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                  <circle cx="6" cy="6" r="3" />
                                  <path d="M8.5 8.5L21 21" />
                                </svg>
                                <span>&ldquo;{item.personalization.text}&rdquo;</span>
                                {item.personalization.threadHex && (
                                  <span
                                    className="w-2 h-2 rounded-full border border-white/40 inline-block shadow-xs"
                                    style={{ backgroundColor: item.personalization.threadHex }}
                                  />
                                )}
                                <span className="opacity-75 font-normal text-[0.65rem]">
                                  ({(typeof item.personalization.threadColor === 'object' ? (item.personalization.threadColor as any)?.name : item.personalization.threadColor) || 'Gold'})
                                </span>
                              </span>
                            )}

                            {isBulk && namesList.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedBulkIds((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                                className="bg-bg-surface hover:bg-white/10 border border-border-glass text-text-main text-[0.7rem] px-2.5 py-0.5 rounded-md font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                              >
                                <span>📋 Bulk Name List ({namesList.length} lines)</span>
                                {item.personalization?.threadHex && (
                                  <span
                                    className="w-2 h-2 rounded-full border border-white/40 inline-block shadow-xs"
                                    style={{ backgroundColor: item.personalization.threadHex }}
                                  />
                                )}
                                <span className="text-[0.65rem] underline ml-0.5">
                                  {isExpanded ? 'Hide' : 'View'}
                                </span>
                              </button>
                            )}
                          </div>

                          {/* Bulk Names Preview / Expandable List */}
                          {isBulk && namesList.length > 0 && (
                            <div className="mt-2 bg-bg-surface border border-border-glass rounded-lg p-2.5 text-[0.72rem]">
                              <div className="flex items-center justify-between text-text-dim mb-1">
                                <span>
                                  Personalized Names ({namesList.length} pcs • Thread:{' '}
                                  <strong className="text-text-main">
                                    {(typeof item.personalization?.threadColor === 'object'
                                      ? (item.personalization.threadColor as any)?.name
                                      : item.personalization?.threadColor) || 'Gold'}
                                  </strong>
                                  )
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  className="text-primary hover:underline font-bold bg-transparent border-none cursor-pointer p-0 text-[0.7rem]"
                                >
                                  Edit Names / Mode
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {(isExpanded ? namesList : namesList.slice(0, 5)).map((lineName, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-text-main font-mono text-[0.68rem]"
                                  >
                                    <span className="text-text-dim mr-1">#{idx + 1}</span>
                                    {lineName}
                                  </span>
                                ))}
                                {!isExpanded && namesList.length > 5 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedBulkIds((prev) => ({ ...prev, [item.id]: true }))
                                    }
                                    className="px-2 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary font-bold text-[0.68rem] cursor-pointer"
                                  >
                                    +{namesList.length - 5} more…
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Pre-Order Notice Banner if exceeding stock */}
                          {isItemPreOrder && (
                            <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-border-glass text-[0.7rem] text-text-dim flex items-center gap-2">
                              <span>⏳</span>
                              <span>
                                <strong>Pre-Order Item:</strong> Quantity ({item.quantity} pcs) exceeds current on-hand stock ({Math.max(0, availableStock)} pcs). Includes extended workshop preparation &amp; production time.
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Price Breakdown */}
                        <div className="text-right shrink-0">
                          <span className="text-base sm:text-lg font-mono font-black text-text-main block leading-tight">
                            ₱{(item.price * item.quantity).toFixed(2)}
                          </span>
                          <span className="text-[0.7rem] text-text-dim block">
                            ₱{item.price.toFixed(2)} avg/pc
                          </span>
                          {(item.personalization?.totalExtraLetteringCost ?? 0) > 0 && (
                            <span className="text-[0.65rem] text-primary font-semibold block">
                              incl. +₱{(item.personalization?.totalExtraLetteringCost ?? 0).toFixed(0)} extra letters
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Controls Row */}
                      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/5 flex-wrap">
                        {/* Stepper with Direct Typing */}
                        <div className="flex items-center gap-2 shrink-0">
                          <QuantityInput
                            value={item.quantity}
                            onChange={(newQty) => handleQuantityChange(item, newQty, availableStock)}
                            min={1}
                            max={9999}
                            size="sm"
                            ariaLabel={`Quantity for ${item.name}`}
                          />
                          {isBulk && (
                            <span className="text-[0.68rem] text-text-dim italic">
                              Synced to {namesList.length} lines
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 border border-primary/35 text-primary font-bold transition-all flex items-center gap-1.5 cursor-pointer text-[0.72rem]"
                            title="Edit item variant, names, or switch Single / Bulk mode"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            <span>Edit Item / Names</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleFavoriteItem(item)}
                            className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer border text-[0.72rem] ${
                              isFav
                                ? 'bg-primary/20 border-primary text-primary font-bold shadow-sm'
                                : 'bg-white/5 border-border-glass text-text-dim hover:text-primary hover:bg-white/10'
                            }`}
                            title={isFav ? 'Saved in Favorites (Click to unfavorite)' : 'Save to Favorites'}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill={isFav ? 'currentColor' : 'none'}
                              stroke="currentColor"
                              strokeWidth="2"
                              className={isFav ? 'text-primary' : ''}
                            >
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                            <span className="hidden sm:inline">{isFav ? 'Saved' : 'Save'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              removeItem(item.id);
                              showToast(`Removed "${item.name}" from basket`, 'info');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-danger/15 text-text-dim hover:text-danger hover:border-danger/30 transition-all flex items-center gap-1.5 cursor-pointer border border-border-glass text-[0.72rem]"
                            title="Remove from Basket"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            <span className="hidden sm:inline">Remove</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick catalog shortcut */}
          <div className="p-3.5 bg-white/[0.02] border border-border-glass/60 rounded-lg flex items-center justify-between text-xs text-text-dim">
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              Want to customize another towel or cap?
            </span>
            <button
              onClick={onGoToShop}
              className="text-primary font-bold hover:underline bg-transparent border-none cursor-pointer p-0"
            >
              + Add More Designs
            </button>
          </div>
        </div>

        {/* Right Column: Clean, Focused Order Summary (4 of 12 cols on desktop) */}
        <div className="lg:col-span-4 lg:sticky lg:top-4 flex flex-col gap-4">
          <div className="bg-bg-surface/90 border border-border-glass rounded-xl p-5 sm:p-6 backdrop-blur-xl shadow-xl flex flex-col gap-4">
            <h2 className="text-base font-extrabold text-text-main m-0 pb-3 border-b border-white/10 flex items-center justify-between">
              <span>Order Summary</span>
              <span className="text-xs font-mono font-bold text-primary">
                {selectedItemCount} {selectedItemCount === 1 ? 'item' : 'items'}
              </span>
            </h2>

            {/* Calculations Breakdown */}
            <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
              <div className="flex justify-between items-center text-text-dim">
                <span>Merchandise Subtotal:</span>
                <span className="font-mono text-text-main font-bold">
                  ₱{selectedTotal.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center text-text-dim">
                <span>Fulfillment Method:</span>
                <span className="text-text-main font-medium text-xs">
                  Store Pick-up (Pacific Mall)
                </span>
              </div>

              <div className="flex justify-between items-center text-text-dim">
                <span>Payment Terms:</span>
                <span className="text-primary font-bold text-xs">
                  100% Upfront Payment
                </span>
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                <div>
                  <span className="text-sm sm:text-base font-black text-text-main block">Total Payable</span>
                  <span className="text-[0.68rem] text-text-dim">Counter pick-up with Claim Slip</span>
                </div>
                <span className="text-xl sm:text-2xl font-mono font-black text-text-main">
                  ₱{selectedTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Checkout CTA */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={selectedItems.length === 0}
              className="w-full py-3.5 sm:py-4 rounded-lg bg-primary hover:bg-primary-light text-white font-extrabold text-sm tracking-wide transition-all duration-200 cursor-pointer border-none shadow-lg hover:shadow-primary/30 flex items-center justify-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              <span>Proceed to Checkout</span>
              <span className="transition-transform group-hover:translate-x-1 font-bold">→</span>
            </button>

            {/* Subtle Assurance */}
            <div className="flex items-center justify-center gap-1.5 text-[0.7rem] text-text-dim/80 pt-1 border-t border-white/5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Ground Floor Pacific Mall Lucena Pick-up • Official GCash Pay</span>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Confirmation Dialog for Clearing Basket */}
      <GlassModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        maxWidth="max-w-[420px]"
      >
        <div className="flex flex-col items-center text-center p-2">
          <div className="w-14 h-14 rounded-xl bg-danger/15 border border-danger/30 text-danger flex items-center justify-center mb-4">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>

          <h3 className="text-lg font-extrabold text-text-main m-0 mb-1.5">
            Clear Entire Basket?
          </h3>
          <p className="text-xs text-text-dim leading-relaxed m-0 mb-6 max-w-xs">
            This will remove all <strong className="text-text-main">{items.length} item{items.length === 1 ? '' : 's'}</strong> and personalized embroidery lettering from your basket.
          </p>

          <div className="grid grid-cols-2 gap-3 w-full">
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              className="py-3 px-4 rounded-xl border border-border-glass bg-bg-surface hover:bg-white/5 text-text-main text-xs font-bold transition-all cursor-pointer active:scale-95"
            >
              Keep Items
            </button>
            <button
              type="button"
              onClick={() => {
                clearBasket();
                setShowClearConfirm(false);
                showToast('Basket cleared', 'info');
              }}
              className="py-3 px-4 rounded-xl bg-danger hover:bg-danger/90 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-danger/20 active:scale-95"
            >
              Yes, Clear All
            </button>
          </div>
        </div>
      </GlassModal>

      {/* Full In-Basket Item & Personalization Editor Modal */}
      {editingItem && (() => {
        const product = products.find((p) => (p.id || (p as any)._id) === editingItem.productId);
        const variants = product?.variants || [];
        const selectedVariantObj = variants.find((v: ProductVariant) => v.name === editVariantName);

        // Determine base unit price (without extra lettering)
        const baseUnitPrice =
          selectedVariantObj?.priceOverride ??
          editingItem.baseUnitPrice ??
          product?.price ??
          Math.max(0, editingItem.price - (editingItem.personalization?.extraLetteringCost || 0));

        // Determine available stock for the selected variant
        let variantStock = 999999;
        if (product) {
          if (selectedVariantObj) {
            variantStock =
              selectedVariantObj.availableStock !== undefined
                ? selectedVariantObj.availableStock
                : (selectedVariantObj.stock ?? 0);
          } else {
            variantStock =
              product.availableStock !== undefined
                ? product.availableStock
                : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
          }
        }

        const garmentSize = resolveProductGarmentSize(
          product || { name: editingItem.name, garmentSize: editingItem.garmentSize }
        );
        const isBig = garmentSize === 'big';

        const singleBreakdown = calculateLetteringCost(editSingleText, isBig, letteringRates);
        const bulkSummary = parseBulkLetteringLines(editBulkText, isBig, letteringRates);

        const effectiveQuantity =
          editIsPersonalized && editLetteringMode === 'bulk'
            ? Math.max(1, bulkSummary.lineCount)
            : Math.max(1, editQuantity);

        const avgExtraPerUnit = !editIsPersonalized
          ? 0
          : editLetteringMode === 'bulk'
          ? bulkSummary.averageExtraCostPerUnit
          : singleBreakdown.extraCost;

        const totalExtraCost = !editIsPersonalized
          ? 0
          : editLetteringMode === 'bulk'
          ? bulkSummary.totalExtraCost
          : singleBreakdown.extraCost * effectiveQuantity;

        const finalUnitPrice = Number((baseUnitPrice + avgExtraPerUnit).toFixed(2));
        const finalSubtotal = Number((baseUnitPrice * effectiveQuantity + totalExtraCost).toFixed(2));

        const exceedsStock = variantStock < 999999 && effectiveQuantity > variantStock;
        const shortageCount = exceedsStock ? Math.max(0, effectiveQuantity - Math.max(0, variantStock)) : 0;

        const handleSaveEdit = () => {
          setEditError(null);

          if (editIsPersonalized) {
            if (editLetteringMode === 'single' && !editSingleText.trim()) {
              setEditError('Please enter a name for Single Name embroidery, or turn off Personalization.');
              return;
            }
            if (editLetteringMode === 'bulk' && bulkSummary.lineCount === 0) {
              setEditError('Please enter or paste at least 1 line of text in Bulk List mode.');
              return;
            }
          }

          if (exceedsStock && !editPreOrderAccepted) {
            setEditError(
              `Your quantity (${effectiveQuantity} pcs) exceeds the ${Math.max(0, variantStock)} pcs currently in stock. Please check the Pre-Order acknowledgment box below to proceed.`
            );
            return;
          }

          const updatedPersonalization = editIsPersonalized
            ? {
                text:
                  editLetteringMode === 'bulk'
                    ? bulkSummary.namesList.length === 1
                      ? bulkSummary.namesList[0]
                      : `${bulkSummary.namesList.length} Names (${bulkSummary.namesList.slice(0, 3).join(', ')}${
                          bulkSummary.namesList.length > 3 ? '...' : ''
                        })`
                    : sanitizeSingleLineText(editSingleText).trim(),
                namesList:
                  editLetteringMode === 'bulk'
                    ? bulkSummary.namesList
                    : [sanitizeSingleLineText(editSingleText).trim()],
                isBulkList: editLetteringMode === 'bulk' && bulkSummary.namesList.length > 1,
                font: editingItem.personalization?.font || 'Classic Cursive Script',
                threadColor: editThreadColor.name,
                threadHex: editThreadColor.hex,
                extraLetteringCost: Number(avgExtraPerUnit.toFixed(2)),
                totalExtraLetteringCost: Number(totalExtraCost.toFixed(2)),
              }
            : undefined;

          updateBasketItem(editingItem.id, {
            selectedVariant: editVariantName || editingItem.selectedVariant,
            selectedColor: editSelectedColor || editingItem.selectedColor,
            selectedSize: editSelectedSize || editingItem.selectedSize,
            imageUrl: editImageUrl || editingItem.imageUrl,
            baseUnitPrice,
            garmentSize,
            price: finalUnitPrice,
            quantity: effectiveQuantity,
            isPreOrder: exceedsStock,
            preOrderShortage: shortageCount,
            personalization: updatedPersonalization,
          });

          showToast(`Updated "${editingItem.name}" in your basket`, 'success');
          setEditingItem(null);
        };

        return (
          <GlassModal
            isOpen={Boolean(editingItem)}
            onClose={() => setEditingItem(null)}
            maxWidth="max-w-[560px]"
          >
            <div className="flex flex-col gap-4 text-left p-1 max-h-[82vh] overflow-y-auto pr-1">
              {/* Header */}
              <div className="flex flex-col gap-1.5 border-b border-border-glass pb-3 pr-10">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[0.65rem] uppercase tracking-wider text-primary font-bold">
                    Edit Basket Item &amp; Personalization
                  </span>
                  <span
                    className={`text-[0.62rem] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      isBig
                        ? 'bg-white/5 text-text-dim border-border-glass'
                        : 'bg-white/5 text-text-dim border-border-glass'
                    }`}
                  >
                    {isBig
                      ? `Big Garment (+₱${letteringRates.bigRate}/extra letter)`
                      : `Small Garment (+₱${letteringRates.smallRate}/extra letter)`}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-text-main m-0 leading-tight">
                  {editingItem.name}
                </h3>
              </div>

              {/* 1. Variant Selection */}
              {variants.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-text-main uppercase tracking-wider">
                    1. Garment Variant / Color
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                    {variants.map((v: ProductVariant, idx: number) => {
                      const isVarSelected = editVariantName === v.name;
                      const vPrice = v.priceOverride ?? product?.price ?? baseUnitPrice;
                      const vStock = v.availableStock !== undefined ? v.availableStock : (v.stock ?? 0);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setEditVariantName(v.name);
                            if (v.color) setEditSelectedColor(v.color);
                            if (v.size) setEditSelectedSize(v.size);
                            if (v.imageUrl) setEditImageUrl(v.imageUrl);
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer text-left ${
                            isVarSelected
                              ? 'bg-primary/15 border-primary shadow-sm ring-1 ring-primary'
                              : 'bg-bg-surface/80 hover:bg-white/[0.06] border-border-glass'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {v.color && (
                              <span
                                className="w-4 h-4 rounded-full border border-white/40 shrink-0"
                                style={{ backgroundColor: v.color }}
                              />
                            )}
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-text-main block truncate">
                                {v.name}
                              </span>
                              <span className="text-[0.65rem] text-text-dim block">
                                {vStock > 0 ? `${vStock} in stock` : 'Pre-Order available'}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-primary shrink-0 pl-2">
                            ₱{vPrice.toFixed(0)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Personalization Toggle & Single vs Bulk Mode */}
              <div className="flex flex-col gap-3 bg-white/[0.02] border border-border-glass rounded-xl p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-text-main block">
                      2. Custom Embroidery Lettering
                    </span>
                    <span className="text-[0.68rem] text-text-dim">
                      First word/name free • Max {MAX_CHARS_PER_LINE} chars per line (including spaces)
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsPersonalized}
                      onChange={(e) => setEditIsPersonalized(e.target.checked)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                    <span className="text-xs font-bold text-primary">
                      {editIsPersonalized ? 'Personalized' : 'Plain (No Text)'}
                    </span>
                  </label>
                </div>

                {editIsPersonalized && (
                  <>
                    {/* Mode Switcher: Single Name <-> Bulk List */}
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-bg-surface border border-border-glass rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          if (editLetteringMode === 'bulk') {
                            const firstLine = bulkSummary.namesList[0] || '';
                            if (firstLine) setEditSingleText(sanitizeSingleLineText(firstLine));
                          }
                          setEditLetteringMode('single');
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
                          editLetteringMode === 'single'
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-transparent text-text-dim hover:text-text-main'
                        }`}
                      >
                        Single Name
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editLetteringMode === 'single' && editSingleText.trim() && !editBulkText.trim()) {
                            setEditBulkText(sanitizeSingleLineText(editSingleText));
                          }
                          setEditLetteringMode('bulk');
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
                          editLetteringMode === 'bulk'
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-transparent text-text-dim hover:text-text-main'
                        }`}
                      >
                        📋 Bulk List (Copy &amp; Paste)
                      </button>
                    </div>

                    {/* Single Name Input */}
                    {editLetteringMode === 'single' ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-[0.7rem]">
                          <span className="text-text-dim font-medium">
                            Embroidery Name (or paste multiple lines to switch to Bulk):
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              editSingleText.length >= MAX_CHARS_PER_LINE ? 'text-primary' : 'text-text-dim'
                            }`}
                          >
                            {editSingleText.length}/{MAX_CHARS_PER_LINE} chars
                          </span>
                        </div>
                        <input
                          type="text"
                          value={editSingleText}
                          maxLength={MAX_CHARS_PER_LINE}
                          onPaste={(e) => {
                            const pasted = e.clipboardData.getData('text');
                            if (pasted && /\r?\n/.test(pasted.trim())) {
                              e.preventDefault();
                              const sanitizedMulti = sanitizeBulkMultilineText(pasted);
                              setEditBulkText(sanitizedMulti);
                              setEditLetteringMode('bulk');
                            }
                          }}
                          onChange={(e) => setEditSingleText(sanitizeSingleLineText(e.target.value))}
                          placeholder="e.g. Coach1 A (max 20 chars)"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-bg-surface border border-border-glass text-text-main text-sm font-medium focus:outline-none focus:border-primary"
                        />
                        {editSingleText.trim() && (
                          <div className="text-[0.7rem] text-text-dim flex items-center justify-between bg-white/[0.03] px-2.5 py-1.5 rounded-lg border border-white/5">
                            <span>{singleBreakdown.explanation}</span>
                            <span className="font-mono font-bold text-primary">
                              {singleBreakdown.extraCost > 0
                                ? `+₱${singleBreakdown.extraCost.toFixed(2)}/pc`
                                : 'Included'}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Bulk Multi-Line Textarea */
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center text-[0.7rem]">
                          <span className="text-text-dim font-medium">
                            1 line = 1 piece (Max {MAX_CHARS_PER_LINE} chars per line incl. spaces):
                          </span>
                          <span className="font-mono font-bold text-primary">
                            {bulkSummary.lineCount} {bulkSummary.lineCount === 1 ? 'line' : 'lines'} = {bulkSummary.lineCount} qty
                          </span>
                        </div>
                        <textarea
                          rows={5}
                          value={editBulkText}
                          onChange={(e) => setEditBulkText(sanitizeBulkMultilineText(e.target.value))}
                          placeholder={`Paste or type names (1 per line, max 20 chars/line):\nCoach1\nCoach2\nCoach3 A\nPlayer 4`}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-bg-surface border border-border-glass text-text-main text-xs font-mono leading-relaxed focus:outline-none focus:border-primary resize-y"
                        />

                        {/* Per-line breakdown preview */}
                        {bulkSummary.lines.length > 0 && (
                          <div className="bg-bg-surface border border-border-glass rounded-lg p-2.5 max-h-[140px] overflow-y-auto flex flex-col gap-1">
                            {bulkSummary.lines.map((line) => (
                              <div
                                key={line.lineIndex}
                                className="flex items-center justify-between text-[0.68rem] py-0.5 border-b border-white/5 last:border-none"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-text-dim font-mono">#{line.lineIndex}</span>
                                  <span className="font-mono text-text-main truncate font-semibold">
                                    &ldquo;{line.sanitizedLine}&rdquo;
                                  </span>
                                  <span className="text-[0.62rem] text-text-dim font-mono">
                                    ({line.charCount}/{MAX_CHARS_PER_LINE})
                                  </span>
                                </div>
                                <span
                                  className={`font-mono font-bold shrink-0 ${
                                    line.extraCost > 0 ? 'text-primary' : 'text-text-dim'
                                  }`}
                                >
                                  {line.extraCost > 0
                                    ? `+₱${line.extraCost} (${line.extraLettersCount} extra)`
                                    : 'Included'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Thread Color Swatches */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <span className="text-[0.7rem] text-text-dim font-semibold">
                        Thread Color: <strong className="text-text-main">{editThreadColor.name}</strong>
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {availableColors
                          .filter((c) => c.isAvailable !== false)
                          .map((c) => {
                            const active = editThreadColor.name === c.name;
                            return (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => setEditThreadColor({ name: c.name, hex: c.hex })}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[0.7rem] font-semibold cursor-pointer transition-all ${
                                  active
                                    ? 'bg-primary/20 border-primary text-text-main ring-1 ring-primary'
                                    : 'bg-bg-surface border-border-glass text-text-dim hover:text-text-main'
                                }`}
                              >
                                <span
                                  className="w-3 h-3 rounded-full border border-white/40 shrink-0"
                                  style={{ backgroundColor: c.hex }}
                                />
                                <span>{c.name}</span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 3. Quantity & Stock / Pre-Order Check */}
              <div className="flex flex-col gap-2.5 bg-white/[0.02] border border-border-glass rounded-xl p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-text-main block">3. Order Quantity</span>
                    <span className="text-[0.68rem] text-text-dim">
                      {variantStock < 999999
                        ? `On-hand stock for this variant: ${Math.max(0, variantStock)} pcs`
                        : 'Available for studio embroidery'}
                    </span>
                  </div>

                  {editIsPersonalized && editLetteringMode === 'bulk' ? (
                    <span className="px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary font-mono font-bold text-xs">
                      {effectiveQuantity} pcs (Auto-synced from {bulkSummary.lineCount} lines)
                    </span>
                  ) : (
                    <QuantityInput
                      value={editQuantity}
                      onChange={(q) => setEditQuantity(Math.max(1, q))}
                      min={1}
                      max={9999}
                      size="sm"
                      ariaLabel="Edit item quantity"
                    />
                  )}
                </div>

                {/* Pre-Order Warning & Acceptance when exceeding on-hand stock */}
                {exceedsStock && (
                  <div className="mt-1 p-3 rounded-xl bg-bg-surface border border-border-glass text-xs text-text-dim flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none">⚠️</span>
                      <div className="leading-relaxed">
                        <strong className="text-text-main block mb-0.5">
                          Quantity Exceeds Immediate On-Hand Stock ({Math.max(0, variantStock)} available)
                        </strong>
                        You are ordering <strong>{effectiveQuantity} pcs</strong> ({shortageCount} pcs beyond immediate on-hand stock). You can proceed with this order as a <strong>Pre-Order (100% upfront payment)</strong> with an extended workshop preparation &amp; production schedule (+{letteringRates.preOrderPrepDays} prep days plus batch embroidery turnaround).
                      </div>
                    </div>
                    <label className="flex items-center gap-2.5 pt-1.5 border-t border-border-glass cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editPreOrderAccepted}
                        onChange={(e) => setEditPreOrderAccepted(e.target.checked)}
                        className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                      />
                      <span className="text-[0.72rem] font-bold text-text-main">
                        I accept the extended Pre-Order production wait time and 100% upfront payment
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {editError && (
                <div className="p-2.5 rounded-lg bg-danger/15 border border-danger/30 text-danger text-xs font-semibold">
                  {editError}
                </div>
              )}

              {/* Summary & Action Buttons */}
              <div className="pt-3 border-t border-border-glass flex items-center justify-between gap-3">
                <div>
                  <span className="text-[0.68rem] text-text-dim block">
                    Updated Item Total ({effectiveQuantity} pcs)
                  </span>
                  <span className="text-lg font-mono font-black text-primary">
                    ₱{finalSubtotal.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2.5 rounded-xl border border-border-glass bg-bg-surface hover:bg-white/5 text-text-main text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-extrabold transition-all cursor-pointer border-none shadow-md"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </GlassModal>
        );
      })()}
    </section>
  );
}
