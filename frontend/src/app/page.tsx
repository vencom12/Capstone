'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StorefrontHeader from '@/components/layout/StorefrontHeader';
import Sidebar from '@/components/layout/Sidebar';
import ProductGrid from '@/components/products/ProductGrid';
import ProductModal from '@/components/products/ProductModal';
import AuthModal from '@/components/auth/AuthModal';
import AiAttendant from '@/components/products/AiAttendant';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import RightPanel from '@/components/dashboard/RightPanel';
import CheckoutModal from '@/components/checkout/CheckoutModal';
import type { Product } from '@/lib/types';

export default function StorefrontPage() {
  const router = useRouter();
  const { products, fetchProducts, fetchDashboardState } = useProductStore();
  const { isAuthenticated, user } = useAuthStore();
  const { isBasketOpen, setBasketOpen } = useUIStore();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Role-based redirect: send admin/employee users back to their dashboards
  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      router.replace('/admin');
    } else if (isAuthenticated && user?.role === 'employee') {
      router.replace('/employee');
    }
  }, [isAuthenticated, user?.role, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardState();
    } else {
      fetchProducts();
    }
  }, [isAuthenticated, fetchProducts, fetchDashboardState]);

  // Real-time socket updates for Storefront
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
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
        transports: ['websocket', 'polling']
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

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-transparent">
      <StorefrontHeader />

      {/* Main Layout */}
      <div className="flex-1 flex w-full overflow-hidden items-stretch max-[650px]:flex-col">
        <Sidebar />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-transparent max-[650px]:pt-0">
          <ProductGrid onQuickView={handleQuickView} />
        </main>
      </div>

      {/* Product Quick-View Modal */}
      <ProductModal
        product={selectedProduct ? products.find(p => (p.id || p._id) === (selectedProduct.id || selectedProduct._id)) || selectedProduct : null}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <Suspense fallback={null}>
        <AuthModal />
      </Suspense>

      {/* Right Panel / Drawer */}
      <div className={`
        fixed top-0 right-0 h-full z-[2000] transition-transform duration-300
        ${isBasketOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <RightPanel onCheckout={() => setIsCheckoutOpen(true)} onCloseMobile={() => setBasketOpen(false)} />
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
      />

      {/* AI Store Attendant Chatbot */}
      <AiAttendant />
    </div>
  );
}
