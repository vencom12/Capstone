import { create } from 'zustand';

export type AuthPortal = 'customer' | 'employee' | 'admin';

interface UIStore {
  isBasketOpen: boolean;
  isSidebarOpen: boolean;
  isAuthOpen: boolean;
  authMode: 'login' | 'register';
  authPortal: AuthPortal;
  setBasketOpen: (isOpen: boolean) => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setAuthOpen: (isOpen: boolean, mode?: 'login' | 'register', portal?: AuthPortal) => void;
  setAuthPortal: (portal: AuthPortal) => void;
  toggleBasket: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isBasketOpen: false,
  isSidebarOpen: false,
  isAuthOpen: false,
  authMode: 'login',
  authPortal: 'customer',
  setBasketOpen: (isOpen) => set({ isBasketOpen: isOpen }),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setAuthOpen: (isOpen, mode = 'login', portal) =>
    set((state) => ({
      isAuthOpen: isOpen,
      authMode: mode,
      authPortal: portal || state.authPortal || 'customer',
    })),
  setAuthPortal: (portal) => set({ authPortal: portal }),
  toggleBasket: () => set((state) => ({ isBasketOpen: !state.isBasketOpen })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
