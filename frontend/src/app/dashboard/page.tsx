'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { useUIStore } from '@/stores/useUIStore';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';
import RightPanel from '@/components/dashboard/RightPanel';
import ProductGrid from '@/components/products/ProductGrid';
import ProductModal from '@/components/products/ProductModal';
import CheckoutModal from '@/components/checkout/CheckoutModal';
import OrderDetailsModal from '@/components/dashboard/OrderDetailsModal';
import ReceiptModal from '@/components/dashboard/ReceiptModal';
import type { Product, Order } from '@/lib/types';
import { showToast } from '@/components/ui/Toast';
import GlassDatePicker from '@/components/ui/GlassDatePicker';
import AddressSelect from '@/components/ui/AddressSelect';
import { TableSkeleton, CardSkeleton, ProductCardSkeleton } from '@/components/ui/Skeletons';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, checkAccess, refreshUser } = useAuthStore();
  const { products, fetchDashboardState, orders, favorites, transactions, selectedCategory, setSelectedCategory, getCategories, isSyncing } = useProductStore();
  const { isBasketOpen, setBasketOpen, toggleBasket, isSidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();

  const [activeTab, setActiveTab] = useState<string>('shop');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOrderDetailsOpen, setIsOrderDetailsOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  
  // Settings State — inline edit one field at a time
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Date Filters
  const [ordersDateFilter, setOrdersDateFilter] = useState('');
  const [txDateFilter, setTxDateFilter] = useState('');

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
    setIsUpdating(true);
    try {
      const { api } = await import('@/lib/api');
      await api.patch('/api/customer/settings', {
        [editingField]: editValue
      });
      await refreshUser();
      showToast('Profile updated successfully!', 'success');
      setEditingField(null);
      setEditValue('');
    } catch (err) {
      showToast('Failed to update profile', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    // 1. Handle Hydration & Tab Persistence
    const savedTab = localStorage.getItem('stitch-dashboard-tab');
    if (savedTab) setActiveTab(savedTab);
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

    // 4. Real-time Polling (15s interval)
    const interval = setInterval(() => {
      fetchDashboardState();
    }, 15000);

    return () => clearInterval(interval);
  }, [isHydrated, isAuthenticated, checkAccess, router, fetchDashboardState]);



  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('stitch-dashboard-tab', activeTab);
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
      case 'shop':
        return (
          <section className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4 flex justify-between items-center flex-wrap gap-3 max-[650px]:mb-3">
              <div className="max-[1100px]:w-full">
                <h1 className="text-xl font-bold mb-0.5 max-[650px]:text-lg">Design Catalog</h1>
                <p className="text-text-dim text-[0.85rem] m-0 max-[650px]:text-[0.75rem]">Select a professional design for your next project.</p>
              </div>
              
              <div className="flex gap-3 w-full max-w-[400px] max-[1100px]:max-w-none max-[1100px]:order-2">
                {/* Animated Custom Category Dropdown (Visible on Mobile only) */}
                <div className="hidden max-[650px]:block shrink-0 relative category-dropdown-container">
                  <button 
                    onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                    className="flex items-center gap-2 bg-bg-surface border border-border-glass text-text-main px-4 py-2.5 rounded-xl text-[0.9rem] font-bold outline-none cursor-pointer hover:bg-white/5 transition-all whitespace-nowrap"
                  >
                    {selectedCategory === 'All' ? 'All Designs' : selectedCategory}
                    <svg 
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`transition-transform duration-300 ${isCategoryOpen ? 'rotate-180' : ''}`}
                    >
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>

                  <div className={`
                    absolute top-[calc(100%+8px)] left-0 w-[180px] bg-bg-dark/95 backdrop-blur-xl border border-border-glass rounded-2xl overflow-hidden z-[3000] shadow-[0_20px_40px_rgba(0,0,0,0.4)]
                    transition-all duration-300 origin-top-left
                    ${isCategoryOpen ? 'opacity-100 scale-100 translate-y-0 visible' : 'opacity-0 scale-95 -translate-y-2 invisible'}
                  `}>
                    {getCategories().map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          setSelectedCategory(c);
                          setIsCategoryOpen(false);
                        }}
                        className={`
                          w-full text-left px-4 py-3 text-sm font-medium transition-all hover:bg-white/10
                          ${selectedCategory === c ? 'text-primary bg-primary/10' : 'text-text-dim'}
                        `}
                      >
                        {c === 'All' ? 'All Designs' : c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-bg-surface border border-border-glass px-4 py-2.5 rounded-xl flex items-center gap-3 flex-1">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-dim"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <input 
                    type="text" 
                    placeholder="Search designs..." 
                    className="bg-transparent border-none text-text-main outline-none w-full text-[0.95rem]" 
                    onChange={(e) => useProductStore.getState().setSearchQuery(e.target.value)} 
                  />
                </div>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto pr-2">
              <ProductGrid onQuickView={handleQuickView} />
            </div>
          </section>
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
          <section className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
             <header className="mb-4 flex justify-between items-center flex-wrap gap-3">
              <div className="max-[1100px]:w-full">
                <h1 className="text-xl font-bold mb-0.5">Order Tracking</h1>
                <p className="text-text-dim text-[0.85rem] m-0">Monitor your active and recent projects in real-time.</p>
              </div>
              <div className="shrink-0 flex items-center gap-2 max-[650px]:w-full">
                <span className="text-[0.8rem] text-text-dim font-medium mr-1 max-[650px]:hidden">Filter by date:</span>
                <GlassDatePicker 
                  value={ordersDateFilter}
                  onChange={(val) => setOrdersDateFilter(val)}
                  placeholder="All Dates"
                />
              </div>
            </header>
            <div className="flex-1 overflow-y-auto pr-2">
            
            {isSyncing && orders.length === 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-6 max-[1100px]:grid-cols-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-bg-surface border border-border-glass rounded-2xl p-8 flex flex-col items-center justify-center text-text-dim min-h-[300px]">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                <p className="text-lg font-medium m-0">No active orders found</p>
                <p className="text-sm mt-1 opacity-70">Try adjusting your date selection filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-6 max-[1100px]:grid-cols-1">
                {filteredOrders.map((order) => (
                  <div key={order.id} className="bg-bg-card backdrop-blur-md border border-border-glass rounded-2xl p-6 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-primary font-bold m-0">{order.orderId}</h4>
                        <p className="text-xs text-text-dim mt-1">{new Date(order.date).toLocaleDateString()} • {order.paymentMethod.toUpperCase()}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase tracking-wider ${
                        order.status === 'Completed' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 mt-2">
                      <div className="flex justify-between text-[0.8rem] font-medium">
                        <span>Production Progress</span>
                        <span>{order.progress}%</span>
                      </div>
                      <div className="w-full bg-black/30 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-primary to-secondary h-full rounded-full transition-all duration-1000"
                          style={{ width: `${order.progress}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-2 pt-4 border-t border-border-glass/50">
                      <div className="text-[0.8rem]">
                        <span className="text-text-dim">Total: </span>
                        <span className="font-bold text-text-main">${order.totalAmount.toFixed(2)}</span>
                      </div>
                      <button 
                        onClick={() => {
                          setSelectedOrder(order);
                          setIsOrderDetailsOpen(true);
                        }}
                        className="text-[0.8rem] font-bold text-primary hover:underline bg-transparent border-none cursor-pointer"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        );
      }

      case 'favs':
        return (
          <section className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4">
              <h1 className="text-xl font-bold mb-0.5">My Favorites</h1>
              <p className="text-text-dim text-[0.85rem] m-0">Designs you've saved for later.</p>
            </header>
            <div className="flex-1 overflow-y-auto pr-2">
            {isSyncing && favorites.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade">
                {Array.from({ length: 4 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : favorites.length === 0 ? (
              <div className="border-2 border-dashed border-border-glass rounded-3xl p-12 flex flex-col items-center justify-center text-text-dim text-center min-h-[300px]">
                 <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 text-accent"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                 <p className="text-lg font-medium m-0">You haven't favorited any designs yet.</p>
              </div>
            ) : (
              <ProductGrid products={favorites} onQuickView={handleQuickView} />
            )}
          </div>
        </section>
        );

      case 'history': {
        const filteredTransactions = transactions.filter(tx => {
          if (!txDateFilter) return true;
          try {
            return new Date(tx.timestamp).toISOString().split('T')[0] === txDateFilter;
          } catch {
            return true;
          }
        });

        return (
          <section className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4 flex justify-between items-center flex-wrap gap-3">
              <div className="max-[1100px]:w-full">
                <h1 className="text-xl font-bold mb-0.5">My Transactions</h1>
                <p className="text-text-dim text-[0.85rem] m-0">Your payment history and digital receipts.</p>
              </div>
              <div className="shrink-0 flex items-center gap-2 max-[650px]:w-full">
                <span className="text-[0.8rem] text-text-dim font-medium mr-1 max-[650px]:hidden">Filter by date:</span>
                <GlassDatePicker 
                  value={txDateFilter}
                  onChange={(val) => setTxDateFilter(val)}
                  placeholder="All Dates"
                />
              </div>
            </header>
            <div className="flex-1 overflow-y-auto pr-2">
            
            {isSyncing && transactions.length === 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-6 max-[1100px]:grid-cols-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="bg-bg-surface border border-border-glass rounded-2xl p-8 flex flex-col items-center justify-center text-text-dim min-h-[300px]">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                <p className="text-lg font-medium m-0">No transactions found</p>
                <p className="text-sm mt-1 opacity-70">Try adjusting your date selection filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-6 max-[1100px]:grid-cols-1">
                {filteredTransactions.map((tx) => {
                  const receipt = useProductStore.getState().receipts.find(r => r.orderID === tx.orderID);
                  
                  return (
                    <div key={tx.id} className="bg-bg-card backdrop-blur-md border border-border-glass rounded-2xl p-6 flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-primary font-bold m-0">{tx.transactionID}</h4>
                          <p className="text-xs text-text-dim mt-1">
                            {new Date(tx.timestamp).toLocaleString()} • Order {tx.orderID}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase tracking-wider ${
                          tx.status === 'completed' ? 'bg-success/20 text-success' : 
                          tx.status === 'processing' ? 'bg-primary/20 text-primary' :
                          tx.status === 'canceled' ? 'bg-error/20 text-error' :
                          'bg-warning/20 text-warning'
                        }`}>
                          {tx.status === 'completed' ? 'Payment Received' : 
                           tx.status === 'processing' ? 'In Production' : 
                           tx.status === 'canceled' ? 'Cancelled' : 
                           tx.status}
                        </span>
                      </div>

                      <div className="flex justify-between items-center mt-2 pt-4 border-t border-border-glass/50">
                        <div className="text-[0.85rem]">
                          <span className="text-text-dim">Amount: </span>
                          <span className="font-bold text-text-main">${tx.amount.toFixed(2)}</span>
                        </div>
                        <div className="flex gap-4 items-center">
                          <button 
                            onClick={() => {
                              setSelectedTransactionId(tx.transactionID);
                              setIsReceiptOpen(true);
                            }}
                            className="text-[0.8rem] font-bold text-primary hover:underline bg-transparent border-none cursor-pointer p-0"
                          >
                            View Details
                          </button>
                          {tx.receiptLink && (
                            <button 
                              onClick={async () => {
                                try {
                                  const { api } = await import('@/lib/api');
                                  await api.download(tx.receiptLink!, `receipt-${tx.transactionID}.pdf`);
                                } catch (err) {
                                  showToast('Download failed. Please try again.', 'error');
                                }
                              }}
                              className="text-[0.8rem] font-bold text-primary hover:underline bg-transparent border-none cursor-pointer p-0"
                            >
                              Receipt
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        );
      }

      case 'settings': {
        const profileFields = [
          { key: 'username', label: 'Display Name', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>), type: 'text' as const },
          { key: 'email', label: 'Email Address', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>), type: 'email' as const },
          { key: 'phoneNumber', label: 'Phone Number', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>), type: 'text' as const },
          { key: 'address', label: 'Shipping Address', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>), type: 'textarea' as const },
          { key: 'preferredDeliveryTime', label: 'Preferred Delivery Time', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>), type: 'text' as const },
        ];

        return (
          <section className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4">
              <h1 className="text-xl font-bold mb-0.5">Account Settings</h1>
              <p className="text-text-dim text-[0.85rem] m-0">Tap the edit icon to update any field individually.</p>
            </header>
            <div className="flex-1 overflow-y-auto pr-2 pb-6">
              {/* Profile Card */}
              <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass rounded-[24px] overflow-hidden max-w-[600px] shadow-[0_25px_80px_-12px_rgba(0,0,0,0.6)] flex flex-col">
                {/* Avatar Header */}
                <div className="px-6 py-5 border-b border-border-glass/50 bg-black/10 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xl font-bold shrink-0 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-text-main m-0">{user?.username || 'User'}</h3>
                    <p className="text-[0.8rem] text-text-dim m-0 mt-0.5">{user?.email || 'No email set'}</p>
                  </div>
                </div>

                {/* Inline Edit Fields */}
                <div className="flex flex-col">
                  {profileFields.map((field, idx) => {
                    const currentValue = getFieldValue(field.key);
                    const isEditing = editingField === field.key;
                    return (
                      <div key={field.key} className={`px-6 py-4 flex flex-col gap-2 transition-all duration-300 ${idx < profileFields.length - 1 ? 'border-b border-border-glass/30' : ''} ${isEditing ? 'bg-primary/5' : 'hover:bg-white/3'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="text-text-dim shrink-0">{field.icon}</div>
                            <div className="flex flex-col">
                              <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider">{field.label}</span>
                              {!isEditing && (
                                <span className="text-[0.95rem] text-text-main mt-0.5">{currentValue || <span className="italic text-text-dim/50">Not set</span>}</span>
                              )}
                            </div>
                          </div>
                          {!isEditing && (
                            <button
                              onClick={() => startEditing(field.key)}
                              disabled={editingField !== null && editingField !== field.key}
                              className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer border-none ${editingField !== null && editingField !== field.key ? 'opacity-30 cursor-not-allowed bg-transparent' : 'bg-white/5 hover:bg-primary/20 text-text-dim hover:text-primary'}`}
                              title={`Edit ${field.label}`}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                          )}
                        </div>
                        {isEditing && (
                          <div className="flex flex-col gap-2.5 ml-[30px] animate-[fadeIn_0.2s_ease-out]">
                            {field.key === 'address' ? (
                              <AddressSelect
                                value={editValue}
                                onChange={(val) => setEditValue(val)}
                              />
                            ) : field.key === 'preferredDeliveryTime' ? (
                              <select
                                value={editValue || '⚡ As soon as possible (Express)'}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                className="w-full bg-bg-surface border border-primary/50 p-3 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary cursor-pointer transition-all shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
                              >
                                <option value="⚡ As soon as possible (Express)" className="bg-bg-dark text-white">⚡ As soon as possible (Express)</option>
                                <option value="🌅 Morning (8:00 AM - 12:00 PM)" className="bg-bg-dark text-white">🌅 Morning (8:00 AM - 12:00 PM)</option>
                                <option value="☀️ Afternoon (1:00 PM - 5:00 PM)" className="bg-bg-dark text-white">☀️ Afternoon (1:00 PM - 5:00 PM)</option>
                                <option value="🌙 Evening (5:00 PM - 8:00 PM)" className="bg-bg-dark text-white">🌙 Evening (5:00 PM - 8:00 PM)</option>
                              </select>
                            ) : field.type === 'textarea' ? (
                              <textarea
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                rows={2}
                                autoFocus
                                className="w-full bg-bg-surface border border-primary/50 p-3 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary resize-none transition-all shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
                              />
                            ) : (
                              <input
                                type={field.type}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveField(); if (e.key === 'Escape') cancelEditing(); }}
                                className="w-full bg-bg-surface border border-primary/50 p-3 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary transition-all shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
                              />
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleSaveField}
                                disabled={isUpdating}
                                className="bg-primary text-white font-bold px-5 py-2 rounded-lg text-[0.8rem] hover:shadow-[0_6px_20px_rgba(99,102,241,0.4)] active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none"
                              >
                                {isUpdating ? 'Saving...' : 'Save'}
                              </button>
                              <button
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

              {/* Preferences / Theme Panel */}
              <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass rounded-[24px] overflow-hidden max-w-[600px] shadow-[0_25px_80px_-12px_rgba(0,0,0,0.6)] flex flex-col mt-6">
                <div className="px-6 py-4 border-b border-border-glass/50 bg-black/10">
                  <h3 className="text-base font-bold text-text-main m-0">Preferences</h3>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between bg-bg-surface p-4 rounded-xl border border-border-glass flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line></svg>
                       <div>
                         <h4 className="m-0 text-[0.95rem] font-bold text-text-main">Interface Theme</h4>
                         <p className="m-0 text-[0.8rem] text-text-dim">Toggle light and dark mode</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => {
                        const html = document.documentElement;
                        html.setAttribute('data-theme', html.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
                      }} 
                      className="bg-white/5 border border-border-glass px-4 py-2.5 rounded-lg text-[0.85rem] text-text-main font-bold hover:bg-white/10 cursor-pointer transition-all active:scale-95"
                    >
                      Switch Theme
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent text-text-main">
      {/* Mobile Top Bar */}
      <div className="hidden max-[650px]:flex items-center justify-between w-full h-[60px] px-4 border-b border-border-glass bg-bg-header backdrop-blur-md fixed top-0 left-0 z-[1000]">
         <button onClick={toggleSidebar} className="bg-transparent border-none text-text-main cursor-pointer p-1">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
         </button>
         <div className="font-extrabold text-[1.1rem] bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">Stitch-Opt</div>
         <button onClick={toggleBasket} className="bg-transparent border-none text-text-main cursor-pointer p-1">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
         </button>
      </div>

      <DashboardSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 h-full overflow-hidden p-8 max-[650px]:p-4 max-[650px]:pt-[80px]">
        {renderTabContent()}
      </main>

      {/* Right Panel / Drawer */}
      <div className={`
        fixed top-0 right-0 h-full z-[2000] transition-transform duration-300
        ${isBasketOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <RightPanel onCheckout={() => setIsCheckoutOpen(true)} onCloseMobile={() => setBasketOpen(false)} />
      </div>
 
      {/* Mobile Overlays */}
      {(isBasketOpen || isSidebarOpen) && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1900]"
          onClick={() => {
            setBasketOpen(false);
            setSidebarOpen(false);
          }}
        />
      )}

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
        onClose={() => setIsCheckoutOpen(false)}
      />
      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        isOpen={isOrderDetailsOpen}
        onClose={() => setIsOrderDetailsOpen(false)}
      />
      {/* Receipt Modal */}
      <ReceiptModal
        transactionId={selectedTransactionId}
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
      />
    </div>
  );
}
