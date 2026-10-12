'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import DeliveryTracker from '@/components/dashboard/DeliveryTracker';
import CustomerHelpModal from '@/components/dashboard/CustomerHelpModal';
import OrderReviewModal from '@/components/dashboard/OrderReviewModal';
import type { Order } from '@/lib/types';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { useProductStore } from '@/stores/useProductStore';

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'summary' | 'tracking';
  onOrderCancelled?: (orderId: string) => void;
}

export default function OrderDetailsModal({
  order,
  isOpen,
  onClose,
  initialTab = 'summary',
  onOrderCancelled
}: OrderDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'tracking'>(initialTab);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  if (!order) return null;

  const personalization = (order.personalization && typeof order.personalization === 'object') ? (order.personalization as any) : {};
  const isPickup = personalization.fulfillmentType === 'pickup' || (typeof order.address === 'string' && order.address.toLowerCase().includes('pick-up'));

  const isCanceled = order.status === 'Order Canceled';
  const isPreparingOrBeyond = [
    'Preparing Order',
    'In Transit',
    'Ready For Pick Up',
    'Ready For Pick-Up',
    'Ready for Pickup',
    'Out for Delivery',
    'Order Delivered',
    'Completed'
  ].includes(order.status);

  // Can cancel only while still before Preparing Order (e.g. In Queue, Awaiting Payment, Pending Payment)
  const canCancel = !isCanceled && !isPreparingOrBeyond;

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

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Order Tracking & Details" maxWidth="max-w-[620px]">
      <div className="modal-stack">
        {/* Order Header */}
        <div className="flex justify-between items-start border-b border-border-glass pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="modal-title-sm text-primary m-0">{order.orderId}</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                order.status === 'Completed' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
              }`}>
                {order.status}
              </span>
            </div>
            <p className="text-xs text-text-dim mt-1 m-0">
              Placed on {new Date(order.date).toLocaleString()} • {order.paymentMethod.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border-glass gap-2 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer bg-transparent border-none ${
              activeTab === 'summary'
                ? '!border-b-2 !border-primary text-primary'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            Order Items & Receipt
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tracking')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer bg-transparent border-none flex items-center gap-1.5 ${
              activeTab === 'tracking'
                ? '!border-b-2 !border-primary text-primary'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            <span>{isPickup ? 'Pick-up & Claim Tracking' : 'Logistics & Shipping Tracking'}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping"></span>
          </button>
        </div>

        {/* Content based on Active Tab */}
        {activeTab === 'tracking' ? (
          <div className="pt-2">
            <DeliveryTracker order={order} />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-1">
            {/* Items List */}
            <div className="modal-section">
              <h4 className="modal-label">Items Ordered</h4>
              <div className="flex flex-col gap-2">
                {order.items.map((item, idx) => {
                  const variantText = [item.selectedVariant, item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');
                  return (
                    <div key={idx} className="modal-box flex justify-between items-start">
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-[0.85rem] text-text-main">{item.name}</span>
                        <div className="flex items-center gap-1.5 text-[0.72rem] text-text-dim mt-0.5 font-medium">
                          {item.selectedColor && (
                            <span 
                              className="w-2.5 h-2.5 rounded-full border border-white/20 inline-block shrink-0 shadow-sm" 
                              style={{ backgroundColor: item.selectedColor }} 
                            />
                          )}
                          <span>{variantText ? `${variantText} • Qty: ${item.quantity}` : `Qty: ${item.quantity}`}</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[0.85rem] text-text-main">
                        ₱{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-bg-surface rounded-xl p-4 border border-border-glass flex flex-col gap-2">
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-text-dim">Payment Method</span>
                <span className="font-bold uppercase">{order.paymentMethod}</span>
              </div>
              <div className="flex justify-between text-[0.8rem]">
                <span className="text-text-dim">{isPickup ? 'Fulfillment Type' : 'Delivery Preferences'}</span>
                <span className="font-bold">{isPickup ? 'Store Pick-up (Pacific Mall Lucena)' : (order.deliveryTime || 'As soon as possible')}</span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t border-border-glass/50">
                <span className="font-bold">Total Amount</span>
                <span className="font-extrabold text-primary">₱{order.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Shipping / Notes */}
            <div className="modal-section">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="modal-label">{isPickup ? 'Store Pick-up Location' : 'Shipping Address'}</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('tracking')}
                    className="text-[0.7rem] text-primary hover:underline bg-transparent border-none cursor-pointer font-semibold"
                  >
                    {isPickup ? 'Track Pick-up →' : 'Track Delivery →'}
                  </button>
                </div>
                <div className="modal-box text-[0.85rem]">
                  {order.address || 'No address provided.'}
                </div>
              </div>
              
              {order.notes && (
                <div className="flex flex-col gap-1">
                  <span className="modal-label">Notes to Seller</span>
                  <div className="modal-box text-[0.85rem] italic text-text-dim">
                    "{order.notes}"
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Informational warning if preparing or beyond */}
        {isPreparingOrBeyond && !isCanceled && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>
              <strong>Cancellation locked:</strong> Order is in <em>{order.status}</em> status. Embroidery production is already underway and cannot be cancelled.
            </span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="modal-footer pt-3 border-t border-border-glass flex flex-wrap items-center gap-2">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 min-w-[90px] bg-white/5 hover:bg-white/10 border border-border-glass py-2 rounded-xl font-bold text-sm transition-all cursor-pointer text-text-main"
          >
            Close
          </button>

          {!isCanceled && (
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={!canCancel || isCancelling}
              title={
                !canCancel 
                  ? "Orders in 'Preparing Order' or later cannot be cancelled because custom production has begun." 
                  : "Cancel this order"
              }
              className={`flex-1 min-w-[120px] py-2 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5 ${
                canCancel
                  ? 'bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 cursor-pointer'
                  : 'bg-white/5 border border-white/10 text-text-muted/40 opacity-40 grayscale cursor-not-allowed'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>{isCancelling ? 'Cancelling...' : 'Cancel Order'}</span>
            </button>
          )}

          {order.status === 'Completed' ? (
            <>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(true)}
                className="flex-1 min-w-[130px] bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="text-amber-400">★</span>
                <span>Rate Quality & Review</span>
              </button>
              <button 
                type="button"
                className="flex-1 min-w-[90px] bg-primary text-white py-2 rounded-xl font-bold text-sm shadow-sm hover:bg-primary/90 cursor-pointer"
              >
                Reorder
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsHelpModalOpen(true)}
              className="flex-1 min-w-[130px] bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim hover:text-text-main py-2 rounded-xl font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Workshop Support</span>
            </button>
          )}
        </div>
      </div>

      <CustomerHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        defaultOrderId={order.orderId}
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
      />
    </GlassModal>
  );
}
