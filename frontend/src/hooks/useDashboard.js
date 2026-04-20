import { useState, useCallback, useEffect } from 'react';
import { dashboardAPI, productsAPI, ordersAPI, favoritesAPI, adminAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export function useDashboard() {
  const { isAuthenticated, role } = useAuth();
  const { lastEvent } = useSocket();
  const [data, setData] = useState({
    orders: [],
    products: [],
    inventory: [],
    favorites: [],
    users: [],
    analytics: null,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      if (!isAuthenticated) {
        const products = await productsAPI.getAll();
        setData(prev => ({ ...prev, products }));
      } else {
        const batch = await dashboardAPI.getState();
        if (batch) setData(prev => ({ ...prev, ...batch }));
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time sync on Socket.IO events
  useEffect(() => {
    if (lastEvent && isAuthenticated) {
      fetchData();
    }
  }, [lastEvent, fetchData, isAuthenticated]);

  // Silent sync helper
  const silentSync = useCallback(async () => {
    setSyncing(true);
    try { await fetchData(); } finally { setSyncing(false); }
  }, [fetchData]);

  // ── Order Actions ──
  const createOrder = useCallback(async (orderData) => {
    setSyncing(true);
    try {
      const { _id, ...clean } = orderData;
      await ordersAPI.create(clean);
      await silentSync();
      return true;
    } catch (err) {
      console.error('Create order error:', err);
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  const updateOrder = useCallback(async (id, updates) => {
    // Optimistic
    setData(prev => ({
      ...prev,
      orders: prev.orders.map(o => o._id === id ? { ...o, ...updates } : o),
    }));
    setSyncing(true);
    try {
      await ordersAPI.update(id, updates);
      await silentSync();
      return true;
    } catch (err) {
      console.error('Update order error:', err);
      await silentSync();
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  const deleteOrder = useCallback(async (id) => {
    setData(prev => ({
      ...prev,
      orders: prev.orders.map(o => o._id === id ? { ...o, status: 'Order Canceled', progress: 100 } : o),
    }));
    setSyncing(true);
    try {
      await ordersAPI.update(id, { status: 'Order Canceled', progress: 100 });
      await silentSync();
      return true;
    } catch (err) {
      await silentSync();
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  const batchUpdateOrders = useCallback(async (orderIds, status) => {
    setData(prev => ({
      ...prev,
      orders: prev.orders.map(o => orderIds.includes(o._id) ? { ...o, status } : o),
    }));
    setSyncing(true);
    try {
      await ordersAPI.batchStatus(orderIds, status);
      await silentSync();
      return true;
    } catch (err) {
      await silentSync();
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  // ── Favorite Actions ──
  const toggleFavorite = useCallback(async (productId, isFavorite) => {
    const product = data.products.find(p => p._id === productId);
    // Optimistic
    setData(prev => ({
      ...prev,
      favorites: isFavorite
        ? prev.favorites.filter(f => f._id !== productId)
        : [...prev.favorites, product].filter(Boolean),
    }));
    setSyncing(true);
    try {
      if (isFavorite) {
        await favoritesAPI.remove(productId);
      } else {
        await favoritesAPI.add(productId);
      }
      await silentSync();
    } catch (err) {
      await silentSync();
    } finally {
      setSyncing(false);
    }
  }, [data.products, silentSync]);

  // ── Product Actions (Admin/Employee) ──
  const createProduct = useCallback(async (productData) => {
    setSyncing(true);
    try {
      await productsAPI.create(productData);
      await silentSync();
      return true;
    } catch (err) {
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  const updateProduct = useCallback(async (id, productData) => {
    setData(prev => ({
      ...prev,
      products: prev.products.map(p => p._id === id ? { ...p, ...productData } : p),
    }));
    setSyncing(true);
    try {
      await productsAPI.update(id, productData);
      await silentSync();
      return true;
    } catch (err) {
      await silentSync();
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  const deleteProduct = useCallback(async (id) => {
    setData(prev => ({
      ...prev,
      products: prev.products.filter(p => p._id !== id),
    }));
    setSyncing(true);
    try {
      await productsAPI.delete(id);
      await silentSync();
      return true;
    } catch (err) {
      await silentSync();
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  // ── Admin User Actions ──
  const createUser = useCallback(async (userData) => {
    setSyncing(true);
    try {
      await adminAPI.createUser(userData);
      await silentSync();
      return true;
    } catch (err) {
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  const updateUser = useCallback(async (id, userData) => {
    setSyncing(true);
    try {
      await adminAPI.updateUser(id, userData);
      await silentSync();
      return true;
    } catch (err) {
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  const deleteUser = useCallback(async (id) => {
    setData(prev => ({
      ...prev,
      users: prev.users.filter(u => u._id !== id),
    }));
    setSyncing(true);
    try {
      await adminAPI.deleteUser(id);
      await silentSync();
      return true;
    } catch (err) {
      await silentSync();
      return false;
    } finally {
      setSyncing(false);
    }
  }, [silentSync]);

  return {
    ...data,
    loading,
    syncing,
    refresh: fetchData,
    createOrder, updateOrder, deleteOrder, batchUpdateOrders,
    toggleFavorite,
    createProduct, updateProduct, deleteProduct,
    createUser, updateUser, deleteUser,
  };
}
