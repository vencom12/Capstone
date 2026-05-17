'use client';

import { Suspense, useEffect, useState } from 'react';
import StorefrontHeader from '@/components/layout/StorefrontHeader';
import Sidebar from '@/components/layout/Sidebar';
import ProductGrid from '@/components/products/ProductGrid';
import ProductModal from '@/components/products/ProductModal';
import AuthModal from '@/components/auth/AuthModal';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import RightPanel from '@/components/dashboard/RightPanel';
import CheckoutModal from '@/components/checkout/CheckoutModal';
import type { Product } from '@/lib/types';

export default function StorefrontPage() {
  const { fetchProducts, fetchDashboardState } = useProductStore();
  const { isAuthenticated } = useAuthStore();
  const { isBasketOpen, setBasketOpen } = useUIStore();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardState();
    } else {
      fetchProducts();
    }
  }, [isAuthenticated, fetchProducts, fetchDashboardState]);

  const handleQuickView = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-transparent">
      <StorefrontHeader />

      {/* Main Layout */}
      <div className="flex-1 flex gap-3 p-3 w-full overflow-hidden items-stretch max-[650px]:flex-col max-[650px]:p-0">
        <Sidebar />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-transparent max-[650px]:pt-0">
          <ProductGrid onQuickView={handleQuickView} />
        </main>
      </div>

      {/* Product Quick-View Modal */}
      <ProductModal
        product={selectedProduct}
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
    </div>
  );
}
