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
  welcomeData: WelcomeTransitionData | null;
  setBasketOpen: (isOpen: boolean) => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setAuthOpen: (isOpen: boolean, mode?: 'login' | 'register', portal?: AuthPortal) => void;
  setGoogleSetupData: (data: GoogleSetupData | null) => void;
  setAuthPortal: (portal: AuthPortal) => void;
  triggerWelcome: (username: string, role?: string) => void;
  markDashboardReady: () => void;
  closeWelcome: () => void;
  toggleBasket: () => void;
  toggleSidebar: () => void;
}

export interface WelcomeTransitionData {
  isOpen: boolean;
  username: string;
  role?: string;
  isReady?: boolean;
  triggerId?: number;
}

export const useUIStore = create<UIStore>((set) => ({
  isBasketOpen: false,
  isSidebarOpen: false,
  isAuthOpen: false,
  authMode: 'login',
  authPortal: 'customer',
  googleSetupData: null,
  welcomeData: null,
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
  triggerWelcome: (username: string, role?: string) =>
    set({
      welcomeData: {
        isOpen: true,
        username,
        role,
        isReady: false,
        triggerId: Date.now(),
      },
    }),
  markDashboardReady: () =>
    set((state) => ({
      welcomeData: state.welcomeData
        ? { ...state.welcomeData, isReady: true }
        : null,
    })),
  closeWelcome: () => set({ welcomeData: null }),
  toggleBasket: () => set((state) => ({ isBasketOpen: !state.isBasketOpen })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
