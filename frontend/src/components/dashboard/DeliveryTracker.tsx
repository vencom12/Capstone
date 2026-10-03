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

  // Standardized J&T Express tracking number derived from order ID
  const cleanId = order.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  const trackingNumber = `JNT-PH-78${cleanId}`;

  // Normalize order status
  const rawStatus = (order.status || '').toLowerCase();
  const isDelivered = rawStatus === 'completed' || rawStatus === 'order delivered' || order.progress >= 100;
  const isOutForDelivery = rawStatus === 'out for delivery';
  const isInTransit = rawStatus === 'in transit' || (order.progress >= 75 && !isDelivered && !isOutForDelivery);
  const isProduction = !isDelivered && !isOutForDelivery && !isInTransit;

  // Base dates for realistic milestone chronology
  const baseDate = new Date(order.date || Date.now());
  const formatDate = (daysOffset: number, hoursOffset: number, minute: number) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + daysOffset);
    d.setHours(d.getHours() + hoursOffset, minute, 0);
    return d.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Shopee-style dynamic logistics timeline events
  interface TimelineEvent {
    status: string;
    description: string;
    time: string;
    isLatest?: boolean;
    hub?: string;
  }

  const getTimeline = (): TimelineEvent[] => {
    if (isDelivered) {
      return [
        {
          status: 'Parcel Delivered & Received',
          description: `Parcel has been delivered to ${order.client || 'Recipient'}. Signature & photo proof recorded.`,
          time: formatDate(2, 6, 15),
          isLatest: true,
          hub: 'Lucena Delivery Hub'
        },
        {
          status: 'Out for Delivery',
          description: 'Parcel is out for delivery with J&T Courier [Mark Anthony R. - 0917-882-1490].',
          time: formatDate(2, 1, 30),
          hub: 'Lucena Delivery Hub'
        },
        {
          status: 'Arrived at Delivery Hub',
          description: 'Parcel arrived at local sorting facility [J&T Lucena Distribution Center].',
          time: formatDate(1, 19, 45),
          hub: 'Lucena Delivery Hub'
        },
        {
          status: 'In Transit',
          description: 'Parcel departed South Luzon Sorting Center, in transit to delivery hub.',
          time: formatDate(1, 10, 20),
          hub: 'South Luzon Hub'
        },
        {
          status: 'Picked up by Logistics Partner',
          description: 'J&T Express courier picked up parcel from Stitch-Opt Pacific Mall Lucena Studio.',
          time: formatDate(0, 16, 40),
          hub: 'Pacific Mall Lucena Studio'
        },
        {
          status: 'Order Packed & Waybill Created',
          description: 'Embroidery finished. Parcel packed & J&T Air Waybill sticker generated.',
          time: formatDate(0, 14, 10),
          hub: 'Pacific Mall Lucena Studio'
        },
        {
          status: 'Order Placed & Confirmed',
          description: 'Customer order placed & payment verified.',
          time: formatDate(0, 0, 5)
        }
      ];
    }

    if (isOutForDelivery) {
      return [
        {
          status: 'Parcel is Out for Delivery',
          description: 'J&T Courier [Mark Anthony R. - 0917-882-1490] is delivering your parcel today. Please keep your lines open.',
          time: formatDate(1, 4, 30),
          isLatest: true,
          hub: 'Lucena Delivery Hub'
        },
        {
          status: 'Arrived at Delivery Hub',
          description: 'Parcel arrived at local distribution facility [J&T Lucena Hub].',
          time: formatDate(1, 1, 15),
          hub: 'Lucena Delivery Hub'
        },
        {
          status: 'In Transit',
          description: 'Parcel departed South Luzon Sorting Center.',
          time: formatDate(0, 20, 10),
          hub: 'South Luzon Hub'
        },
        {
          status: 'Picked up by J&T Express',
          description: 'J&T Express accepted package from Stitch-Opt Pacific Mall Lucena Studio.',
          time: formatDate(0, 16, 40),
          hub: 'Pacific Mall Lucena Studio'
        },
        {
          status: 'Order Packed & Waybill Attached',
          description: 'Garment packed into shipping pouch with J&T Waybill sticker.',
          time: formatDate(0, 14, 10),
          hub: 'Pacific Mall Lucena Studio'
        },
        {
          status: 'Order Placed & Confirmed',
          description: 'Customer order placed & payment verified.',
          time: formatDate(0, 0, 5)
        }
      ];
    }

    if (isInTransit) {
      return [
        {
          status: 'In Transit to Local Delivery Hub',
          description: 'Parcel is moving between J&T Express sorting centers towards destination.',
          time: formatDate(0, 18, 20),
          isLatest: true,
          hub: 'South Luzon Sorting Center'
        },
        {
          status: 'Picked up by J&T Express',
          description: 'J&T Express courier scanned and accepted package from Stitch-Opt Pacific Mall Lucena Studio.',
          time: formatDate(0, 16, 30),
          hub: 'Pacific Mall Lucena Studio'
        },
        {
          status: 'Order Packed & Waybill Attached',
          description: 'Embroidered cap inspected, sealed in pouch, and J&T AWB sticker applied.',
          time: formatDate(0, 14, 0),
          hub: 'Pacific Mall Lucena Studio'
        },
        {
          status: 'Embroidery Production Completed',
          description: 'Vector digitization and high-speed machine stitching passed inspection.',
          time: formatDate(0, 10, 45)
        },
        {
          status: 'Order Placed & Confirmed',
          description: 'Customer order placed & payment verified.',
          time: formatDate(0, 0, 5)
        }
      ];
    }

    // Default: Workshop Production Phase
    return [
      {
        status: 'In Embroidery Production',
        description: 'Order is currently undergoing vector digitizing, hooping, and machine stitching at Stitch-Opt Pacific Mall Lucena Studio.',
        time: formatDate(0, 2, 30),
        isLatest: true,
        hub: 'Pacific Mall Lucena Studio'
      },
      {
        status: 'Order Placed & Payment Verified',
        description: `Order successfully logged via ${order.paymentMethod.toUpperCase()}. Preparing raw materials.`,
        time: formatDate(0, 0, 5)
      }
    ];
  };

  const timeline = getTimeline();

  const handleCopyTracking = () => {
    navigator.clipboard.writeText(trackingNumber);
    setCopied(true);
    showToast('J&T Tracking Number copied to clipboard!', 'success');
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
              {isDelivered
                ? 'Parcel has been delivered'
                : isOutForDelivery
                  ? 'Parcel is out for delivery'
                  : isInTransit
                    ? 'Parcel is in transit'
                    : 'Parcel is being prepared'}
            </h4>
            <p className="text-[0.72rem] text-text-dim m-0 mt-0.5">
              {isDelivered
                ? 'Delivered to recipient address • Verified'
                : 'Estimated Arrival: 1-3 Business Days via J&T Express'}
            </p>
          </div>
        </div>

        {/* Waybill Sticker Action Button */}
        <button
          onClick={() => setIsWaybillOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-main font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          title="View and print official 4x6 inch J&T Express thermal waybill sticker"
        >
          <span>🏷️ J&T Waybill Sticker</span>
        </button>
      </div>

      {/* 2. Logistics Partner & Tracking Number Card */}
      <div className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2.5">
          {/* J&T Express Badge */}
          <div className="flex items-center gap-1 bg-[#e11d48] text-white px-2 py-1 rounded-lg text-xs font-black tracking-wide shadow-sm">
            <span>J&T</span>
            <span className="text-[9px] font-bold text-white/80">EXPRESS</span>
          </div>
          <div>
            <span className="text-xs font-bold text-text-main block">Standard Delivery</span>
            <span className="text-[0.7rem] text-text-dim">Official 3PL Logistics Partner</span>
          </div>
        </div>

        {/* Tracking Number with Copy */}
        <div className="flex items-center gap-2 bg-bg-dark/60 border border-border-glass px-3 py-1.5 rounded-xl">
          <div className="text-right">
            <span className="text-[0.62rem] text-text-dim block uppercase font-bold">
              Tracking No.
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
