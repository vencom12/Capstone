'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { useUIStore } from '@/stores/useUIStore';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';
import RightPanel from '@/components/dashboard/RightPanel';
import ProductGrid from '@/components/products/ProductGrid';
import ProductModal from '@/components/products/ProductModal';
import CheckoutModal from '@/components/checkout/CheckoutModal';
import OrderDetailsModal from '@/components/dashboard/OrderDetailsModal';
import type { Product, Order, BasketItem } from '@/lib/types';
import { showToast } from '@/components/ui/Toast';
import GlassDatePicker from '@/components/ui/GlassDatePicker';
import { TableSkeleton, CardSkeleton, ProductCardSkeleton } from '@/components/ui/Skeletons';
import OrderList from '@/components/dashboard/OrderList';
import InvoiceModal from '@/components/dashboard/InvoiceModal';
import BasketView from '@/components/dashboard/BasketView';
import { useBasketStore } from '@/stores/useBasketStore';
import { getOrderStage } from '@/lib/orderStatus';
import { toggleTheme } from '@/lib/theme';
import Pagination from '@/components/ui/Pagination';
import GlassModal from '@/components/ui/GlassModal';
import ChangePasswordModal from '@/components/auth/ChangePasswordModal';
import { API_BASE } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, checkAccess, refreshUser, logout } = useAuthStore();
  const basketCount = useBasketStore((s) => s.getCount());

  const { products, fetchDashboardState, orders, favorites, transactions, selectedCategory, setSelectedCategory, getCategories, isSyncing } = useProductStore();
  const { isBasketOpen, setBasketOpen, toggleBasket, isSidebarOpen, toggleSidebar, setSidebarOpen, setHelpOpen, setTermsOpen } = useUIStore();
  const activeOrdersCount = (orders || []).filter((o) => getOrderStage(o).isActive).length;

  const [activeTab, setActiveTab] = useState<string>('tracking');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOrderDetailsOpen, setIsOrderDetailsOpen] = useState(false);
  const [orderDetailsTab, setOrderDetailsTab] = useState<'summary' | 'tracking'>('summary');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedCheckoutItems, setSelectedCheckoutItems] = useState<BasketItem[] | undefined>(undefined);
  const [selectedFulfillmentType, setSelectedFulfillmentType] = useState<'delivery' | 'pickup'>('pickup');
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);
  const [selectedInvoiceTx, setSelectedInvoiceTx] = useState<any | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res && res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
      }).catch(() => { });
    });
  }, []);

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmName.trim().toLowerCase() !== (user.username || '').trim().toLowerCase()) {
      showToast('Please type your exact account name to confirm deletion.', 'error');
      return;
    }
    setIsDeletingAccount(true);
    try {
      const { api } = await import('@/lib/api');
      await api.delete('/api/customer/account', {
        confirmationUsername: deleteConfirmName.trim()
      });
      showToast('Your account has been deleted.', 'success');
      setIsDeleteAccountModalOpen(false);
      setDeleteConfirmName('');
      logout();
      router.push('/');
    } catch (err: any) {
      console.error('Delete account error:', err);
      showToast(err?.response?.data?.message || err?.message || 'Failed to delete account.', 'error');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // 1-Click Reorder Action
  const handleReorder = (order: Order) => {
    if (!order.items || order.items.length === 0) {
      showToast('No items available to reorder from this project.', 'info');
      return;
    }
    const { addItem } = useBasketStore.getState();
    let count = 0;
    order.items.forEach((item) => {
      addItem({
        productId: item.productId,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
        selectedVariant: item.selectedVariant,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        quantity: item.quantity || 1
      });
      count += (item.quantity || 1);
    });
    showToast(`Added ${count} item(s) from ${order.orderId} to your basket!`, 'success');
    setBasketOpen(true);
  };

  // Move All Favorites to Basket
  const handleMoveAllFavoritesToBasket = () => {
    if (favorites.length === 0) {
      showToast('Your favorites list is empty', 'info');
      return;
    }
    const { addItem } = useBasketStore.getState();
    let count = 0;
    favorites.forEach((prod) => {
      const isOutOfStock = prod.isOutOfStock !== undefined ? prod.isOutOfStock : ((prod.count ?? 0) - (prod.reservedCount ?? 0) <= 0);
      if (!isOutOfStock) {
        addItem({
          productId: prod.id || prod._id || '',
          name: prod.name,
          price: prod.price,
          imageUrl: prod.imageUrl,
          quantity: 1
        });
        count++;
      }
    });
    if (count > 0) {
      showToast(`Moved ${count} favorite item(s) into your basket!`, 'success');
      setBasketOpen(true);
    } else {
      showToast('All favorited items are currently out of stock.', 'error');
    }
  };

  // Settings State — inline edit one field at a time
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Date Filters
  const [ordersDateFilter, setOrdersDateFilter] = useState('');
  const [txDateFilter, setTxDateFilter] = useState('');
  const [txPage, setTxPage] = useState(1);
  const txPageSize = 8;

  useEffect(() => {
    setTxPage(1);
  }, [txDateFilter]);

  const getFieldValue = (fieldKey: string): string => {
    switch (fieldKey) {
      case 'username': return user?.username || '';
      case 'email': return user?.email || '';
      case 'phoneNumber': return user?.phoneNumber || '';
      case 'address': return user?.address || '';
      case 'preferredDeliveryTime': return (user as any)?.preferredDeliveryTime || '';
      default: return '';
    }
  };

  const startEditing = (fieldKey: string) => {
    setEditingField(fieldKey);
    setEditValue(getFieldValue(fieldKey));
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleSaveField = async () => {
    if (!editingField) return;
    const fieldToUpdate = editingField;
    const valueToUpdate = editValue;
    const previousUser = useAuthStore.getState().user;

    // 1. Instantly update UI and auth store state (0ms latency)
    if (previousUser) {
      useAuthStore.getState().setUser({
        ...previousUser,
        [fieldToUpdate]: valueToUpdate
      });
    }
    setEditingField(null);
    setEditValue('');
    showToast('Profile updated successfully!', 'success');

    // 2. Perform API update in background
    try {
      const { api } = await import('@/lib/api');
      const res = await api.patch<{ message: string; user: any }>('/api/customer/settings', {
        [fieldToUpdate]: valueToUpdate
      });
      if (res && res.user && useAuthStore.getState().user) {
        useAuthStore.getState().setUser({
          ...useAuthStore.getState().user!,
          ...res.user
        });
      }
    } catch (err) {
      // 3. Rollback on failure
      if (previousUser) {
        useAuthStore.getState().setUser(previousUser);
      }
      showToast('Failed to update profile — changes reverted', 'error');
    }
  };

  useEffect(() => {
    // 1. Handle Hydration, URL Query, & Tab Persistence (Orders hub now unifies tracking & receipts)
    const params = new URLSearchParams(window.location.search);
    const rawTab = params.get('tab');
    const queryTab = rawTab === 'history' ? 'tracking' : rawTab;
    const validTabs = ['tracking', 'settings', 'favs', 'basket'];

    if (queryTab && validTabs.includes(queryTab)) {
      setActiveTab(queryTab);
      localStorage.setItem('stitch-dashboard-tab', queryTab);
    } else {
      const rawSaved = localStorage.getItem('stitch-dashboard-tab');
      const savedTab = rawSaved === 'history' ? 'tracking' : rawSaved;
      if (savedTab && validTabs.includes(savedTab)) {
        setActiveTab(savedTab);
      } else {
        setActiveTab('tracking');
        localStorage.setItem('stitch-dashboard-tab', 'tracking');
      }
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    // 2. Auth Check
    if (!isAuthenticated || !checkAccess('customer')) {
      router.push('/?auth=login');
      return;
    }

    // 3. Initial Data Fetch
    fetchDashboardState();

    // 4. Fallback Polling (20s interval - lightweight, only when tab is visible)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchDashboardState(true);
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [isHydrated, isAuthenticated, checkAccess, router, fetchDashboardState]);

  // Real-time Socket.IO Listener & Instant Tab Focus Sync
  useEffect(() => {
    if (typeof window === 'undefined' || !isHydrated || !isAuthenticated) return;
    let activeSocket: any = null;
    let isCancelled = false;

    const connectSocket = () => {
      if (isCancelled) return;
      const io = (window as any).io;
      if (!io) return;

      const socket = io(API_BASE, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        auth: { portal: 'customer' }
      });
      activeSocket = socket;

      const handleLiveUpdate = () => {
        fetchDashboardState(true);
      };

      socket.on('dataChanged', (data: any) => {
        if (!data || !data.entity || ['ORDER', 'PRODUCT', 'INVENTORY', 'WALLET', 'TRANSACTION'].includes(data.entity)) {
          handleLiveUpdate();
        }
      });

      socket.on('ordersUpdated', handleLiveUpdate);
      socket.on('order:cancelled', handleLiveUpdate);
    };

    // Load Socket.IO client script if not already on window
    if ((window as any).io) {
      connectSocket();
    } else {
      const script = document.createElement('script');
      script.src = `${API_BASE}/socket.io/socket.io.js`;
      script.async = true;
      script.onload = connectSocket;
      document.head.appendChild(script);
    }

    // Window Focus & Tab Switch Listener: instant 0ms refresh when switching back to this tab
    const handleTabActive = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardState(true);
      }
    };
    window.addEventListener('focus', handleTabActive);
    document.addEventListener('visibilitychange', handleTabActive);

    return () => {
      isCancelled = true;
      window.removeEventListener('focus', handleTabActive);
      document.removeEventListener('visibilitychange', handleTabActive);
      if (activeSocket) {
        activeSocket.close();
      }
    };
  }, [isHydrated, isAuthenticated, fetchDashboardState]);



  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('stitch-dashboard-tab', activeTab);
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('tab') !== activeTab) {
          currentUrl.searchParams.set('tab', activeTab);
          window.history.replaceState(null, '', currentUrl.pathname + currentUrl.search);
        }
      }
    }
  }, [activeTab, isHydrated]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (isCategoryOpen && !(e.target as HTMLElement).closest('.category-dropdown-container')) {
        setIsCategoryOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isCategoryOpen]);

  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-bg-main text-text-main">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-text-dim font-medium animate-pulse">Resuming your session...</p>
        </div>
      </div>
    );
  }

  const handleQuickView = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basket':
        return (
          <BasketView
            onGoToShop={() => router.push('/#products-section')}
            onOpenCheckout={(items) => {
              setSelectedCheckoutItems(items);
              setSelectedFulfillmentType('pickup');
              setIsCheckoutOpen(true);
            }}
          />
        );

      case 'tracking': {
        const filteredOrders = orders.filter(order => {
          if (!ordersDateFilter) return true;
          try {
            return new Date(order.date).toISOString().split('T')[0] === ordersDateFilter;
          } catch {
            return true;
          }
        });

        return (
          <section className="flex flex-col min-h-full md:h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4 flex justify-between items-center flex-wrap gap-3">
              <div className="max-[1100px]:w-full">
                <h1 className="text-xl font-bold mb-0.5">My Orders</h1>
                <p className="text-text-dim text-[0.85rem] m-0">Monitor your active jobs, completed history, and receipts in real-time.</p>
              </div>
              <div className="shrink-0 flex items-center gap-2 max-md:w-full">
                <span className="text-[0.8rem] text-text-dim font-medium mr-1 max-md:hidden">Filter by date:</span>
                <GlassDatePicker
                  value={ordersDateFilter}
                  onChange={(val) => setOrdersDateFilter(val)}
                  placeholder="All Dates"
                />
              </div>
            </header>
            <div className="flex-1 pr-0 md:pr-2">

              {isSyncing && orders.length === 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-6 max-[1100px]:grid-cols-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="bg-bg-surface border border-border-glass rounded-xl p-8 flex flex-col items-center justify-center text-text-dim min-h-[300px]">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                  <p className="text-lg font-medium m-0">No orders found</p>
                  <p className="text-sm mt-1 opacity-70">Try adjusting your date selection filter.</p>
                </div>
              ) : (
                <OrderList
                  orders={filteredOrders}
                  onTrack={(ord) => { setSelectedOrder(ord); setOrderDetailsTab('tracking'); setIsOrderDetailsOpen(true); }}
                  onDetails={(ord) => { setSelectedOrder(ord); setOrderDetailsTab('summary'); setIsOrderDetailsOpen(true); }}
                  onReceipt={(ord) => {
                    setSelectedInvoiceOrder(ord);
                    setSelectedInvoiceTx(null);
                    setIsInvoiceModalOpen(true);
                  }}
                  onReorder={handleReorder}
                />
              )}
            </div>
          </section>
        );
      }

      case 'favs':
        return (
          <section className="flex flex-col min-h-full md:h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4">
              <h1 className="text-xl font-bold mb-0.5">My Favorites</h1>
              <p className="text-text-dim text-[0.85rem] m-0">Designs you've saved for later.</p>
            </header>
            <div className="flex-1 pr-0 md:pr-2">
              {isSyncing && favorites.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              ) : favorites.length === 0 ? (
                <div className="border-2 border-dashed border-border-glass rounded-xl p-12 flex flex-col items-center justify-center text-text-dim text-center min-h-[300px]">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-primary opacity-60"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                  <p className="text-base font-bold text-text-main m-0">You haven't favorited any designs yet</p>
                  <p className="text-xs text-text-dim mt-1 max-w-xs">Heart any embroidery design from our products to save it for quick ordering anytime.</p>
                  <Link
                    href="/#products-section"
                    className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer no-underline shadow-sm"
                  >
                    Browse Products →
                  </Link>
                </div>
              ) : (
                <ProductGrid products={favorites} onQuickView={handleQuickView} />
              )}
            </div>
          </section>
        );

      case 'settings': {
        const personalFields = [
          { key: 'username', label: 'Display Name', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>), type: 'text' as const },
          { key: 'email', label: 'Email', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>), type: 'email' as const },
          { key: 'phoneNumber', label: 'Phone Number', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>), type: 'text' as const },
        ] as Array<{ key: string; label: string; icon: React.ReactNode; type: 'text' | 'email' | 'textarea' }>;

        return (
          <section className="flex flex-col min-h-full md:h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-6">
              <h1 className="text-xl font-bold mb-1">Account Settings</h1>
              <p className="text-text-dim text-[0.85rem] m-0">Manage your personal profile and account settings.</p>
            </header>

            <div className="flex-1 pr-0 md:pr-2 pb-12 overflow-y-auto flex flex-col gap-8 max-w-4xl">
              {/* =========================================================================
                  SECTION 1: PERSONAL INFORMATION
                  ========================================================================= */}
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim m-0">Personal Information</h2>
                </div>

                <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass rounded-2xl overflow-hidden shadow-xl flex flex-col">
                  {/* Avatar Banner */}
                  <div className="px-6 py-5 border-b border-border-glass/50 bg-black/10 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 text-primary border border-primary/30 flex items-center justify-center text-xl font-black shrink-0 shadow-md">
                      {user?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-text-main m-0">{user?.username || 'Customer'}</h3>
                      <p className="text-xs sm:text-sm text-text-dim m-0 mt-0.5">{user?.email || 'No email set'}</p>
                    </div>
                  </div>

                  {/* Inline Editable Profile Fields */}
                  <div className="flex flex-col">
                    {personalFields.map((field, idx) => {
                      const currentValue = getFieldValue(field.key);
                      const isEditing = editingField === field.key;
                      return (
                        <div
                          key={field.key}
                          className={`px-6 py-4 flex flex-col gap-2 transition-all duration-300 ${
                            idx < personalFields.length - 1 ? 'border-b border-border-glass/30' : ''
                          } ${isEditing ? 'bg-primary/5' : 'hover:bg-white/3'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3.5">
                              <div className="text-text-dim shrink-0">{field.icon}</div>
                              <div className="flex flex-col">
                                <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider">{field.label}</span>
                                {!isEditing && (
                                  <span className="text-[0.95rem] text-text-main mt-0.5 font-medium">
                                    {currentValue || <span className="italic text-text-dim/50">Not set</span>}
                                  </span>
                                )}
                              </div>
                            </div>
                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => startEditing(field.key)}
                                disabled={editingField !== null && editingField !== field.key}
                                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer border-none ${
                                  editingField !== null && editingField !== field.key
                                    ? 'opacity-30 cursor-not-allowed bg-transparent'
                                    : 'bg-white/5 hover:bg-primary/20 text-text-dim hover:text-primary active:scale-95'
                                }`}
                                title={`Edit ${field.label}`}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                              </button>
                            )}
                          </div>
                          {isEditing && (
                            <div className="flex flex-col gap-2.5 ml-[30px] animate-[fadeIn_0.2s_ease-out]">
                              <input
                                type={field.type}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveField();
                                  if (e.key === 'Escape') cancelEditing();
                                }}
                                className="w-full bg-bg-surface border border-primary/50 p-3 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary transition-all shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveField()}
                                  disabled={isUpdating}
                                  className="bg-primary text-white font-bold px-5 py-2 rounded-lg text-[0.8rem] hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none"
                                >
                                  {isUpdating ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  disabled={isUpdating}
                                  className="bg-transparent border border-border-glass text-text-dim font-bold px-5 py-2 rounded-lg text-[0.8rem] hover:bg-white/5 active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 3: ACCOUNT MANAGEMENT
                  ========================================================================= */}
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim m-0">Account Management</h2>
                </div>

                <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass rounded-2xl overflow-hidden shadow-xl flex flex-col divide-y divide-border-glass/40">
                  {/* Password */}
                  <div className="p-6 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="m-0 text-[0.95rem] font-bold text-text-main">Password</h4>
                        <p className="m-0 text-[0.8rem] text-text-dim mt-0.5">Update your password to keep your account secure</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsChangePasswordOpen(true)}
                      className="bg-white/5 border border-border-glass px-4 py-2 rounded-xl text-[0.85rem] text-text-main font-bold hover:bg-white/10 cursor-pointer transition-all active:scale-95 shadow-sm"
                    >
                      Change Password
                    </button>
                  </div>

                  {/* Theme */}
                  <div className="p-6 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-white/5 text-primary flex items-center justify-center shrink-0 border border-border-glass">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line></svg>
                      </div>
                      <div>
                        <h4 className="m-0 text-[0.95rem] font-bold text-text-main">Theme</h4>
                        <p className="m-0 text-[0.8rem] text-text-dim mt-0.5">Toggle between dark and light mode</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleTheme()}
                      className="bg-white/5 border border-border-glass px-4 py-2 rounded-xl text-[0.85rem] text-text-main font-bold hover:bg-white/10 cursor-pointer transition-all active:scale-95 shadow-sm"
                    >
                      Switch Theme
                    </button>
                  </div>

                  {/* Danger Zone: Delete Account */}
                  <div className="p-6 flex items-center justify-between flex-wrap gap-4 bg-red-500/5">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="m-0 text-[0.95rem] font-bold text-red-400">Delete Account</h4>
                        <span className="text-[0.65rem] font-black uppercase px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                          Caution
                        </span>
                      </div>
                      <p className="m-0 text-[0.8rem] text-text-dim mt-0.5 max-w-md">
                        Permanently delete your account and personal data
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirmName('');
                        setIsDeleteAccountModalOpen(true);
                      }}
                      className="bg-danger/10 border border-danger/30 text-danger hover:bg-danger hover:text-white px-4 py-2 rounded-xl text-[0.85rem] font-bold cursor-pointer transition-all active:scale-95 shadow-sm"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 4: HELP & POLICIES (Mobile-Only: Desktop has these pinned in the sidebar footer)
                  ========================================================================= */}
              <div className="flex md:hidden flex-col gap-3.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-text-dim m-0">Help & Policies</h2>
                </div>

                <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass rounded-2xl overflow-hidden shadow-xl flex flex-col divide-y divide-border-glass/40">
                  {/* Help & FAQs */}
                  <div className="p-6 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="m-0 text-[0.95rem] font-bold text-text-main">Help & FAQs</h4>
                        <p className="m-0 text-[0.8rem] text-text-dim mt-0.5">Turnaround times, machine stitching guide, & workshop support</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHelpOpen(true)}
                      className="bg-white/5 border border-border-glass px-4 py-2 rounded-xl text-[0.85rem] text-text-main font-bold hover:bg-white/10 cursor-pointer transition-all active:scale-95 shadow-sm"
                    >
                      Open Help & FAQs
                    </button>
                  </div>

                  {/* Store Policies & Terms */}
                  <div className="p-6 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-white/5 text-primary flex items-center justify-center shrink-0 border border-border-glass">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="m-0 text-[0.95rem] font-bold text-text-main">Store Policies & Terms</h4>
                        <p className="m-0 text-[0.8rem] text-text-dim mt-0.5">Custom order policies, terms of service, & cancellation rules</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTermsOpen(true)}
                      className="bg-white/5 border border-border-glass px-4 py-2 rounded-xl text-[0.85rem] text-text-main font-bold hover:bg-white/10 cursor-pointer transition-all active:scale-95 shadow-sm"
                    >
                      View Policies
                    </button>
                  </div>

                  {/* Sign Out (Especially essential for mobile users!) */}
                  <div className="p-6 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-danger/10 text-danger flex items-center justify-center shrink-0 border border-danger/20">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="m-0 text-[0.95rem] font-bold text-text-main">Account Session</h4>
                        <p className="m-0 text-[0.8rem] text-text-dim mt-0.5">Sign out of your account on this device</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="bg-danger/10 border border-danger/30 text-danger hover:bg-danger hover:text-white px-4 py-2 rounded-xl text-[0.85rem] font-bold cursor-pointer transition-all active:scale-95 shadow-sm"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      }

      default:
        return (
          <section className="flex flex-col min-h-full md:h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4 flex justify-between items-center flex-wrap gap-3">
              <div className="max-[1100px]:w-full">
                <h1 className="text-xl font-bold mb-0.5">My Orders</h1>
                <p className="text-text-dim text-[0.85rem] m-0">Monitor your active jobs, completed history, and receipts in real-time.</p>
              </div>
            </header>
            <div className="flex-1 pr-0 md:pr-2">
              <OrderList
                orders={orders}
                onTrack={(ord) => { setSelectedOrder(ord); setOrderDetailsTab('tracking'); setIsOrderDetailsOpen(true); }}
                onDetails={(ord) => { setSelectedOrder(ord); setOrderDetailsTab('summary'); setIsOrderDetailsOpen(true); }}
                onReceipt={(ord) => {
                  setSelectedInvoiceOrder(ord);
                  setSelectedInvoiceTx(null);
                  setIsInvoiceModalOpen(true);
                }}
                onReorder={handleReorder}
              />
            </div>
          </section>
        );
    }
  };

  return (
    <div className="min-h-screen min-h-dvh w-full bg-transparent text-text-main flex flex-col md:flex-row md:h-screen md:overflow-hidden">
      {/* Mobile Top Bar */}
      <div className="hidden max-md:flex items-center justify-between w-full h-[58px] px-4 border-b border-border-glass bg-bg-header/95 backdrop-blur-xl fixed top-0 left-0 z-[1000] shadow-sm">
        <Link href="/" className="flex items-center gap-2 min-w-0 max-w-[210px] shrink no-underline cursor-pointer group">
          {businessLogoUrl ? (
            <img src={businessLogoUrl} alt="Logo" className="w-7 h-7 rounded-lg object-contain bg-white/10 shrink-0" />
          ) : (
            <div className="bg-primary w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </div>
          )}
          <span className="font-black text-[1.02rem] text-text-main tracking-tight truncate">Customer Hub</span>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/#products-section"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary font-bold text-xs hover:bg-primary/20 active:scale-95 transition-all no-underline"
            title="Browse Products"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            <span>Products</span>
          </Link>

          <button
            onClick={() => toggleTheme()}
            className="bg-transparent border-none text-text-dim hover:text-text-main cursor-pointer p-1.5 flex items-center justify-center rounded-lg hover:bg-white/5 active:scale-95 transition-all shrink-0"
            title="Toggle theme"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
          </button>

          {/* Mobile Quick Account Avatar / Settings Trigger */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer transition-all border ${activeTab === 'settings'
                ? 'bg-primary text-white border-primary shadow-sm scale-105'
                : 'bg-primary/20 text-primary border-primary/30 hover:bg-primary/30'
              }`}
            title="Account Settings"
            aria-label="Account Settings"
          >
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </button>
        </div>
      </div>

      <DashboardSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="w-full flex-1 p-3.5 sm:p-6 lg:p-8 pt-[70px] md:pt-6 lg:pt-8 pb-32 md:pb-8 md:h-full md:overflow-y-auto md:min-h-0">
        {renderTabContent()}
      </main>

      {/* Phone-Centric Bottom Navigation Dock */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[1000] bg-bg-card/95 backdrop-blur-2xl border-t border-border-glass px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-bottom min-h-[64px]"
        aria-label="Mobile Navigation"
      >
        {[
          {
            id: 'tracking',
            label: 'Orders',
            badge: activeOrdersCount > 0 ? activeOrdersCount : undefined,
            badgeColor: 'bg-primary text-white',
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            ),
          },
          {
            id: 'basket',
            label: 'Basket',
            badge: isHydrated && basketCount > 0 ? basketCount : undefined,
            badgeColor: 'bg-primary text-white',
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            ),
          },
          {
            id: 'favs',
            label: 'Favorites',
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill={activeTab === 'favs' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            ),
          },
        ].map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                const mainEl = document.querySelector('main');
                if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-1 sm:px-3 rounded-xl transition-all duration-200 cursor-pointer border-none max-w-[80px] ${
                isActive
                  ? 'text-primary bg-primary/10 dark:bg-primary/15 font-bold shadow-sm'
                  : 'text-text-dim hover:text-text-main bg-transparent active:scale-95'
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.badge !== undefined && (
                  <span className={`absolute -top-1.5 -right-2 text-[0.6rem] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-md ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[0.65rem] sm:text-[0.68rem] mt-0.5 tracking-tight whitespace-nowrap truncate max-w-full ${isActive ? 'text-primary font-bold' : 'text-text-dim font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Product Quick-View Modal */}
      <ProductModal
        product={selectedProduct ? products.find(p => (p.id || p._id) === (selectedProduct.id || selectedProduct._id)) || selectedProduct : null}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onBuyNow={() => setIsCheckoutOpen(true)}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => {
          setIsCheckoutOpen(false);
          setSelectedCheckoutItems(undefined);
        }}
        checkoutItems={selectedCheckoutItems}
        initialFulfillmentType={selectedFulfillmentType}
        onSuccess={() => {
          setIsCheckoutOpen(false);
          setSelectedCheckoutItems(undefined);
          setActiveTab('tracking');
        }}
      />
      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder ? orders.find((o) => (o.orderId && o.orderId === selectedOrder.orderId) || (o.id && o.id === selectedOrder.id)) || selectedOrder : null}
        isOpen={isOrderDetailsOpen}
        onClose={() => setIsOrderDetailsOpen(false)}
        initialTab={orderDetailsTab}
        onReorder={handleReorder}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      {/* Official Printable Receipt Modal */}
      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        order={selectedInvoiceOrder ? orders.find((o) => (o.orderId && o.orderId === selectedInvoiceOrder.orderId) || (o.id && o.id === selectedInvoiceOrder.id)) || selectedInvoiceOrder : null}
        transaction={selectedInvoiceTx}
        user={user}
      />

      {/* Delete Account Confirmation Modal */}
      <GlassModal
        isOpen={isDeleteAccountModalOpen}
        onClose={() => {
          if (!isDeletingAccount) {
            setIsDeleteAccountModalOpen(false);
            setDeleteConfirmName('');
          }
        }}
        title="Delete Your Account"
      >
        <div className="flex flex-col gap-4 text-left">
          <p className="text-sm text-text-main m-0 leading-relaxed">
            Are you sure you want to delete your account? This action is <b className="text-danger font-bold">permanent and irreversible</b>.
          </p>

          <div className="p-3.5 rounded-xl bg-white/5 border border-border-glass text-xs text-text-dim flex flex-col gap-1.5 leading-relaxed">
            <div className="flex items-center gap-2 text-text-main font-semibold">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-main shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Important information before deleting:</span>
            </div>
            <ul className="m-0 pl-4 list-disc space-y-1">
              <li>Your personal profile (name, email, phone, addresses) will be permanently erased.</li>
              <li>You will be logged out immediately and cannot access this account again.</li>
              <li>Past completed orders remain preserved as anonymous records for business receipts and accounting.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            <label className="text-xs font-semibold text-text-main">
              To confirm, please type your account name <span className="font-mono text-primary font-bold">"{user?.username}"</span>:
            </label>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={user?.username || 'Enter your account name'}
              className="w-full bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none focus:border-danger transition-all font-mono"
              autoFocus
            />
          </div>

          <div className="flex gap-3 justify-end mt-2 pt-3 border-t border-border-glass/40">
            <button
              type="button"
              disabled={isDeletingAccount}
              onClick={() => {
                setIsDeleteAccountModalOpen(false);
                setDeleteConfirmName('');
              }}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold hover:bg-white/10 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeletingAccount || deleteConfirmName.trim().toLowerCase() !== (user?.username || '').trim().toLowerCase()}
              onClick={handleDeleteAccount}
              className="px-5 py-2.5 rounded-xl bg-danger text-white text-xs font-bold hover:bg-danger-light cursor-pointer border-none shadow-[0_4px_12px_rgba(239,68,68,0.3)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isDeletingAccount ? 'Deleting Account...' : 'Permanently Delete Account'}
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
