'use client';

import { useState } from 'react';
import type { Order } from '@/lib/types';

interface OrderMilestoneHeroProps {
  orders: Order[];
  onViewDetails: (order: Order, tab?: 'summary' | 'tracking') => void;
}

const MILESTONES = [
  { step: 1, label: 'Order Placed', desc: 'Verified & Queued', minProgress: 0 },
  { step: 2, label: 'Digitized', desc: 'Vector Pathing & Density', minProgress: 20 },
  { step: 3, label: 'Stitching', desc: 'Embroidery In-Flight', minProgress: 45 },
  { step: 4, label: 'QA Inspection', desc: 'Tension & Trim Check', minProgress: 80 },
  { step: 5, label: 'Out for Delivery', desc: 'Courier Dispatched', minProgress: 100 },
];

export default function OrderMilestoneHero({ orders, onViewDetails }: OrderMilestoneHeroProps) {
  // Find orders that are currently in progress
  const activeOrders = orders.filter(
    (o) => o.status !== 'Completed' && o.status !== 'Cancelled'
  );

  const [selectedIndex, setSelectedIndex] = useState(0);

  if (activeOrders.length === 0) return null;

  const currentOrder = activeOrders[selectedIndex] || activeOrders[0];
  const progress = currentOrder.progress || 0;

  // Determine current active milestone
  let currentMilestoneIndex = 0;
  for (let i = 0; i < MILESTONES.length; i++) {
    if (progress >= MILESTONES[i].minProgress) {
      currentMilestoneIndex = i;
    }
  }

  return (
    <div className="mb-6 bg-gradient-to-r from-bg-card/90 via-bg-surface/90 to-bg-card/90 border border-primary/25 backdrop-blur-xl rounded-3xl p-5 shadow-lg relative overflow-hidden transition-all animate-[fadeIn_0.3s_ease-out]">
      {/* Decorative ambient glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Banner Row: Order Info & Selector */}
      <div className="flex justify-between items-start flex-wrap gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold shadow-sm shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2v4" />
              <path d="m4.93 4.93 2.83 2.83" />
              <path d="M2 12h4" />
              <path d="m4.93 19.07 2.83-2.83" />
              <path d="M12 22v-4" />
              <path d="m19.07 19.07-2.83-2.83" />
              <path d="M22 12h-4" />
              <path d="m19.07 4.93-2.83 2.83" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[0.7rem] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                Live Production Stepper
              </span>
              <span className="font-bold text-sm text-text-main">
                {currentOrder.orderId}
              </span>
              {currentOrder.design && (
                <span className="text-xs text-text-dim">
                  • {currentOrder.design}
                </span>
              )}
            </div>
            <p className="text-xs text-text-dim m-0 mt-0.5">
              Target Dispatch: <span className="text-text-main font-semibold">{currentOrder.deliveryTime || 'Standard Priority'}</span> • Placed {new Date(currentOrder.date).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Multi-order switcher if user has > 1 active order */}
        <div className="flex items-center gap-2">
          {activeOrders.length > 1 && (
            <div className="flex items-center gap-1 bg-bg-surface/80 border border-border-glass rounded-xl p-1">
              {activeOrders.map((ord, idx) => (
                <button
                  key={ord.id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
                    idx === selectedIndex
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-transparent text-text-dim hover:text-text-main'
                  }`}
                >
                  #{ord.orderId.slice(-4)}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => onViewDetails(currentOrder, 'tracking')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-sm cursor-pointer border-none"
          >
            <span>Live GPS</span>
            <span className="w-2 h-2 rounded-full bg-success animate-ping" />
          </button>
        </div>
      </div>

      {/* Progress Bar & Milestone Stepper */}
      <div className="mt-5 relative z-10">
        {/* Progress track */}
        <div className="relative flex items-center justify-between">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-border-glass rounded-full z-0" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all duration-700 z-0"
            style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
          />

          {/* Stepper Nodes */}
          {MILESTONES.map((m, idx) => {
            const isCompleted = idx < currentMilestoneIndex || (idx === currentMilestoneIndex && progress >= 100);
            const isCurrent = idx === currentMilestoneIndex && progress < 100;

            return (
              <div key={m.step} className="flex flex-col items-center relative z-10 group">
                <div
                  className={`
                    w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300
                    ${isCompleted
                      ? 'bg-primary text-white shadow-sm'
                      : isCurrent
                        ? 'bg-bg-dark border-2 border-primary text-primary shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.5)] ring-4 ring-primary/20 animate-pulse'
                        : 'bg-bg-surface border border-border-glass text-text-dim'}
                  `}
                >
                  {isCompleted ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    m.step
                  )}
                </div>

                <div className="hidden sm:flex flex-col items-center mt-2 text-center">
                  <span
                    className={`text-[0.7rem] font-bold whitespace-nowrap ${
                      isCurrent ? 'text-primary' : isCompleted ? 'text-text-main' : 'text-text-dim'
                    }`}
                  >
                    {m.label}
                  </span>
                  <span className="text-[0.65rem] text-text-dim/80 whitespace-nowrap">
                    {m.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile active milestone label */}
        <div className="sm:hidden mt-3 text-center">
          <span className="text-xs font-bold text-primary">
            Step {currentMilestoneIndex + 1}: {MILESTONES[currentMilestoneIndex]?.label}
          </span>
          <span className="text-xs text-text-dim ml-1.5">
            ({progress}% completed)
          </span>
        </div>
      </div>
    </div>
  );
}
