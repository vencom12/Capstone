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
  
  // Settings State
  const [settingsName, setSettingsName] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsAddress, setSettingsAddress] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Date Filters
  const [ordersDateFilter, setOrdersDateFilter] = useState('');
  const [txDateFilter, setTxDateFilter] = useState('');

  useEffect(() => {
    if (user && isHydrated) {
      setSettingsName(user.username || '');
      setSettingsEmail(user.email || '');
      setSettingsPhone(user.phoneNumber || '');
      setSettingsAddress(user.address || '');
    }
  }, [user, isHydrated, activeTab]);

  const handleUpdateProfile = async () => {
    setIsUpdating(true);
    try {
      const { api } = await import('@/lib/api');
      await api.patch('/api/customer/settings', {
        username: settingsName,
        email: settingsEmail,
        phoneNumber: settingsPhone,
        address: settingsAddress
      });
      await refreshUser();
      showToast('Profile updated successfully!', 'success');
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
    // Synchronize settings form with user data
    if (user && isHydrated) {
      setSettingsName(user.username || '');
      setSettingsEmail(user.email || '');
      setSettingsPhone(user.phoneNumber || '');
      setSettingsAddress(user.address || '');
    }
  }, [user, isHydrated, activeTab]);

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

      case 'settings':
        return (
          <section className="flex flex-col h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4">
              <h1 className="text-xl font-bold mb-0.5">Account Settings</h1>
              <p className="text-text-dim text-[0.85rem] m-0">Profile and notification preferences.</p>
            </header>
            <div className="flex-1 overflow-y-auto pr-2 pb-6">
              {/* Account Settings Panel styled like Modal Panel */}
              <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass rounded-[24px] overflow-hidden max-w-[600px] shadow-[0_25px_80px_-12px_rgba(0,0,0,0.6)] flex flex-col">
                <div className="px-6 py-4 border-b border-border-glass/50 bg-black/10">
                  <h3 className="text-base font-bold text-text-main m-0">Update Profile</h3>
                </div>
                <div className="p-6 flex flex-col gap-4.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.75rem] font-bold text-text-dim uppercase tracking-wider ml-1">Display Name</label>
                    <input type="text" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} placeholder="Display Name" className="w-full bg-bg-surface border border-border-glass p-3.5 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary transition-all" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.75rem] font-bold text-text-dim uppercase tracking-wider ml-1">Email Address</label>
                    <input type="email" value={settingsEmail} onChange={(e) => setSettingsEmail(e.target.value)} placeholder="Email Address" className="w-full bg-bg-surface border border-border-glass p-3.5 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary transition-all" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.75rem] font-bold text-text-dim uppercase tracking-wider ml-1">Phone Number</label>
                    <input type="text" value={settingsPhone} onChange={(e) => setSettingsPhone(e.target.value)} placeholder="Phone Number" className="w-full bg-bg-surface border border-border-glass p-3.5 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary transition-all" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.75rem] font-bold text-text-dim uppercase tracking-wider ml-1">Shipping Address</label>
                    <textarea value={settingsAddress} onChange={(e) => setSettingsAddress(e.target.value)} placeholder="Shipping Address" rows={3} className="w-full bg-bg-surface border border-border-glass p-3.5 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary resize-none transition-all"></textarea>
                  </div>

                  <button 
                    onClick={handleUpdateProfile}
                    disabled={isUpdating}
                    className="bg-primary text-white font-bold px-10 py-3.5 rounded-xl mt-2 self-start hover:shadow-[0_10px_30px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 active:scale-95 transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isUpdating ? 'Saving Changes...' : 'Update Profile'}
                  </button>
                </div>
              </div>

              {/* Preferences / Theme Panel styled like Modal Panel */}
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
