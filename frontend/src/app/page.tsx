'use client';

import { useState, useEffect } from 'react';
import type { Product, BasketItem, User } from '@/types';
import { productsApi, favoritesApi } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import Header from '@/components/layout/Header';
import HeroBanner from '@/components/storefront/HeroBanner';
import ProductGrid from '@/components/storefront/ProductGrid';
import BasketDrawer from '@/components/layout/BasketDrawer';
import { useToast } from '@/components/ui/Toast';

export default function StorefrontPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('All');

  // Basket state
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);

  useEffect(() => {
    // Initial data fetch
    const load = async () => {
      try {
        const userSession = await getSession();
        if (userSession) {
          setUser(userSession);
          toast(`Welcome back, ${userSession.username}!`, 'success');
        }
        
        const [prodList, favList] = await Promise.all([
          productsApi.getAll(),
          userSession ? favoritesApi.getAll().catch(() => []) : Promise.resolve([])
        ]);
        setProducts(prodList);
        setFavorites(favList.map(f => f._id));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.description.toLowerCase().includes(search.toLowerCase());
    const matchesTag = tag === 'All' || p.tag === tag;
    return matchesSearch && matchesTag;
  });

  const tags = ['All', ...new Set(products.map(p => p.tag))];

  // Basket Actions
  const addToCart = (product: Product) => {
    setBasket(prev => {
      const existing = prev.find(i => i.product._id === product._id);
      if (existing) {
        return prev.map(i => i.product._id === product._id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast(`Added ${product.name} to basket`, 'success');
  };

  const removeFromCart = (id: string) => setBasket(prev => prev.filter(i => i.product._id !== id));
  
  const updateQty = (id: string, qty: number) => {
    if (qty < 1) return removeFromCart(id);
    setBasket(prev => prev.map(i => i.product._id === id ? { ...i, quantity: qty } : i));
  };

  const toggleFavorite = async (id: string) => {
    if (!user) return toast('Please login to favorite products', 'info');
    
    try {
      if (favorites.includes(id)) {
        await favoritesApi.remove(id);
        setFavorites(prev => prev.filter(fid => fid !== id));
      } else {
        await favoritesApi.add(id);
        setFavorites(prev => [...prev, id]);
      }
    } catch (err) {
      toast('Failed to update favorite', 'error');
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <Header 
        user={user} 
        basketCount={basket.reduce((sum, i) => sum + i.quantity, 0)}
        onBasketOpen={() => setBasketOpen(true)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <HeroBanner />

        <div id="shop-section" className="scroll-mt-24 space-y-8">
          {/* Controls */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between glass-card p-4">
            <div className="relative w-full md:max-w-md">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input 
                type="text" 
                placeholder="Search products..." 
                className="input-dark pl-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 no-scrollbar">
              {tags.map(t => (
                <button
                  key={t}
                  onClick={() => setTag(t)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap
                    ${tag === t 
                      ? 'bg-primary text-white shadow-glow' 
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <ProductGrid 
            products={filteredProducts} 
            loading={loading}
            onAddToCart={addToCart}
            onToggleFavorite={toggleFavorite}
            favorites={favorites}
          />
        </div>
      </main>

      <BasketDrawer 
        open={basketOpen}
        onClose={() => setBasketOpen(false)}
        items={basket}
        onRemove={removeFromCart}
        onUpdateQty={updateQty}
        onCheckout={() => toast('Checkout logic is handled in the dashboard', 'info')}
        loggedIn={!!user}
      />
    </div>
  );
}
