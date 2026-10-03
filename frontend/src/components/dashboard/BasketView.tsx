'use client';

import React, { useState, useEffect } from 'react';
import { useBasketStore } from '@/stores/useBasketStore';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';
import type { BasketItem } from '@/lib/types';

interface BasketViewProps {
  onGoToShop: () => void;
  onOpenCheckout: (selectedItems?: BasketItem[], fulfillmentType?: 'delivery' | 'pickup') => void;
}

export default function BasketView({ onGoToShop, onOpenCheckout }: BasketViewProps) {
  const { items, removeItem, updateQuantity, clearBasket } = useBasketStore();
  const { products, toggleFavorite, favorites } = useProductStore();
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  // Selected item IDs for checkout
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
    // Select all items by default on initial mount
    setSelectedIds(items.map((i) => i.id));
  }, []);

  // Sync selected IDs if items list changes
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((i) => i.id === id)));
  }, [items]);

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

  const handleQuantityChange = (id: string, productId: string, newQty: number) => {
    if (newQty < 1) return;
    const product = products.find((p) => (p.id || (p as any)._id) === productId);
    if (product) {
      const availableStock =
        product.availableStock !== undefined
          ? product.availableStock
          : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
      if (newQty > availableStock) {
        showToast(
          `Only ${availableStock} units of "${product.name}" are currently available in stock.`,
          'error'
        );
        return;
      }
    }
    updateQuantity(id, newQty);
  };

  const handleMoveToFavorites = (item: BasketItem) => {
    const product = products.find((p) => (p.id || (p as any)._id) === item.productId);
    if (product) {
      toggleFavorite(product);
      removeItem(item.id);
      showToast(`Moved "${item.name}" to your Favorites!`, 'success');
    } else {
      removeItem(item.id);
      showToast(`Removed from basket`, 'info');
    }
  };

  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      showToast('Please select at least one item to proceed to checkout.', 'error');
      return;
    }
    // Open checkout without forcing fulfillment upfront; let customer choose in CheckoutModal
    onOpenCheckout(selectedItems);
  };

  // 1. EMPTY STATE
  if (items.length === 0) {
    return (
      <section className="flex flex-col min-h-full animate-[fadeIn_0.3s_ease-out]">
        <header className="mb-6">
          <h1 className="text-2xl font-black text-white m-0 tracking-tight flex items-center gap-3">
            <span>My Embroidery Basket</span>
            <span className="text-xs bg-white/10 text-text-dim px-3 py-1 rounded-full font-normal">
              0 Items
            </span>
          </h1>
          <p className="text-text-dim text-[0.85rem] mt-1 m-0">
            Review your customized towels, caps, and garments before placing your order.
          </p>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[420px] bg-white/[0.02] border-2 border-dashed border-border-glass rounded-3xl">
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
          <h2 className="text-xl font-bold text-white mb-2">Your Basket is Empty</h2>
          <p className="text-text-dim text-sm max-w-md mb-6 leading-relaxed">
            You haven&apos;t added any personalized caps or luxury towels yet. Explore our custom embroidery catalog and customize your design!
          </p>
          <button
            onClick={onGoToShop}
            className="px-6 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition-all cursor-pointer border-none shadow-md hover:shadow-lg flex items-center gap-2 group"
          >
            <span>Explore Towels & Caps Catalog</span>
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
      <header className="mb-5 flex justify-between items-end flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-white m-0 tracking-tight">
              My Embroidery Basket
            </h1>
            <span className="text-xs bg-primary/20 border border-primary/30 text-primary px-2.5 py-0.5 rounded-full font-bold">
              {totalItemCount} {totalItemCount === 1 ? 'Item' : 'Items'}
            </span>
          </div>
          <p className="text-text-dim text-xs mt-1 m-0">
            Review custom colors, garment options, and quantities before proceeding to checkout.
          </p>
        </div>

        {/* Clear All CTA */}
        <button
          onClick={() => {
            if (confirm('Are you sure you want to empty your basket?')) {
              clearBasket();
              showToast('Basket cleared', 'info');
            }
          }}
          className="text-text-dim hover:text-danger text-xs font-semibold px-3 py-1.5 rounded-lg border border-border-glass hover:border-danger/30 transition-all cursor-pointer bg-white/[0.03]"
        >
          Clear Basket
        </button>
      </header>

      {/* Main Grid: Clean & Well Proportioned */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-36 lg:pb-8 items-start">
        {/* Left Column: Itemized List Container (7 of 12 cols on desktop) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* Header Row / Select All Controls Bar */}
          <div className="bg-bg-surface/90 border border-border-glass rounded-2xl px-4 py-3 flex items-center justify-between backdrop-blur-md">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
              <span className="text-xs sm:text-sm font-bold text-white">
                Select All ({items.length} {items.length === 1 ? 'item' : 'items'})
              </span>
            </label>

            <span className="text-xs text-text-dim">
              <strong className="text-primary">{selectedItems.length}</strong> of {items.length} selected
            </span>
          </div>

          {/* Items Container */}
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const product = products.find((p) => (p.id || (p as any)._id) === item.productId);
              const isFav = favorites.some((f) => (f.id || (f as any)._id) === item.productId);

              return (
                <div
                  key={item.id}
                  className={`bg-bg-surface/70 border rounded-2xl p-4 sm:p-4.5 transition-all duration-200 ${
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
                    <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-xl bg-black/40 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center relative">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xl">🧵</span>
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
                          <h3 className="text-sm sm:text-base font-bold text-white m-0 truncate">
                            {item.name}
                          </h3>
                          {product?.tag && (
                            <span className="inline-block text-[0.65rem] uppercase tracking-wider text-text-dim mt-0.5">
                              {product.tag}
                            </span>
                          )}

                          {/* Variant & Personalization Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {item.selectedVariant && (
                              <span className="bg-white/5 border border-white/10 text-text-main text-[0.7rem] px-2 py-0.5 rounded-md font-medium">
                                {item.selectedVariant}
                              </span>
                            )}
                            {item.selectedSize && (
                              <span className="bg-white/5 border border-white/10 text-text-main text-[0.7rem] px-2 py-0.5 rounded-md font-medium">
                                Size: {item.selectedSize}
                              </span>
                            )}
                            <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[0.68rem] px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                              <span>🧵</span> Digitizing Included
                            </span>
                          </div>
                        </div>

                        {/* Price Breakdown */}
                        <div className="text-right shrink-0">
                          <span className="text-base sm:text-lg font-mono font-black text-primary block leading-tight">
                            ₱{(item.price * item.quantity).toFixed(2)}
                          </span>
                          <span className="text-[0.7rem] text-text-dim">
                            ₱{item.price.toFixed(2)} each
                          </span>
                        </div>
                      </div>

                      {/* Controls Row */}
                      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/5">
                        {/* Stepper */}
                        <div className="flex items-center gap-1 bg-black/40 border border-border-glass rounded-xl p-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(item.id, item.productId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed border-none text-xs"
                          >
                            -
                          </button>
                          <span className="w-7 text-center text-xs font-mono font-bold text-white select-none">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(item.id, item.productId, item.quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center transition-all cursor-pointer border-none text-xs"
                          >
                            +
                          </button>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveToFavorites(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-dim hover:text-primary transition-all flex items-center gap-1.5 cursor-pointer border border-border-glass text-[0.72rem]"
                            title="Save to Favorites"
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
                            <span className="hidden sm:inline">Save</span>
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
          <div className="p-3.5 bg-white/[0.02] border border-border-glass/60 rounded-2xl flex items-center justify-between text-xs text-text-dim">
            <span className="flex items-center gap-2">
              <span>🧵</span> Want to customize another towel or cap?
            </span>
            <button
              onClick={onGoToShop}
              className="text-primary font-bold hover:underline bg-transparent border-none cursor-pointer p-0"
            >
              + Add More Designs
            </button>
          </div>
        </div>

        {/* Right Column: Clean, Focused Order Summary (5 of 12 cols on desktop) */}
        <div className="lg:col-span-4 sticky top-4 flex flex-col gap-4">
          <div className="bg-bg-surface/90 border border-border-glass rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-xl flex flex-col gap-4">
            <h2 className="text-base font-extrabold text-white m-0 pb-3 border-b border-white/10 flex items-center justify-between">
              <span>Order Summary</span>
              <span className="text-xs font-mono font-bold text-primary">
                {selectedItemCount} {selectedItemCount === 1 ? 'item' : 'items'}
              </span>
            </h2>

            {/* Calculations Breakdown */}
            <div className="flex flex-col gap-2.5 text-xs sm:text-sm">
              <div className="flex justify-between items-center text-text-dim">
                <span>Merchandise Subtotal:</span>
                <span className="font-mono text-white font-bold">
                  ₱{selectedTotal.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center text-text-dim">
                <span>Embroidery Digitizing:</span>
                <span className="text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  Included (Free)
                </span>
              </div>

              <div className="flex justify-between items-center text-text-dim">
                <span>Fulfillment Method:</span>
                <span className="text-text-main font-medium text-xs">
                  Door Delivery or Store Pick-up
                </span>
              </div>

              <div className="flex justify-between items-center text-text-dim">
                <span>Shipping / Claiming:</span>
                <span className="text-xs text-text-dim">
                  Selected at checkout
                </span>
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                <div>
                  <span className="text-sm sm:text-base font-black text-white block">Estimated Total</span>
                  <span className="text-[0.68rem] text-text-dim">Free Pacific Mall Pick-up available</span>
                </div>
                <span className="text-xl sm:text-2xl font-mono font-black text-primary">
                  ₱{selectedTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Checkout CTA */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={selectedItems.length === 0}
              className="w-full py-3.5 sm:py-4 rounded-2xl bg-primary hover:bg-primary-light text-white font-extrabold text-sm tracking-wide transition-all duration-200 cursor-pointer border-none shadow-lg hover:shadow-primary/30 flex items-center justify-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              <span>Proceed to Checkout</span>
              <span className="transition-transform group-hover:translate-x-1 font-bold">→</span>
            </button>

            {/* Subtle Assurance */}
            <div className="flex items-center justify-center gap-1.5 text-[0.7rem] text-text-dim/80 pt-1 border-t border-white/5">
              <span>🛡️</span>
              <span>Fast Studio Embroidery • Official GCash Checkout</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom Bar for Mobile Screen Checkout */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-bg-surface/95 backdrop-blur-xl border-t border-border-glass p-3 px-4 z-40 flex items-center justify-between gap-3 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col">
          <span className="text-[0.68rem] text-text-dim uppercase tracking-wider font-semibold">
            Total ({selectedItemCount} {selectedItemCount === 1 ? 'item' : 'items'})
          </span>
          <span className="text-lg font-mono font-black text-primary leading-tight">
            ₱{selectedTotal.toFixed(2)}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCheckout}
          disabled={selectedItems.length === 0}
          className="px-5 py-3 rounded-xl bg-primary hover:bg-primary-light text-white font-extrabold text-xs shadow-md active:scale-95 transition-all cursor-pointer border-none flex items-center gap-1.5 disabled:opacity-40"
        >
          <span>Proceed to Checkout</span>
          <span className="font-bold">→</span>
        </button>
      </div>
    </section>
  );
}
