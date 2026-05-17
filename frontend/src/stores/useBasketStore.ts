import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BasketItem } from '@/lib/types';

interface BasketState {
  items: BasketItem[];
  
  addItem: (item: Omit<BasketItem, 'id' | 'quantity'> & { quantity?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearBasket: () => void;
  getTotal: () => number;
  getCount: () => number;
}

export const useBasketStore = create<BasketState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + (item.quantity || 1) }
                  : i
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                productId: item.productId,
                name: item.name,
                price: item.price,
                imageUrl: item.imageUrl,
                quantity: item.quantity || 1,
              },
            ],
          };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        }));
      },

      updateQuantity: (productId, quantity) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, quantity: Math.max(1, quantity) } : i
          ),
        }));
      },

      clearBasket: () => set({ items: [] }),

      getTotal: () => {
        return get().items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      },

      getCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: 'stitch-basket',
    }
  )
);
