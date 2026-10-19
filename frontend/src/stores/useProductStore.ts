import { create } from 'zustand';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { matchesProductSearch } from '@/lib/searchUtils';
import type { Product, Order, Transaction, Receipt, DashboardState } from '@/lib/types';

const formatCategoryName = (str?: string) => {
  if (!str) return 'General';
  if (str === 'All') return 'All';
  return str
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

interface ProductStoreState {
  products: Product[];
  orders: Order[];
  favorites: Product[];
  transactions: Transaction[];
  receipts: Receipt[];

  searchQuery: string;
  selectedCategory: string;
  isSyncing: boolean;

  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string) => void;
  fetchProducts: () => Promise<void>;
  fetchDashboardState: (silent?: boolean) => Promise<void>;
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
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('Failed to fetch products:', err);
      set({ isSyncing: false });
    }
  },

  fetchDashboardState: async (silent = false) => {
    // Only flash sync/skeleton state if products list is currently empty
    if (!silent && get().products.length === 0) {
      set({ isSyncing: true });
    }
    try {
      const data = await api.get<DashboardState>('/api/customer/dashboard-state');
      const current = get();
      const newFavs = data.favorites || [];
      const favsChanged =
        current.favorites.length !== newFavs.length ||
        current.favorites.some((f, idx) => (f.id || f._id) !== (newFavs[idx]?.id || newFavs[idx]?._id));

      set({
        products: data.products || [],
        orders: data.orders || [],
        favorites: favsChanged ? newFavs : current.favorites,
        transactions: data.transactions || [],
        receipts: data.receipts || [],
        isSyncing: false,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (!silent) {
        console.warn('Dashboard state sync notice:', err?.message || err);
      }
      set({ isSyncing: false });
    }
  },

  toggleFavorite: async (productId) => {
    const { favorites, products } = get();
    const isFav = favorites.some((f) => (f.id || f._id) === productId);
    const prevFavorites = favorites;

    // Instant optimistic update (0ms latency for seamless responsiveness)
    if (isFav) {
      set({ favorites: favorites.filter((f) => (f.id || f._id) !== productId) });
    } else {
      const product =
        products.find((p) => (p.id || p._id) === productId) ||
        favorites.find((f) => (f.id || f._id) === productId);
      if (product) {
        set({ favorites: [...favorites, product] });
        showToast(`Saved "${product.name}" to favorites`, 'success');
      }
    }

    try {
      if (isFav) {
        await api.delete(`/api/customer/favorites/${productId}`);
      } else {
        await api.post(`/api/customer/favorites/${productId}`, {});
      }
    } catch (err) {
      console.warn('Favorite sync notice:', err);
      // Rollback on genuine error
      set({ favorites: prevFavorites });
    }
  },

  clearState: () => set({
    orders: [],
    favorites: [],
    transactions: [],
    receipts: [],
    searchQuery: '',
    selectedCategory: 'All'
  }),

  getFilteredProducts: () => {
    const { products, searchQuery, selectedCategory } = get();
    return products.filter((p) => {
      const matchesSearch = matchesProductSearch(p, searchQuery);
      const pTagFormatted = formatCategoryName(p.tag);
      const matchesCategory = selectedCategory === 'All' || pTagFormatted === selectedCategory || p.tag === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  },

  getCategories: () => {
    const { products } = get();
    const formattedTags = products.map((p) => formatCategoryName(p.tag)).filter(Boolean);
    const tags = [...new Set(formattedTags)];
    return ['All', ...tags];
  },
}));
