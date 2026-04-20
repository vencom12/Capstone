import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);
const SESSION_KEY = 'stitch_opt_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      if (!session) return null;
      const parsed = JSON.parse(session);
      return parsed?.user || null;
    } catch { return null; }
  });

  const login = useCallback(async (email, password) => {
    try {
      const data = await authAPI.login(email, password);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user: data.user }));
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }, []);

  const register = useCallback(async (username, email, password) => {
    try {
      const data = await authAPI.register(username, email, password);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user: data.user }));
      setUser(data.user);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (userData) => {
    const data = await authAPI.updateProfile(userData);
    const currentSession = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    currentSession.user = { ...currentSession.user, username: data.user.username, email: data.user.email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    setUser(prev => ({ ...prev, username: data.user.username, email: data.user.email }));
    return data;
  }, []);

  const value = {
    user,
    isAuthenticated: !!user,
    role: user?.role || null,
    login,
    register,
    logout,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export default AuthContext;
