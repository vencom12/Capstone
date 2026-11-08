export interface OrderScheduleInfo {
  dueTime: number;
  isOverdue: boolean;
  relativeLabel: string;
  exactTargetLabel: string;
  timeFormatted: string;
  stitchLabel: string;
}

export function isOrderInsufficientPayment(o: any): boolean {
  if (!o) return false;
  const status = String(o.status || '').toLowerCase();
  if (status === 'completed' || status.includes('cancel') || status.includes('delivered')) return false;
  const pers = o.personalization && typeof o.personalization === 'object' ? o.personalization : {};
  if (pers.employeeApprovedPartial) return false; // Staff authorized to process anyway
  return (
    status === 'insufficient payment' ||
    o.paymentStatus === 'partial' ||
    Boolean(pers.insufficientPayment) ||
    (Number(pers.outstandingBalance) > 0 && !pers.balanceSettledAt)
  );
}

export function getOrderScheduleInfo(o: any): OrderScheduleInfo {
  // If payment is incomplete, this order DOES NOT enter the queue and has NO target time allocated
  if (isOrderInsufficientPayment(o)) {
    const pers = o?.personalization && typeof o.personalization === 'object' ? o.personalization : {};
    const hasTopUp = Boolean(pers?.balanceTopUpPending);
    return {
      dueTime: 0,
      isOverdue: false,
      relativeLabel: hasTopUp ? 'Top-Up Sent' : 'Queue Hold',
      exactTargetLabel: 'Target: Unscheduled (Not in Queue)',
      timeFormatted: 'Unscheduled',
      stitchLabel: o?.estimatedTime ? `~${o.estimatedTime}m stitch (Paused)` : 'Queue Paused',
    };
  }

  const createdTime = new Date(o?.date || o?.createdAt || Date.now()).getTime();
  const rawDue = o?.dueDate || o?.personalization?.estimatedReadyDate;
  let dueTime = rawDue ? new Date(rawDue).getTime() : 0;

  // Fallback if missing or before creation time
  if (!dueTime || isNaN(dueTime) || dueTime < createdTime) {
    const estMins = typeof o?.estimatedTime === 'number' && o.estimatedTime > 0 ? o.estimatedTime : 15;
    dueTime = createdTime + estMins * 60 * 1000;
  }

  const dueDateObj = new Date(dueTime);
  const now = Date.now();
  const diffMs = dueTime - now;
  const isOverdue = diffMs < 0;
  const absDiff = Math.abs(diffMs);
  const mins = Math.floor(absDiff / (1000 * 60));
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

  let relativeLabel = '';
  if (isOverdue) {
    if (mins < 1) relativeLabel = 'Overdue now';
    else if (mins < 60) relativeLabel = `Overdue by ${mins}m`;
    else if (hours < 24) relativeLabel = `Overdue by ${hours}h`;
    else relativeLabel = `Overdue by ${days}d`;
  } else {
    if (mins < 1) relativeLabel = 'Due now';
    else if (mins < 60) relativeLabel = `${mins}m left`;
    else if (hours < 24) relativeLabel = `${hours}h left`;
    else relativeLabel = `${days}d left`;
  }

  const today = new Date();
  const isToday = dueDateObj.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = dueDateObj.toDateString() === tomorrow.toDateString();

  const timeFormatted = dueDateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const exactTargetLabel = isToday
    ? `Target: Today ${timeFormatted}`
    : isTomorrow
    ? `Target: Tomorrow ${timeFormatted}`
    : `Target: ${dueDateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeFormatted}`;

  const stitchLabel = o?.estimatedTime ? `~${o.estimatedTime}m stitch` : 'Plain (2 to 5m)';

  return {
    dueTime,
    isOverdue,
    relativeLabel,
    exactTargetLabel,
    timeFormatted,
    stitchLabel,
  };
}

