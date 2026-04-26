'use client';

import type { Order } from '@/types';
import Badge from '@/components/ui/Badge';

interface OrderListProps {
  orders: Order[];
  loading?: boolean;
}

export default function OrderList({ orders, loading }: OrderListProps) {
  if (loading) return <div className="py-10 text-center text-slate-500 italic">Loading your orders...</div>;
  if (orders.length === 0) return <div className="py-10 text-center text-slate-500 italic">You haven't placed any orders yet.</div>;

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div key={order._id} className="glass-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-indigo-500/30 transition-all">
          <div className="flex gap-4 items-center">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold text-lg">
              #{order._id.slice(-4).toUpperCase()}
            </div>
            <div>
              <h4 className="font-bold text-white group-hover:text-primary transition-colors">{order.design}</h4>
              <p className="text-xs text-slate-500">{new Date(order.date).toLocaleDateString()} • {order.items?.length || 0} items</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="hidden sm:block">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Total</div>
              <div className="text-lg font-bold text-white">₱{parseFloat(order.price || '0').toLocaleString()}</div>
            </div>
            
            <div className="w-full md:w-32">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Status</div>
              <Badge status={order.status} />
            </div>

            {order.status === 'In Progress' && (
              <div className="w-full md:w-32">
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Progress</div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-1000" 
                    style={{ width: `${order.progress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
