import type { Order } from '@/lib/types';

export type OrderTone = 'pending' | 'progress' | 'shipping' | 'done' | 'cancelled';

export interface OrderStage {
  /** Customer-friendly headline, e.g. "Being embroidered" */
  label: string;
  /** Short helper sentence shown under the headline */
  hint: string;
  /** Current step (1-based) out of TOTAL_STEPS */
  step: number;
  tone: OrderTone;
  isActive: boolean;
}

export const TOTAL_STEPS = 5;

export const STEP_LABELS = [
  'Order confirmed',
  'Preparing design',
  'Being embroidered',
  'Ready for Store Pick-up',
  'Claimed / Completed',
];

/** Translates internal order status/progress into plain customer language. */
export function getOrderStage(order: Order): OrderStage {
  const status = (order.status || '').toLowerCase();
  const progress = order.progress || 0;

  if (status.includes('cancel')) {
    return { label: 'Cancelled', hint: 'This order was cancelled.', step: 0, tone: 'cancelled', isActive: false };
  }
  if (status === 'completed' || status === 'order delivered' || progress >= 100) {
    return { label: 'Claimed', hint: 'Your order was picked up at Pacific Mall Lucena. Enjoy!', step: 5, tone: 'done', isActive: false };
  }
  if (status === 'out for delivery' || status.includes('ready')) {
    return { label: 'Ready for Pick-up', hint: 'Your order is at the counter ready for claiming.', step: 4, tone: 'shipping', isActive: true };
  }
  if (status === 'in transit' || progress >= 75) {
    return { label: 'Ready for Pick-up', hint: 'Claim at Eds Towels & Caps, Pacific Mall Lucena (10AM-8PM).', step: 4, tone: 'shipping', isActive: true };
  }
  if (status.includes('awaiting') || status === 'pending') {
    return { label: 'Confirming your payment', hint: 'We are checking your payment. This usually takes a short while.', step: 1, tone: 'pending', isActive: true };
  }
  if (progress >= 45) {
    return { label: 'Being embroidered', hint: 'Our team is stitching your design.', step: 3, tone: 'progress', isActive: true };
  }
  if (progress >= 20) {
    return { label: 'Preparing your design', hint: 'We are getting your design ready for stitching.', step: 2, tone: 'progress', isActive: true };
  }
  return { label: 'Order confirmed', hint: 'Your order is in our queue.', step: 1, tone: 'progress', isActive: true };
}

/** Human title for an order: product name(s), never a raw ID. */
export function getOrderTitle(order: Order): string {
  const items = order.items || [];
  if (items.length > 0) {
    const first = items[0].name || order.design || 'Custom order';
    return items.length > 1 ? `${first} +${items.length - 1} more` : first;
  }
  return order.design || 'Custom order';
}

export const TONE_CLASSES: Record<OrderTone, string> = {
  pending: 'bg-white/5 text-text-dim border-border-glass',
  progress: 'bg-primary/15 text-primary border-primary/30',
  shipping: 'bg-secondary/15 text-secondary border-secondary/30',
  done: 'bg-success/15 text-success border-success/30',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
};
