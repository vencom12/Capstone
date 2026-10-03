'use client';

import type { Order } from '@/lib/types';
import {
  getOrderStage,
  getOrderTitle,
  STEP_LABELS,
  TOTAL_STEPS,
  TONE_CLASSES,
} from '@/lib/orderStatus';

interface OrderMilestoneHeroProps {
  orders: Order[];
  onViewDetails: (order: Order, tab?: 'summary' | 'tracking') => void;
  onViewAll?: () => void;
}

/**
 * Compact "your order" banner shown above the catalog.
 * Shows only the most recent active order; everything else lives in the Orders tab.
 */
export default function OrderMilestoneHero({ orders, onViewDetails, onViewAll }: OrderMilestoneHeroProps) {
  const active = [...orders]
    .filter((o) => getOrderStage(o).isActive)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (active.length === 0) return null;

  const order = active[0];
  const others = active.length - 1;
  const stage = getOrderStage(order);
  const personalization = (order.personalization && typeof order.personalization === 'object') ? (order.personalization as any) : {};
  const isPickup = personalization.fulfillmentType === 'pickup' || (typeof order.address === 'string' && order.address.toLowerCase().includes('pick-up'));

  return (
    <div className="mb-5 bg-bg-card/90 border border-border-glass backdrop-blur-xl rounded-2xl p-4 shadow-sm animate-[fadeIn_0.3s_ease-out]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-text-dim">Your order</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold border ${TONE_CLASSES[stage.tone]}`}>
              {stage.label}
            </span>
          </div>
          <p className="m-0 mt-1 text-sm font-bold text-text-main truncate">{getOrderTitle(order)}</p>
          <p className="m-0 mt-0.5 text-[0.72rem] text-text-dim">{stage.hint}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {others > 0 && onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs font-semibold text-primary hover:underline bg-transparent border-none cursor-pointer p-0"
            >
              +{others} more {others === 1 ? 'order' : 'orders'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onViewDetails(order, 'tracking')}
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer border-none shadow-sm"
          >
            {isPickup ? 'Track Pick-up' : 'Track Delivery'}
          </button>
        </div>
      </div>

      {/* Compact segmented progress */}
      <div className="mt-3 flex gap-1.5" aria-label={`Step ${stage.step} of ${TOTAL_STEPS}: ${STEP_LABELS[stage.step - 1] || ''}`}>
        {STEP_LABELS.map((label, i) => (
          <div
            key={label}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < stage.step ? 'bg-primary' : 'bg-white/10'
            }`}
            title={label}
          />
        ))}
      </div>
      <p className="m-0 mt-1.5 text-[0.68rem] text-text-dim">
        Step {stage.step} of {TOTAL_STEPS} • {STEP_LABELS[stage.step - 1]}
      </p>
    </div>
  );
}
