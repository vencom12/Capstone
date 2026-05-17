import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';
import type { User, AuthResponse } from '@/lib/types';
import { useProductStore } from './useProductStore';
import { useBasketStore } from './useBasketStore';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  rememberMe: boolean;

  login: (email: string, password: string, rememberMe?: boolean, role?: 'customer' | 'employee' | 'admin') => Promise<AuthResponse>;
  register: (username: string, email: string, password: string, phoneNumber?: string, address?: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  checkAccess: (role: string) => boolean;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      rememberMe: false,
      
      login: async (email, password, rememberMe = false, role = 'customer') => {
        set({ isLoading: true });
        try {
          const data = await api.post<{ user: User }>('/api/auth/login', {
            email,
            password,
            rememberMe,
            portal: role,
          });
          
          if (!rememberMe) {
            // Set a flag in sessionStorage to track this session
            sessionStorage.setItem('stitch-session-active', 'true');
          } else {
            // Ensure session flag is removed if they chose to be remembered
            sessionStorage.removeItem('stitch-session-active');
          }

          set({ 
            user: data.user, 
            isAuthenticated: true, 
            isLoading: false,
            rememberMe: rememberMe
          });
          return { success: true, user: data.user };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, message: err instanceof Error ? err.message : 'Login failed' };
        }
      },

      register: async (username, email, password, phoneNumber, address) => {
        set({ isLoading: true });
        try {
          const data = await api.post<{ user: User }>('/api/auth/register', {
            username,
            email,
            password,
            role: 'customer',
            phoneNumber,
            address,
          });
          set({ user: data.user, isAuthenticated: true, isLoading: false });
          return { success: true, user: data.user };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, message: err instanceof Error ? err.message : 'Registration failed' };
        }
      },

      logout: async () => {
        try {
          // Clear other stores first to ensure UI updates immediately
          useProductStore.getState().clearState();
          useBasketStore.getState().clearBasket();
          
          await api.post('/api/auth/logout', {});
        } catch {
          // Ignore — still clear local state
        }
        set({ user: null, isAuthenticated: false });
      },

      checkAccess: (role) => {
        const { user } = get();
        return user?.role === role;
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      refreshUser: async () => {
        try {
          const data = await api.get<any>('/api/customer/dashboard-state');
          if (get().user) {
            set({ 
              user: { 
                ...get().user!, 
                walletBalance: data.walletBalance,
                address: data.address 
              } 
            });
          }
        } catch (err) {
          console.error('Failed to refresh user state');
        }
      },
    }),
    {
      name: 'stitch-auth',
      partialize: (state) => ({ 
        user: state.user, 
        isAuthenticated: state.isAuthenticated,
        rememberMe: state.rememberMe
      }),
      onRehydrateStorage: () => (state) => {
        if (typeof window !== 'undefined' && state) {
          const isSessionActive = sessionStorage.getItem('stitch-session-active');
          
          // If NOT remembered AND no active session flag, clear the store
          if (!state.rememberMe && !isSessionActive && state.isAuthenticated) {
            state.logout();
          }
        }
      }
    }
  )
);
