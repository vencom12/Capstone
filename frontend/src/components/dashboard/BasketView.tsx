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
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>('delivery');

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
    onOpenCheckout(selectedItems, fulfillmentType);
  };

  // 1. EMPTY STATE
  if (items.length === 0) {
    return (
      <section className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
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
    <section className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
      {/* Header */}
      <header className="mb-6 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white m-0 tracking-tight flex items-center gap-3">
            <span>My Embroidery Basket</span>
            <span className="text-xs bg-primary/20 border border-primary/30 text-primary px-3 py-1 rounded-full font-bold">
              {totalItemCount} {totalItemCount === 1 ? 'Item' : 'Items'}
            </span>
          </h1>
          <p className="text-text-dim text-[0.85rem] mt-1 m-0">
            Review custom thread colors, quantities, and delivery options before instant GCash checkout.
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
          className="text-text-dim hover:text-danger text-xs font-semibold px-3 py-1.5 rounded-lg border border-border-glass hover:border-danger/30 transition-all cursor-pointer bg-black/20"
        >
          Clear Basket
        </button>
      </header>

      {/* Main 2-Column Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pr-1 pb-24 lg:pb-6 items-start">
        {/* Left Column: Itemized Cards (8 of 12 cols on desktop) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Select All Controls Bar */}
          <div className="bg-bg-surface/80 border border-border-glass rounded-2xl p-4 flex items-center justify-between backdrop-blur-md">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
              <span className="text-sm font-bold text-white">
                Select All ({items.length} {items.length === 1 ? 'product' : 'products'})
              </span>
            </label>

            <span className="text-xs text-text-dim">
              {selectedItems.length} of {items.length} selected
            </span>
          </div>

          {/* Items List */}
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const product = products.find((p) => (p.id || (p as any)._id) === item.productId);
              const isFav = favorites.some((f) => (f.id || (f as any)._id) === item.productId);

              return (
                <div
                  key={item.id}
                  className={`bg-bg-card border rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 transition-all duration-200 relative ${
                    isSelected
                      ? 'border-primary/40 bg-bg-card/90 shadow-sm'
                      : 'border-border-glass/60 opacity-80 hover:opacity-100'
                  }`}
                >
                  {/* Item Checkbox */}
                  <div className="flex items-center sm:self-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.id)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                  </div>

                  {/* Thumbnail */}
                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl bg-black/40 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center relative">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[0.65rem] font-bold text-text-dim uppercase tracking-wider text-center p-2">
                        Custom Blank
                      </span>
                    )}
                    {item.selectedColor && (
                      <div
                        className="absolute bottom-1 right-1 w-4 h-4 rounded-full border border-white/50 shadow-sm"
                        style={{ backgroundColor: item.selectedColor }}
                        title={`Color: ${item.selectedColor}`}
                      />
                    )}
                  </div>

                  {/* Item Details */}
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h3 className="text-base font-bold text-white m-0 truncate">
                            {item.name}
                          </h3>
                          {product?.tag && (
                            <span className="inline-block text-[0.65rem] uppercase tracking-wider text-text-dim mt-0.5">
                              {product.tag}
                            </span>
                          )}
                        </div>

                        {/* Line Total */}
                        <div className="text-right shrink-0">
                          <span className="text-base font-mono font-black text-primary block">
                            ₱{(item.price * item.quantity).toFixed(2)}
                          </span>
                          <span className="text-[0.7rem] text-text-dim">
                            ₱{item.price.toFixed(2)} each
                          </span>
                        </div>
                      </div>

                      {/* Variant & Personalization Badges */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {item.selectedVariant && (
                          <span className="bg-white/5 border border-white/10 text-text-main text-[0.72rem] px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 font-medium">
                            <span className="text-text-dim">Style:</span>
                            {item.selectedVariant}
                          </span>
                        )}
                        {item.selectedSize && (
                          <span className="bg-white/5 border border-white/10 text-text-main text-[0.72rem] px-2.5 py-0.5 rounded-lg font-medium">
                            <span className="text-text-dim">Size:</span> {item.selectedSize}
                          </span>
                        )}
                        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[0.7rem] px-2.5 py-0.5 rounded-lg font-medium flex items-center gap-1">
                          <span>🧵</span> Embroidery Digitizing Included
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Quantity Controls & Secondary Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-white/5">
                      {/* Interactive Stepper */}
                      <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.id, item.productId, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed border-none text-sm"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-mono font-bold text-white select-none">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.id, item.productId, item.quantity + 1)}
                          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center transition-all cursor-pointer border-none text-sm"
                        >
                          +
                        </button>
                      </div>

                      {/* Quick Actions */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleMoveToFavorites(item)}
                          className="text-[0.75rem] text-text-dim hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill={isFav ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth="2"
                            className={isFav ? 'text-primary' : ''}
                          >
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                          </svg>
                          <span>Move to Favorites</span>
                        </button>

                        <span className="text-white/10">|</span>

                        <button
                          type="button"
                          onClick={() => {
                            removeItem(item.id);
                            showToast(`Removed "${item.name}" from basket`, 'info');
                          }}
                          className="text-[0.75rem] text-text-dim hover:text-danger transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Sticky Order Summary & Checkout Card (4 of 12 cols on desktop) */}
        <div className="lg:col-span-4 sticky top-4 flex flex-col gap-4">
          <div className="bg-bg-surface/90 border border-border-glass rounded-3xl p-6 backdrop-blur-xl shadow-xl flex flex-col gap-5">
            <h2 className="text-lg font-black text-white m-0 pb-3 border-b border-white/10 flex items-center justify-between">
              <span>Order Summary</span>
              <span className="text-xs font-mono font-bold text-primary">
                {selectedItemCount} {selectedItemCount === 1 ? 'item' : 'items'}
              </span>
            </h2>

            {/* Fulfillment Method Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[0.72rem] font-bold text-text-dim uppercase tracking-wider">
                Fulfillment Method
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setFulfillmentType('delivery')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 border cursor-pointer ${
                    fulfillmentType === 'delivery'
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-transparent text-text-dim border-transparent hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>🚚</span>
                  <span>Door Delivery</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentType('pickup')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 border cursor-pointer ${
                    fulfillmentType === 'pickup'
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-transparent text-text-dim border-transparent hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>🏪</span>
                  <span>Store Pick-up</span>
                </button>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="flex flex-col gap-3 text-sm">
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
                <span>Logistics:</span>
                <span className="text-text-main font-medium text-xs">
                  {fulfillmentType === 'pickup' ? 'Store Counter Claiming' : 'J&T Express Philippines'}
                </span>
              </div>

              <div className="flex justify-between items-center text-text-dim">
                <span>Shipping Fee:</span>
                <span className={`text-xs font-semibold ${fulfillmentType === 'pickup' ? 'text-emerald-400' : 'text-text-main'}`}>
                  {fulfillmentType === 'pickup' ? 'FREE (Store Pick-up)' : 'Standard Delivery'}
                </span>
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                <div>
                  <span className="text-base font-black text-white block">Total Payable</span>
                  <span className="text-[0.7rem] text-text-dim">All taxes & fees included</span>
                </div>
                <span className="text-2xl font-mono font-black text-primary">
                  ₱{selectedTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Destination / Pick-up Preview */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex flex-col gap-1 text-xs">
              <span className="font-bold text-text-dim uppercase tracking-wider text-[0.65rem] flex items-center gap-1.5">
                {fulfillmentType === 'pickup' ? (
                  <>
                    <span className="text-primary text-xs">🏪</span>
                    Pick-up Location
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    Delivering To
                  </>
                )}
              </span>
              <p className="text-white font-medium m-0 truncate">
                {fulfillmentType === 'pickup'
                  ? 'Eds Towels & Caps, Pacific Mall Lucena, Quezon'
                  : (user?.address || 'Specify delivery address at checkout')}
              </p>
              {fulfillmentType === 'pickup' && (
                <span className="text-[0.68rem] text-primary/90 font-medium">
                  Mall Hours: 10:00 AM – 8:00 PM Daily
                </span>
              )}
            </div>

            {/* Checkout CTA */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={selectedItems.length === 0}
              className="w-full py-4 rounded-2xl bg-primary hover:bg-primary-light text-white font-extrabold text-sm tracking-wide transition-all duration-200 cursor-pointer border-none shadow-lg hover:shadow-primary/30 flex items-center justify-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              <span>{fulfillmentType === 'pickup' ? 'Proceed to Pick-up Checkout' : 'Proceed to GCash Checkout'}</span>
              <span className="transition-transform group-hover:translate-x-1 font-bold">→</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Bottom Bar for Mobile Screen Checkout */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-bg-surface/95 backdrop-blur-xl border-t border-border-glass p-3 px-4 z-40 flex items-center justify-between gap-3 shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col">
          <span className="text-[0.68rem] text-text-dim uppercase tracking-wider font-semibold">
            Total ({selectedItemCount} {selectedItemCount === 1 ? 'item' : 'items'})</span>
            <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-white/10 text-primary font-bold">{fulfillmentType === 'pickup' ? '🏪 Pick-up' : '🚚 Delivery'}</span>
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
          <span>GCash Checkout</span>
          <span className="font-bold">→</span>
        </button>
      </div>
    </section>
  );
}
