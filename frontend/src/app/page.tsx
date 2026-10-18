'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StorefrontHeader from '@/components/layout/StorefrontHeader';
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
