'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { dashboardApi, ordersApi, productsApi, adminApi, authApi, inventoryApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { DashboardState, User, Product, InventoryItem } from '@/types';
import AuthGuard from '@/components/auth/AuthGuard';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import OrdersTable from '@/components/admin/OrdersTable';
import StaffTable from '@/components/admin/StaffTable';

const AnalyticsCharts = dynamic(() => import('@/components/admin/AnalyticsCharts'), {
  loading: () => <div className="h-64 glass-card animate-pulse bg-white/5" />,
  ssr: false
});
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

export default function AdminDashboard() {
  const { toast } = useToast();
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Orders');

  const loadData = async () => {
    try {
      const data = await dashboardApi.getState();
      setState(data);
    } catch (err) {
      toast('Failed to sync admin data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const socket = getSocket();
    socket.on('dataChanged', loadData);
    return () => { socket.off('dataChanged'); };
  }, []);

  const handleLogout = async () => {
    await authApi.logout();
    window.location.href = '/login';
  };

  const updateOrderStatus = async (id: string, status: string) => {
    try {
      await ordersApi.update(id, { status: status as any });
      toast('Order updated successfully', 'success');
      loadData();
    } catch (err) {
      toast('Failed to update order', 'error');
    }
  };

  return (
    <AuthGuard role="admin">
      {(user) => (
        <div className="flex h-screen bg-bg-deeper overflow-hidden">
          <Sidebar user={user} onLogout={handleLogout} />
          
          <div className="flex-1 flex flex-col min-w-0">
            <Header user={user} title={`Admin / ${activeTab}`} />

            <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
              {/* Analytics Header */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total Revenue', value: `₱${state?.analytics?.revenue.toLocaleString() || '0'}`, icon: '💰' },
                  { label: 'Active Orders', value: state?.analytics?.activeOrders || 0, icon: '📦' },
                  { label: 'Total Users', value: state?.analytics?.userCount || 0, icon: '👥' },
                  { label: 'Low Stock Items', value: state?.analytics?.lowStock || 0, icon: '⚠️', danger: (state?.analytics?.lowStock || 0) > 0 },
                ].map((stat, i) => (
                  <Card key={i} className="flex items-center gap-4 py-4 px-6">
                    <div className="text-3xl">{stat.icon}</div>
                    <div>
                      <div className="text-[10px] uppercase font-black tracking-widest text-slate-500">{stat.label}</div>
                      <div className={`text-xl font-bold ${stat.danger ? 'text-red-400' : 'text-white'}`}>{stat.value}</div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Tabs */}
              <div className="space-y-6">
                <div className="flex gap-2 border-b border-white/5 pb-2">
                  {['Orders', 'Inventory', 'Staff', 'Analytics'].map(t => (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t)}
                      className={`px-4 py-2 text-sm font-bold transition-all
                        ${activeTab === t ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {activeTab === 'Orders' && (
                  <OrdersTable 
                    orders={state?.orders || []} 
                    onUpdateStatus={updateOrderStatus}
                    onDelete={async (id) => {
                      if (confirm('Are you sure you want to delete this order?')) {
                        await ordersApi.delete(id);
                        toast('Order deleted', 'success');
                        loadData();
                      }
                    }}
                  />
                )}

                {activeTab === 'Staff' && (
                  <StaffTable 
                    users={state?.users || []}
                    onUpdateRole={async (id, role) => {
                      await adminApi.updateUser(id, { role });
                      toast('User role updated', 'success');
                      loadData();
                    }}
                    onDelete={async (id) => {
                      if (confirm('Delete this user?')) {
                        await adminApi.deleteUser(id);
                        toast('User removed', 'success');
                        loadData();
                      }
                    }}
                  />
                )}

                {activeTab === 'Analytics' && <AnalyticsCharts />}

                {activeTab === 'Inventory' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {state?.inventory.map(item => (
                      <Card key={item._id} className="flex flex-col gap-4">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-white text-lg">{item.item}</h4>
                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${item.count < 10 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                            {item.count < 10 ? 'LOW STOCK' : 'STABLE'}
                          </span>
                        </div>
                        <div className="text-3xl font-black gradient-text">{item.count} units</div>
                        <input 
                          type="range" 
                          min="0" max="200" 
                          className="w-full accent-primary"
                          value={item.count}
                          onChange={async (e) => {
                             const newCount = parseInt(e.target.value);
                             // Optimistic UI
                             setState(prev => prev ? {
                               ...prev,
                               inventory: prev.inventory.map(i => i.item === item.item ? { ...i, count: newCount } : i)
                             } : null);
                             await inventoryApi.update(item.item, newCount);
                          }}
                        />
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
