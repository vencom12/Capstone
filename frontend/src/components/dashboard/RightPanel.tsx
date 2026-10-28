'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBasketStore } from '@/stores/useBasketStore';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import GlassButton from '@/components/ui/GlassButton';
import QuantityInput from '@/components/ui/QuantityInput';
import { showToast } from '@/components/ui/Toast';
import type { BasketItem } from '@/lib/types';

interface RightPanelProps {
  onCheckout: () => void;
  onCloseMobile?: () => void;
  onClose?: () => void;
}

export default function RightPanel({ onCheckout, onCloseMobile, onClose }: RightPanelProps) {
  const router = useRouter();
  const { items, getCount, getTotal, removeItem, updateBasketItem } = useBasketStore();
  const { products } = useProductStore();
  const { isAuthenticated } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = onClose || onCloseMobile;
  const basketCount = getCount();
  const basketTotal = getTotal();

  const handleQuantityChange = (item: BasketItem, newQty: number, availableStock: number) => {
    if (newQty < 1) return;
    const isBulk = Boolean(
      item.personalization?.isBulkList ||
        (Array.isArray(item.personalization?.namesList) && item.personalization!.namesList!.length > 1)
    );
    if (isBulk) {
      showToast('Bulk Name List quantity is synced to lines. Edit names in your Basket.', 'info');
      if (handleClose) handleClose();
      router.push('/dashboard?tab=basket');
      return;
    }

    if (availableStock < 999999 && newQty > availableStock) {
      updateBasketItem(item.id, {
        quantity: newQty,
        isPreOrder: true,
        preOrderShortage: Math.max(0, newQty - Math.max(0, availableStock)),
      });
      showToast(
        `Quantity (${newQty}) exceeds current stock (${Math.max(0, availableStock)}). Marked as Pre-Order.`,
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

  const handleExploreShop = () => {
    if (handleClose) handleClose();
    const el = document.getElementById('products-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      router.push('/#products-section');
    }
  };

  return (
    <aside className="w-[380px] max-w-[100vw] h-full bg-bg-sidebar/95 backdrop-blur-2xl border-l border-border-glass flex flex-col shadow-2xl z-40 relative">
      {/* =========================================================================
          DRAWER HEADER
          ========================================================================= */}
      <div className="px-6 py-5 border-b border-border-glass flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/25 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </div>
          <div>
            <h3 className="m-0 text-[1.05rem] font-bold tracking-tight text-text-main flex items-center gap-2">
              <span>Your Basket</span>
              {mounted && basketCount > 0 && (
                <span className="bg-primary text-white text-[0.7rem] px-2 py-0.5 rounded-full font-bold shadow-sm">
                  {basketCount}
                </span>
              )}
            </h3>
          </div>
        </div>

        {/* Close Button (Universal across Desktop and Mobile) */}
        {handleClose && (
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/5 border border-border-glass text-text-dim hover:text-text-main hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all active:scale-95"
            title="Close Basket"
            aria-label="Close Basket"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* =========================================================================
          DRAWER BODY: ITEMS LIST / EMPTY STATE (Scrollable)
          ========================================================================= */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {!mounted || items.length === 0 ? (
          <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center px-4 py-8">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-border-glass flex items-center justify-center text-text-dim mb-4 shadow-inner">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <h4 className="text-base font-bold text-text-main m-0">Your basket is empty</h4>
            <p className="text-xs text-text-dim mt-1.5 max-w-[220px] leading-relaxed">
              Explore our custom embroidery blanks, caps, and heirloom pieces.
            </p>
            <button
              type="button"
              onClick={handleExploreShop}
              className="mt-5 px-5 py-2.5 rounded-xl bg-primary/10 border border-primary/25 hover:bg-primary hover:text-white text-primary font-bold text-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-sm"
            >
              <span>Explore Products</span>
              <span>↓</span>
            </button>
          </div>
        ) : (
          items.map((item) => {
            const product = products.find((p) => (p.id || p._id) === item.productId);
            let availableStock = 999999;
            if (product) {
              if (product.variants && Array.isArray(product.variants) && item.selectedVariant) {
                const v = product.variants.find((variant: any) => variant.name === item.selectedVariant);
                if (v) {
                  availableStock = v.availableStock !== undefined ? v.availableStock : (v.stock ?? 999999);
                } else {
                  availableStock = product.availableStock !== undefined ? product.availableStock : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
                }
              } else {
                availableStock = product.availableStock !== undefined ? product.availableStock : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
              }
            }
            const isBulk = Boolean(
              item.personalization?.isBulkList ||
                (Array.isArray(item.personalization?.namesList) && item.personalization!.namesList!.length > 1)
            );
            const namesList = Array.isArray(item.personalization?.namesList) ? item.personalization!.namesList! : [];
            const isPreOrder = Boolean(item.isPreOrder || (availableStock < 999999 && item.quantity > availableStock));

            return (
              <div
                key={item.id}
                className="flex gap-3 bg-bg-surface/80 hover:bg-bg-surface p-3 rounded-2xl border border-border-glass transition-all duration-200 animate-[fadeIn_0.2s_ease-out]"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    className="w-16 h-16 rounded-xl object-cover bg-black/20 shrink-0 border border-border-glass/40"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-white/5 border border-border-glass/40 flex items-center justify-center text-[0.6rem] font-bold text-text-dim shrink-0">
                    PREVIEW
                  </div>
                )}

                <div className="flex flex-col flex-1 min-w-0 justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-[0.88rem] text-text-main truncate leading-tight">
                        {item.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-text-dim hover:text-danger bg-transparent border-none cursor-pointer p-0.5 transition-colors shrink-0"
                        title="Remove item"
                        aria-label="Remove item"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {item.selectedVariant && (
                        <span className="text-[0.7rem] text-primary flex items-center gap-1 font-semibold">
                          {item.selectedColor && (
                            <span
                              className="w-2 h-2 rounded-full inline-block border border-white/20 shrink-0"
                              style={{ backgroundColor: item.selectedColor }}
                            />
                          )}
                          <span className="truncate">{item.selectedVariant}</span>
                          {item.selectedSize && <span className="opacity-70">({item.selectedSize})</span>}
                        </span>
                      )}
                      {isPreOrder && (
                        <span className="text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Pre-Order
                        </span>
                      )}
                    </div>

                    {isBulk && namesList.length > 0 ? (
                      <div className="mt-1 text-[0.68rem] text-emerald-300 font-semibold truncate">
                        📋 {namesList.length} Names: {namesList.slice(0, 3).join(', ')}
                        {namesList.length > 3 ? ` +${namesList.length - 3} more` : ''}
                      </div>
                    ) : item.personalization?.text ? (
                      <div className="mt-1 text-[0.68rem] text-text-dim truncate">
                        Embroidery: <strong className="text-text-main">&ldquo;{item.personalization.text}&rdquo;</strong>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-border-glass/30">
                    <div>
                      <span className="text-text-main font-black text-[0.92rem] block">
                        ₱{(item.price * item.quantity).toFixed(2)}
                      </span>
                      <Link
                        href="/dashboard?tab=basket"
                        onClick={() => handleClose && handleClose()}
                        className="text-[0.65rem] text-primary hover:underline font-bold no-underline"
                      >
                        Edit Item / Names →
                      </Link>
                    </div>

                    {/* Quantity Stepper & Direct Typing */}
                    <div className="flex items-center">
                      <QuantityInput
                        value={item.quantity}
                        onChange={(newQty) => handleQuantityChange(item, newQty, availableStock)}
                        min={1}
                        max={9999}
                        size="sm"
                        ariaLabel={`Quantity for ${item.name}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* =========================================================================
          DRAWER FOOTER: SUB-TOTAL & STICKY CHECKOUT (Pinned at Bottom)
          ========================================================================= */}
      {mounted && items.length > 0 && (
        <div className="p-5 border-t border-border-glass bg-bg-card/70 backdrop-blur-xl shrink-0 flex flex-col gap-3.5">
          {/* Pickup Fulfillment Note */}
          <div className="flex items-center justify-between text-xs text-text-dim bg-white/[0.03] px-3 py-2 rounded-xl border border-border-glass/40">
            <span className="font-medium text-text-main">
              Studio Pickup (100% Upfront)
            </span>
            <span className="text-emerald-400 font-bold text-[0.7rem] uppercase tracking-wider">Free</span>
          </div>

          <div className="flex justify-between items-baseline px-0.5">
            <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Subtotal:</span>
            <span className="font-black text-xl text-primary">₱{basketTotal.toFixed(2)}</span>
          </div>

          <GlassButton
            variant="primary"
            fullWidth
            onClick={onCheckout}
            disabled={items.length === 0}
          >
            Checkout Now →
          </GlassButton>

          {/* Quick Basket Editor & Order Tracking Links */}
          <div className="flex items-center justify-between text-[0.72rem] pt-0.5">
            <Link
              href="/dashboard?tab=basket"
              onClick={() => handleClose && handleClose()}
              className="text-primary font-bold hover:underline no-underline"
            >
              Open Full Basket &amp; Edit Names
            </Link>
            {isAuthenticated && (
              <Link
                href="/dashboard?tab=tracking"
                onClick={() => handleClose && handleClose()}
                className="text-text-dim hover:text-text-main no-underline"
              >
                Track Orders →
              </Link>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
