'use client';

import GlassModal from '@/components/ui/GlassModal';
import type { Order } from '@/lib/types';

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderDetailsModal({ order, isOpen, onClose }: OrderDetailsModalProps) {
  if (!order) return null;

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Order Details">
      <div className="modal-stack">
        {/* Order Header */}
        <div className="flex justify-between items-start border-b border-border-glass pb-3">
          <div>
            <h3 className="modal-title-sm text-primary">{order.orderId}</h3>
            <p className="text-xs text-text-dim mt-0.5">
              Placed on {new Date(order.date).toLocaleString()}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            order.status === 'Completed' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
          }`}>
            {order.status}
          </span>
        </div>

        {/* Items List */}
        <div className="modal-section">
          <h4 className="modal-label">Items Ordered</h4>
          <div className="flex flex-col gap-2">
            {order.items.map((item, idx) => (
              <div key={idx} className="modal-box flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="font-bold text-[0.85rem] text-text-main">{item.name}</span>
                  <span className="text-[0.7rem] text-text-dim">Quantity: {item.quantity}</span>
                </div>
                <span className="font-mono font-bold text-[0.85rem] text-text-main">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
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
            <span className="font-extrabold text-primary">${order.totalAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Shipping / Notes */}
        <div className="modal-section">
          <div className="flex flex-col gap-1">
            <span className="modal-label">Shipping Address</span>
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

        {/* Footer Actions */}
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="flex-1 bg-white/5 hover:bg-white/10 border border-border-glass py-2 rounded-xl font-bold text-sm transition-all"
          >
            Close
          </button>
          {order.status === 'Completed' && (
            <button className="flex-1 bg-primary text-white py-2 rounded-xl font-bold text-sm shadow-[0_0_15px_rgba(99,102,241,0.4)]">
              Reorder
            </button>
          )}
        </div>
      </div>
    </GlassModal>
  );
}
