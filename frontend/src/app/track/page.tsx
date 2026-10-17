'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface TrackedOrder {
  orderId: string;
  claimCode: string;
  client: string;
  design: string;
  monogramText: string | null;
  status: string;
  stage: 'queue' | 'stitching' | 'ready' | 'completed';
  ordersAhead: number;
  estimatedMinutesLeft: number;
  totalAmount: number;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
}

function OrderTrackerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawId = (searchParams.get('id') || '').trim();

  const [inputCode, setInputCode] = useState('');
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevStageRef = useRef<string>('');

  // Audio chime when order transitions to ready
  const playClaimReadyChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch {
      // AudioContext unavailable
    }
  };

  useEffect(() => {
    if (!rawId) {
      setOrder(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const fetchOrder = async () => {
      try {
        const res = await api.get<{ success: boolean; order: TrackedOrder }>(`/api/customer/track/${rawId}`);
        if (isMounted && res && res.success) {
          const ord = res.order;
          if (prevStageRef.current && prevStageRef.current !== 'ready' && ord.stage === 'ready') {
            playClaimReadyChime();
          }
          prevStageRef.current = ord.stage;
          setOrder(ord);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Order not found. Please check your claim stub.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchOrder();
    // Fallback Polling (45s background safety net - WebSockets handle real-time sync)
    const interval = setInterval(fetchOrder, 45000);

    // Real-time Socket.IO Listener for instant status change
    let activeSocket: any = null;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

    const connectSocket = () => {
      if (!isMounted) return;
      const io = (window as any).io;
      if (!io) return;

      const socket = io(API_BASE, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        auth: { portal: 'customer' }
      });
      activeSocket = socket;

      const handleLiveOrderUpdate = (data?: any) => {
        if (data) {
          if (data.order) {
            setOrder((prev: any) => {
              if (!prev) return data.order;
              const matches = (prev.id && (prev.id === data.order.id || prev.id === data.order.orderId)) ||
                              (prev.orderId && (prev.orderId === data.order.orderId || prev.orderId === data.order.id));
              return matches ? { ...prev, ...data.order } : prev;
            });
            return;
          }
          if (Array.isArray(data.results)) {
            setOrder((prev: any) => {
              if (!prev) return prev;
              const match = data.results.find((r: any) => r.id === prev.id || r.orderId === prev.orderId);
              return match ? { ...prev, ...match } : prev;
            });
            return;
          }
          if (data.status) {
            setOrder((prev: any) => {
              if (!prev) return prev;
              const matches = (data.orderId && (prev.orderId === data.orderId || prev.id === data.orderId)) ||
                              (data.id && (prev.id === data.id || prev.orderId === data.id)) ||
                              (Array.isArray(data.ids) && (data.ids.includes(prev.id) || data.ids.includes(prev.orderId)));
              return matches ? { ...prev, status: data.status } : prev;
            });
            return;
          }
        }
        fetchOrder();
      };

      socket.on('dataChanged', (data: any) => {
        if (!data || !data.entity || data.entity === 'ORDER') {
          handleLiveOrderUpdate(data?.data);
        }
      });
      socket.on('ordersUpdated', handleLiveOrderUpdate);
      socket.on('order:cancelled', handleLiveOrderUpdate);
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

    // Refresh when user switches tabs, throttled to prevent spam
    let lastTabFocus = 0;
    const handleTabActive = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastTabFocus > 15000) {
          lastTabFocus = now;
          fetchOrder();
        }
      }
    };
    window.addEventListener('focus', handleTabActive);
    document.addEventListener('visibilitychange', handleTabActive);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', handleTabActive);
      document.removeEventListener('visibilitychange', handleTabActive);
      if (activeSocket) {
        activeSocket.close();
      }
    };
  }, [rawId]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputCode.trim().toUpperCase();
    if (clean) {
      router.push(`/track?id=${encodeURIComponent(clean)}`);
    }
  };

  // IF NO ID SPECIFIED: RENDER SEARCH FORM
  if (!rawId) {
    return (
      <main className="flex-1 p-6 max-w-sm w-full mx-auto flex flex-col items-center justify-center text-center gap-6">
        <div className="w-16 h-16 rounded-xl bg-red-600/10 border border-red-500/30 flex items-center justify-center text-3xl shadow-lg shadow-red-950/50">
          🎟️
        </div>

        <div>
          <h2 className="text-xl font-black text-text-main">Track Your Embroidery</h2>
          <p className="text-xs text-text-dim mt-1 max-w-xs">
            Type your Ticket Number or Claim Code written on your paper stub (e.g. <strong className="text-text-main font-mono">WI-582B</strong> or <strong className="text-text-main font-mono">A-582B</strong>).
          </p>
        </div>

        <form onSubmit={handleManualSearch} className="w-full flex flex-col gap-3">
          <input
            type="text"
            placeholder="e.g. WI-582B or A-582B"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            className="w-full bg-bg-surface border border-border-glass px-4 py-3.5 rounded-lg text-center text-base font-mono font-bold tracking-widest text-text-main outline-none focus:border-primary transition shadow-inner"
            required
            autoFocus
          />

          <button
            type="submit"
            className="w-full py-3.5 rounded-lg bg-primary hover:bg-primary-light active:scale-[0.99] text-white text-xs font-extrabold transition shadow-md shadow-primary/20 cursor-pointer"
          >
            Check Order Status
          </button>
        </form>

        <div className="text-[11px] text-text-dim">
          Pacific Mall Lucena ground floor embroidery stall.
        </div>
      </main>
    );
  }

  // IF LOADING
  if (isLoading && !order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-text-dim">Loading order status...</p>
      </div>
    );
  }

  // IF ERROR
  if (error || !order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-xl bg-white/5 border border-border-glass flex items-center justify-center text-2xl mb-4">
          🔍
        </div>
        <h2 className="text-lg font-bold text-text-main mb-1">Ticket Not Found</h2>
        <p className="text-xs text-text-dim max-w-xs mb-6">
          We could not find an order matching <strong className="text-text-main">"{rawId}"</strong>. Please verify the code printed on your thermal claim stub.
        </p>
        <button
          type="button"
          onClick={() => router.push('/track')}
          className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-light text-white text-xs font-bold transition shadow-sm cursor-pointer"
        >
          Enter Different Code
        </button>
      </div>
    );
  }

  const isReady = order.stage === 'ready';
  const isStitching = order.stage === 'stitching';
  const isQueue = order.stage === 'queue';
  const isCompleted = order.stage === 'completed';

  return (
    <main className="flex-1 p-4 max-w-md w-full mx-auto flex flex-col gap-4 animate-fade">
      {/* HERO STATUS CARD */}
      <div
        className={`rounded-xl p-6 border transition-all flex flex-col gap-4 ${
          isReady
            ? 'bg-bg-card border-emerald-500/60 shadow-lg shadow-emerald-500/10'
            : isStitching
            ? 'bg-bg-card border-blue-500/60 shadow-lg shadow-blue-500/10'
            : isCompleted
            ? 'bg-bg-card border-border-glass'
            : 'bg-bg-card border-amber-500/60 shadow-lg shadow-amber-500/10'
        }`}
      >
        {/* Header Row */}
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim block mb-0.5">
              Your Anti-Fraud Claim Stub
            </span>
            <div className="text-3xl font-black font-mono tracking-widest text-text-main">
              {order.claimCode}
            </div>
            <span className="text-xs text-text-dim font-mono">
              Order #{order.orderId}
            </span>
          </div>

          <div
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border flex items-center gap-1.5 shadow-sm ${
              isReady
                ? 'bg-emerald-500 text-white border-emerald-400 animate-pulse'
                : isStitching
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                : isCompleted
                ? 'bg-white/10 text-text-dim border-border-glass'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
            }`}
          >
            <span>{isReady ? '🟢' : isStitching ? '🔵' : isCompleted ? '✓' : '🟡'}</span>
            <span>
              {isReady
                ? 'READY FOR CLAIM'
                : isStitching
                ? 'NOW STITCHING'
                : isCompleted
                ? 'CLAIMED'
                : 'IN QUEUE'}
            </span>
          </div>
        </div>

        {/* 3-Step Visual Progress Tracker */}
        <div className="py-2 flex items-center justify-between relative">
          <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-white/10 z-0" />

          {/* Step 1: Queue */}
          <div className="flex flex-col items-center gap-1 relative z-10">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isQueue || isStitching || isReady || isCompleted
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-bg-surface text-text-dim border border-border-glass'
              }`}
            >
              1
            </div>
            <span className="text-[10px] font-bold text-text-dim">Queue</span>
          </div>

          {/* Step 2: Stitching */}
          <div className="flex flex-col items-center gap-1 relative z-10">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isStitching || isReady || isCompleted
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-bg-surface text-text-dim border border-border-glass'
              }`}
            >
              2
            </div>
            <span className="text-[10px] font-bold text-text-dim">Stitching</span>
          </div>

          {/* Step 3: Ready */}
          <div className="flex flex-col items-center gap-1 relative z-10">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isReady || isCompleted
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-bg-surface text-text-dim border border-border-glass'
              }`}
            >
              3
            </div>
            <span className="text-[10px] font-bold text-text-dim">Ready</span>
          </div>
        </div>

        {/* Turnaround Status Notice */}
        {isReady ? (
          <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-3.5 text-center">
            <div className="text-sm font-black text-emerald-500 dark:text-emerald-300">
              🎉 Your order is ready for pickup!
            </div>
            <p className="text-xs text-text-dim mt-1 leading-relaxed">
              Please proceed to the counter and show your claim code{' '}
              <strong className="text-text-main font-mono">{order.claimCode}</strong> to collect your items.
            </p>
          </div>
        ) : isStitching ? (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-center">
            <span className="text-xs text-blue-500 dark:text-blue-300 font-bold block">
              🧵 Currently stitching on the machine
            </span>
            <span className="text-[11px] text-text-dim">
              Estimated completion in <strong>~{order.estimatedMinutesLeft} minutes</strong>.
            </span>
          </div>
        ) : isCompleted ? (
          <div className="bg-bg-surface border border-border-glass rounded-xl p-3 text-center text-xs text-text-dim">
            ✓ Order collected. Thank you for your business!
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center">
            <span className="text-xs text-amber-500 dark:text-amber-400 font-bold block">
              ⏳ In machine queue ({order.ordersAhead} orders ahead)
            </span>
            <span className="text-[11px] text-text-dim">
              Estimated wait time: <strong>~{order.estimatedMinutesLeft} minutes</strong>.
            </span>
          </div>
        )}
      </div>

      {/* ORDER SUMMARY */}
      <div className="bg-bg-card border border-border-glass rounded-xl p-4 flex flex-col gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-dim pb-1 border-b border-border-glass">
          Order Details
        </span>

        <div className="flex justify-between items-center text-xs">
          <span className="text-text-dim">Garment Item:</span>
          <span className="font-bold text-text-main text-right">{order.design}</span>
        </div>

        {order.monogramText && (
          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5 flex items-center justify-between text-xs">
            <span className="text-text-dim text-[11px]">Embroidered Text:</span>
            <span className="font-mono font-black text-amber-300 text-sm tracking-wider uppercase">
              "{order.monogramText}"
            </span>
          </div>
        )}

        <div className="flex justify-between items-center text-xs pt-1 border-t border-border-glass">
          <span className="text-text-dim">Customer:</span>
          <span className="font-semibold text-text-main">{order.client}</span>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="text-text-dim">Total Paid:</span>
          <span className="font-mono font-bold text-emerald-500">
            ₱{order.totalAmount?.toFixed(2)} (PAID)
          </span>
        </div>
      </div>

      {/* Customer Mall Tip */}
      <div className="mt-auto bg-bg-surface border border-border-glass rounded-xl p-4 text-xs text-text-dim text-center leading-relaxed">
        💡 <strong>Customer Tip:</strong> Feel free to browse around Pacific Mall while you wait. This tracker automatically updates and plays a chime once your order is ready for pickup!
      </div>
    </main>
  );
}

export default function MobileOrderTrackerPage() {
  return (
    <div className="min-h-screen bg-bg-dark text-text-main flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Header */}
      <header className="border-b border-border-glass bg-bg-card/90 backdrop-blur-md px-5 py-3.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-black text-sm text-white shadow-sm">
            E
          </div>
          <div>
            <h1 className="text-xs font-extrabold uppercase tracking-wider text-text-main">
              Eds Towels &amp; Caps
            </h1>
            <p className="text-[10px] text-text-dim">
              Pacific Mall Lucena • Mobile Tracker
            </p>
          </div>
        </div>

        <Link
          href="/track"
          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 border border-border-glass text-text-dim hover:text-text-main transition"
        >
          Search Another
        </Link>
      </header>

      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center p-6 text-xs text-text-dim">
          Loading...
        </div>
      }>
        <OrderTrackerContent />
      </Suspense>
    </div>
  );
}
