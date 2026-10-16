'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StorefrontHeader from '@/components/layout/StorefrontHeader';
import Sidebar from '@/components/layout/Sidebar';
import ProductGrid from '@/components/products/ProductGrid';
import ProductModal from '@/components/products/ProductModal';
import EmailVerificationBanner from '@/components/auth/EmailVerificationBanner';
import dynamic from 'next/dynamic';

const AiAttendant = dynamic(() => import('@/components/products/AiAttendant'), {
  ssr: false,
});
import FullScreenStitchExperience from '@/components/landing/FullScreenStitchExperience';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import RightPanel from '@/components/dashboard/RightPanel';
import CheckoutModal from '@/components/checkout/CheckoutModal';
import { API_BASE } from '@/lib/api';
import type { Product } from '@/lib/types';
import { isGoogleAuthPending } from '@/lib/googleAuth';

export default function StorefrontPage() {
  const router = useRouter();
  const { products, fetchProducts, fetchDashboardState } = useProductStore();
  const { isAuthenticated, user } = useAuthStore();
  const { isBasketOpen, setBasketOpen } = useUIStore();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Computed staff check: immediately true if logged in as staff, false otherwise
  const isStaff = isAuthenticated && (user?.role === 'admin' || user?.role === 'employee');

  useEffect(() => {
    if (isStaff) {
      useUIStore.getState().triggerWelcome(user?.username || 'Staff', user?.role || 'admin');
      if (user?.role === 'admin') router.replace('/admin');
      else router.replace('/employee');
    }
  }, [isStaff, user?.role, user?.username, router]);

  useEffect(() => {
    if (isStaff) return;

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

  const handleQuickView = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  if (isStaff) {
    return (
      <div
        className="h-screen w-full flex items-center justify-center select-none"
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
      <section id="products-section" className="relative z-20 w-full min-h-screen flex flex-col bg-bg-dark border-t border-white/10 scroll-mt-20">
        {/* Products Section Header Bar */}
        <div className="w-full bg-slate-900/60 backdrop-blur-md border-b border-border-glass px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight m-0">
                All Products
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-text-dim mt-0.5 m-0">
              Industrial precision embroidery on demand. Choose a design or order custom monogramming.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold px-3 py-1 rounded-full bg-white/5 border border-white/10">
              Active Embroidery Collection
            </span>
          </div>
        </div>

        {/* Main Layout: Sidebar & Products Grid */}
        <div className="flex-1 flex w-full min-h-0 min-w-0 items-stretch relative">
          <Sidebar />

          {/* Main Products Grid */}
          <main className="flex-1 min-h-0 min-w-0 p-4 md:p-6 max-[480px]:p-3 bg-transparent">
            <ProductGrid onQuickView={handleQuickView} />
          </main>
        </div>
      </section>

      {/* Product Quick-View Modal */}
      <ProductModal
        product={selectedProduct ? products.find(p => (p.id || p._id) === (selectedProduct.id || selectedProduct._id)) || selectedProduct : null}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onBuyNow={() => setIsCheckoutOpen(true)}
      />

      {/* Right Panel / Drawer */}
      <div className={`
        fixed top-0 right-0 h-full z-[2000] transition-transform duration-300
        ${isBasketOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <RightPanel
          onCheckout={() => {
            if (!isAuthenticated) {
              useUIStore.getState().setAuthOpen(true, 'login');
              return;
            }
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
        onClose={() => setIsCheckoutOpen(false)}
        onSuccess={() => {
          setIsCheckoutOpen(false);
          router.push('/dashboard');
        }}
      />

      {/* AI Store Attendant Chatbot */}
      <AiAttendant />
    </div>
  );
}
