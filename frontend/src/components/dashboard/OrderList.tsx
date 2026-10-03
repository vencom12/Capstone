'use client';

import { useState } from 'react';
import type { Order } from '@/lib/types';
import {
  getOrderStage,
  getOrderTitle,
  TOTAL_STEPS,
  TONE_CLASSES,
} from '@/lib/orderStatus';

interface OrderListProps {
  orders: Order[];
  onTrack: (order: Order) => void;
  onDetails: (order: Order) => void;
  onReorder: (order: Order) => void;
}

function OrderCard({ order, onTrack, onDetails, onReorder }: {
  order: Order;
  onTrack: (o: Order) => void;
  onDetails: (o: Order) => void;
  onReorder: (o: Order) => void;
}) {
  const stage = getOrderStage(order);
  const title = getOrderTitle(order);
  const thumb = order.items?.[0]?.imageUrl;
  const percent = stage.step === 0 ? 0 : Math.round((stage.step / TOTAL_STEPS) * 100);

  return (
    <article className="bg-bg-card backdrop-blur-md border border-border-glass rounded-2xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-xl bg-bg-surface border border-border-glass overflow-hidden shrink-0 flex items-center justify-center text-xl">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={title} className="w-full h-full object-cover" />
          ) : (
            <span aria-hidden>🧵</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="m-0 text-sm font-bold text-text-main truncate">{title}</h4>
          <p className="m-0 mt-0.5 text-[0.72rem] text-text-dim">
            Ordered {new Date(order.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
            {' • '}₱{order.totalAmount.toFixed(2)}
          </p>
          <p className="m-0 mt-0.5 text-[0.65rem] text-text-dim/70 font-mono">Order #{order.orderId}</p>
        </div>

        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border ${TONE_CLASSES[stage.tone]}`}>
          {stage.label}
        </span>
      </div>

      {stage.isActive && (
        <div className="flex flex-col gap-1.5">
          <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between text-[0.7rem] text-text-dim">
            <span>{stage.hint}</span>
            <span className="font-semibold text-text-main shrink-0 ml-2">
              Step {stage.step} of {TOTAL_STEPS}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-glass/50">
        <button
          type="button"
          onClick={() => onDetails(order)}
          className="text-xs font-semibold text-text-dim hover:text-text-main bg-transparent border-none cursor-pointer p-0"
        >
          View details
        </button>

        {stage.isActive ? (
          <button
            type="button"
            onClick={() => onTrack(order)}
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer border-none shadow-sm"
          >
            Track Delivery
          </button>
        ) : stage.tone === 'done' ? (
          <button
            type="button"
            onClick={() => onReorder(order)}
            className="px-4 py-2 rounded-xl bg-primary/15 text-primary border border-primary/30 text-xs font-bold hover:bg-primary/25 transition-all cursor-pointer"
          >
            Buy Again
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function OrderList({ orders, onTrack, onDetails, onReorder }: OrderListProps) {
  const [tab, setTab] = useState<'active' | 'past'>('active');

  const sorted = [...orders].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const active = sorted.filter((o) => getOrderStage(o).isActive);
  const past = sorted.filter((o) => !getOrderStage(o).isActive);
  const visible = tab === 'active' ? active : past;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="tablist" aria-label="Order status">
        {([
          { id: 'active', label: 'In progress', count: active.length },
          { id: 'past', label: 'Completed', count: past.length },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              tab === t.id
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-bg-surface text-text-dim border-border-glass hover:text-text-main'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="bg-bg-surface border border-border-glass rounded-2xl p-8 text-center text-text-dim text-sm">
          {tab === 'active'
            ? 'You have no orders in progress right now.'
            : 'No completed orders yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
          {visible.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onTrack={onTrack}
              onDetails={onDetails}
              onReorder={onReorder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
