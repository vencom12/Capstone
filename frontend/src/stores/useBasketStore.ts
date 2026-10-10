import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BasketItem } from '@/lib/types';

interface BasketState {
  items: BasketItem[];
  
  addItem: (item: Omit<BasketItem, 'id' | 'quantity'> & { quantity?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateBasketItem: (
    basketItemId: string,
    updates: Partial<Pick<BasketItem, 'selectedVariant' | 'selectedColor' | 'selectedSize' | 'backupVariant' | 'backupColor' | 'price' | 'imageUrl'>>
  ) => void;
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
          const itemText = item.personalization?.text || '';
          const existing = state.items.find(
            (i) =>
              i.productId === item.productId &&
              i.selectedVariant === item.selectedVariant &&
              i.selectedSize === item.selectedSize &&
              i.backupVariant === item.backupVariant &&
              (i.personalization?.text || '') === itemText &&
              (i.personalization?.font || '') === (item.personalization?.font || '') &&
              (i.personalization?.threadColor || '') === (item.personalization?.threadColor || '')
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === existing.id
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
                selectedVariant: item.selectedVariant,
                selectedColor: item.selectedColor,
                selectedSize: item.selectedSize,
                backupVariant: item.backupVariant,
                backupColor: item.backupColor,
                personalization: item.personalization,
              },
            ],
          };
        });
      },

      removeItem: (idOrProductId) => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== idOrProductId && i.productId !== idOrProductId),
        }));
      },

      updateQuantity: (idOrProductId, quantity) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.id === idOrProductId || i.productId === idOrProductId
              ? { ...i, quantity: Math.max(1, quantity) }
              : i
          ),
        }));
      },

      updateBasketItem: (basketItemId, updates) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.id === basketItemId
              ? {
                  ...i,
                  ...updates,
                }
              : i
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
