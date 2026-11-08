'use client';

import { isValidProductImage } from '@/lib/imageOptimizer';
import ProductImagePlaceholder from '@/components/ui/ProductImagePlaceholder';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GlassModal from '@/components/ui/GlassModal';
import { useProductStore } from '@/stores/useProductStore';
import type { Product } from '@/lib/types';
import { showToast } from '@/components/ui/Toast';
import { API_BASE } from '@/lib/api';

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
  const router = useRouter();
  const { products } = useProductStore();
  const [copiedCode, setCopiedCode] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string>(order?.status || 'In Queue');
  const [liveStage, setLiveStage] = useState<'queue' | 'stitching' | 'ready' | 'completed'>(() => {
    const s = (order?.status || '').toLowerCase();
    if (s.includes('complete') || s.includes('ready')) return 'ready';
    if (s.includes('process') || s.includes('stitch')) return 'stitching';
    return 'queue';
  });

  const orderId = order?.orderId || order?.id || 'N/A';
  const cleanId = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  const claimCode = order?.personalization?.claimCode || (
    orderId.startsWith('WI-') ? `#${orderId.replace('WI-', 'A-')}` : `#A-${cleanId}`
  );

  const readyLabel = order?.personalization?.readyLabel || order?.deliveryTime || 'Scheduled for production';
  const queuePosition = order?.personalization?.queuePosition;
  const ordersAhead = order?.personalization?.ordersAhead;
  const items = Array.isArray(order?.items) ? order.items : [];
  const totalAmount = parseFloat(order?.totalAmount || 0).toFixed(2);

  // Financial reconciliation state (Insufficient payment vs Overpayment)
  const pers = (order?.personalization && typeof order.personalization === 'object') ? order.personalization : {};
  const isInsufficient = Boolean(
    order?.isInsufficientPayment ||
    order?.status === 'Insufficient Payment' ||
    order?.paymentStatus === 'partial' ||
    pers?.insufficientPayment ||
    pers?.isInsufficientPayment
  );
  const creditAmount = Number(pers?.accountCredit ?? (isInsufficient ? (Number(order?.totalAmount || 0) - Number(pers?.outstandingBalance || 0)) : Number(order?.totalAmount || 0)));
  const balanceDue = Number(pers?.outstandingBalance ?? (isInsufficient ? Math.max(0, Number(order?.totalAmount || 0) - creditAmount) : 0));

  const isOverpayment = Boolean(
    order?.isOverpayment ||
    pers?.isOverpayment ||
    (pers?.overpaymentAmount && Number(pers.overpaymentAmount) > 0)
  );
  const overpaidAmount = Number(pers?.overpaymentAmount || order?.overpaymentAmount || 0);
  const totalPaid = Number(order?.totalAmount || 0) + overpaidAmount;

  // Real-time socket sync for live status progression
  useEffect(() => {
    if (!isOpen || !order) return;
    const currentId = order.orderId || order.id;
    if (!currentId) return;

    let activeSocket: any = null;

    const handleUpdate = (data: any) => {
      if (!data) return;
      const target = data.order || data;
      const matches = (target.id && (target.id === currentId || target.orderId === currentId)) ||
                      (target.orderId && (target.orderId === currentId || target.id === currentId)) ||
                      (data.orderId && data.orderId === currentId);

      if (matches) {
        const newStatus = target.status || data.status;
        if (newStatus) {
          setLiveStatus(newStatus);
          const lower = newStatus.toLowerCase();
          if (lower.includes('complete') || lower.includes('ready')) {
            setLiveStage('ready');
            showToast('Your item is ready for pickup at the counter!', 'success');
          } else if (lower.includes('process') || lower.includes('stitch')) {
            setLiveStage('stitching');
            showToast('Artisan started stitching your design!', 'info');
          }
        }
      }
    };

    const connectSocket = () => {
      const io = (window as any).io;
      if (!io) return;
      const socket = io(API_BASE, {
        withCredentials: true,
        transports: ['websocket', 'polling']
      });
      activeSocket = socket;
      socket.on('dataChanged', (data: any) => {
        if (!data || !data.entity || data.entity === 'ORDER') {
          handleUpdate(data?.data);
        }
      });
      socket.on('ordersUpdated', handleUpdate);
    };

    if ((window as any).io) {
      connectSocket();
    } else {
      const script = document.createElement('script');
      script.src = `${API_BASE}/socket.io/socket.io.js`;
      script.async = true;
      script.onload = connectSocket;
      document.head.appendChild(script);
    }

    return () => {
      if (activeSocket) activeSocket.close();
    };
  }, [isOpen, order]);

  if (!order) return null;

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
            <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-text-main shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold m-0 text-text-main leading-tight">
                {isInsufficient ? 'Order Placed (Payment Incomplete)' : isOverpayment ? 'Order Confirmed & Paid' : 'Order Confirmed'}
              </h2>
              <p className="text-[0.68rem] text-text-dim m-0">
                {isInsufficient
                  ? `Remaining balance required • Order #${orderId}`
                  : isOverpayment
                  ? `₱${overpaidAmount.toFixed(2)} credited to wallet • Order #${orderId}`
                  : `Payment verified • Order #${orderId}`}
              </p>
            </div>
          </div>
          {isInsufficient ? (
            <span className="text-[0.62rem] font-semibold text-text-main bg-white/10 border border-border-glass px-2.5 py-0.5 rounded-full shrink-0 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
              <span>Balance Due</span>
            </span>
          ) : isOverpayment ? (
            <span className="text-[0.62rem] font-semibold text-text-main bg-white/10 border border-border-glass px-2.5 py-0.5 rounded-full shrink-0 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              <span>Paid • Wallet Credited</span>
            </span>
          ) : (
            <span className="text-[0.62rem] font-semibold text-text-main bg-white/10 border border-border-glass px-2.5 py-0.5 rounded-full shrink-0">
              Paid &amp; In Queue
            </span>
          )}
        </div>

        {/* Overpayment or Insufficient Payment Alert Banner (Theme-consistent glass card) */}
        {isInsufficient && (
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-border-glass flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-text-main text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                <span className="uppercase tracking-wider">Remaining Balance Required</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-white/5 border border-border-glass text-text-dim text-[0.6rem] font-semibold uppercase tracking-wider">
                Hold
              </span>
            </div>
            <p className="text-xs text-text-dim m-0 leading-relaxed">
              Amount received: <strong className="font-mono text-text-main">₱{creditAmount.toFixed(2)}</strong>. Required: <strong className="font-mono text-text-main">₱{totalAmount}</strong>.
              Your partial payment is saved as Account Credit. Please settle the remaining balance (<strong className="font-mono text-text-main font-bold">₱{balanceDue.toFixed(2)}</strong>) for production to proceed.
            </p>
            <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-bg-surface border border-border-glass text-[0.68rem] font-mono text-center">
              <div>
                <span className="text-text-dim block text-[0.6rem] uppercase font-sans font-semibold">Required</span>
                <span className="font-bold text-text-main">₱{totalAmount}</span>
              </div>
              <div>
                <span className="text-text-dim block text-[0.6rem] uppercase font-sans font-semibold">Account Credit</span>
                <span className="font-bold text-text-main">₱{creditAmount.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-text-dim block text-[0.6rem] uppercase font-sans font-semibold">Remaining</span>
                <span className="font-bold text-text-main">₱{balanceDue.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {isOverpayment && (
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-border-glass flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-bold text-text-main text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              <span className="uppercase tracking-wider">Overpayment Credited to Store Wallet</span>
            </div>
            <p className="text-xs text-text-dim m-0 leading-relaxed">
              You sent <strong className="font-mono text-text-main font-bold">₱{totalPaid.toFixed(2)}</strong> for this <strong className="font-mono text-text-main font-bold">₱{totalAmount}</strong> order.
              The excess <strong className="font-mono text-text-main font-bold">₱{overpaidAmount.toFixed(2)}</strong> has been automatically credited to your <strong>Store Wallet Balance</strong>.
            </p>
          </div>
        )}

        {/* 3-Step Ordering Journey Progress Bar (100% Completed Milestones) */}
        <div className="pt-0.5 pb-2 border-b border-border-glass/40 -mt-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              
              <span className="text-[11px] font-bold text-text-main">
                Step 3 of 3:
              </span>
              <span className="text-[11px] text-primary font-bold">
                Order Validated &amp; Placed in Queue!
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">
              <span className="font-mono font-bold text-[11px]">
                100%
              </span>
            </div>
          </div>

          {/* Checkpoints & Connecting Progress Line */}
          <div className="relative flex items-center justify-between px-3 pt-1 pb-0.5">
            {/* Connected Track: 100% Filled glowing line */}
            <div className="absolute left-[24px] right-[24px] top-4 -translate-y-1/2 h-1 bg-bg-surface border border-border-glass rounded-full overflow-hidden z-0">
              <div 
                className="h-full bg-gradient-to-r bg-primary rounded-full transition-all duration-500 w-full"
              />
            </div>

            {/* 3 Checkpoint Milestones */}
            {[
              { id: 1, label: 'Product Selection', shortLabel: 'Product' },
              { id: 2, label: 'Secure Checkout', shortLabel: 'Checkout' },
              { id: 3, label: 'Verified in Queue', shortLabel: 'In Queue' },
            ].map((s) => (
              <div key={s.id} className="relative z-10 flex flex-col items-center">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-primary text-white scale-105"
                  title={`Step ${s.id}: ${s.label} (Completed)`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-[9px] mt-1 font-bold tracking-tight uppercase whitespace-nowrap text-text-main">
                  {s.shortLabel}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Clean Digital Claim Slip Card */}
        <div className="bg-white/[0.03] border border-border-glass rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-xl">
          {/* Claim Slip Code Block */}
          <div className="flex items-center justify-between pb-3.5 border-b border-border-glass/50">
            <div className="flex flex-col">
              <span className="text-[0.62rem] font-bold text-text-dim uppercase tracking-wider">
                Claim Slip Code
              </span>
              <span className="font-mono text-2xl sm:text-3xl font-black text-text-main tracking-wider mt-0.5">
                {claimCode}
              </span>
              <span className="text-[0.68rem] text-text-dim font-semibold mt-0.5 flex items-center gap-1">
                <span>✓</span> Present this code at the Pacific Mall counter to pick up
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyClaimCode}
              className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-border-glass text-text-main text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {copiedCode ? (
                <>
                  <span className="text-primary">✓</span>
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          {/* Ordered Items List */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.65rem] font-bold text-text-dim uppercase tracking-wider">
              Items Ordered ({items.length})
            </span>
            <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
              {items.map((item: any, idx: number) => {
                const itemPers = item.personalization || {};
                const customText = itemPers.text || '';
                const threadName = typeof itemPers.threadColor === 'object' ? itemPers.threadColor?.name : (itemPers.threadColor || itemPers.color || '');
                const rawItemName = item.name || '';
                const lowerItemName = rawItemName.toLowerCase();
                const variantName = (item.selectedVariant || item.variant || '').trim();
                const showVariant = variantName && !lowerItemName.includes(variantName.toLowerCase());

                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-white/[0.02] border border-border-glass/40 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-border-glass/50 bg-bg-surface shrink-0 flex items-center justify-center">
                        {isValidProductImage(item.imageUrl) ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <ProductImagePlaceholder name={item.name} size="thumb" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-text-main truncate">
                          {item.quantity || 1}x {item.name}
                        </span>
                        {showVariant && (
                          <span className="text-[0.68rem] text-text-dim truncate">
                            Variant: {variantName}
                          </span>
                        )}
                        {customText && (
                          <span className="text-[0.68rem] text-text-main font-semibold italic truncate">
                            Embroidery: "{customText}"{threadName ? ` (${threadName})` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    {item.price !== undefined && (
                      <span className="font-mono font-bold text-xs text-text-main shrink-0">
                        ₱{(Number(item.price) * (Number(item.quantity) || 1)).toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financial Summary Breakdown */}
          <div className="pt-2.5 border-t border-border-glass/50 flex flex-col gap-1.5 text-xs">
            {isInsufficient ? (
              <>
                <div className="flex items-center justify-between text-text-dim text-[0.7rem]">
                  <span>Total Order Required</span>
                  <span className="font-mono text-text-main font-semibold">₱{totalAmount}</span>
                </div>
                <div className="flex items-center justify-between text-text-dim text-[0.7rem]">
                  <span>Account Credit Applied</span>
                  <span className="font-mono font-semibold text-text-main">₱{creditAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border-glass/40">
                  <span className="font-semibold text-text-dim uppercase tracking-wider text-[0.68rem]">
                    Outstanding Balance
                  </span>
                  <span className="font-mono font-bold text-base text-text-main">
                    ₱{balanceDue.toFixed(2)}
                  </span>
                </div>
              </>
            ) : isOverpayment ? (
              <>
                <div className="flex items-center justify-between text-text-dim text-[0.7rem]">
                  <span>Order Total</span>
                  <span className="font-mono text-text-main font-semibold">₱{totalAmount}</span>
                </div>
                <div className="flex items-center justify-between text-text-dim text-[0.7rem]">
                  <span>Total Amount Sent</span>
                  <span className="font-mono text-text-main font-semibold">₱{totalPaid.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border-glass/40">
                  <span className="font-semibold text-text-dim uppercase tracking-wider text-[0.68rem]">
                    Credited to Store Wallet
                  </span>
                  <span className="font-mono font-bold text-base text-text-main">
                    +₱{overpaidAmount.toFixed(2)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-dim uppercase tracking-wider text-[0.68rem]">
                  Total Paid
                </span>
                <span className="font-mono font-extrabold text-sm sm:text-base text-text-main">
                  ₱{totalAmount}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons matching theme */}
        <div className="pt-3 border-t border-border-glass/40 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-border-glass text-text-main font-medium text-xs transition-all cursor-pointer"
          >
            Continue Shopping
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewOrders?.();
            }}
            className="flex-1 py-2.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
          >
            <span>{isInsufficient ? `Pay Balance (₱${balanceDue.toFixed(2)}) in Orders` : 'Track in My Orders'}</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
