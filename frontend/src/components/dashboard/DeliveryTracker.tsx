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
  const isPickup = personalization.fulfillmentType === 'pickup' ||
    (typeof order.address === 'string' && order.address.toLowerCase().includes('pick-up')) ||
    (personalization.courier && personalization.courier.toLowerCase().includes('pick-up')) ||
    (personalization.trackingNumber && personalization.trackingNumber.startsWith('PU-'));
  const trackingNumber = personalization.trackingNumber || (isPickup ? `PU-LUC-${cleanId}` : null);
  const courierName = isPickup ? 'IN-STORE PICK-UP' : (personalization.courier || 'Partner Courier / Local Rider');

  // Check if genuine recorded status history exists
  const recordedHistory: Array<{ status: string; timestamp: string; actor?: string; hub?: string; note?: string }> = 
    Array.isArray(personalization.statusHistory) ? personalization.statusHistory : [];

  // Normalize order status
  const rawStatus = (order.status || '').toLowerCase();
  const isDelivered = rawStatus === 'completed' || rawStatus === 'order delivered' || order.progress >= 100;
  const isOutForDelivery = rawStatus === 'out for delivery';
  const isInTransit = rawStatus === 'in transit' || (order.progress >= 75 && !isDelivered && !isOutForDelivery);

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
      <div className={`p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-3 ${
        isDelivered
          ? 'bg-success/10 border-success/30 text-success'
          : isOutForDelivery
            ? 'bg-secondary/10 border-secondary/30 text-secondary'
            : isInTransit
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold shadow-sm ${
            isDelivered
              ? 'bg-success text-white'
              : isOutForDelivery
                ? 'bg-secondary text-white animate-pulse'
                : 'bg-white/10 text-text-main'
          }`}>
            {isDelivered ? '✓' : isOutForDelivery ? '🚚' : isInTransit ? '📦' : '🧵'}
          </div>
          <div>
            <h4 className="text-sm font-extrabold m-0 leading-tight">
              {isPickup ? (
                isDelivered
                  ? 'Order Claimed at Pacific Mall Counter'
                  : isOutForDelivery || isInTransit
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
              {isPickup ? (
                isDelivered
                  ? 'Claimed by recipient at Eds Towels Counter • Verified'
                  : isOutForDelivery || isInTransit
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

        {/* Waybill / Dispatch Label Button */}
        <button
          onClick={() => setIsWaybillOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-main font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          title="View and print 4x6 inch pouch dispatch label"
        >
          <span>{isPickup ? '📄 Claim Slip' : '🏷️ Parcel Label'}</span>
        </button>
      </div>

      {/* 2. Logistics Partner & Tracking Number Card */}
      <div className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2.5">
          {isPickup ? (
            <>
              <div className="flex items-center gap-1.5 bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-black tracking-wide shadow-sm">
                <span>🏪</span>
                <span>STORE PICK-UP</span>
              </div>
              <div>
                <span className="text-xs font-bold text-text-main block">Counter Claiming</span>
                <span className="text-[0.7rem] text-text-dim">Pacific Mall Lucena Studio</span>
              </div>
            </>
          ) : (
            <>
              {/* Courier Delivery Indicator */}
              <div className="flex items-center gap-1.5 bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-xs font-black tracking-wide shadow-sm">
                <span>🚚</span>
                <span>PARCEL DELIVERY</span>
              </div>
              <div>
                <span className="text-xs font-bold text-text-main block">{courierName}</span>
                <span className="text-[0.7rem] text-text-dim">Standard Courier Logistics</span>
              </div>
            </>
          )}
        </div>

        {/* Tracking Number with Copy & Official Courier Portal link */}
        {trackingNumber ? (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-bg-dark/60 border border-border-glass px-3 py-1.5 rounded-xl">
              <div className="text-right">
                <span className="text-[0.62rem] text-text-dim block uppercase font-bold">
                  {isPickup ? 'Claim Reference' : 'Tracking No.'}
                </span>
                <span className="font-mono text-xs font-bold text-primary">{trackingNumber}</span>
              </div>
              <button
                onClick={handleCopyTracking}
                className="px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-[0.7rem] font-bold border border-primary/20 cursor-pointer transition-all"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {!isPickup && trackingNumber.startsWith('JNT') && (
              <a
                href={`https://www.jtexpress.ph/trajectoryQuery?bills=${trackingNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-main border border-border-glass text-[0.72rem] font-bold no-underline inline-flex items-center gap-1.5 transition-all shadow-sm"
                title="Verify tracking on carrier portal"
              >
                <span>Track Online</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>
        ) : (
          <div className="text-right">
            <span className="text-[0.68rem] text-text-dim italic">Tracking number assigned upon courier pickup</span>
          </div>
        )}
      </div>

      {/* 3. Shopee-Style Chronological Logistics Timeline Stepper */}
      <div className="bg-bg-surface border border-border-glass rounded-2xl p-5 flex flex-col gap-4">
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

      {/* 4. Recipient Delivery Address Card */}
      <div className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="text-xs leading-relaxed flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-extrabold text-text-main">{order.client || 'Recipient'}</span>
              <span className="text-text-dim text-[0.7rem]">(Delivery Recipient)</span>
            </div>
            <p className="text-text-dim m-0">
              {order.address?.split('(Landmark:')[0]?.trim() || order.address || 'Standard Delivery Address'}
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
