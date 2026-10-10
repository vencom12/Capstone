import { create } from 'zustand';

export type AuthPortal = 'customer' | 'employee' | 'admin';

export interface GoogleSetupData {
  token: string;
  email: string;
  username: string;
}

interface UIStore {
  isBasketOpen: boolean;
  isSidebarOpen: boolean;
  isAuthOpen: boolean;
  authMode: 'login' | 'register';
  authPortal: AuthPortal;
  googleSetupData: GoogleSetupData | null;
  setBasketOpen: (isOpen: boolean) => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setAuthOpen: (isOpen: boolean, mode?: 'login' | 'register', portal?: AuthPortal) => void;
  setGoogleSetupData: (data: GoogleSetupData | null) => void;
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
  googleSetupData: null,
  setBasketOpen: (isOpen) => set({ isBasketOpen: isOpen }),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setAuthOpen: (isOpen, mode = 'login', portal) =>
    set((state) => ({
      isAuthOpen: isOpen,
      authMode: mode,
      authPortal: portal || state.authPortal || 'customer',
    })),
  setGoogleSetupData: (data) => set({ googleSetupData: data }),
  setAuthPortal: (portal) => set({ authPortal: portal }),
  toggleBasket: () => set((state) => ({ isBasketOpen: !state.isBasketOpen })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
