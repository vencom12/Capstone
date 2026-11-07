import type { Order } from '@/lib/types';

export type OrderTone = 'pending' | 'progress' | 'shipping' | 'done' | 'cancelled' | 'warning';

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

export interface OrderCreditSummary {
  isInsufficientPayment: boolean;
  requiredAmount: number;
  accountCredit: number;
  outstandingBalance: number;
  employeeApprovedPartial: boolean;
  balanceTopUpPending: boolean;
  balanceTopUpAmount: number;
  balanceTopUpRef: string | null;
  balanceTopUpReceiptUrl: string | null;
  note: string | null;
}

export function getOrderCreditSummary(order: any): OrderCreditSummary {
  const pers = (order?.personalization && typeof order.personalization === 'object') ? order.personalization : {};
  const requiredAmount = Number(order?.totalAmount ?? pers.requiredAmount ?? 0);
  const rawCredit = Number(pers.accountCredit ?? 0);
  const rawBalance = Number(pers.outstandingBalance ?? 0);
  const isPartialStatus = order?.status === 'Insufficient Payment' || order?.paymentStatus === 'partial' || Boolean(pers.insufficientPayment);
  const outstandingBalance = isPartialStatus
    ? (rawBalance > 0 ? rawBalance : Math.max(0, Math.round((requiredAmount - rawCredit) * 100) / 100))
    : 0;
  const accountCredit = isPartialStatus
    ? (rawCredit > 0 ? rawCredit : Math.max(0, Math.round((requiredAmount - outstandingBalance) * 100) / 100))
    : (order?.paymentStatus === 'paid' ? requiredAmount : 0);

  return {
    isInsufficientPayment: Boolean(isPartialStatus && outstandingBalance > 0),
    requiredAmount,
    accountCredit,
    outstandingBalance,
    employeeApprovedPartial: Boolean(pers.employeeApprovedPartial),
    balanceTopUpPending: Boolean(pers.balanceTopUpPending),
    balanceTopUpAmount: Number(pers.balanceTopUpAmount ?? 0),
    balanceTopUpRef: pers.balanceTopUpRef || null,
    balanceTopUpReceiptUrl: pers.balanceTopUpReceiptUrl || null,
    note: pers.insufficientPaymentNote || null,
  };
}

export const TOTAL_STEPS = 5;

export const STEP_LABELS = [
  'Being Processed by Management',
  'Order Confirmed & In Queue',
  'Being Embroidered',
  'Ready for Store Pick-up',
  'Claimed / Completed',
];

/** Translates internal order status/progress into plain customer language. */
export function getOrderStage(order: Order): OrderStage {
  const status = (order.status || '').toLowerCase();
  const progress = order.progress || 0;
  const creditSummary = getOrderCreditSummary(order);

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
  if (creditSummary.isInsufficientPayment && !creditSummary.employeeApprovedPartial && status === 'insufficient payment') {
    if (creditSummary.balanceTopUpPending) {
      return {
        label: 'Remaining Balance Sent — Verifying',
        hint: `Account Credit: ₱${creditSummary.accountCredit.toFixed(2)} + Top-Up: ₱${creditSummary.balanceTopUpAmount.toFixed(2)} submitted for staff review.`,
        step: 1,
        tone: 'warning',
        isActive: true,
      };
    }
    return {
      label: `Insufficient Payment — Balance Due (₱${creditSummary.outstandingBalance.toFixed(2)})`,
      hint: `What you sent (₱${creditSummary.accountCredit.toFixed(2)}) was not enough. Please pay the remaining ₱${creditSummary.outstandingBalance.toFixed(2)} balance for your order to be processed.`,
      step: 1,
      tone: 'warning',
      isActive: true,
    };
  }
  if (status.includes('awaiting') || status === 'pending' || (order as any).paymentStatus === 'unpaid') {
    return { label: 'Being Processed by Management', hint: 'Our management team is reviewing your order and confirming payment details before queueing.', step: 1, tone: 'pending', isActive: true };
  }
  if (progress >= 45) {
    return { label: 'Being embroidered', hint: 'Our team is stitching your design.', step: 3, tone: 'progress', isActive: true };
  }
  if (progress >= 20) {
    return { label: 'Preparing your design', hint: 'We are getting your design ready for stitching.', step: 2, tone: 'progress', isActive: true };
  }
  return {
    label: creditSummary.isInsufficientPayment
      ? `Order in Queue (Balance Due: ₱${creditSummary.outstandingBalance.toFixed(2)})`
      : 'Order confirmed',
    hint: creditSummary.isInsufficientPayment
      ? `Account Credit: ₱${creditSummary.accountCredit.toFixed(2)} • Remaining Balance: ₱${creditSummary.outstandingBalance.toFixed(2)} due upon pickup/online.`
      : 'Your order is in our queue.',
    step: 2,
    tone: creditSummary.isInsufficientPayment ? 'warning' : 'progress',
    isActive: true,
  };
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
  pending: 'bg-white/10 text-text-main border-white/20',
  progress: 'bg-primary/15 text-primary border-primary/30',
  shipping: 'bg-secondary/15 text-secondary border-secondary/30',
  done: 'bg-success/15 text-success border-success/30',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
};
