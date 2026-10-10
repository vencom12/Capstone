'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

export default function MobileOrderTrackerPage() {
  const params = useParams();
  const rawId = (params?.id as string) || '';
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
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
    if (!rawId) return;
    let isMounted = true;

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
          setError(err.message || 'Order not found. Please check your ticket number.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchOrder();
    const interval = setInterval(fetchOrder, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [rawId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-400">Loading order status...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-4">
          🔍
        </div>
        <h2 className="text-lg font-bold text-white mb-1">Ticket Not Found</h2>
        <p className="text-xs text-slate-400 max-w-xs mb-6">
          We could not find an order matching <strong className="text-white">"{rawId}"</strong>. Please verify the code printed on your thermal claim stub.
        </p>
        <Link
          href="/track"
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow"
        >
          Enter Different Code
        </Link>
      </div>
    );
  }

  const isReady = order.stage === 'ready';
  const isStitching = order.stage === 'stitching';
  const isQueue = order.stage === 'queue';
  const isCompleted = order.stage === 'completed';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-slate-900/90 backdrop-blur-md px-5 py-3.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-sm text-white shadow">
            E
          </div>
          <div>
            <h1 className="text-xs font-extrabold uppercase tracking-wider text-white">
              Eds Towels &amp; Caps
            </h1>
            <p className="text-[10px] text-slate-400">
              Pacific Mall Lucena • Mobile Tracker
            </p>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/5 border border-white/10 text-slate-300">
          Live Auto-Update
        </span>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 max-w-md w-full mx-auto flex flex-col gap-4">
        {/* HERO STATUS CARD */}
        <div
          className={`rounded-2xl p-6 border-2 shadow-xl transition-all flex flex-col gap-4 ${
            isReady
              ? 'bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-900 border-emerald-500 shadow-emerald-950/50'
              : isStitching
              ? 'bg-gradient-to-br from-blue-950/70 via-slate-900 to-slate-900 border-blue-500 shadow-blue-950/40'
              : isCompleted
              ? 'bg-slate-900 border-white/15'
              : 'bg-slate-900 border-amber-500/50 shadow-amber-950/30'
          }`}
        >
          {/* Header Row */}
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-0.5">
                Your Anti-Fraud Claim Stub
              </span>
              <div className="text-3xl font-black font-mono tracking-widest text-white">
                {order.claimCode}
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Order #{order.orderId}
              </span>
            </div>

            <div
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border flex items-center gap-1.5 shadow-sm ${
                isReady
                  ? 'bg-emerald-500 text-black border-emerald-400 animate-pulse'
                  : isStitching
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : isCompleted
                  ? 'bg-white/10 text-slate-300 border-white/20'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
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
                    ? 'bg-amber-500 text-black shadow'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                1
              </div>
              <span className="text-[10px] font-bold text-slate-400">Queue</span>
            </div>

            {/* Step 2: Stitching */}
            <div className="flex flex-col items-center gap-1 relative z-10">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  isStitching || isReady || isCompleted
                    ? 'bg-blue-500 text-white shadow'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                2
              </div>
              <span className="text-[10px] font-bold text-slate-400">Stitching</span>
            </div>

            {/* Step 3: Ready */}
            <div className="flex flex-col items-center gap-1 relative z-10">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  isReady || isCompleted
                    ? 'bg-emerald-500 text-black shadow'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                3
              </div>
              <span className="text-[10px] font-bold text-slate-400">Ready</span>
            </div>
          </div>

          {/* Action / Turnaround Callout */}
          {isReady ? (
            <div className="bg-emerald-500/20 border border-emerald-400/40 rounded-xl p-3.5 text-center">
              <div className="text-sm font-black text-emerald-300">
                🎉 Tapos na po ang order niyo!
              </div>
              <p className="text-xs text-emerald-100/80 mt-1 leading-relaxed">
                Pumunta lamang po sa counter at ipakita ang inyong paper stub{' '}
                <strong className="text-white font-mono">{order.claimCode}</strong> para makuha ang inyong bag.
              </p>
            </div>
          ) : isStitching ? (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-center">
              <span className="text-xs text-blue-300 font-bold block">
                🧵 Kasalukuyang tinatahi sa makina
              </span>
              <span className="text-[11px] text-slate-400">
                Tinatayang matatapos sa loob ng <strong>~{order.estimatedMinutesLeft} minuto</strong>.
              </span>
            </div>
          ) : isCompleted ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center text-xs text-slate-300">
              ✓ Nakuha na ang order. Maraming salamat po!
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center">
              <span className="text-xs text-amber-300 font-bold block">
                ⏳ Nakapila sa makina ({order.ordersAhead} nauna)
              </span>
              <span className="text-[11px] text-slate-400">
                Tinatayang oras ng paghihintay: <strong>~{order.estimatedMinutesLeft} minuto</strong>.
              </span>
            </div>
          )}
        </div>

        {/* ORDER SUMMARY */}
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-1 border-b border-white/5">
            Order Details
          </span>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Garment Item:</span>
            <span className="font-bold text-white text-right">{order.design}</span>
          </div>

          {order.monogramText && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">Embroidered Text:</span>
              <span className="font-mono font-black text-amber-300 text-sm tracking-wider uppercase">
                "{order.monogramText}"
              </span>
            </div>
          )}

          <div className="flex justify-between items-center text-xs pt-1 border-t border-white/5">
            <span className="text-slate-400">Customer:</span>
            <span className="font-semibold text-slate-200">{order.client}</span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Total Paid:</span>
            <span className="font-mono font-bold text-emerald-400">
              ₱{order.totalAmount?.toFixed(2)} (PAID)
            </span>
          </div>
        </div>

        {/* Customer Mall Tip */}
        <div className="mt-auto bg-white/[0.03] border border-white/5 rounded-2xl p-4 text-xs text-slate-400 text-center leading-relaxed">
          💡 <strong>Tip para sa customer:</strong> Maaari po kayong mamasyal o kumain sa food court ng Pacific Mall. Magre-refresh ang pahinang ito at tutunog kapag handa na ang inyong order!
        </div>
      </main>
    </div>
  );
}
