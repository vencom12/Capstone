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
import type { Product, Order, BasketItem, SavedAddress } from '@/lib/types';
import { showToast } from '@/components/ui/Toast';
import GlassDatePicker from '@/components/ui/GlassDatePicker';
import AddressSelect from '@/components/ui/AddressSelect';
import { TableSkeleton, CardSkeleton, ProductCardSkeleton } from '@/components/ui/Skeletons';
import OrderMilestoneHero from '@/components/dashboard/OrderMilestoneHero';
import OrderList from '@/components/dashboard/OrderList';
import AddressBookModal from '@/components/dashboard/AddressBookModal';
import InvoiceModal from '@/components/dashboard/InvoiceModal';
import BasketView from '@/components/dashboard/BasketView';
import { useBasketStore } from '@/stores/useBasketStore';
import { getOrderStage } from '@/lib/orderStatus';
import Pagination from '@/components/ui/Pagination';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, checkAccess, refreshUser } = useAuthStore();
  const basketCount = useBasketStore((s) => s.getCount());

  const { products, fetchDashboardState, orders, favorites, transactions, selectedCategory, setSelectedCategory, getCategories, isSyncing } = useProductStore();
  const { isBasketOpen, setBasketOpen, toggleBasket, isSidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  const activeOrdersCount = (orders || []).filter((o) => getOrderStage(o).isActive).length;

  const [activeTab, setActiveTab] = useState<string>('shop');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOrderDetailsOpen, setIsOrderDetailsOpen] = useState(false);
  const [orderDetailsTab, setOrderDetailsTab] = useState<'summary' | 'tracking'>('summary');
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedCheckoutItems, setSelectedCheckoutItems] = useState<BasketItem[] | undefined>(undefined);
  const [selectedFulfillmentType, setSelectedFulfillmentType] = useState<'delivery' | 'pickup'>('delivery');
  const [isAddressBookOpen, setIsAddressBookOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);
  const [selectedInvoiceTx, setSelectedInvoiceTx] = useState<any | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');

  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res && res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
      }).catch(() => {});
    });
  }, []);

  // 1-Click Reorder Action
  const handleReorder = (order: Order) => {
    if (!order.items || order.items.length === 0) {
      showToast('No catalog items available to reorder from this project.', 'info');
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
    setIsUpdating(true);
    try {
      const { api } = await import('@/lib/api');
      const res = await api.patch<{ message: string; user: any }>('/api/customer/settings', {
        [editingField]: editValue
      });
      if (res && res.user) {
        useAuthStore.getState().setUser({
          ...useAuthStore.getState().user!,
          ...res.user
        });
      } else {
        await refreshUser();
      }
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

    // 4. Real-time Polling (15s interval - silent in background)
    const interval = setInterval(() => {
      fetchDashboardState(true);
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
      case 'basket':
        return (
          <BasketView
            onGoToShop={() => setActiveTab('shop')}
            onOpenCheckout={(items, fulfillmentType) => {
              setSelectedCheckoutItems(items);
              if (fulfillmentType) {
                setSelectedFulfillmentType(fulfillmentType);
              }
              setIsCheckoutOpen(true);
            }}
          />
        );

      case 'shop':
        return (
          <section className="flex flex-col min-h-full md:h-full animate-[fadeIn_0.3s_ease-out]">
            <OrderMilestoneHero 
              orders={orders} 
              onViewDetails={(ord, tab) => {
                setSelectedOrder(ord);
                setOrderDetailsTab(tab || 'summary');
                setIsOrderDetailsOpen(true);
              }} 
              onViewAll={() => setActiveTab('tracking')}
            />
            <header className="mb-4 flex justify-between items-center flex-wrap gap-3 max-md:mb-3">
              <div className="max-[1100px]:w-full">
                <h1 className="text-xl font-bold mb-0.5 max-md:text-lg">Design Catalog</h1>
                <p className="text-text-dim text-[0.85rem] m-0 max-md:text-[0.75rem]">Select a professional design for your next project.</p>
              </div>
              
              <div className="flex gap-3 w-full max-w-[400px] max-[1100px]:max-w-none max-[1100px]:order-2">
                {/* Animated Custom Category Dropdown (Visible on Mobile only) */}
                <div className="hidden max-md:block shrink-0 relative category-dropdown-container">
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
                    absolute top-[calc(100%+8px)] left-0 w-[180px] bg-bg-dark/95 backdrop-blur-xl border border-border-glass rounded-2xl overflow-hidden z-[3000] shadow-lg
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
            <div className="flex-1 pr-0 md:pr-2">
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
          <section className="flex flex-col min-h-full md:h-full animate-[fadeIn_0.3s_ease-out]">
             <header className="mb-4 flex justify-between items-center flex-wrap gap-3">
              <div className="max-[1100px]:w-full">
                <h1 className="text-xl font-bold mb-0.5">Order Tracking</h1>
                <p className="text-text-dim text-[0.85rem] m-0">Monitor your active and recent projects in real-time.</p>
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
              <div className="bg-bg-surface border border-border-glass rounded-2xl p-8 flex flex-col items-center justify-center text-text-dim min-h-[300px]">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                <p className="text-lg font-medium m-0">No active orders found</p>
                <p className="text-sm mt-1 opacity-70">Try adjusting your date selection filter.</p>
              </div>
            ) : (
              <OrderList
                orders={filteredOrders}
                onTrack={(ord) => { setSelectedOrder(ord); setOrderDetailsTab('tracking'); setIsOrderDetailsOpen(true); }}
                onDetails={(ord) => { setSelectedOrder(ord); setOrderDetailsTab('summary'); setIsOrderDetailsOpen(true); }}
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
              <div className="border-2 border-dashed border-border-glass rounded-3xl p-12 flex flex-col items-center justify-center text-text-dim text-center min-h-[300px]">
                 <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-primary opacity-60"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                 <p className="text-base font-bold text-text-main m-0">You haven't favorited any designs yet</p>
                 <p className="text-xs text-text-dim mt-1 max-w-xs">Heart any embroidery design from our catalog to save it for quick ordering anytime.</p>
                 <button 
                   onClick={() => setActiveTab('shop')} 
                   className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer border-none shadow-sm"
                 >
                   Explore Catalog →
                 </button>
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

        const paginatedTransactions = filteredTransactions.slice(
          (txPage - 1) * txPageSize,
          txPage * txPageSize
        );

        return (
          <section className="flex flex-col min-h-full md:h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4 flex justify-between items-center flex-wrap gap-3">
              <div className="max-[1100px]:w-full">
                <h1 className="text-xl font-bold mb-0.5">My Transactions</h1>
                <p className="text-text-dim text-[0.85rem] m-0">Your payment history and digital receipts.</p>
              </div>
              <div className="shrink-0 flex items-center gap-2 max-md:w-full">
                <span className="text-[0.8rem] text-text-dim font-medium mr-1 max-md:hidden">Filter by date:</span>
                <GlassDatePicker 
                  value={txDateFilter}
                  onChange={(val) => setTxDateFilter(val)}
                  placeholder="All Dates"
                />
              </div>
            </header>
            <div className="flex-1 pr-0 md:pr-2 pb-6">
            
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
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-6 max-[1100px]:grid-cols-1">
                  {paginatedTransactions.map((tx) => {
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
                            <span className="font-bold text-text-main">₱{tx.amount.toFixed(2)}</span>
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

                <Pagination
                  currentPage={txPage}
                  totalItems={filteredTransactions.length}
                  pageSize={txPageSize}
                  onPageChange={setTxPage}
                  itemLabel="transactions"
                />
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
          { key: 'preferredDeliveryTime', label: 'Preferred Delivery Time', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>), type: 'text' as const },
        ] as Array<{ key: string; label: string; icon: React.ReactNode; type: 'text' | 'email' | 'textarea' }>;

        // Unify address sources: if savedAddresses is not yet populated, use profile address as initial default
        const effectiveSavedAddresses: SavedAddress[] = (user?.savedAddresses && user.savedAddresses.length > 0)
          ? user.savedAddresses
          : (user?.address ? [{
              id: 'addr_default_profile',
              recipientName: user.username || 'Customer',
              phoneNumber: user.phoneNumber || '',
              streetAddress: user.address,
              fullAddress: user.address,
              label: 'Home',
              isDefault: true,
            }] : []);

        return (
          <section className="flex flex-col min-h-full md:h-full animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4">
              <h1 className="text-xl font-bold mb-0.5">Account Settings</h1>
              <p className="text-text-dim text-[0.85rem] m-0">Tap the edit icon to update any field individually.</p>
            </header>
            <div className="flex-1 pr-0 md:pr-2 pb-8">
              {/* Profile Card */}
              <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass rounded-[24px] overflow-hidden max-w-[600px] shadow-xl flex flex-col">
                {/* Avatar Header */}
                <div className="px-6 py-5 border-b border-border-glass/50 bg-black/10 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center text-xl font-bold shrink-0 shadow-sm">
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
                                value={editValue || 'Express (Earliest available dispatch)'}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                className="w-full bg-bg-surface border border-primary/50 p-3 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary cursor-pointer transition-all shadow-sm"
                              >
                                <option value="Express (Earliest available dispatch)" className="bg-bg-surface text-text-main">Express (Earliest available dispatch)</option>
                                <option value="Morning (8:00 AM - 12:00 PM)" className="bg-bg-surface text-text-main">Morning (8:00 AM - 12:00 PM)</option>
                                <option value="Afternoon (1:00 PM - 5:00 PM)" className="bg-bg-surface text-text-main">Afternoon (1:00 PM - 5:00 PM)</option>
                                <option value="Evening (5:00 PM - 8:00 PM)" className="bg-bg-surface text-text-main">Evening (5:00 PM - 8:00 PM)</option>
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
                                className="bg-primary text-white font-bold px-5 py-2 rounded-lg text-[0.8rem] hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none"
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

              {/* Shopee-Style Saved Addresses Panel */}
              <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass rounded-[24px] overflow-hidden max-w-[600px] shadow-xl flex flex-col mt-6">
                <div className="px-6 py-4 border-b border-border-glass/50 bg-black/10 flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-bold text-text-main m-0">My Delivery Addresses</h3>
                    <p className="text-xs text-text-dim m-0 mt-0.5">Shopee-style multi-address book for rapid checkout</p>
                  </div>
                  <button
                    onClick={() => setIsAddressBookOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer border-none shadow-sm"
                  >
                    <span>Manage / Add</span>
                    <span>+</span>
                  </button>
                </div>
                <div className="p-6 flex flex-col gap-3">
                  {effectiveSavedAddresses.length > 0 ? (
                    effectiveSavedAddresses.slice(0, 3).map((addr) => (
                      <div
                        key={addr.id}
                        onClick={() => setIsAddressBookOpen(true)}
                        className={`p-3.5 rounded-xl border flex flex-col gap-1.5 cursor-pointer transition-all ${
                          addr.isDefault
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border-glass bg-bg-surface/60 hover:bg-bg-surface'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-text-main">{addr.recipientName}</span>
                            <span className="text-xs text-text-dim">| {addr.phoneNumber}</span>
                            <span className="px-1.5 py-0.5 rounded text-[0.65rem] font-bold uppercase bg-white/10 text-text-dim border border-border-glass">
                              {addr.label || 'Home'}
                            </span>
                            {addr.isDefault && (
                              <span className="px-1.5 py-0.5 rounded text-[0.65rem] font-bold uppercase bg-primary/20 text-primary border border-primary/30">
                                Default
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-primary font-semibold">Edit</span>
                        </div>
                        <p className="text-xs text-text-dim m-0 leading-relaxed truncate">
                          {addr.fullAddress || addr.streetAddress}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-xs text-text-dim">
                      <p className="m-0">No saved addresses yet.</p>
                      <button
                        onClick={() => setIsAddressBookOpen(true)}
                        className="mt-2 text-primary font-bold hover:underline bg-transparent border-none cursor-pointer"
                      >
                        + Add Your First Address
                      </button>
                    </div>
                  )}

                  {effectiveSavedAddresses.length > 3 && (
                    <button
                      onClick={() => setIsAddressBookOpen(true)}
                      className="text-xs text-center text-primary font-bold hover:underline bg-transparent border-none cursor-pointer py-1"
                    >
                      View all {effectiveSavedAddresses.length} addresses ›
                    </button>
                  )}
                </div>
              </div>

              {/* Preferences / Theme Panel */}
              <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass rounded-[24px] overflow-hidden max-w-[600px] shadow-xl flex flex-col mt-6">
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
    <div className="min-h-screen min-h-dvh w-full bg-transparent text-text-main flex flex-col md:flex-row md:h-screen md:overflow-hidden">
      {/* Mobile Top Bar */}
      <div className="hidden max-md:flex items-center justify-between w-full h-[58px] px-3.5 border-b border-border-glass bg-bg-header/95 backdrop-blur-xl fixed top-0 left-0 z-[1000] shadow-sm">
         <button onClick={toggleSidebar} className="bg-transparent border-none text-text-main cursor-pointer p-1.5 flex items-center justify-center rounded-lg hover:bg-white/5 active:scale-95 transition-all shrink-0" title="Toggle Navigation Menu">
           <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
         </button>

         <div className="flex items-center gap-2 min-w-0 max-w-[210px] shrink">
           {businessLogoUrl ? (
             <img src={businessLogoUrl} alt="Logo" className="w-7 h-7 rounded-lg object-contain bg-white/10 shrink-0" />
           ) : (
             <div className="bg-primary w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
             </div>
           )}
           <span className="font-black text-[1.02rem] text-text-main tracking-tight truncate">Eds Towels & Caps</span>
         </div>

         <div className="flex items-center gap-1.5 shrink-0">
           <button
             onClick={() => {
               const html = document.documentElement;
               const current = html.getAttribute('data-theme');
               html.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
             }}
             className="bg-transparent border-none text-text-dim hover:text-text-main cursor-pointer p-1.5 flex items-center justify-center rounded-lg hover:bg-white/5 active:scale-95 transition-all shrink-0"
             title="Toggle theme"
           >
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
           </button>

           {/* Mobile Quick Account Avatar / Settings Trigger */}
           <button
             onClick={() => setActiveTab('settings')}
             className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer transition-all border ${
               activeTab === 'settings'
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
        onOpenAddressBook={() => setIsAddressBookOpen(true)}
      />
      
      <main className="w-full flex-1 p-3.5 sm:p-6 lg:p-8 pt-[70px] md:pt-6 lg:pt-8 pb-32 md:pb-8 md:h-full md:overflow-y-auto md:min-h-0">
        {renderTabContent()}
      </main>

      {/* Phone-Centric Bottom Navigation Dock */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-[1000] bg-bg-card/95 backdrop-blur-2xl border-t border-border-glass px-2 py-1 flex items-center justify-around shadow-2xl safe-area-bottom"
        aria-label="Mobile Navigation"
      >
        {[
          {
            id: 'shop',
            label: 'Catalog',
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            ),
          },
          {
            id: 'tracking',
            label: 'Tracking',
            badge: activeOrdersCount > 0 ? activeOrdersCount : undefined,
            badgeColor: 'bg-primary text-white',
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
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
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
            ),
          },
          {
            id: 'favs',
            label: 'Favorites',
            badge: favorites.length > 0 ? favorites.length : undefined,
            badgeColor: 'bg-rose-500 text-white',
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill={activeTab === 'favs' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
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
              className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition-all duration-200 cursor-pointer border-none bg-transparent ${
                isActive
                  ? 'text-primary scale-105'
                  : 'text-text-dim hover:text-text-main'
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.badge !== undefined && (
                  <span className={`absolute -top-1.5 -right-2.5 text-[0.6rem] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-md ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[0.66rem] mt-0.5 font-semibold tracking-tight ${isActive ? 'text-primary font-bold' : 'text-text-dim'}`}>
                {item.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-primary mt-0.5 shadow-sm" />
              )}
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
        order={selectedOrder}
        isOpen={isOrderDetailsOpen}
        onClose={() => setIsOrderDetailsOpen(false)}
        initialTab={orderDetailsTab}
      />
      {/* Address Book Modal */}
      <AddressBookModal
        isOpen={isAddressBookOpen}
        onClose={() => setIsAddressBookOpen(false)}
      />

      {/* Official Tax Invoice Modal */}
      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        order={selectedInvoiceOrder}
        transaction={selectedInvoiceTx}
        user={user}
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
