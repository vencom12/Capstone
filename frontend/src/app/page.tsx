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
  const [isAuthRedirecting, setIsAuthRedirecting] = useState(false);

  // Role-based redirect & Google OAuth protection: prevent flashing the storefront UI
  useEffect(() => {
    if (isGoogleAuthPending()) {
      setIsAuthRedirecting(true);
      return;
    }

    if (isAuthenticated && (user?.role === 'admin' || user?.role === 'employee')) {
      setIsAuthRedirecting(true);
      if (user.role === 'admin') router.replace('/admin');
      else router.replace('/employee');
    }
  }, [isAuthenticated, user?.role, router]);

  useEffect(() => {
    if (isAuthRedirecting || (isAuthenticated && (user?.role === 'admin' || user?.role === 'employee'))) {
      return;
    }

    if (isAuthenticated) {
      fetchDashboardState();
    } else {
      fetchProducts();
    }
  }, [isAuthenticated, user?.role, isAuthRedirecting, fetchProducts, fetchDashboardState]);

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

  if (isAuthRedirecting || (isAuthenticated && (user?.role === 'admin' || user?.role === 'employee'))) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-bg-dark text-text-main">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen lg:h-screen w-full overflow-x-hidden lg:overflow-hidden bg-transparent">
      <StorefrontHeader />
      <EmailVerificationBanner />

      {/* Main Layout */}
      <div className="flex-1 flex w-full min-h-0 min-w-0 lg:overflow-hidden items-stretch relative">
        <Sidebar />

        {/* Main Content */}
        <main className="flex-1 min-h-0 min-w-0 lg:overflow-y-auto p-4 md:p-6 max-[480px]:p-3 bg-transparent">
          <ProductGrid onQuickView={handleQuickView} />
        </main>
      </div>

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
