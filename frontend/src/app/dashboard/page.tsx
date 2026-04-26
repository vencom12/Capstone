'use client';

import { useState, useEffect } from 'react';
import { dashboardApi, ordersApi, productsApi, favoritesApi, authApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { DashboardState, Order, Product, User } from '@/types';
import AuthGuard from '@/components/auth/AuthGuard';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import OrderList from '@/components/dashboard/OrderList';
import ProductGrid from '@/components/storefront/ProductGrid';
import FavoritesGrid from '@/components/dashboard/FavoritesGrid';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export default function CustomerDashboard() {
  const { toast } = useToast();
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Shop');

  const loadData = async () => {
    try {
      const data = await dashboardApi.getState();
      setState(data);
    } catch (err) {
      toast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const socket = getSocket();
    socket.on('dataChanged', (payload: any) => {
      if (payload.type === 'orders' || payload.type === 'products' || payload.type === 'inventory') {
        loadData();
      }
    });

    return () => { socket.off('dataChanged'); };
  }, []);

  const handleLogout = async () => {
    await authApi.logout();
    window.location.href = '/login';
  };

  return (
    <AuthGuard role="customer">
      {(user) => (
        <div className="flex h-screen bg-bg-deeper overflow-hidden">
          <Sidebar user={user} onLogout={handleLogout} />
          
          <div className="flex-1 flex flex-col min-w-0">
            <Header user={user} title={activeTab} />

            <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
              {/* Stats / Welcome */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-black text-white">Hello, {user.username}!</h2>
                  <p className="text-slate-500">Track your embroidery projects and explore new designs.</p>
                </div>
                <div className="flex gap-4">
                   <div className="stat-card py-2 px-6">
                      <div className="stat-label">Active Orders</div>
                      <div className="stat-value text-2xl">{state?.orders.filter(o => o.status !== 'Completed' && o.status !== 'Order Canceled').length || 0}</div>
                   </div>
                </div>
              </div>

              {/* Tabs Content */}
              <div className="space-y-6">
                <div className="flex gap-2 border-b border-white/5 pb-2">
                  {['Shop', 'My Orders', 'Favorites'].map(t => (
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

                {activeTab === 'Shop' && (
                  <ProductGrid 
                    products={state?.products || []} 
                    loading={loading}
                    onAddToCart={(p) => toast(`Added ${p.name} to basket`, 'success')}
                    onToggleFavorite={async (id) => {
                       if (state?.favorites.find(f => f._id === id)) {
                         await favoritesApi.remove(id);
                         toast('Removed from favorites', 'info');
                       } else {
                         await favoritesApi.add(id);
                         toast('Added to favorites', 'success');
                       }
                       loadData();
                    }}
                    favorites={state?.favorites.map(f => f._id) || []}
                  />
                )}

                {activeTab === 'My Orders' && (
                  <OrderList orders={state?.orders || []} loading={loading} />
                )}

                {activeTab === 'Favorites' && (
                  <FavoritesGrid 
                    products={state?.favorites || []} 
                    onRemove={async (id) => {
                      await favoritesApi.remove(id);
                      toast('Removed from favorites', 'info');
                      loadData();
                    }}
                    onAddToCart={(p) => toast(`Added ${p.name} to basket`, 'success')}
                  />
                )}
              </div>
            </main>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
