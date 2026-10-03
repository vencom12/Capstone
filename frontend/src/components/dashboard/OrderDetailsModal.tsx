'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import DeliveryTracker from '@/components/dashboard/DeliveryTracker';
import type { Order } from '@/lib/types';

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'summary' | 'tracking';
}

export default function OrderDetailsModal({
  order,
  isOpen,
  onClose,
  initialTab = 'summary'
}: OrderDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'tracking'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  if (!order) return null;

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
            📋 Order Items & Receipt
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tracking')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer bg-transparent border-none flex items-center gap-1.5 ${
              activeTab === 'tracking'
                ? '!border-b-2 !border-secondary text-secondary'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            <span>🚚 Live Geolocation Tracking</span>
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
                <span className="text-text-dim">Delivery Preferences</span>
                <span className="font-bold">{order.deliveryTime || 'As soon as possible'}</span>
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
                  <span className="modal-label">Shipping Address</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('tracking')}
                    className="text-[0.7rem] text-primary hover:underline bg-transparent border-none cursor-pointer font-semibold"
                  >
                    View on Live Map →
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

        {/* Footer Actions */}
        <div className="modal-footer pt-3 border-t border-border-glass">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 bg-white/5 hover:bg-white/10 border border-border-glass py-2 rounded-xl font-bold text-sm transition-all cursor-pointer text-text-main"
          >
            Close
          </button>
          {order.status === 'Completed' && (
            <button 
              type="button"
              className="flex-1 bg-primary text-white py-2 rounded-xl font-bold text-sm shadow-[0_0_15px_rgba(99,102,241,0.4)] cursor-pointer"
            >
              Reorder
            </button>
          )}
        </div>
      </div>
    </GlassModal>
  );
}
