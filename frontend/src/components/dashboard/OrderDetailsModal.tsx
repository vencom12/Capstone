'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import WaybillModal from '@/components/dashboard/WaybillModal';
import CustomerHelpModal from '@/components/dashboard/CustomerHelpModal';
import OrderReviewModal from '@/components/dashboard/OrderReviewModal';
import InvoiceModal from '@/components/dashboard/InvoiceModal';
import type { Order } from '@/lib/types';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { useProductStore } from '@/stores/useProductStore';
import { useBasketStore } from '@/stores/useBasketStore';
import { getOrderStage, TOTAL_STEPS } from '@/lib/orderStatus';

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'summary' | 'tracking';
  onOrderCancelled?: (orderId: string) => void;
  onReorder?: (order: Order) => void;
}

export default function OrderDetailsModal({
  order,
  isOpen,
  onClose,
  onOrderCancelled,
  onReorder
}: OrderDetailsModalProps) {
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isClaimSlipOpen, setIsClaimSlipOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [helpCategory, setHelpCategory] = useState<string | undefined>(undefined);

  if (!order) return null;

  const stage = getOrderStage(order);
  const percent = Math.min(100, Math.max(10, (stage.step / TOTAL_STEPS) * 100));

  const isCanceled = stage.tone === 'cancelled';
  const isCompletedOrDelivered = stage.tone === 'done';

  const isInProduction = [
    'Preparing Order',
    'In Transit',
    'Ready For Pick Up',
    'Ready For Pick-Up',
    'Ready for Pickup',
    'Out for Delivery'
  ].includes(order.status) && !isCompletedOrDelivered;

  // Option A: Paid orders (GCash, Maya, etc.) require workshop mediation/counter visit for cancellation & refund.
  // Direct self-service cancel is reserved for unpaid orders before production.
  const isPaid = order.paymentStatus?.toLowerCase() === 'paid' ||
    (Boolean(order.paymentMethod) && 
     !['none', 'unpaid', 'pending'].includes(order.paymentMethod.toLowerCase()) && 
     order.paymentStatus?.toLowerCase() !== 'unpaid');

  const canCancel = !isCanceled && !isInProduction && !isCompletedOrDelivered && !isPaid;

  const cleanId = order.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  const claimCode = (order.personalization as any)?.claimCode || (
    order.orderId.startsWith('WI-')
      ? `#${order.orderId.replace('WI-', 'A-')}`
      : `#A-${cleanId.slice(-4)}`
  );

  const handleCancelOrder = async () => {
    if (!canCancel || isCancelling) return;
    const confirmed = window.confirm(
      `Are you sure you want to cancel order #${order.orderId}?\n\nThis will cancel your order and release reserved materials.`
    );
    if (!confirmed) return;

    setIsCancelling(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/api/customer/orders/${order.id || order.orderId}/cancel`,
        {}
      );
      showToast(res?.message || 'Order cancelled successfully', 'success');
      onOrderCancelled?.(order.id || order.orderId);
      useProductStore.getState().fetchDashboardState().catch(() => {});
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to cancel order', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReorderAction = () => {
    if (onReorder) {
      onReorder(order);
      onClose();
      return;
    }
    if (!order.items || order.items.length === 0) {
      showToast('No items available to reorder from this order.', 'info');
      return;
    }
    const { addItem } = useBasketStore.getState();
    let count = 0;
    order.items.forEach((item) => {
      addItem({
        productId: item.productId,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
        selectedVariant: item.selectedVariant,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        quantity: item.quantity || 1
      });
      count += (item.quantity || 1);
    });
    showToast(`Added ${count} item(s) from #${order.orderId} to your basket!`, 'success');
    onClose();
  };

  // Tone color styling
  const statusBadgeStyle = isCanceled
    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
    : isCompletedOrDelivered
      ? 'bg-white/10 text-text-main border border-border-glass'
      : stage.tone === 'shipping'
        ? 'bg-secondary/15 text-secondary border border-secondary/30'
        : 'bg-primary/15 text-primary border border-primary/30';

  const statusCardStyle = isCanceled
    ? 'bg-red-500/10 border-red-500/25'
    : isCompletedOrDelivered
      ? 'bg-bg-surface border-border-glass'
      : stage.tone === 'shipping'
        ? 'bg-secondary/10 border-secondary/25'
        : 'bg-bg-surface border-border-glass';

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Order Tracking & Details" maxWidth="max-w-[560px]">
      <div className="flex flex-col gap-3 text-left">
        {/* 1. Header: Order ID + Status + Claim Code (Compact) */}
        <div className="flex items-center justify-between pb-2.5 border-b border-border-glass">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-primary text-base sm:text-lg">#{order.orderId}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeStyle}`}>
                {stage.label}
              </span>
            </div>
            <p className="text-[0.72rem] text-text-dim mt-0.5 m-0">
              Placed on {new Date(order.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} • Paid via {order.paymentMethod.toUpperCase()}
            </p>
          </div>

          {claimCode && !isCanceled && (
            <div className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl text-right shrink-0">
              <span className="text-[0.62rem] text-text-dim block uppercase font-bold tracking-wider">Claim Code</span>
              <span className="font-mono font-black text-xs text-text-main">{claimCode}</span>
            </div>
          )}
        </div>

        {/* 2. Compact Status & Store Pick-up Card */}
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${statusCardStyle}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              {isCanceled ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              ) : isCompletedOrDelivered ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 14 14" />
                </svg>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs text-text-main leading-tight truncate">
                {isCanceled
                  ? 'Order Cancelled'
                  : isCompletedOrDelivered
                    ? 'Claimed at Pacific Mall Studio'
                    : 'Crafting at Pacific Mall Studio'}
              </span>
              <span className="text-[0.68rem] text-text-dim/80 mt-0.5">
                Pacific Mall Lucena • Ground Floor
              </span>
            </div>
          </div>

          {!isCanceled && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsClaimSlipOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-text-main text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                title="View your digital claim slip & QR code"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span>Claim Slip</span>
              </button>

              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-text-main text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                title="View receipt"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>Receipt</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. Progress Bar (Step X of 5) */}
        {!isCanceled && (
          <div className="bg-bg-surface/60 border border-border-glass rounded-xl p-2.5 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[0.68rem]">
              <span className="text-text-dim font-medium">{stage.hint}</span>
              <span className="font-bold text-text-main">Step {stage.step} of {TOTAL_STEPS}</span>
            </div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {/* 4. Unified Ordered Items & Payment Card (High-density) */}
        <div className="bg-bg-surface/80 border border-border-glass rounded-xl p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center pb-1.5 border-b border-white/5">
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">
              Items Ordered ({order.items?.length || 0})
            </span>
          </div>

          {/* Items rows */}
          <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
            {order.items && order.items.length > 0 ? (
              order.items.map((item, idx) => {
                const variantText = [
                  item.selectedVariant,
                  item.selectedSize ? `Size: ${item.selectedSize}` : null
                ].filter(Boolean).join(' • ');

                const persText = item.personalization?.text || (order.personalization as any)?.text;
                const rawPersColor = item.personalization?.threadColor || (order.personalization as any)?.threadColor || (order.personalization as any)?.color;
                const persColor = typeof rawPersColor === 'object' && rawPersColor !== null ? (rawPersColor.name || '') : (typeof rawPersColor === 'string' ? rawPersColor : '');

                return (
                  <div key={idx} className="flex justify-between items-center text-xs p-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.imageUrl && (
                        <img 
                          src={item.imageUrl} 
                          alt={item.name} 
                          className="w-8 h-8 rounded-lg object-cover bg-black/40 border border-white/10 shrink-0" 
                        />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-text-main truncate text-xs leading-tight">{item.name}</span>
                        <div className="flex items-center gap-1 text-[0.68rem] text-text-dim flex-wrap">
                          <span>{variantText ? `${variantText} • Qty: ${item.quantity}` : `Qty: ${item.quantity}`}</span>
                          {persText && (
                            <span className="text-primary font-semibold">
                              • Stitch: &ldquo;{persText}&rdquo; ({persColor || 'Gold'})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-xs text-text-main shrink-0 ml-2">
                      ₱{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-text-dim italic">Custom embroidery stitch order</div>
            )}
          </div>

          {/* Total row */}
          <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs">
            <span className="text-text-dim">Paid via {order.paymentMethod.toUpperCase()}:</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm text-text-main">₱{order.totalAmount.toFixed(2)}</span>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(true)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-text-dim hover:text-text-main border border-border-glass text-[0.68rem] font-medium transition-all cursor-pointer flex items-center gap-1"
                title="View receipt"
              >
                <span>Receipt</span>
                <span className="opacity-60">↗</span>
              </button>
            </div>
          </div>
        </div>

        {/* 5. Notes / Instructions (if any) */}
        {order.notes && (
          <div className="px-3 py-2 bg-white/[0.02] border border-border-glass rounded-xl text-[0.72rem] text-text-dim flex items-center gap-2">
            <span className="font-bold text-text-main shrink-0">Note:</span>
            <span className="italic truncate">&ldquo;{order.notes}&rdquo;</span>
          </div>
        )}

        {/* Paid Order modification notice */}
        {isPaid && !isCanceled && !isCompletedOrDelivered && (
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-[0.68rem] text-text-dim">
            <span>Need changes or cancellation?</span>
            <button
              type="button"
              onClick={() => {
                setHelpCategory('Order Cancellation & Refund');
                setIsHelpModalOpen(true);
              }}
              className="text-primary hover:underline font-semibold bg-transparent border-none p-0 cursor-pointer"
            >
              Contact Workshop Studio →
            </button>
          </div>
        )}

        {/* 6. Action Buttons Bar */}
        <div className="pt-2 border-t border-border-glass flex items-center gap-2">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 h-9 rounded-xl font-bold text-xs bg-white/5 hover:bg-white/10 border border-border-glass transition-all cursor-pointer text-text-main flex items-center justify-center active:scale-[0.98]"
          >
            Close
          </button>

          {!isCanceled && !isCompletedOrDelivered && canCancel && (
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={isCancelling}
              className="flex-1 h-9 rounded-xl font-bold text-xs bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger transition-all cursor-pointer flex items-center justify-center active:scale-[0.98]"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Order'}
            </button>
          )}

          {isCompletedOrDelivered ? (
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(true)}
              className="flex-1 h-9 rounded-xl font-bold text-xs bg-primary hover:bg-primary/90 border border-primary text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <span>★</span>
              <span>{order.myReview ? 'Edit Review' : 'Rate Order'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setHelpCategory(undefined);
                setIsHelpModalOpen(true);
              }}
              className={`flex-1 h-9 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98] ${
                isPaid
                  ? 'bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary'
                  : 'bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim hover:text-text-main font-semibold'
              }`}
              title={isPaid ? 'Need changes, cancellation, or workshop help? Contact our studio' : 'Workshop Help & FAQs'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Workshop Help</span>
            </button>
          )}
        </div>
      </div>

      <CustomerHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        defaultOrderId={order.orderId}
        defaultCategory={helpCategory}
      />

      <OrderReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        order={{
          orderId: order.orderId,
          design: order.items?.[0]?.name,
          items: order.items,
          status: order.status,
          totalAmount: order.totalAmount
        }}
        existingReview={order.myReview}
        onReviewSubmitted={() => useProductStore.getState().fetchDashboardState().catch(() => {})}
      />

      <InvoiceModal
        order={order}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
      />

      <WaybillModal
        order={order}
        isOpen={isClaimSlipOpen}
        onClose={() => setIsClaimSlipOpen(false)}
      />
    </GlassModal>
  );
}
