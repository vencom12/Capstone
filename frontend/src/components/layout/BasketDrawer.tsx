'use client';
import Image from 'next/image';
import React from 'react';
import type { BasketItem, Product } from '@/types';
import Button from '@/components/ui/Button';

interface BasketDrawerProps {
  open: boolean;
  onClose: () => void;
  items: BasketItem[];
  onRemove: (productId: string) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onCheckout: () => void;
  loggedIn: boolean;
}

export default function BasketDrawer({
  open, onClose, items, onRemove, onUpdateQty, onCheckout, loggedIn
}: BasketDrawerProps) {
  const total = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-sm z-50 flex flex-col
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'rgba(15,23,42,0.97)', borderLeft: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">
            Shopping Basket
            {items.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">({items.length} item{items.length !== 1 ? 's' : ''})</span>
            )}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-9H5.4M7 13L5.4 5M7 13l-2.3 2.3A1 1 0 006 17h12M17 17a2 2 0 100 4 2 2 0 000-4zM9 17a2 2 0 100 4 2 2 0 000-4z"/>
                </svg>
              </div>
              <p className="text-slate-500">Your basket is empty</p>
            </div>
          ) : (
            items.map(({ product, quantity }) => (
              <div key={product._id} className="glass-card p-4 flex gap-3">
                {product.imageUrl ? (
                  <div className="w-16 h-16 relative flex-shrink-0">
                    <Image 
                      src={product.imageUrl} 
                      alt={product.name} 
                      fill 
                      className="object-cover rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-white/5 flex-shrink-0 flex items-center justify-center text-2xl">🧵</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                  <p className="text-indigo-400 font-bold text-sm">₱{product.price.toFixed(2)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => onUpdateQty(product._id, quantity - 1)}
                      className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
                    >−</button>
                    <span className="text-sm font-semibold w-4 text-center">{quantity}</span>
                    <button
                      onClick={() => onUpdateQty(product._id, quantity + 1)}
                      className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
                    >+</button>
                    <button
                      onClick={() => onRemove(product._id)}
                      className="ml-auto text-red-400 hover:text-red-300 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-6 py-5 border-t border-white/5 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Total</span>
              <span className="text-xl font-bold gradient-text">₱{total.toFixed(2)}</span>
            </div>
            {loggedIn ? (
              <Button onClick={onCheckout} className="w-full">Place Order</Button>
            ) : (
              <a href="/login" className="btn-primary w-full text-center">Login to Checkout</a>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
