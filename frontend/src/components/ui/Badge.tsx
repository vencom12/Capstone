import React from 'react';

type Status = 'Pending' | 'In Progress' | 'Completed' | 'Order Canceled' | string;

const statusMap: Record<string, string> = {
  'Pending':        'badge-pending',
  'In Progress':    'badge-progress',
  'Completed':      'badge-completed',
  'Order Canceled': 'badge-canceled',
};

export default function Badge({ status }: { status: Status }) {
  const cls = statusMap[status] ?? 'badge bg-slate-500/20 text-slate-400 border border-slate-500/30';
  return <span className={cls}>{status}</span>;
}
