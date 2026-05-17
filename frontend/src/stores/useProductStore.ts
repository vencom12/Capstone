import { create } from 'zustand';
import { api } from '@/lib/api';
import type { Product, Order, Transaction, Receipt, DashboardState } from '@/lib/types';

interface ProductStoreState {
  products: Product[];
  orders: Order[];
  favorites: Product[];
  transactions: Transaction[];
  receipts: Receipt[];
  walletBalance: number;

  searchQuery: string;
  selectedCategory: string;
  isSyncing: boolean;

  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string) => void;
  fetchProducts: () => Promise<void>;
  fetchDashboardState: () => Promise<void>;
  toggleFavorite: (productId: string) => Promise<void>;
  clearState: () => void;

  // Computed
  getFilteredProducts: () => Product[];
  getCategories: () => string[];
}

export const useProductStore = create<ProductStoreState>()((set, get) => ({
  products: [],
  orders: [],
  favorites: [],
  transactions: [],
  receipts: [],
  walletBalance: 0,

  searchQuery: '',
  selectedCategory: 'All',
  isSyncing: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),

  fetchProducts: async () => {
    set({ isSyncing: true });
    try {
      const products = await api.get<Product[]>('/api/products');
      set({ products, isSyncing: false });
    } catch (err) {
      console.error('Failed to fetch products:', err);
      set({ isSyncing: false });
    }
  },

  fetchDashboardState: async () => {
    set({ isSyncing: true });
    try {
      const data = await api.get<DashboardState>('/api/customer/dashboard-state');
      set({
        products: data.products || [],
        orders: data.orders || [],
        favorites: data.favorites || [],
        transactions: data.transactions || [],
        receipts: data.receipts || [],
        walletBalance: data.walletBalance || 0,
        isSyncing: false,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Failed to fetch dashboard state:', err);
      set({ isSyncing: false });
    }
  },

  toggleFavorite: async (productId) => {
    const { favorites, products } = get();
    const isFav = favorites.some((f) => (f.id || f._id) === productId);

    // Optimistic update
    if (isFav) {
      set({ favorites: favorites.filter((f) => (f.id || f._id) !== productId) });
    } else {
      const product = products.find((p) => (p.id || p._id) === productId);
      if (product) set({ favorites: [...favorites, product] });
    }

    try {
      if (isFav) {
        await api.delete(`/api/customer/favorites/${productId}`);
      } else {
        await api.post(`/api/customer/favorites/${productId}`, {});
      }
    } catch {
      // Rollback on error
      set({ favorites });
    }
  },
  
  clearState: () => set({
    orders: [],
    favorites: [],
    transactions: [],
    receipts: [],
    walletBalance: 0,
    searchQuery: '',
    selectedCategory: 'All'
  }),

  getFilteredProducts: () => {
    const { products, searchQuery, selectedCategory } = get();
    return products.filter((p) => {
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || p.tag === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  },

  getCategories: () => {
    const { products } = get();
    const tags = [...new Set(products.map((p) => p.tag).filter(Boolean))];
    return ['All', ...tags];
  },
}));
