'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { useProductStore } from '@/stores/useProductStore';
import type { Product } from '@/lib/types';
import { showToast } from '@/components/ui/Toast';

interface OrderSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onViewOrders?: () => void;
  onSelectProduct?: (product: Product) => void;
}

export default function OrderSuccessModal({
  isOpen,
  onClose,
  order,
  onViewOrders,
  onSelectProduct,
}: OrderSuccessModalProps) {
  const { products } = useProductStore();
  const [copiedCode, setCopiedCode] = useState(false);

  if (!order) return null;

  const orderId = order.orderId || order.id || 'N/A';
  const cleanId = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  const claimCode = order.personalization?.claimCode || (
    orderId.startsWith('WI-') ? `#${orderId.replace('WI-', 'A-')}` : `#A-${cleanId}`
  );

  const readyLabel = order.personalization?.readyLabel || order.deliveryTime || 'Scheduled for production';
  const queuePosition = order.personalization?.queuePosition;
  const ordersAhead = order.personalization?.ordersAhead;
  const items = Array.isArray(order.items) ? order.items : [];
  const totalAmount = parseFloat(order.totalAmount || 0).toFixed(2);

  // Extract similar/recommended products from store catalog (excluding purchased items)
  const orderedProductNames = items.map((i: any) => (i.name || '').toLowerCase());
  const recommendedProducts = products
    .filter((p) => !orderedProductNames.includes((p.name || '').toLowerCase()))
    .slice(0, 4);

  const handleCopyClaimCode = () => {
    if (claimCode) {
      navigator.clipboard.writeText(claimCode);
      setCopiedCode(true);
      showToast('Claim code copied to clipboard!', 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[620px]">
      <div className="flex flex-col gap-4">
        {/* Header matching CheckoutModal style */}
        <div className="flex justify-between items-center pb-3 border-b border-border-glass/40 pr-8">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold m-0 text-text-main leading-tight">
                Order Confirmed
              </h2>
              <p className="text-[0.68rem] text-text-dim m-0">
                Payment verified • Order #{orderId}
              </p>
            </div>
          </div>
          <span className="text-[0.62rem] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full shrink-0">
            Paid &amp; In Queue
          </span>
        </div>

        {/* Claim Code & Workshop Card */}
        <div className="bg-white/[0.02] border border-border-glass/60 rounded-xl p-3.5 flex flex-col gap-3">
          {/* Top Row: Claim Code & Copy Action */}
          <div className="flex items-center justify-between pb-2.5 border-b border-border-glass/40">
            <div className="flex flex-col">
              <span className="text-[0.58rem] font-bold text-text-dim uppercase tracking-wider">
                Counter Claim Code
              </span>
              <span className="font-mono text-xl sm:text-2xl font-extrabold text-text-main tracking-wider mt-0.5">
                {claimCode}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyClaimCode}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-border-glass text-text-main text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {copiedCode ? (
                <>
                  <span className="text-emerald-400">✓</span>
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          {/* Middle Row: Ready Time & Pickup Counter Details */}
          <div className="grid grid-cols-2 gap-3 text-xs max-sm:grid-cols-1">
            <div>
              <span className="text-[0.62rem] text-text-dim block font-medium">Estimated Ready Time</span>
              <span className="text-text-main text-xs font-semibold block mt-0.5">
                {readyLabel}
              </span>
              <span className="text-[0.58rem] text-text-dim/70">
                {ordersAhead !== undefined ? (ordersAhead === 0 ? 'Next in line for setup' : `#${queuePosition || (ordersAhead + 1)} in workshop queue`) : 'In queue'}
              </span>
            </div>
            <div>
              <span className="text-[0.62rem] text-text-dim block font-medium">Store Pick-up Counter</span>
              <span className="text-text-main text-xs font-semibold block mt-0.5">
                Eds Towels &amp; Caps (Ground Floor)
              </span>
              <span className="text-[0.58rem] text-text-dim/70">Pacific Mall Lucena • Daily 10 AM – 8 PM</span>
            </div>
          </div>

          {/* Bottom Note: Clean, professional notice */}
          <div className="pt-2 border-t border-border-glass/30 flex items-center gap-2 text-[0.68rem] text-text-dim">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-dim shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>Handcrafted in queue order. Monitor live progress in your Orders tab before heading to the counter.</span>
          </div>
        </div>

        {/* Similar / Recommended Products Section */}
        {recommendedProducts.length > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-main tracking-wide">
                You May Also Like
              </span>
              <span className="text-[0.62rem] text-text-dim">Similar custom products</span>
            </div>

            <div className="grid grid-cols-4 gap-2.5 max-sm:grid-cols-2">
              {recommendedProducts.map((prod) => {
                const prodId = prod.id || prod._id;
                return (
                  <div
                    key={prodId}
                    onClick={() => onSelectProduct?.(prod)}
                    className="group bg-white/[0.02] hover:bg-white/[0.06] border border-border-glass/50 hover:border-border-glass rounded-xl p-2 flex flex-col gap-1.5 cursor-pointer transition-all hover:-translate-y-0.5"
                  >
                    <div className="relative w-full aspect-[4/3] bg-bg-surface rounded-lg overflow-hidden border border-border-glass/30">
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {prod.tag && (
                        <span className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm text-[0.55rem] font-medium text-text-dim px-1.5 py-0.2 rounded">
                          {prod.tag}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-text-main truncate group-hover:text-primary transition-colors leading-tight">
                        {prod.name}
                      </span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs font-mono font-semibold text-text-main">
                          ₱{parseFloat(String(prod.price || 0)).toFixed(2)}
                        </span>
                        <span className="text-[0.65rem] text-text-dim group-hover:text-text-main font-medium">
                          View ›
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons matching theme */}
        <div className="pt-3 border-t border-border-glass/40 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-border-glass text-text-main font-medium text-xs transition-all cursor-pointer"
          >
            Continue Shopping
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewOrders?.();
            }}
            className="flex-1 py-2 px-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium text-xs transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
          >
            Track in Orders Tab ›
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
