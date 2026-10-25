'use client';

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

        {/* 3-Step Ordering Journey Progress Bar (100% Completed Milestones) */}
        <div className="pt-0.5 pb-2 border-b border-border-glass/40 -mt-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-bold text-text-main">
                Step 3 of 3:
              </span>
              <span className="text-[11px] text-emerald-400 font-bold">
                Order Validated &amp; Placed in Queue!
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
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
                className="h-full bg-gradient-to-r from-primary via-emerald-500 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] w-full"
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
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)] scale-105"
                  title={`Step ${s.id}: ${s.label} (Completed)`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-[9px] mt-1 font-bold tracking-tight uppercase whitespace-nowrap text-emerald-400">
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
              <span className="text-[0.68rem] text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
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
                  <span className="text-emerald-400">✓</span>
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
                const variantName = item.selectedVariant || item.variant || '';

                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-white/[0.02] border border-border-glass/40 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.imageUrl && (
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-border-glass/50 bg-black/30 shrink-0">
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-text-main truncate">
                          {item.quantity || 1}x {item.name}
                        </span>
                        {variantName && (
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

          {/* Total Row */}
          <div className="pt-2.5 border-t border-border-glass/50 flex items-center justify-between text-xs">
            <span className="font-bold text-text-dim uppercase tracking-wider text-[0.68rem]">
              Total Paid
            </span>
            <span className="font-mono font-extrabold text-sm sm:text-base text-text-main">
              ₱{totalAmount}
            </span>
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
            <span>Track in My Orders</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
