'use client';

import { useState, useEffect } from 'react';
import { dashboardApi, ordersApi, authApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { DashboardState } from '@/types';
import AuthGuard from '@/components/auth/AuthGuard';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import OrdersTable from '@/components/admin/OrdersTable';
import Card from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

export default function EmployeeDashboard() {
  const { toast } = useToast();
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Queue');

  const loadData = async () => {
    try {
      const data = await dashboardApi.getState();
      setState(data);
    } catch (err) {
      toast('Sync failed', 'error');
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
      toast('Order status updated', 'success');
      loadData();
    } catch (err) {
      toast('Update failed', 'error');
    }
  };

  return (
    <AuthGuard role="employee">
      {(user) => (
        <div className="flex h-screen bg-bg-deeper overflow-hidden">
          <Sidebar user={user} onLogout={handleLogout} />
          
          <div className="flex-1 flex flex-col min-w-0">
            <Header user={user} title={`Production / ${activeTab}`} />

            <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
               <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-3xl font-black text-white">Production Queue</h2>
                    <p className="text-slate-500">Manage daily embroidery tasks and inventory.</p>
                  </div>
                  <div className="flex gap-4">
                     <div className="stat-card py-2 px-6">
                        <div className="stat-label">Pending</div>
                        <div className="stat-value text-2xl">{state?.orders.filter(o => o.status === 'Pending').length || 0}</div>
                     </div>
                  </div>
               </div>

               <div className="space-y-6">
                  <div className="flex gap-2 border-b border-white/5 pb-2">
                    {['Queue', 'Inventory'].map(t => (
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

                  {activeTab === 'Queue' && (
                    <OrdersTable 
                      orders={state?.orders || []} 
                      onUpdateStatus={updateOrderStatus}
                      onDelete={() => toast('Employees cannot delete orders', 'error')}
                    />
                  )}

                  {activeTab === 'Inventory' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {state?.inventory.map(item => (
                        <Card key={item._id} className="flex flex-col gap-4">
                          <h4 className="font-bold text-white text-lg">{item.item}</h4>
                          <div className="text-3xl font-black gradient-text">{item.count} units</div>
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
