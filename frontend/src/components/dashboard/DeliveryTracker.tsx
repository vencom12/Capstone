'use client';

import { useState } from 'react';
import type { Order } from '@/lib/types';
import { showToast } from '@/components/ui/Toast';
import WaybillModal from '@/components/dashboard/WaybillModal';

interface DeliveryTrackerProps {
  order: Order;
  onClose?: () => void;
}

export default function DeliveryTracker({ order }: DeliveryTrackerProps) {
  const [isWaybillOpen, setIsWaybillOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check if personalization has saved tracking number, or derive standard format
  const personalization = (order.personalization && typeof order.personalization === 'object') ? order.personalization as any : {};
  const cleanId = order.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  const isPickup = true;
  const trackingNumber = personalization.trackingNumber || `PU-LUC-${cleanId}`;
  const courierName = 'IN-STORE PICK-UP';

  // Check if genuine recorded status history exists
  const recordedHistory: Array<{ status: string; timestamp: string; actor?: string; hub?: string; note?: string }> = 
    Array.isArray(personalization.statusHistory) ? personalization.statusHistory : [];

  // Normalize order status
  const rawStatus = (order.status || '').toLowerCase();
  const isCanceled = rawStatus.includes('cancel');
  const isDelivered = !isCanceled && (rawStatus === 'completed' || rawStatus === 'order delivered' || order.progress >= 100);
  const isOutForDelivery = !isCanceled && rawStatus === 'out for delivery';
  const isInTransit = !isCanceled && (rawStatus === 'in transit' || (order.progress >= 75 && !isDelivered && !isOutForDelivery));
  const isReadyForPickup = isPickup && !isCanceled && (rawStatus.includes('ready') || isOutForDelivery);
  const isClaimed = isPickup && !isCanceled && (isDelivered || rawStatus === 'completed');

  // Real status history from database or active order status
  interface TimelineEvent {
    status: string;
    description: string;
    time: string;
    isLatest?: boolean;
    hub?: string;
  }

  const getTimeline = (): TimelineEvent[] => {
    // If genuine logged status history exists in database, render it
    if (recordedHistory.length > 0) {
      return recordedHistory.map((item, idx) => {
        const itemDate = new Date(item.timestamp);
        const formatted = isNaN(itemDate.getTime())
          ? item.timestamp
          : itemDate.toLocaleString('en-PH', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            });

        return {
          status: item.status,
          description: item.note || `Order status updated to "${item.status}"`,
          time: formatted,
          isLatest: idx === recordedHistory.length - 1,
          hub: item.hub || 'Eds Towels & Caps Pacific Mall Hub'
        };
      }).reverse();
    }

    // Single genuine verified milestone based strictly on the order record
    const orderDate = new Date(order.date || (order as any).createdAt || Date.now());
    const formattedOrderDate = isNaN(orderDate.getTime())
      ? 'Recorded'
      : orderDate.toLocaleString('en-PH', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

    const events: TimelineEvent[] = [
      {
        status: order.status || 'Order Placed',
        description: isPickup
          ? (isDelivered ? 'Order claimed by customer at store counter.' : 'Awaiting counter pick-up at Pacific Mall Lucena.')
          : (isDelivered ? 'Parcel delivered to recipient address.' : `Current order status: ${order.status}`),
        time: formattedOrderDate,
        isLatest: true,
        hub: 'Eds Towels & Caps Pacific Mall Lucena'
      }
    ];

    if (order.status !== 'In Queue' && order.status !== 'Pending') {
      events.push({
        status: 'Order Placed & Confirmed',
        description: `Order verified with ${order.paymentMethod ? order.paymentMethod.toUpperCase() : 'standard'} payment.`,
        time: formattedOrderDate
      });
    }

    return events;
  };

  const timeline = getTimeline();

  const handleCopyTracking = () => {
    navigator.clipboard.writeText(trackingNumber);
    setCopied(true);
    showToast(isPickup ? 'Pick-up Claim Reference copied to clipboard!' : 'J&T Tracking Number copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4 font-sans text-left animate-[fadeIn_0.2s_ease-out]">
      {/* 1. Shopee-Style Top Status Banner */}
      <div className={`p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3 ${
        isCanceled
          ? 'bg-red-500/10 border-red-500/30 text-red-400'
          : isDelivered
            ? 'bg-success/10 border-success/30 text-success'
            : isOutForDelivery
              ? 'bg-secondary/10 border-secondary/30 text-secondary'
              : isInTransit
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm ${
            isCanceled
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : isDelivered
                ? 'bg-success text-white'
                : isOutForDelivery
                  ? 'bg-secondary text-white animate-pulse'
                  : 'bg-white/10 text-text-main'
          }`}>
            {isCanceled ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            ) : isDelivered ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : isOutForDelivery ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            ) : isInTransit ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
            )}
          </div>
          <div>
            <h4 className="text-sm font-extrabold m-0 leading-tight">
              {isCanceled ? (
                'Order Cancelled'
              ) : isPickup ? (
                isClaimed
                  ? 'Order Claimed at Pacific Mall Counter'
                  : isReadyForPickup
                    ? 'Ready for Counter Pick-up'
                    : 'Crafting at Pacific Mall Studio'
              ) : (
                isDelivered
                  ? 'Parcel has been delivered'
                  : isOutForDelivery
                    ? 'Parcel is out for delivery'
                    : isInTransit
                      ? 'Parcel is in transit'
                      : 'Parcel is being prepared'
              )}
            </h4>
            <p className="text-[0.72rem] text-text-dim m-0 mt-0.5">
              {isCanceled ? (
                'This order was cancelled before production. Reserved materials have been released.'
              ) : isPickup ? (
                isClaimed
                  ? 'Claimed by recipient at Eds Towels Counter • Verified'
                  : isReadyForPickup
                    ? 'Available for claiming at Pacific Mall Lucena (10:00 AM – 8:00 PM)'
                    : 'Being hooped, digitized and stitched in our workshop'
              ) : (
                isDelivered
                  ? 'Delivered to recipient address • Verified'
                  : 'Estimated Arrival: 1-3 Business Days via J&T Express'
              )}
            </p>
          </div>
        </div>

        {/* Claim Slip / Receipt Button */}
        {isCanceled ? (
          <span className="px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 font-bold text-xs flex items-center gap-1.5 shadow-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span>Claim Slip Voided</span>
          </span>
        ) : (
          <button
            onClick={() => setIsWaybillOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-main font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title={
              isReadyForPickup
                ? 'View and print store claim slip to claim order at Pacific Mall'
                : isClaimed
                  ? 'View completed order receipt and transaction record'
                  : 'View order intake ticket and estimated pick-up schedule'
            }
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>
              {isReadyForPickup
                ? 'Claim Slip (Ready)'
                : isClaimed
                  ? 'Receipt (Claimed)'
                  : 'Order Ticket & Receipt'}
            </span>
          </button>
        )}
      </div>

      {/* 2. Logistics Partner & Tracking Number Card */}
      <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2.5">
          {isCanceled ? (
            <>
              <div className="flex items-center gap-1.5 bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-lg text-xs font-black tracking-wide shadow-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>ORDER CANCELLED</span>
              </div>
              <div>
                <span className="text-xs font-bold text-text-main block">Pick-up Cancelled</span>
                <span className="text-[0.7rem] text-text-dim">No physical pickup required</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-black tracking-wide shadow-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <span>STORE PICK-UP</span>
              </div>
              <div>
                <span className="text-xs font-bold text-text-main block">Counter Claiming</span>
                <span className="text-[0.7rem] text-text-dim">Pacific Mall Lucena Studio</span>
              </div>
            </>
          )}
        </div>

        {/* Tracking Number with Copy */}
        {trackingNumber ? (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-bg-dark/60 border border-border-glass px-3 py-1.5 rounded-xl">
              <div className="text-right">
                <span className="text-[0.62rem] text-text-dim block uppercase font-bold">
                  Claim Reference
                </span>
                <span className={`font-mono text-xs font-bold ${isCanceled ? 'line-through text-text-dim' : 'text-primary'}`}>
                  {trackingNumber} {isCanceled ? '(VOID)' : ''}
                </span>
              </div>
              {!isCanceled && (
                <button
                  onClick={handleCopyTracking}
                  className="px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-[0.7rem] font-bold border border-primary/20 cursor-pointer transition-all"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-right">
            <span className="text-[0.68rem] text-text-dim italic">Claim code assigned upon counter intake</span>
          </div>
        )}
      </div>

      {/* 3. Shopee-Style Chronological Logistics Timeline Stepper */}
      <div className="bg-bg-surface border border-border-glass rounded-xl p-5 flex flex-col gap-4">
        <div className="flex justify-between items-center border-b border-border-glass pb-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-text-dim m-0">
            Logistics Tracking History
          </h4>
          <span className="text-[0.7rem] text-text-dim font-medium">
            Status auto-refreshed in-app
          </span>
        </div>

        <div className="flex flex-col gap-4 pl-1">
          {timeline.map((event, idx) => (
            <div key={idx} className="flex items-start gap-3.5 relative">
              {/* Vertical connector line */}
              {idx < timeline.length - 1 && (
                <div
                  className={`absolute left-[9px] top-4 bottom-0 w-0.5 -mb-4 ${
                    idx === 0 ? 'bg-primary' : 'bg-white/10'
                  }`}
                />
              )}

              {/* Step indicator node */}
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10 ${
                  event.isLatest
                    ? 'bg-primary text-white shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)] ring-4 ring-primary/20'
                    : 'bg-white/15 text-text-dim'
                }`}
              >
                {event.isLatest ? (
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                )}
              </div>

              {/* Event Content */}
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="flex justify-between items-start flex-wrap gap-1">
                  <h5
                    className={`text-xs font-bold m-0 ${
                      event.isLatest ? 'text-primary font-black' : 'text-text-main'
                    }`}
                  >
                    {event.status}
                  </h5>
                  <span className="text-[0.68rem] text-text-dim font-mono">{event.time}</span>
                </div>
                <p className="text-[0.72rem] text-text-dim m-0 leading-relaxed">
                  {event.description}
                </p>
                {event.hub && (
                  <span className="text-[0.65rem] text-text-dim/70 font-medium">
                    Facility: {event.hub}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Recipient / Claimant Location Card */}
      <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="text-xs leading-relaxed flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-extrabold text-text-main">{order.client || 'Customer'}</span>
              <span className="text-text-dim text-[0.7rem]">{isPickup ? '(In-Store Pick-up)' : '(Delivery Recipient)'}</span>
            </div>
            <p className="text-text-dim m-0">
              {order.address?.split('(Landmark:')[0]?.trim() || order.address || (isPickup ? 'Eds Towels & Caps, Ground Floor, Pacific Mall Lucena' : 'Standard Delivery Address')}
            </p>
          </div>
        </div>

        {order.address && order.address.includes('(Landmark:') && (
          <div className="ml-8 px-3 py-1.5 bg-secondary/10 border border-secondary/20 rounded-xl text-[0.7rem] text-secondary flex items-center gap-2">
            <span className="font-bold shrink-0">Rider Note / Landmark:</span>
            <span className="italic">{order.address.split('(Landmark:')[1]?.replace(')', '')?.trim()}</span>
          </div>
        )}
      </div>

      {/* 5. Waybill Modal */}
      <WaybillModal
        isOpen={isWaybillOpen}
        onClose={() => setIsWaybillOpen(false)}
        order={order}
      />
    </div>
  );
}
