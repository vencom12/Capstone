'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StorefrontHeader from '@/components/layout/StorefrontHeader';
import ProductGrid from '@/components/products/ProductGrid';
import ProductModal from '@/components/products/ProductModal';
import EmailVerificationBanner from '@/components/auth/EmailVerificationBanner';
import FullScreenStitchExperience from '@/components/landing/FullScreenStitchExperience';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import RightPanel from '@/components/dashboard/RightPanel';
import CheckoutModal from '@/components/checkout/CheckoutModal';
import OrderSuccessModal from '@/components/checkout/OrderSuccessModal';
import AiAttendant from '@/components/products/AiAttendant';
import CustomerTour from '@/components/landing/CustomerTour';
import { API_BASE } from '@/lib/api';
import type { Product, BasketItem } from '@/lib/types';
import { isGoogleAuthPending } from '@/lib/googleAuth';

export default function StorefrontPage() {
  const router = useRouter();
  const { products, fetchProducts, fetchDashboardState } = useProductStore();
  const { isAuthenticated, user } = useAuthStore();
  const { isBasketOpen, setBasketOpen } = useUIStore();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [expressCheckoutItems, setExpressCheckoutItems] = useState<BasketItem[] | undefined>(undefined);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);
  const [emergencyNotice, setEmergencyNotice] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = () => {
      import('@/lib/api').then(({ api }) => {
        api.get<any>('/api/customer/settings').then(res => {
          if (res?.emergencyNotice?.active) {
            setEmergencyNotice(res.emergencyNotice);
          } else {
            setEmergencyNotice(null);
          }
        }).catch(() => {});
      });
    };

    fetchSettings();

    const handleSettingsEvent = (e: any) => {
      if (e.detail?.emergencyNotice !== undefined) {
        setEmergencyNotice(e.detail.emergencyNotice?.active ? e.detail.emergencyNotice : null);
      } else {
        fetchSettings();
      }
    };

    window.addEventListener('settingsUpdated', handleSettingsEvent);
    window.addEventListener('focus', fetchSettings);

    return () => {
      window.removeEventListener('settingsUpdated', handleSettingsEvent);
      window.removeEventListener('focus', fetchSettings);
    };
  }, []);

  // Computed staff check: immediately true if logged in as staff, false otherwise
  const isStaff = isAuthenticated && (user?.role === 'admin' || user?.role === 'employee');
  const [isPendingAuth, setIsPendingAuth] = useState(() => {
    if (typeof window !== 'undefined') {
      return isGoogleAuthPending();
    }
    return false;
  });

  useEffect(() => {
    if (!isPendingAuth) return;
    const interval = setInterval(() => {
      if (!isGoogleAuthPending()) {
        setIsPendingAuth(false);
      }
    }, 150);
    return () => clearInterval(interval);
  }, [isPendingAuth]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (isStaff) {
      if (!useUIStore.getState().welcomeData?.isOpen) {
        useUIStore.getState().triggerWelcome(user?.username || 'Staff', user?.role || 'admin');
      }
      if (user?.role === 'admin') router.replace('/admin');
      else router.replace('/employee');
    }
  }, [isStaff, user?.role, user?.username, router]);

  useEffect(() => {
    if (isStaff || isPendingAuth) return;

    if (isAuthenticated) {
      fetchDashboardState()
        .then(() => useUIStore.getState().markDashboardReady())
        .catch(() => useUIStore.getState().markDashboardReady());
    } else {
      fetchProducts()
        .then(() => useUIStore.getState().markDashboardReady())
        .catch(() => useUIStore.getState().markDashboardReady());
    }
  }, [isAuthenticated, isStaff, fetchProducts, fetchDashboardState]);

  // Real-time socket updates for Storefront
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let activeSocket: any = null;
    let isCancelled = false;

    const script = document.createElement('script');
    script.src = `${API_BASE}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = () => {
      if (isCancelled) return;
      const io = (window as any).io;
      if (!io) return;

      const socket = io(API_BASE, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        auth: { portal: 'customer' }
      });
      activeSocket = socket;

      socket.on('dataChanged', (data: any) => {
        if (['PRODUCT', 'INVENTORY', 'ORDER'].includes(data.entity)) {
          if (isAuthenticated) {
            fetchDashboardState();
          } else {
            fetchProducts();
          }
        }
      });

      socket.on('settingsUpdated', (data: any) => {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: data }));
      });
    };

    document.head.appendChild(script);

    return () => {
      isCancelled = true;
      if (activeSocket) {
        activeSocket.close();
      }
      const scripts = document.head.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        if (scripts[i].src.includes('/socket.io/socket.io.js')) {
          document.head.removeChild(scripts[i]);
          break;
        }
      }
    };
  }, [isAuthenticated, fetchProducts, fetchDashboardState]);

  // Window Focus & Tab Switch Listener: instant live refresh when switching back to this tab
  useEffect(() => {
    const handleTabActive = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (isAuthenticated) {
          fetchDashboardState(true);
        } else {
          fetchProducts();
        }
      }
    };
    window.addEventListener('focus', handleTabActive);
    document.addEventListener('visibilitychange', handleTabActive);
    return () => {
      window.removeEventListener('focus', handleTabActive);
      document.removeEventListener('visibilitychange', handleTabActive);
    };
  }, [isAuthenticated, fetchProducts, fetchDashboardState]);

  const handleQuickView = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  if (isStaff || isPendingAuth) {
    return (
      <div
        className="fixed inset-0 w-full h-full select-none z-[99990]"
        style={{
          backgroundColor: '#090d16',
          backgroundImage: 'radial-gradient(circle at 50% 48%, rgba(185, 28, 28, 0.22) 0%, rgba(9, 13, 22, 0.92) 58%, rgba(9, 13, 22, 1) 100%)',
        }}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-clip bg-bg-dark text-text-main">
      <StorefrontHeader />
      <EmailVerificationBanner />

      {/* Interactive Full-Screen Scroll-Driven Stitch Canvas Experience */}
      <FullScreenStitchExperience />

      {/* Storefront Products Section */}
      <section id="products-section" className="relative z-20 w-full min-h-screen flex flex-col bg-transparent scroll-mt-20">

        {/* Full-Width Products Grid */}

        <div className="flex-1 flex w-full min-h-0 min-w-0 flex-col relative pt-4 md:pt-6">
          {/* Main Products Grid - Centered & Spacious */}
          <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-transparent">
            {emergencyNotice?.active && (() => {
              const isClosedOrPaused = Boolean(
                emergencyNotice.isCurrentlyClosed ||
                (!emergencyNotice.isScheduled && emergencyNotice.policy === 'PAUSE_ORDERS') ||
                (emergencyNotice.isScheduled && emergencyNotice.isCurrentlyClosed && emergencyNotice.policy === 'PAUSE_ORDERS')
              );
              const resumeFormatted = emergencyNotice.resumeDate
                ? new Date(emergencyNotice.resumeDate).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : null;
              const startFormatted = emergencyNotice.startDate
                ? new Date(emergencyNotice.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })
                : null;

              return (
                <div className={`mb-6 p-4 rounded-2xl border backdrop-blur-md shadow-lg flex items-start gap-3.5 transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
                  isClosedOrPaused
                    ? 'bg-danger/10 border-danger/30 text-text-main'
                    : emergencyNotice.isScheduled
                    ? 'bg-bg-card/90 border-border-glass text-text-main'
                    : 'bg-amber-500/10 border-amber-500/30 text-text-main'
                }`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    isClosedOrPaused
                      ? 'bg-danger/20 text-danger'
                      : emergencyNotice.isScheduled
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {isClosedOrPaused ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                      </svg>
                    ) : emergencyNotice.isScheduled ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-bold text-sm text-text-main m-0">
                        {isClosedOrPaused
                          ? 'Online Ordering Temporarily Paused'
                          : emergencyNotice.isScheduled
                          ? `Scheduled Workshop Break Notice (${emergencyNotice.reason || 'Leave'})`
                          : `Workshop Production Notice (+${emergencyNotice.delayHours || 24}h Turnaround)`}
                      </h4>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isClosedOrPaused
                          ? 'bg-danger/20 text-danger'
                          : emergencyNotice.isScheduled
                          ? 'bg-primary/15 text-primary'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {isClosedOrPaused ? 'Store Paused' : emergencyNotice.isScheduled ? 'Upcoming' : 'Notice'}
                      </span>
                    </div>
                    <p className="text-xs text-text-dim leading-relaxed m-0">
                      {isClosedOrPaused ? (
                        <>
                          Our workshop is closed for <strong>{emergencyNotice.reason || 'scheduled leave'}</strong>.
                          {resumeFormatted ? <> Orders resume on <strong className="text-text-main">{resumeFormatted}</strong>.</> : ''}
                          {' '}You can freely browse all catalog products, inspect variants, and preview lettering customizations.
                        </>
                      ) : emergencyNotice.isScheduled ? (
                        <>
                          Our workshop will be on a scheduled break for <strong>{emergencyNotice.reason}</strong>
                          {startFormatted ? <> from <strong className="text-text-main">{startFormatted}</strong></> : ''}
                          {resumeFormatted ? <> to <strong className="text-text-main">{resumeFormatted}</strong></> : ''}.
                          {' '}Orders placed now that finish before the break proceed normally; intersecting orders are prioritized immediately upon reopening.
                        </>
                      ) : (
                        <>
                          Workshop is on operational leave (<strong>{emergencyNotice.reason}</strong>). Orders placed today will be scheduled with extended lead time. Production resumes standard turnaround on{' '}
                          <strong className="text-text-main">{resumeFormatted || 'reopening'}</strong>.
                        </>
                      )}
                    </p>
                    {emergencyNotice.message && (
                      <p className="text-xs italic text-text-dim/80 mt-1 mb-0 border-l-2 border-border-glass pl-2">
                        &ldquo;{emergencyNotice.message}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
            <ProductGrid onQuickView={handleQuickView} />
          </main>
        </div>
      </section>

      {/* Product Quick-View Modal */}
      <ProductModal
        product={selectedProduct ? products.find(p => (p.id || p._id) === (selectedProduct.id || selectedProduct._id)) || selectedProduct : null}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onBuyNow={(expressItem) => {
          setExpressCheckoutItems(expressItem ? [expressItem] : undefined);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Right Panel / Drawer */}
      <div className={`
        fixed top-0 right-0 h-full z-[2000] transition-all duration-300
        ${isBasketOpen ? 'translate-x-0 opacity-100 pointer-events-auto visible' : 'translate-x-full opacity-0 pointer-events-none invisible'}
      `}>
        <RightPanel
          onCheckout={() => {
            if (!isAuthenticated) {
              useUIStore.getState().setAuthOpen(true, 'login');
              return;
            }
            setExpressCheckoutItems(undefined);
            setIsCheckoutOpen(true);
          }}
          onCloseMobile={() => setBasketOpen(false)}
        />
      </div>

      {/* Drawer Overlay */}
      {isBasketOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1900]"
          onClick={() => setBasketOpen(false)}
        />
      )}

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => {
          setIsCheckoutOpen(false);
          setExpressCheckoutItems(undefined);
        }}
        onBack={() => {
          setIsCheckoutOpen(false);
          if (expressCheckoutItems && expressCheckoutItems.length > 0) {
            setIsModalOpen(true);
          } else {
            setBasketOpen(true);
          }
        }}
        checkoutItems={expressCheckoutItems}
        onSwitchToFullBasket={() => setExpressCheckoutItems(undefined)}
        onSuccess={(createdOrder) => {
          setIsCheckoutOpen(false);
          setExpressCheckoutItems(undefined);
          if (createdOrder) {
            setSuccessOrder(createdOrder);
          } else {
            router.push('/dashboard');
          }
        }}
      />

      {/* Shopee-style Post-Payment Order Success Modal */}
      <OrderSuccessModal
        isOpen={Boolean(successOrder)}
        onClose={() => setSuccessOrder(null)}
        order={successOrder}
        onViewOrders={() => {
          setSuccessOrder(null);
          useUIStore.getState().setBasketOpen(false);
          router.push('/dashboard?tab=tracking');
        }}
        onSelectProduct={(prod) => {
          setSuccessOrder(null);
          setSelectedProduct(prod);
          setIsModalOpen(true);
        }}
      />

      {/* Virtual Store Attendant Modal */}
      <AiAttendant />

      {/* Interactive New Customer Onboarding Tour */}
      <CustomerTour />
    </div>
  );
}
