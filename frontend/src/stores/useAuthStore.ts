import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
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
  sendPhoneOtp: (username: string, email: string, phoneNumber: string) => Promise<{ success: boolean; message: string; cooldownSeconds?: number }>;
  resendPhoneOtp: (phoneNumber: string) => Promise<{ success: boolean; message: string; cooldownSeconds?: number }>;
  registerWithOtp: (data: { username: string; email: string; password: string; phoneNumber: string; address?: string; code: string }) => Promise<AuthResponse>;
  resendEmailVerification: () => Promise<{ success: boolean; message: string; cooldownSeconds?: number }>;
  checkEmailStatus: () => Promise<{ isEmailVerified: boolean; email: string }>;
  verifyEmailToken: (token: string) => Promise<{ success: boolean; message: string }>;
  loginWithGoogle: (googleUserData: { email: string; displayName?: string; photoURL?: string; phoneNumber?: string; uid: string }) => Promise<AuthResponse & { needsPassword?: boolean; setupToken?: string; suggestedUsername?: string; email?: string }>;
  completeGoogleSignup: (setupToken: string, password: string, username?: string) => Promise<AuthResponse>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string; cooldownSeconds?: number }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; message: string }>;
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
      
      login: async (email, password, rememberMe = false, role) => {
        set({ isLoading: true });
        try {
          const payload: any = {
            email,
            password,
            rememberMe,
          };
          if (role) {
            payload.portal = role;
          }
          const data = await api.post<{ user: User }>('/api/auth/login', payload);
          
          const isStaff = data.user.role === 'admin' || data.user.role === 'employee';

          if (isStaff || !rememberMe) {
            // Staff sessions are always tracked in sessionStorage so closing the browser terminates access
            sessionStorage.setItem('stitch-session-active', 'true');
          } else {
            // Ensure session flag is removed if customer chose to be remembered
            sessionStorage.removeItem('stitch-session-active');
          }

          set({ 
            user: data.user, 
            isAuthenticated: true, 
            isLoading: false,
            rememberMe: isStaff ? false : rememberMe
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

      sendPhoneOtp: async (username, email, phoneNumber) => {
        return await api.post<{ success: boolean; message: string; cooldownSeconds?: number }>(
          '/api/auth/phone/send-otp',
          { username, email, phoneNumber }
        );
      },

      resendPhoneOtp: async (phoneNumber) => {
        return await api.post<{ success: boolean; message: string; cooldownSeconds?: number }>(
          '/api/auth/phone/resend-otp',
          { phoneNumber }
        );
      },

      registerWithOtp: async (payload) => {
        set({ isLoading: true });
        try {
          const data = await api.post<{ user: User }>('/api/auth/register-with-otp', payload);
          set({ user: data.user, isAuthenticated: true, isLoading: false });
          return { success: true, user: data.user };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, message: err instanceof Error ? err.message : 'Verification failed' };
        }
      },

      resendEmailVerification: async () => {
        return await api.post<{ success: boolean; message: string; cooldownSeconds?: number }>(
          '/api/auth/email/resend',
          {}
        );
      },

      checkEmailStatus: async () => {
        const data = await api.get<{ success: boolean; isEmailVerified: boolean; email: string }>(
          '/api/auth/email/status'
        );
        // Update the local user state if verified
        const currentUser = get().user;
        if (currentUser && data.isEmailVerified && !currentUser.isEmailVerified) {
          set({ user: { ...currentUser, isEmailVerified: true } });
        }
        return { isEmailVerified: data.isEmailVerified, email: data.email };
      },

      verifyEmailToken: async (token: string) => {
        const data = await api.post<{ success: boolean; message: string }>(
          '/api/auth/email/verify',
          { token }
        );
        // Update local user state on successful verification
        if (data.success) {
          const currentUser = get().user;
          if (currentUser) {
            set({ user: { ...currentUser, isEmailVerified: true } });
          }
        }
        return data;
      },

      loginWithGoogle: async (googleUserData) => {
        set({ isLoading: true });
        try {
          const data = await api.post<any>('/api/auth/google', googleUserData);
          if (data.needsPassword) {
            // First-time Google user: no account yet, caller must collect a password
            set({ isLoading: false });
            return { success: true, needsPassword: true, setupToken: data.setupToken, suggestedUsername: data.suggestedUsername, email: data.email };
          }
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('stitch-session-active', 'true');
          }
          set({ user: data.user, isAuthenticated: true, isLoading: false, rememberMe: true });
          return { success: true, user: data.user };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, message: err instanceof Error ? err.message : 'Google Sign-In failed' };
        }
      },

      completeGoogleSignup: async (setupToken, password, username) => {
        set({ isLoading: true });
        try {
          const data = await api.post<{ user: User }>('/api/auth/google/complete', { setupToken, password, username });
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('stitch-session-active', 'true');
          }
          set({ user: data.user, isAuthenticated: true, isLoading: false, rememberMe: true });
          return { success: true, user: data.user };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, message: err instanceof Error ? err.message : 'Could not finish Google sign-up' };
        }
      },

      forgotPassword: async (email) => {
        return await api.post<{ success: boolean; message: string; cooldownSeconds?: number }>(
          '/api/auth/password/forgot',
          { email }
        );
      },

      resetPassword: async (token, password) => {
        return await api.post<{ success: boolean; message: string }>(
          '/api/auth/password/reset',
          { token, password }
        );
      },

      logout: async () => {
        // Immediate synchronous state reset to prevent exposing UI shell
        set({ user: null, isAuthenticated: false, rememberMe: false });

        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('stitch-session-active');
          sessionStorage.removeItem('stitch-admin-tab');
          sessionStorage.removeItem('stitch-employee-tab');
          sessionStorage.removeItem('stitch-auth');
          localStorage.removeItem('stitch-admin-tab');
          localStorage.removeItem('stitch-employee-tab');
          localStorage.removeItem('stitch-auth');
        }

        // Clear other stores first to ensure UI updates immediately
        useProductStore.getState().clearState();
        useBasketStore.getState().clearBasket();

        try {
          await api.post('/api/auth/logout', {});
        } catch {
          // Ignore network errors during logout
        }
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
                address: data.address ?? get().user!.address,
                phoneNumber: data.phoneNumber ?? get().user!.phoneNumber,
                savedAddresses: data.savedAddresses ?? get().user!.savedAddresses ?? [],
                preferredDeliveryTime: data.preferredDeliveryTime ?? (get().user as any)?.preferredDeliveryTime,
                isEmailVerified: data.isEmailVerified ?? get().user!.isEmailVerified,
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
      storage: {
        getItem: (name: string): StorageValue<Pick<AuthState, 'user' | 'isAuthenticated' | 'rememberMe'>> | null => {
          if (typeof window === 'undefined') return null;

          // 1. Check sessionStorage (active tab / current browser window session)
          const sessionStr = sessionStorage.getItem(name);
          if (sessionStr) {
            try {
              const parsed: StorageValue<Pick<AuthState, 'user' | 'isAuthenticated' | 'rememberMe'>> = JSON.parse(sessionStr);
              if (parsed?.state?.isAuthenticated) {
                return parsed;
              }
            } catch {
              sessionStorage.removeItem(name);
            }
          }

          // 2. Check localStorage (persistent customer sessions ONLY)
          const localStr = localStorage.getItem(name);
          if (localStr) {
            try {
              const parsed: StorageValue<Pick<AuthState, 'user' | 'isAuthenticated' | 'rememberMe'>> = JSON.parse(localStr);
              const user = parsed?.state?.user;
              const rememberMe = parsed?.state?.rememberMe;

              // CRITICAL SECURITY RULE:
              // Privileged roles (Admin, Employee) must NEVER persist across browser relaunch.
              // Also, non-remembered accounts must NEVER persist across browser relaunch.
              if (user?.role === 'admin' || user?.role === 'employee' || !rememberMe) {
                // Stale privileged or non-remembered session detected in persistent disk storage.
                // Purge immediately to prevent exposing confidential admin/employee consoles!
                localStorage.removeItem(name);
                return null;
              }

              return parsed;
            } catch {
              localStorage.removeItem(name);
            }
          }

          return null;
        },

        setItem: (name: string, value: StorageValue<Pick<AuthState, 'user' | 'isAuthenticated' | 'rememberMe'>>): void => {
          if (typeof window === 'undefined') return;

          const user = value?.state?.user;
          const rememberMe = value?.state?.rememberMe;
          const isStaff = user?.role === 'admin' || user?.role === 'employee';

          if (!user || !value?.state?.isAuthenticated) {
            sessionStorage.removeItem(name);
            localStorage.removeItem(name);
            sessionStorage.removeItem('stitch-session-active');
            return;
          }

          const str = JSON.stringify(value);

          if (isStaff || !rememberMe) {
            // Privileged staff or non-remembered sessions are strictly session-only.
            // Stored ONLY in sessionStorage (destroyed on browser close).
            // Explicitly deleted from localStorage so relaunched browsers start completely logged out.
            sessionStorage.setItem(name, str);
            sessionStorage.setItem('stitch-session-active', 'true');
            localStorage.removeItem(name);
          } else {
            // Remembered customer: persist to localStorage
            localStorage.setItem(name, str);
            sessionStorage.removeItem(name);
          }
        },

        removeItem: (name: string): void => {
          if (typeof window === 'undefined') return;
          sessionStorage.removeItem(name);
          localStorage.removeItem(name);
          sessionStorage.removeItem('stitch-session-active');
        },
      } as PersistStorage<Pick<AuthState, 'user' | 'isAuthenticated' | 'rememberMe'>>,
      partialize: (state) => ({ 
        user: state.user, 
        isAuthenticated: state.isAuthenticated,
        rememberMe: state.rememberMe
      }),
      onRehydrateStorage: () => (state) => {
        if (typeof window !== 'undefined' && state) {
          const isSessionActive = sessionStorage.getItem('stitch-session-active');
          const isStaff = state.user?.role === 'admin' || state.user?.role === 'employee';

          // Safeguard: If rehydrated state claims to be staff or non-remembered,
          // but no active browser session exists (e.g. fresh window or relaunched browser),
          // instantly reset state to logged-out so no admin layout is ever revealed.
          if (state.isAuthenticated && (isStaff || !state.rememberMe) && !isSessionActive) {
            state.user = null;
            state.isAuthenticated = false;
            state.rememberMe = false;
            try {
              sessionStorage.removeItem('stitch-auth');
              localStorage.removeItem('stitch-auth');
              sessionStorage.removeItem('stitch-session-active');
            } catch {}
          }
        }
      }
    }
  )
);

if (typeof window !== 'undefined') {
  (window as any).__stitch_auth_store = useAuthStore;
}

