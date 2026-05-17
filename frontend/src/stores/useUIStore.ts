import { create } from 'zustand';

interface UIStore {
  isBasketOpen: boolean;
  isSidebarOpen: boolean;
  isAuthOpen: boolean;
  authMode: 'login' | 'register';
  setBasketOpen: (isOpen: boolean) => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setAuthOpen: (isOpen: boolean, mode?: 'login' | 'register') => void;
  toggleBasket: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isBasketOpen: false,
  isSidebarOpen: false,
  isAuthOpen: false,
  authMode: 'login',
  setBasketOpen: (isOpen) => set({ isBasketOpen: isOpen }),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setAuthOpen: (isOpen, mode = 'login') => set({ isAuthOpen: isOpen, authMode: mode }),
  toggleBasket: () => set((state) => ({ isBasketOpen: !state.isBasketOpen })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
