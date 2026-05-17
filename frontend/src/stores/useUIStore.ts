import { create } from 'zustand';

interface UIStore {
  isBasketOpen: boolean;
  isSidebarOpen: boolean;
  setBasketOpen: (isOpen: boolean) => void;
  setSidebarOpen: (isOpen: boolean) => void;
  toggleBasket: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isBasketOpen: false,
  isSidebarOpen: false,
  setBasketOpen: (isOpen) => set({ isBasketOpen: isOpen }),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  toggleBasket: () => set((state) => ({ isBasketOpen: !state.isBasketOpen })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
