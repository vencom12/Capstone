'use client';

import type { Order } from '@/types';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

interface OrdersTableProps {
  orders: Order[];
  onUpdateStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}

export default function OrdersTable({ orders, onUpdateStatus, onDelete }: OrdersTableProps) {
  if (orders.length === 0) return <div className="p-8 text-center text-slate-500 italic glass-card">No orders found.</div>;

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 bg-white/5 text-[10px] uppercase font-black tracking-widest text-slate-500">
              <th className="px-6 py-4">ID / Client</th>
              <th className="px-6 py-4">Design</th>
              <th className="px-6 py-4">Items</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Total</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {orders.map((order) => (
              <tr key={order._id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-white">#{order._id.slice(-4).toUpperCase()}</div>
                  <div className="text-xs text-slate-500">{order.client}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-300">{order.design}</div>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">
                  {order.items?.length || 0} items
                </td>
                <td className="px-6 py-4">
                  <Badge status={order.status} />
                </td>
                <td className="px-6 py-4 font-bold text-indigo-400">
                  ₱{parseFloat(order.price || '0').toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <select 
                      className="bg-bg-deeper border border-white/10 rounded-lg text-[10px] px-2 py-1 outline-none focus:border-primary"
                      value={order.status}
                      onChange={(e) => onUpdateStatus(order._id, e.target.value)}
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Order Canceled">Canceled</option>
                    </select>
                    <button 
                      onClick={() => onDelete(order._id)}
                      className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
