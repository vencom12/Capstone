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
  'With J&T Express',
  'Delivered',
];

/** Translates internal order status/progress into plain customer language. */
export function getOrderStage(order: Order): OrderStage {
  const status = (order.status || '').toLowerCase();
  const progress = order.progress || 0;

  if (status === 'cancelled') {
    return { label: 'Cancelled', hint: 'This order was cancelled.', step: 0, tone: 'cancelled', isActive: false };
  }
  if (status === 'completed' || status === 'order delivered' || progress >= 100) {
    return { label: 'Delivered', hint: 'Your order has arrived. Enjoy!', step: 5, tone: 'done', isActive: false };
  }
  if (status === 'out for delivery') {
    return { label: 'Out for delivery', hint: 'The J&T rider is on the way to you.', step: 4, tone: 'shipping', isActive: true };
  }
  if (status === 'in transit' || progress >= 75) {
    return { label: 'Handed to J&T Express', hint: 'Your parcel is on its way to you.', step: 4, tone: 'shipping', isActive: true };
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
  pending: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  progress: 'bg-primary/15 text-primary border-primary/30',
  shipping: 'bg-secondary/15 text-secondary border-secondary/30',
  done: 'bg-success/15 text-success border-success/30',
  cancelled: 'bg-white/10 text-text-dim border-border-glass',
};
