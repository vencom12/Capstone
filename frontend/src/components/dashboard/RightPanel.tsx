'use client';

import { useState, useEffect } from 'react';
import { useBasketStore } from '@/stores/useBasketStore';
import { useProductStore } from '@/stores/useProductStore';
import GlassButton from '@/components/ui/GlassButton';
import { showToast } from '@/components/ui/Toast';

interface RightPanelProps {
  onCheckout: () => void;
  onCloseMobile?: () => void;
}

export default function RightPanel({ onCheckout, onCloseMobile }: RightPanelProps) {
  const { items, getCount, getTotal, removeItem, updateQuantity } = useBasketStore();
  const { orders, products } = useProductStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const basketCount = getCount();
  const basketTotal = getTotal();

  const handleQuantityChange = (productId: string, newQty: number) => {
    if (newQty < 1) return;
    const product = products.find(p => (p.id || p._id) === productId);
    if (product) {
      const availableStock = product.availableStock !== undefined 
        ? product.availableStock 
        : Math.max(0, (product.count ?? 0) - (product.reservedCount ?? 0));
      if (newQty > availableStock) {
        showToast(`Sorry, you cannot add more. Only ${availableStock} units of "${product.name}" can be made with current stock.`, 'error');
        return;
      }
    }
    updateQuantity(productId, newQty);
  };

  // Filter for active orders (not completed/cancelled)
  const activeOrders = orders.filter((o) => !['Completed', 'Cancelled'].includes(o.status));

  return (
    <aside className="w-[320px] h-full bg-bg-sidebar backdrop-blur-[12px] border-l border-border-glass p-6 flex flex-col gap-6 overflow-y-auto max-[1100px]:w-[280px] shrink-0 z-40 relative">
      {/* Mobile Close Button (only visible when used as drawer) */}
      {onCloseMobile && (
        <button
          onClick={onCloseMobile}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/30 border border-border-glass text-white flex items-center justify-center cursor-pointer transition-all hover:bg-danger/10 hover:text-danger hidden max-[900px]:flex"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      )}

      {/* Shopping Basket */}
      <div className="flex flex-col border-b border-border-glass pb-6 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="m-0 text-[1.1rem] font-bold tracking-tight">Your Basket</h3>
          <span className="bg-primary px-3 py-1 rounded-full text-xs font-bold text-white shadow-[0_0_10px_rgba(99,102,241,0.3)]">
            {mounted ? basketCount : 0} Items
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {!mounted || items.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center text-text-dim text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
              <p className="text-[0.9rem] m-0">Basket is empty</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex gap-3 bg-bg-surface p-3 rounded-xl border border-border-glass animate-[fadeIn_0.3s_ease-out]">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-cover bg-black/20" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-[0.6rem] font-bold text-text-dim text-center leading-tight">PREVIEW</div>
                )}
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-semibold text-[0.9rem] truncate">{item.name}</span>
                  {item.selectedVariant && (
                    <span className="text-[0.7rem] text-primary flex items-center gap-1 font-medium -mt-0.5 mb-0.5">
                      {item.selectedColor && (
                        <span className="w-2 h-2 rounded-full inline-block border border-white/20" style={{ backgroundColor: item.selectedColor }} />
                      )}
                      {item.selectedVariant}
                    </span>
                  )}
                  <span className="text-primary font-bold text-[0.85rem]">${item.price.toFixed(2)}</span>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-2 bg-black/20 rounded-md px-1.5 py-0.5">
                      <button onClick={() => handleQuantityChange(item.id || item.productId, item.quantity - 1)} className="text-text-dim hover:text-white bg-transparent border-none cursor-pointer px-1">-</button>
                      <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                      <button onClick={() => handleQuantityChange(item.id || item.productId, item.quantity + 1)} className="text-text-dim hover:text-white bg-transparent border-none cursor-pointer px-1">+</button>
                    </div>
                    <button onClick={() => removeItem(item.id)} className="text-danger hover:text-white bg-transparent border-none cursor-pointer p-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-5">
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-[1.1rem]">Total:</span>
            <span className="font-extrabold text-[1.2rem] text-primary">${mounted ? basketTotal.toFixed(2) : '0.00'}</span>
          </div>
          <GlassButton
            variant="primary"
            fullWidth
            onClick={onCheckout}
            disabled={!mounted || items.length === 0}
          >
            Checkout Now
          </GlassButton>
        </div>
      </div>

      {/* Order Queue */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="m-0 text-[1.1rem] font-bold tracking-tight">Order Queue</h3>
          <span className="text-text-dim text-[0.85rem]">Active Status</span>
        </div>

        <div className="flex flex-col gap-3">
          {!mounted || activeOrders.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center text-text-dim text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              <p className="text-[0.9rem] m-0">No active orders</p>
            </div>
          ) : (
            activeOrders.map((order) => (
              <div key={order.id} className="bg-bg-surface p-3.5 rounded-xl border border-border-glass">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-[0.85rem] text-primary">{order.orderId}</span>
                  <span className="text-[0.7rem] bg-white/10 px-2 py-0.5 rounded-full">{order.status}</span>
                </div>
                <div className="w-full bg-black/30 rounded-full h-1.5 mb-2 overflow-hidden">
                  <div className="bg-gradient-to-r from-primary to-secondary h-full rounded-full" style={{ width: `${order.progress}%` }}></div>
                </div>
                <div className="flex justify-between text-[0.75rem] text-text-dim">
                  <span>{order.items.length} items</span>
                  <span>{order.progress}% Complete</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
