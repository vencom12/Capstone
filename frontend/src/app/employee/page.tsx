'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { useUIStore } from '@/stores/useUIStore';
import EmployeeSidebar from '@/components/employee/EmployeeSidebar';
import dynamic from 'next/dynamic';

const PersistentAssistant = dynamic(() => import('@/components/employee/PersistentAssistant'), {
  ssr: false,
});
import GlassModal from '@/components/ui/GlassModal';
import InvoiceModal from '@/components/dashboard/InvoiceModal';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeletons';
import { api, API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import GlassDatePicker from '@/components/ui/GlassDatePicker';
import GlassSelect from '@/components/ui/GlassSelect';
import PanelEmployeeSupport from '@/components/employee/PanelEmployeeSupport';
import PanelCounterMode from '@/components/admin/PanelCounterMode';
import Pagination from '@/components/ui/Pagination';
import { toggleTheme } from '@/lib/theme';
import ChangePasswordModal from '@/components/auth/ChangePasswordModal';
import DashboardOmniSearch from '@/components/layout/DashboardOmniSearch';
import { playOrderChime, isChimeEnabled, setChimeEnabled } from '@/lib/audioAlert';
import { printBagSlip } from '@/lib/printBagSlip';

export default function EmployeePage() {
  const router = useRouter();
  const { user, isAuthenticated, checkAccess, logout } = useAuthStore();
  const { fetchProducts } = useProductStore();
  const isLoggingOutRef = useRef(false);

  const [activeTab, setActiveTab] = useState('orders');
  const [isHydrated, setIsHydrated] = useState(false);
  const { isSidebarOpen, setSidebarOpen } = useUIStore();
  const tabTitles: Record<string, string> = {
    orders: 'Order Queue',
    counter: 'Walk-In Counter',
    history: 'Order History',
    support: 'Customer Reviews',
    settings: 'Settings'
  };

  // --- Live DB State ---
  const [orders, setOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [dbType, setDbType] = useState<string>('supabase');
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false);
  const [isChimeActive, setIsChimeActive] = useState(true);
  const prevOrdersCountRef = useRef<number>(0);

  // Initialize audio chime preference from localStorage
  useEffect(() => {
    setIsChimeActive(isChimeEnabled());
  }, []);

  const handleToggleChime = () => {
    const next = !isChimeActive;
    setIsChimeActive(next);
    setChimeEnabled(next);
    if (next) {
      playOrderChime();
      showToast('New order chime enabled (sample sound played)', 'info');
    } else {
      showToast('New order chime muted', 'info');
    }
  };

  // Search & Filters State
  const [ordersSearchQuery, setOrdersSearchQuery] = useState('');
  const [ordersDateFilter, setOrdersDateFilter] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState('');
  const [ordersQueueTab, setOrdersQueueTab] = useState<string>('all');
  const [queuePage, setQueuePage] = useState(1);
  const [queuePageSize, setQueuePageSize] = useState(10);

  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [archivedOrders, setArchivedOrders] = useState<any[]>([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [archivedTotal, setArchivedTotal] = useState(0);
  const [archivedPage, setArchivedPage] = useState(1);
  const [archivedPageSize, setArchivedPageSize] = useState(15);
  const [archivedTotalPages, setArchivedTotalPages] = useState(1);

  const fetchArchivedOrders = async (query = historySearchQuery, date = historyDateFilter, page = 1, limit = archivedPageSize) => {
    if (isLoggingOutRef.current || !useAuthStore.getState().isAuthenticated || useAuthStore.getState().isLoggingOut) return;
    setIsLoadingArchived(true);
    try {
      const params = new URLSearchParams();
      if (query && query.trim()) params.append('search', query.trim());
      if (date && date.trim()) params.append('date', date.trim());
      params.append('page', String(page));
      params.append('limit', String(limit));

      const res = await api.get<any>(`/api/admin/orders/history?${params.toString()}`);
      if (isLoggingOutRef.current || !useAuthStore.getState().isAuthenticated) return;
      if (res && res.orders) {
        setArchivedOrders(res.orders);
        setArchivedTotal(res.total || 0);
        setArchivedTotalPages(res.totalPages || 1);
        setArchivedPage(res.page || page);
      }
    } catch (err: any) {
      if (isLoggingOutRef.current || !useAuthStore.getState().isAuthenticated || useAuthStore.getState().isLoggingOut) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      const lower = message.toLowerCase();
      if (lower.includes('token') || lower.includes('authorization') || lower.includes('401') || lower.includes('unauthorized')) {
        return;
      }
      console.error('Failed to load archived orders:', err);
      showToast('Failed to load archived orders', 'error');
    } finally {
      setIsLoadingArchived(false);
    }
  };

  // Modals for Actions
  const [selectedOrder, setSelectedOrder] = useState<any>(null); // For processing order
  const [orderStatusInput, setOrderStatusInput] = useState('In Queue');
  const [orderProgressInput, setOrderProgressInput] = useState('10');
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);


  const [confirmingHandoverOrder, setConfirmingHandoverOrder] = useState<any>(null);

  // In-flight status update locks to prevent double-clicks & state reverting
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Record<string, boolean>>({});
  const [verifyingSmsIds, setVerifyingSmsIds] = useState<Record<string, boolean>>({});
  const fetchSeqRef = useRef(0);

  const getOrderGcashRef = (o: any): string => {
    if (!o) return '';
    const rawRef =
      o.receipt?.referenceId ||
      (o.personalization && typeof o.personalization === 'object' ? o.personalization.referenceNumber : '') ||
      o.transaction?.transactionID ||
      '';
    return String(rawRef || '').trim();
  };

  const isOrderSmsVerified = (o: any): boolean => {
    if (!o) return false;
    const pers = o.personalization && typeof o.personalization === 'object' ? o.personalization : {};
    return Boolean(pers.smsVerified);
  };

  const handleVerifySmsMatch = async (o: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetId = o.id || o._id || o.orderId;
    if (!targetId || verifyingSmsIds[targetId]) return;

    const ref = getOrderGcashRef(o);
    setVerifyingSmsIds((prev) => ({ ...prev, [targetId]: true }));

    setOrders((prev) =>
      prev.map((item) => {
        if ((item.id || item._id || item.orderId) !== targetId) return item;
        const pers = item.personalization && typeof item.personalization === 'object' ? { ...item.personalization } : {};
        pers.smsVerified = true;
        return {
          ...item,
          paymentStatus: 'paid',
          personalization: pers,
          receipt: item.receipt ? { ...item.receipt, status: 'Verified', aiVerificationStatus: 'verified' } : item.receipt,
        };
      })
    );

    try {
      const res = await api.post<any>(`/api/admin/orders/${targetId}/verify-payment`, {
        referenceNumber: ref || undefined,
      });
      showToast(res?.message || `Confirmed GCash Ref ...${ref.slice(-4)} on phone!`, 'success');
      fetchEmployeeData();
    } catch (err: any) {
      showToast(err.message || 'Failed to confirm payment reference', 'error');
      fetchEmployeeData();
    } finally {
      setVerifyingSmsIds((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  // Receipt Modal State
  const [viewingReceiptOrder, setViewingReceiptOrder] = useState<any>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const fetchEmployeeData = async () => {
    if (isLoggingOutRef.current) return;
    const authState = useAuthStore.getState();
    if (!authState.isAuthenticated || (authState.user?.role !== 'employee' && authState.user?.role !== 'admin') || authState.isLoggingOut) {
      return;
    }

    const currentSeq = ++fetchSeqRef.current;
    setIsSyncing(true);
    try {
      const data = await api.get<any>('/api/employee/dashboard-state');
      if (isLoggingOutRef.current || !useAuthStore.getState().isAuthenticated) return;
      if (currentSeq !== fetchSeqRef.current) return; // Stale fetch discarded
      if (data) {
        const nextOrders = data.orders || [];
        if (hasInitialDataLoaded && prevOrdersCountRef.current > 0 && nextOrders.length > prevOrdersCountRef.current) {
          playOrderChime();
        }
        prevOrdersCountRef.current = nextOrders.length;
        setOrders(nextOrders);
        setInventory(data.inventory || data.rawMaterials || []);
        setProducts(data.products || []);
        setMachines(data.machines || []);
      }
    } catch (err) {
      if (isLoggingOutRef.current || !useAuthStore.getState().isAuthenticated || useAuthStore.getState().isLoggingOut) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      const lower = message.toLowerCase();
      if (lower.includes('token') || lower.includes('authorization') || lower.includes('401') || lower.includes('unauthorized')) {
        useAuthStore.getState().logout();
        router.replace('/?auth=login');
        return;
      }
    } finally {
      if (currentSeq === fetchSeqRef.current) {
        setIsSyncing(false);
      }
      setHasInitialDataLoaded(true);
      useUIStore.getState().markDashboardReady();
    }
  };

  // Hydration Check (Session-only tab state: resets securely on browser exit)
  useEffect(() => {
    try {
      const savedTab = sessionStorage.getItem('stitch-employee-tab');
      const validTabs = ['orders', 'counter', 'history', 'support', 'settings'];
      if (savedTab && validTabs.includes(savedTab)) {
        setActiveTab(savedTab);
      } else {
        setActiveTab('orders');
      }
    } catch (e) { }
    setIsHydrated(true);
  }, []);

  // Reset logout lock when authenticated employee enters
  useEffect(() => {
    if (isAuthenticated) {
      isLoggingOutRef.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    api.get<{ dbType: string }>('/api/health')
      .then(res => {
        if (res && res.dbType) {
          setDbType(res.dbType.trim().toLowerCase() as 'mongodb' | 'postgres');
        }
      })
      .catch(err => console.error('Failed to load health check:', err));
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (isAuthenticated && (checkAccess('employee') || checkAccess('admin'))) {
      fetchEmployeeData();
    }
  }, [isAuthenticated, checkAccess, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      try {
        sessionStorage.setItem('stitch-employee-tab', activeTab);
      } catch (e) { }
    }
  }, [activeTab, isHydrated]);

  // Trigger fast server-indexed order history query when history tab is active
  useEffect(() => {
    if (!isHydrated || !isAuthenticated || (!checkAccess('employee') && !checkAccess('admin'))) return;
    if (activeTab === 'history') {
      const timer = setTimeout(() => {
        fetchArchivedOrders(historySearchQuery, historyDateFilter, 1);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [activeTab, historySearchQuery, historyDateFilter, isHydrated, isAuthenticated]);


  // Real-time Socket.IO Sync Listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let activeSocket: any = null;
    let isCancelled = false;

    const connectSocket = () => {
      if (isCancelled) return;
      const io = (window as any).io;
      if (!io) return;

      const socket = io(API_BASE, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        auth: { portal: 'employee' }
      });
      activeSocket = socket;

      const handleInPlaceOrderUpdate = (payload: any) => {
        if (!payload) return;
        if (Array.isArray(payload)) {
          setOrders((prev) => prev.map((o) => {
            const match = payload.find((r: any) => (r.id === o.id || r.orderId === o.orderId));
            return match ? { ...o, ...match } : o;
          }));
        } else if (Array.isArray(payload.results)) {
          setOrders((prev) => prev.map((o) => {
            const match = payload.results.find((r: any) => (r.id === o.id || r.orderId === o.orderId));
            return match ? { ...o, ...match } : o;
          }));
        } else if (payload.order) {
          setOrders((prev) => prev.map((o) => {
            if (o.id === payload.order.id || o.orderId === payload.order.orderId) {
              return { ...o, ...payload.order };
            }
            return o;
          }));
        } else if (Array.isArray(payload.ids) && payload.status) {
          setOrders((prev) => prev.map((o) => payload.ids.includes(o.id) ? { ...o, status: payload.status } : o));
        } else if (payload.id || payload.orderId) {
          setOrders((prev) => prev.map((o) => (o.id === (payload.id || payload.orderId) || o.orderId === (payload.orderId || payload.id)) ? { ...o, ...payload, status: payload.status || o.status } : o));
        }
      };

      socket.on('ordersUpdated', (data: any) => {
        handleInPlaceOrderUpdate(data);
      });

      socket.on('dataChanged', (data: any) => {
        if (isLoggingOutRef.current || !useAuthStore.getState().isAuthenticated || useAuthStore.getState().isLoggingOut) return;
        if (data.entity === 'ORDER') {
          if (data.action === 'CREATE') {
            fetchEmployeeData();
            const orderPayload = data.payload || data.data || {};
            const createdOrderId = orderPayload.orderId || orderPayload.id;
            const isSelfCreated = Boolean(
              createdOrderId &&
              typeof window !== 'undefined' &&
              (window as any).__lastSelfCreatedOrderId === createdOrderId &&
              Date.now() - ((window as any).__lastSelfCreatedOrderTime || 0) < 6000
            );

            if (!isSelfCreated) {
              playOrderChime();
              showToast('New customer order ticket received!', 'info');
            }
          } else if (data.action === 'UPDATE' && (data.payload || data.data)) {
            handleInPlaceOrderUpdate(data.payload || data.data);
          }
        } else if (['PRODUCT', 'INVENTORY', 'MACHINE'].includes(data.entity) && (data.action === 'CREATE' || data.action === 'DELETE')) {
          fetchEmployeeData();
        }
      });
    };

    // If socket.io is already loaded (cached from admin page or previous visit), connect immediately
    if ((window as any).io) {
      connectSocket();
    } else {
      const script = document.createElement('script');
      script.src = `${API_BASE}/socket.io/socket.io.js`;
      script.async = true;
      script.onload = connectSocket;
      document.head.appendChild(script);
    }

    return () => {
      isCancelled = true;
      if (activeSocket) {
        activeSocket.close();
      }
    };
  }, []);

  // client-side redirect gate if unauthenticated or not staff
  useEffect(() => {
    if (isHydrated) {
      if (!isAuthenticated) {
        router.replace('/?auth=login');
      } else if (!checkAccess('employee') && !checkAccess('admin')) {
        showToast('Staff privileges required.', 'error');
        router.replace('/');
      }
    }
  }, [isHydrated, isAuthenticated, checkAccess, router]);

  // Reset queue page on filter changes
  useEffect(() => {
    setQueuePage(1);
  }, [ordersSearchQuery, ordersDateFilter, ordersQueueTab]);

  if (!isHydrated || !isAuthenticated || (!checkAccess('employee') && !checkAccess('admin'))) {
    return <div className="h-screen w-full bg-bg-dark" />;
  }

  // --- Action Handlers ---
  const handleUpdateOrderStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const orderId = selectedOrder.id || selectedOrder._id;
    try {
      const url = `/api/employee/orders/${orderId}/status`;

      const payload = {
        status: orderStatusInput,
        progress: parseInt(orderProgressInput)
      };

      // Instant optimistic update
      setOrders(prev => prev.map(o => (o.id === orderId || o.orderId === selectedOrder.orderId) ? { ...o, status: orderStatusInput, progress: parseInt(orderProgressInput) } : o));

      const res: any = await api.patch(url, payload);

      showToast('Order status updated successfully', 'success');
      setIsProcessModalOpen(false);

      if (res && (res.id || res.orderId)) {
        setOrders(prev => prev.map(o => (o.id === orderId || o.orderId === selectedOrder.orderId) ? { ...o, ...res } : o));
      }
    } catch (err) {
      showToast('Failed to update status', 'error');
      fetchEmployeeData();
    }
  };

  const advanceOrderStatus = async (order: any, nextStatus: string, customProgress?: number) => {
    const orderId = order.id || order._id;
    if (!orderId || updatingOrderIds[orderId]) return;

    // Prevent duplicate spam clicks
    setUpdatingOrderIds(prev => ({ ...prev, [orderId]: true }));
    const previousStatus = order.status;
    const previousProgress = order.progress;
    const progress = customProgress !== undefined
      ? customProgress
      : (nextStatus === 'Preparing Order' ? 50 : 100);

    // 1. Instant optimistic UI transition (0ms UI lag)
    setOrders(prev => prev.map(o => {
      if (o.id === orderId || o.orderId === order.orderId) {
        return { ...o, status: nextStatus, progress };
      }
      return o;
    }));

    try {
      const url = `/api/employee/orders/${orderId}/status`;
      const payload = {
        status: nextStatus,
        progress
      };

      const res: any = await api.patch(url, payload);

      showToast(`Order #${order.orderId} marked as ${nextStatus}`, 'success');

      // Update in-place with server-confirmed row (no full refetch wipes)
      if (res && (res.id || res.orderId)) {
        setOrders(prev => prev.map(o => {
          if (o.id === orderId || o.orderId === order.orderId) {
            return { ...o, ...res };
          }
          return o;
        }));
      }
    } catch (err) {
      // Revert only this specific order if network/stock error occurred
      setOrders(prev => prev.map(o => {
        if (o.id === orderId || o.orderId === order.orderId) {
          return { ...o, status: previousStatus, progress: previousProgress };
        }
        return o;
      }));
      showToast('Failed to advance order status', 'error');
    } finally {
      setUpdatingOrderIds(prev => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const handleReceiveGarments = async (order: any) => {
    try {
      const orderId = order.id || order.orderId;
      const res: any = await api.patch(`/api/employee/orders/${orderId}/garments-received`, {});
      showToast(res?.message || `Garments received for Order #${order.orderId}!`, 'success');
      fetchEmployeeData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to record garments received', 'error');
    }
  };

  const handleBatchStatusUpdate = async () => {
    if (selectedOrderIds.length === 0) {
      showToast('No orders selected for batch update', 'error');
      return;
    }
    if (!batchStatus || batchStatus === 'Batch Status Update') {
      showToast('Please select a valid status', 'error');
      return;
    }
    try {
      await api.post('/api/admin/orders/batch-status', {
        ids: selectedOrderIds,
        status: batchStatus,
      });
      showToast(`Batch updated ${selectedOrderIds.length} orders successfully`, 'success');
      setSelectedOrderIds([]);
      setBatchStatus('');
      fetchEmployeeData();
    } catch (err) {
      showToast('Failed to batch update orders', 'error');
    }
  };



  const handleDownloadReceipt = async (order: any) => {
    const receiptId = order?.transactionID ||
      order?.transactionId ||
      order?.receiptID ||
      order?.receiptId ||
      order?.orderId ||
      order?.id ||
      order?._id;

    if (!receiptId || receiptId === 'undefined') {
      showToast('No receipt reference available for download', 'error');
      return;
    }

    try {
      showToast('Preparing secure receipt download...', 'info');
      await api.download(`/api/customer/receipt/${receiptId}/download`, `STITCH_OPT_RECEIPT_${receiptId}.pdf`);
      showToast('Receipt PDF downloaded successfully', 'success');
    } catch (err) {
      console.error('Download failed:', err);
      showToast('Downloading receipt PDF failed', 'error');
    }
  };

  const getRelativeTime = (dueDate: string | Date | null) => {
    if (!dueDate) return null;
    const dueTime = new Date(dueDate).getTime();
    const nowTime = Date.now();
    const diff = dueTime - nowTime;
    const isOverdue = diff < 0;
    const absDiff = Math.abs(diff);

    const mins = Math.floor(absDiff / (1000 * 60));
    const hours = Math.floor(absDiff / (1000 * 60 * 60));
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

    if (isOverdue) {
      if (mins < 60) return `Overdue by ${mins}m`;
      if (hours < 24) return `Overdue by ${hours}h`;
      return `Overdue by ${days}d`;
    } else {
      if (mins < 60) return `due in ${mins}m`;
      if (hours < 24) return `due in ${hours}h`;
      return `due in ${days}d`;
    }
  };

  // Find currently active designs to show Batch Match markers
  const activeDesigns = orders
    .filter((o: any) => o.status === 'Preparing Order' && o.design)
    .map((o: any) => o.design.toLowerCase().trim());

  // --- Filtering & Sorting ---
  const activeOrders = orders.filter(o => {
    if (['Order Delivered', 'Completed', 'Order Canceled'].includes(o.status)) return false;

    const matchesSearch = !ordersSearchQuery || (
      o.orderId.toLowerCase().includes(ordersSearchQuery.toLowerCase()) ||
      o.client?.toLowerCase().includes(ordersSearchQuery.toLowerCase()) ||
      o.status?.toLowerCase().includes(ordersSearchQuery.toLowerCase())
    );

    const matchesDate = !ordersDateFilter || (
      new Date(o.date || o.createdAt).toISOString().split('T')[0] === ordersDateFilter
    );

    const matchesTab = ordersQueueTab === 'all' || o.status === ordersQueueTab;

    return matchesSearch && matchesDate && matchesTab;
  });

  const paginatedQueueOrders = activeOrders.slice(
    (queuePage - 1) * queuePageSize,
    queuePage * queuePageSize
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'orders':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4">
              <h1 className="text-3xl font-extrabold mb-1">Active Order Queue</h1>
            </header>

            {/* Compact Top Filter & Action Toolbar */}
            <div className="flex justify-start items-center flex-wrap gap-3 mb-4">
              <input
                type="text"
                placeholder="Search queue..."
                value={ordersSearchQuery}
                onChange={(e) => setOrdersSearchQuery(e.target.value)}
                className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
              />
              <GlassDatePicker
                value={ordersDateFilter}
                onChange={(val) => setOrdersDateFilter(val)}
                placeholder="Filter date"
              />
            </div>

            {/* Status Tab Navigation */}
            {(() => {
              const ALL_STATUSES = ['In Queue', 'Preparing Order', 'Ready For Pick Up'];
              const allActiveOrders = orders.filter((o) => !['Order Delivered', 'Completed', 'Order Canceled'].includes(o.status));
              const tabs = [
                { key: 'all', label: 'All Active', count: allActiveOrders.length },
                ...ALL_STATUSES.map((s) => ({ key: s, label: s, count: allActiveOrders.filter(o => o.status === s).length }))
              ];
              return (
                <div className="flex gap-2 flex-wrap mb-4 border-b border-border-glass/30 pb-3">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setOrdersQueueTab(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${ordersQueueTab === tab.key
                          ? 'bg-bg-surface text-text-main border-primary/60 shadow-sm'
                          : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                        }`}
                    >
                      {tab.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-[0.6rem] font-extrabold ${ordersQueueTab === tab.key ? 'bg-primary/20 text-primary' : 'bg-white/10 text-text-dim'
                        }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}

            {isSyncing && orders.length === 0 ? (
              <div className="max-[1100px]:hidden mb-4 w-full">
                <TableSkeleton rows={5} cols={6} />
              </div>
            ) : (
              <div className="glass-table-container max-[1100px]:hidden">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th className="glass-th text-left">Order ID & Status</th>
                      <th className="glass-th text-left">Priority / Est. Time</th>
                      <th className="glass-th text-left">Client & Date</th>
                      <th className="glass-th text-left">Design / Items</th>
                      <th className="glass-th text-left">Total</th>
                      <th className="glass-th text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrders.length === 0 ? (
                      <tr className="glass-tr"><td colSpan={6} className="glass-td text-center text-text-dim">No active orders in queue.</td></tr>
                    ) : (
                      paginatedQueueOrders.map((o) => {
                        const isBatchMatched = o.status === 'In Queue' && o.design && activeDesigns.includes(o.design.toLowerCase().trim());
                        return (
                          <tr key={o.id || o._id} className="glass-tr hover:bg-white/5 transition-all">
                            <td className="glass-td">
                              <div className="flex flex-col text-left">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono text-sm font-bold text-text-main">{o.orderId}</span>
                                  <span className="text-[10px] font-mono text-text-dim bg-white/5 border border-border-glass px-1.5 py-0.5 rounded">
                                    {o.claimCode || o.personalization?.claimCode || `#A-${(o.orderId || '').slice(-4).toUpperCase()}`}
                                  </span>
                                  {o.isPlainOrder && (
                                    <span className="text-[10px] font-medium text-text-dim bg-white/5 border border-border-glass px-1.5 py-0.5 rounded">
                                      Plain (2–5m)
                                    </span>
                                  )}
                                </div>
                                <span className={`inline-block text-[0.7rem] px-2 py-0.5 rounded-full font-bold w-fit mt-1
                                   ${o.status === 'Preparing Order' ? 'bg-primary/20 text-primary border border-primary/30' :
                                    o.status === 'Ready For Pick Up' ? 'bg-success/20 text-success border border-success/30' :
                                      'bg-white/10 text-text-dim border border-white/20'
                                  }
                                 `}>
                                  {o.status} ({o.progress || 0}%)
                                </span>
                              </div>
                            </td>
                            <td className="glass-td text-left">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${o.priorityScore >= 80 ? 'bg-danger animate-pulse ' :
                                      o.priorityScore >= 40 ? 'bg-warning' : 'bg-primary'
                                    }`}></span>
                                  <span className="font-bold text-text-main text-sm">
                                    Score: {o.priorityScore !== undefined ? o.priorityScore.toFixed(0) : '0'}
                                  </span>
                                  {o.isRush && (
                                    <span className="text-[0.65rem] bg-danger/25 text-danger font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                      Rush
                                    </span>
                                  )}
                                </div>
                                <span className="text-[0.75rem] text-text-dim mt-0.5">
                                  Est: {o.estimatedTime !== undefined && o.estimatedTime !== null ? `${o.estimatedTime}m` : 'N/A'}
                                </span>
                              </div>
                            </td>
                            <td className="glass-td text-text-main text-sm font-medium text-left">
                              <div>{o.client || 'Valued Customer'}</div>
                              <div className="text-[0.75rem] text-text-dim mt-0.5">
                                {new Date(o.date || o.createdAt).toLocaleString()}
                              </div>
                              {o.dueDate && (
                                <div className={`text-[0.7rem] font-extrabold mt-1 uppercase ${new Date(o.dueDate).getTime() < Date.now() ? 'text-danger animate-pulse' : 'text-primary'}`}>
                                  {getRelativeTime(o.dueDate)}
                                </div>
                              )}
                            </td>
                            <td className="glass-td text-text-main text-sm text-left">
                              {o.items && Array.isArray(o.items) ? (
                                <div className="flex flex-col gap-1.5">
                                  {o.items.map((item: any, idx: number) => {
                                    const variantText = [item.selectedVariant, item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');
                                    const stitchText = item.personalization?.text || item.personalizationText || (typeof item.personalization === 'string' ? item.personalization : null);
                                    const rawColor = item.personalization?.threadColor || item.personalization?.color;
                                    const threadColor = typeof rawColor === 'object' && rawColor !== null ? (rawColor.name || '') : (typeof rawColor === 'string' ? rawColor : '');
                                    return (
                                      <div key={idx} className="flex flex-col text-xs">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {item.selectedColor && (
                                            <span className="w-2 h-2 rounded-full border border-white/20 inline-block shrink-0" style={{ backgroundColor: item.selectedColor }} />
                                          )}
                                          <span className="font-medium text-text-main">{item.quantity}x {item.name}</span>
                                          {variantText && <span className="text-text-dim text-[0.7rem] font-sans">({variantText})</span>}
                                        </div>
                                        {stitchText && (
                                          <div className="flex items-center gap-1 text-[0.7rem] text-text-dim font-mono mt-0.5 pl-2 border-l border-border-glass">
                                            <span>&ldquo;{stitchText}&rdquo;</span>
                                            {threadColor && (
                                              <span className="text-text-dim/70 text-[0.65rem] font-sans">
                                                ({threadColor})
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="font-semibold">{o.design || 'Embroidery Design'}</span>
                              )}
                              {isBatchMatched && (
                                <div className="mt-1">
                                  <span className="inline-flex items-center gap-0.5 text-[0.65rem] bg-primary/10 text-primary border border-primary/25 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    Batch Matched
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="glass-td text-primary font-mono font-bold text-sm text-left">
                              <div>₱{parseFloat(o.totalAmount || o.amount || 0).toFixed(2)}</div>
                              {(() => {
                                const ref = getOrderGcashRef(o);
                                const smsVerified = isOrderSmsVerified(o);
                                if (!ref) return null;
                                const last4 = ref.slice(-4);
                                return (
                                  <div className="mt-1 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                                    <div
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 w-fit"
                                      title={`Full GCash Ref: ${ref} — Match last 4 digits (${last4}) on store phone SMS`}
                                    >
                                      <span className="text-[9px] font-sans font-bold uppercase text-amber-300">Ref:</span>
                                      <span className="text-[10px] font-mono text-text-dim">{ref.length > 4 ? '...' : ''}</span>
                                      <span className="text-xs font-mono font-black text-amber-300 tracking-wider bg-amber-500/20 px-1 rounded">
                                        {last4}
                                      </span>
                                    </div>
                                    {smsVerified ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-sans font-bold text-emerald-400">
                                        ✓ Phone SMS Matched
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => handleVerifySmsMatch(o, e)}
                                        disabled={verifyingSmsIds[o.id || o._id || o.orderId]}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-sans font-bold transition-all cursor-pointer w-fit"
                                      >
                                        <span>{verifyingSmsIds[o.id || o._id || o.orderId] ? 'Confirming...' : `✓ Match SMS (...${last4})`}</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="glass-td text-right">
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => printBagSlip(o)}
                                  title="Print 80mm thermal slip to attach to garment bag"
                                  className="bg-white/5 border border-border-glass text-text-main px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim shrink-0">
                                    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                                    <circle cx="7" cy="7" r="1.5" />
                                  </svg>
                                  <span>Bag Slip</span>
                                </button>
                                {o.status === 'In Queue' && (
                                  o.isByog && !o.garmentsReceivedAt ? (
                                    <button
                                      onClick={() => handleReceiveGarments(o)}
                                      className="bg-white/5 hover:bg-white/10 border border-border-glass text-text-main px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
                                      title="Customer dropped off garments at counter"
                                    >
                                      <span>Intake</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => advanceOrderStatus(o, 'Preparing Order', 50)}
                                      disabled={updatingOrderIds[o.id]}
                                      className="bg-white/5 hover:bg-white/10 border border-border-glass hover:border-primary/50 text-text-main hover:text-primary px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
                                      title="Load to embroidery machine and start stitching"
                                    >
                                      <span>{updatingOrderIds[o.id] ? 'Updating...' : 'Start Stitching'}</span>
                                    </button>
                                  )
                                )}

                                {o.status === 'Preparing Order' && (
                                  <button
                                    onClick={() => advanceOrderStatus(o, 'Ready For Pick Up', 90)}
                                    disabled={updatingOrderIds[o.id]}
                                    className="bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                                    title="Finish stitching, package order with claim slip, and place on side"
                                  >
                                    <span>{updatingOrderIds[o.id] ? 'Updating...' : 'Finish & Bag'}</span>
                                  </button>
                                )}

                                {o.status === 'Ready For Pick Up' && (
                                  <button
                                    onClick={() => {
                                      setConfirmingHandoverOrder(o);
                                    }}
                                    className="bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                    title="Match claim slip code on bag and hand over to customer"
                                  >
                                    <span>Hand Over</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    setSelectedOrder(o);
                                    setOrderStatusInput(o.status || 'In Queue');
                                    setOrderProgressInput((o.progress || 10).toString());
                                    setIsProcessModalOpen(true);
                                  }}
                                  title="Manual status override"
                                  className="text-text-dim hover:text-text-main p-1.5 rounded-lg hover:bg-white/5 text-xs transition-colors cursor-pointer flex items-center justify-center"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tablet & Mobile Card Block View */}
            <div className="min-[1101px]:hidden grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pr-1">
              {isSyncing && orders.length === 0 ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))
              ) : activeOrders.length === 0 ? (
                <div className="glass-card p-6 text-center text-text-dim">No active orders in queue.</div>
              ) : (
                paginatedQueueOrders.map((o) => {
                  return (
                    <div key={o.id || o._id} className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-lg p-5 flex flex-col justify-between text-left relative group h-[260px]">
                      <div className="grid grid-cols-2 gap-4 py-1 text-sm flex-1 overflow-hidden mb-3">
                        {/* Left Side: ID & Status Badge, Client, Priority Details */}
                        <div className="flex flex-col gap-2 text-left justify-between h-full">
                          {/* Status Badge */}
                          <span className={`inline-block text-[0.7rem] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider w-fit
                            ${o.status === 'Preparing Order' ? 'bg-primary/20 text-primary border border-primary/30' :
                              o.status === 'Ready For Pick Up' ? 'bg-success/20 text-success border border-success/30' :
                                'bg-white/10 text-text-dim border border-white/20'
                            }
                          `}>
                            {o.status} ({o.progress || 0}%)
                          </span>

                          {/* Upper Left: ID & Timestamp & Priority */}
                          <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold text-text-main truncate max-w-[120px]">{o.orderId}</span>
                            <span className="text-[0.65rem] text-text-dim mt-0.5">{new Date(o.date || o.createdAt).toLocaleString()}</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${o.priorityScore >= 80 ? 'bg-danger animate-pulse' :
                                  o.priorityScore >= 40 ? 'bg-warning' : 'bg-primary'
                                }`}></span>
                              <span className="text-[0.7rem] font-bold text-text-main">
                                Score: {o.priorityScore !== undefined ? o.priorityScore.toFixed(0) : '0'}
                              </span>
                              {o.isRush && (
                                <span className="text-[0.6rem] bg-danger/25 text-danger font-extrabold px-1 rounded uppercase">
                                  Rush
                                </span>
                              )}
                            </div>
                            <span className="text-[0.65rem] text-text-dim mt-0.5">
                              Est: {o.estimatedTime !== undefined && o.estimatedTime !== null ? `${o.estimatedTime}m` : 'N/A'}
                            </span>
                            {o.dueDate && (
                              <span className={`text-[0.65rem] font-bold mt-0.5 uppercase ${new Date(o.dueDate).getTime() < Date.now() ? 'text-danger animate-pulse' : 'text-primary'}`}>
                                {getRelativeTime(o.dueDate)}
                              </span>
                            )}
                          </div>

                          {/* Client Name */}
                          <div className="flex flex-col text-left">
                            <span className="text-text-dim text-[0.7rem] uppercase tracking-wider block font-semibold mb-0.5">Client</span>
                            <span className="font-bold text-text-main truncate max-w-[140px]">{o.client || 'Valued Customer'}</span>
                          </div>
                        </div>

                        {/* Right Side: Orders / Items (Scrollable List) */}
                        <div className="flex flex-col gap-1 text-left border-l border-border-glass/20 pl-4 h-full overflow-hidden">
                          <span className="text-text-dim text-[0.7rem] uppercase tracking-wider block font-semibold">Orders / Items</span>
                          <div className="flex-1 overflow-y-auto pr-1 text-xs text-text-main font-medium scrollbar-thin">
                            {o.items && Array.isArray(o.items) ? (
                              o.items.map((item: any, idx: number) => {
                                const variantText = [item.selectedVariant, item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');
                                const stitchText = item.personalization?.text || item.personalizationText || (typeof item.personalization === 'string' ? item.personalization : null);
                                const rawColor2 = item.personalization?.threadColor || item.personalization?.color;
                                const threadColor = typeof rawColor2 === 'object' && rawColor2 !== null ? (rawColor2.name || '') : (typeof rawColor2 === 'string' ? rawColor2 : '');
                                return (
                                  <div key={idx} className="py-1 border-b border-white/5 last:border-0 flex flex-col gap-0.5">
                                    <div className="flex items-center justify-between gap-1.5">
                                      <div className="flex items-center gap-1.5 truncate">
                                        {item.selectedColor && (
                                          <span className="w-2 h-2 rounded-full border border-white/20 inline-block shrink-0" style={{ backgroundColor: item.selectedColor }} />
                                        )}
                                        <span className="truncate">{item.quantity}x {item.name}</span>
                                      </div>
                                      {variantText && <span className="text-text-dim text-[0.65rem] shrink-0 font-sans">({variantText})</span>}
                                    </div>
                                    {stitchText && (
                                      <span className="text-[0.65rem] text-text-dim font-mono pl-2 border-l border-border-glass">
                                        &ldquo;{stitchText}&rdquo; {threadColor ? `(${threadColor})` : ''}
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="py-0.5">{o.design || 'Embroidery Design'}</div>
                            )}
                          </div>
                          {o.status === 'In Queue' && o.design && activeDesigns.includes(o.design.toLowerCase().trim()) && (
                            <span className="inline-flex items-center justify-center gap-1 text-[0.6rem] bg-primary/15 text-primary border border-primary/30 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider w-full mt-1">
                              Batch Matched
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Underneath Button */}
                      <div className="flex gap-2 mt-auto w-full">
                        <button
                          type="button"
                          onClick={() => printBagSlip(o)}
                          title="Print 80mm thermal slip for garment bag"
                          className="bg-white/5 border border-border-glass text-text-main py-2.5 px-3 rounded-xl text-xs font-bold hover:bg-white/10 transition-all cursor-pointer text-center shrink-0 flex items-center justify-center gap-1"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim shrink-0">
                            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                            <circle cx="7" cy="7" r="1.5" />
                          </svg>
                          <span>Bag Slip</span>
                        </button>
                        {o.status === 'In Queue' && (
                          o.isByog && !o.garmentsReceivedAt ? (
                            <button
                              onClick={() => handleReceiveGarments(o)}
                              disabled={updatingOrderIds[o.id]}
                              className="flex-1 bg-white/5 hover:bg-white/10 border border-border-glass text-text-main py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer text-center disabled:opacity-50"
                            >
                              Intake
                            </button>
                          ) : (
                            <button
                              onClick={() => advanceOrderStatus(o, 'Preparing Order', 50)}
                              disabled={updatingOrderIds[o.id]}
                              className="flex-1 bg-white/5 hover:bg-white/10 border border-border-glass hover:border-primary/50 text-text-main hover:text-primary py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer text-center disabled:opacity-50"
                            >
                              {updatingOrderIds[o.id] ? 'Updating...' : 'Start Stitching'}
                            </button>
                          )
                        )}
                        {o.status === 'Preparing Order' && (
                          <button
                            onClick={() => advanceOrderStatus(o, 'Ready For Pick Up', 90)}
                            disabled={updatingOrderIds[o.id]}
                            className="flex-1 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center disabled:opacity-50"
                          >
                            {updatingOrderIds[o.id] ? 'Updating...' : 'Finish & Stage'}
                          </button>
                        )}
                        {o.status === 'Ready For Pick Up' && (
                          <button
                            onClick={() => {
                              setConfirmingHandoverOrder(o);
                            }}
                            className="flex-1 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center"
                          >
                            Handover
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedOrder(o);
                            setOrderStatusInput(o.status || 'In Queue');
                            setOrderProgressInput((o.progress || 10).toString());
                            setIsProcessModalOpen(true);
                          }}
                          className="px-3 py-2.5 rounded-xl bg-white/5 border border-border-glass text-text-dim hover:text-text-main text-xs font-bold cursor-pointer flex items-center justify-center"
                          title="Manual adjustments"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Queue Pagination */}
            <Pagination
              currentPage={queuePage}
              totalItems={activeOrders.length}
              pageSize={queuePageSize}
              onPageChange={setQueuePage}
              pageSizeOptions={[5, 10, 20, 50]}
              onPageSizeChange={(newSize) => {
                setQueuePageSize(newSize);
                setQueuePage(1);
              }}
              itemLabel="orders in queue"
            />
          </section>
        );

      case 'counter':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out]">
            <PanelCounterMode
              orders={orders}
              refreshData={fetchEmployeeData}
              isSyncing={isSyncing}
              setOrders={setOrders}
            />
          </section>
        );

      case 'history':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-4">
              <h1 className="text-3xl font-extrabold mb-1">Order History</h1>
              <p className="text-text-dim text-[0.95rem] m-0">
                Archived completed and canceled orders.
                {archivedTotal > 0 && <span className="text-primary font-bold ml-1.5">({archivedTotal} orders archived)</span>}
              </p>
            </header>

            {/* Compact Top Filter Toolbar */}
            <div className="flex justify-start items-center flex-wrap gap-3 mb-4">
              <input
                type="text"
                placeholder="Search history ID, client..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
              />
              <GlassDatePicker
                value={historyDateFilter}
                onChange={(val) => setHistoryDateFilter(val)}
                placeholder="Filter date"
              />
              {(historySearchQuery || historyDateFilter) && (
                <button
                  onClick={() => {
                    setHistorySearchQuery('');
                    setHistoryDateFilter('');
                  }}
                  className="text-xs text-text-dim hover:text-text-main px-3 py-2 rounded-xl bg-white/5 border border-border-glass cursor-pointer transition-all"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {isLoadingArchived ? (
              <>
                <div className="max-[1100px]:hidden mb-4 w-full">
                  <TableSkeleton rows={6} cols={6} />
                </div>
                <div className="min-[1101px]:hidden grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pr-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="glass-table-container max-[1100px]:hidden">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th className="glass-th">Order ID</th>
                        <th className="glass-th">Client</th>
                        <th className="glass-th">Design / Items</th>
                        <th className="glass-th">Status</th>
                        <th className="glass-th">Date</th>
                        <th className="glass-th text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedOrders.length === 0 ? (
                        <tr className="glass-tr">
                          <td colSpan={6} className="glass-td text-center text-text-dim py-6">
                            No historical completed or canceled orders found.
                          </td>
                        </tr>
                      ) : (
                        archivedOrders.map((o) => {
                          return (
                            <tr key={o.id || o._id} className="glass-tr hover:bg-white/5 transition-all">
                              <td className="glass-td font-mono font-bold text-sm text-text-main text-left">
                                {o.orderId}
                              </td>
                              <td className="glass-td text-sm font-medium text-text-main text-left">
                                {o.client || 'Valued Customer'}
                              </td>
                              <td className="glass-td text-sm text-text-main text-left">
                                {o.items && Array.isArray(o.items) ? (
                                  <div className="flex flex-col gap-0.5">
                                    {o.items.map((item: any, idx: number) => (
                                      <span key={idx} className="line-clamp-1">
                                        {item.quantity}x {item.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span>{o.design || 'Custom Embroidery'}</span>
                                )}
                              </td>
                              <td className="glass-td text-left">
                                <span className={`inline-block text-[0.7rem] px-2 py-0.5 rounded-full font-bold
                                  ${o.status === 'Completed' || o.status === 'Order Delivered' ? 'bg-success/20 text-success border border-success/30' :
                                    'bg-danger/20 text-danger border border-danger/30'
                                  }
                                `}>
                                  {o.status}
                                </span>
                              </td>
                              <td className="glass-td text-text-dim text-sm text-left">
                                {new Date(o.date || o.createdAt).toLocaleDateString()}
                              </td>
                              <td className="glass-td text-right">
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => {
                                      setViewingReceiptOrder(o);
                                      setIsReceiptModalOpen(true);
                                    }}
                                    className="bg-primary/10 border border-primary/20 text-primary px-3.5 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/25 transition-all cursor-pointer"
                                  >
                                    View Receipt
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Tablet & Mobile Card Block View */}
                <div className="min-[1101px]:hidden grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pr-1">
                  {archivedOrders.length === 0 ? (
                    <div className="glass-card p-6 text-center text-text-dim col-span-full">
                      No historical completed or canceled orders found.
                    </div>
                  ) : (
                    archivedOrders.map((o) => {
                      return (
                        <div key={o.id || o._id} className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-lg p-5 flex flex-col justify-between text-left relative group h-[260px]">
                          <div className="grid grid-cols-2 gap-4 py-1 text-sm flex-1 overflow-hidden mb-3">
                            {/* Left Side: ID & Timestamp, Status Badge, Client Name */}
                            <div className="flex flex-col gap-2.5 text-left justify-between h-full">
                              <span className={`inline-block text-[0.7rem] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider w-fit
                                ${o.status === 'Completed' || o.status === 'Order Delivered' ? 'bg-success/20 text-success border border-success/30' :
                                  'bg-danger/20 text-danger border border-danger/30'
                                }
                              `}>
                                {o.status}
                              </span>

                              <div className="flex flex-col">
                                <span className="font-mono text-sm font-bold text-text-main truncate max-w-[120px]">{o.orderId}</span>
                                <span className="text-[0.65rem] text-text-dim mt-0.5">{new Date(o.date || o.createdAt).toLocaleDateString()}</span>
                              </div>

                              <div className="flex flex-col text-left">
                                <span className="text-text-dim text-[0.7rem] uppercase tracking-wider block font-semibold mb-0.5">Client</span>
                                <span className="font-bold text-text-main truncate max-w-[140px]">{o.client || 'Valued Customer'}</span>
                              </div>
                            </div>

                            {/* Right Side: Orders / Items (Scrollable List) */}
                            <div className="flex flex-col gap-1 text-left border-l border-border-glass/20 pl-4 h-full overflow-hidden">
                              <span className="text-text-dim text-[0.7rem] uppercase tracking-wider block font-semibold">Orders / Items</span>
                              <div className="flex-1 overflow-y-auto pr-1 text-xs text-text-main font-medium scrollbar-thin">
                                {o.items && Array.isArray(o.items) ? (
                                  o.items.map((item: any, idx: number) => (
                                    <div key={idx} className="py-0.5 border-b border-white/5 last:border-0 truncate">
                                      {item.quantity}x {item.name}
                                    </div>
                                  ))
                                ) : (
                                  <div className="py-0.5">{o.design || 'Custom Embroidery'}</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="w-full mt-1">
                            <button
                              onClick={() => {
                                setViewingReceiptOrder(o);
                                setIsReceiptModalOpen(true);
                              }}
                              className="w-full bg-primary/10 border border-primary/20 text-primary py-2.5 rounded-xl text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer text-center"
                            >
                              View Receipt Preview
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pagination Controls */}
                <Pagination
                  currentPage={archivedPage}
                  totalItems={archivedTotal}
                  pageSize={archivedPageSize}
                  onPageChange={(p) => fetchArchivedOrders(historySearchQuery, historyDateFilter, p, archivedPageSize)}
                  pageSizeOptions={[10, 15, 25, 50]}
                  onPageSizeChange={(newSize) => {
                    setArchivedPageSize(newSize);
                    fetchArchivedOrders(historySearchQuery, historyDateFilter, 1, newSize);
                  }}
                  itemLabel="archived orders"
                />
              </>
            )}
          </section>
        );

      case 'support':
        return <PanelEmployeeSupport />;

      case 'settings':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out] max-w-[700px]">
            <header className="mb-6">
              <h1 className="text-3xl font-extrabold mb-1">Operator Profile &amp; Settings</h1>
              <p className="text-text-dim text-[0.95rem] m-0">Workshop station credentials and visual interface preferences.</p>
            </header>
            <div className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-xl p-6 md:p-8 flex flex-col gap-6">
              {/* Operator Identity Badge */}
              <div className="flex items-center gap-4 pb-6 border-b border-border-glass">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-xl shrink-0">
                  {user?.username?.charAt(0).toUpperCase() || 'OP'}
                </div>
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold m-0 text-text-main">{user?.username || 'Embroidery Operator'}</h3>
                    <span className="text-[0.65rem] font-extrabold px-2 py-0.5 rounded-full uppercase bg-primary/15 border border-primary/30 text-primary">
                      {user?.role === 'admin' ? 'Owner / Master Operator' : 'Artisan Operator'}
                    </span>
                  </div>
                  <p className="text-xs text-text-dim m-0 mt-0.5">
                    {user?.email || 'Logged in to workshop terminal'}
                  </p>
                </div>
              </div>

              {/* Display Theme */}
              <div className="flex items-center justify-between bg-bg-surface p-4 md:p-5 rounded-xl border border-border-glass">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line></svg>
                  </div>
                  <div className="text-left">
                    <h4 className="m-0 text-sm font-bold text-text-main">Display Mode</h4>
                    <p className="m-0 mt-0.5 text-xs text-text-dim">Switch between high-contrast dark and daytime light mode</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleTheme()}
                  className="bg-bg-surface hover:bg-white/10 border border-border-glass hover:border-primary/40 text-text-main font-bold px-4 py-2 rounded-xl text-xs cursor-pointer transition-all"
                >
                  Toggle Theme
                </button>
              </div>

              {/* Security: Change Password */}
              <div className="flex items-center justify-between bg-bg-surface p-4 md:p-5 rounded-xl border border-border-glass">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-white/5 text-text-dim flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  </div>
                  <div className="text-left">
                    <h4 className="m-0 text-sm font-bold text-text-main">Account Security</h4>
                    <p className="m-0 mt-0.5 text-xs text-text-dim">Update your station operator access password</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(true)}
                  className="bg-white/5 border border-border-glass text-text-main font-bold px-4 py-2 rounded-xl text-xs hover:bg-white/10 cursor-pointer transition-all"
                >
                  Change Password
                </button>
              </div>
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent text-text-main relative">
      {/* Dynamic sliding drawer sidebar */}
      <EmployeeSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden relative h-full">
        {/* Persistent Top Header Bar with Breadcrumbs & Top-Right User Button */}
        <header className="bg-bg-sidebar/85 backdrop-blur-[16px] border-b border-border-glass px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between sticky top-0 z-[1900] shrink-0 gap-2 sm:gap-4 max-w-full overflow-hidden">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink">
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="min-[651px]:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/5 border border-border-glass flex items-center justify-center text-text-main hover:text-primary cursor-pointer hover:bg-white/10 transition-colors shrink-0"
              aria-label="Toggle navigation"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('toggleAIAssistant'))}
              className="min-[651px]:hidden w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/20 cursor-pointer transition-colors shrink-0"
              title="Ask AI Copilot"
              aria-label="Ask AI Copilot"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                <path d="M19 4v4m2-2h-4" />
              </svg>
            </button>
            <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1 truncate">
              <span className="text-text-dim text-xs uppercase tracking-wider font-bold hidden sm:inline">Employee</span>
              <span className="text-text-dim/40 hidden sm:inline">/</span>
              <span className="font-bold text-text-main text-sm sm:text-base tracking-tight truncate">
                {tabTitles[activeTab] || 'Workbench'}
              </span>
            </div>
          </div>

          {/* Omni Search & AI Copilot Trigger Bar */}
          <div className="hidden sm:flex flex-1 max-w-[460px] mx-auto justify-center">
            <DashboardOmniSearch
              orders={orders}
              inventory={inventory}
              products={products}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onSelectOrder={(order) => {
                setSelectedOrder(order);
                setOrderStatusInput(order.status || 'In Queue');
                setOrderProgressInput(String((order as any).progress || '10'));
                setIsProcessModalOpen(true);
              }}
              role="employee"
            />
          </div>

          {/* Top-Right User Profile & Quick Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Chime Audio Alert Toggle */}
            <button
              type="button"
              onClick={handleToggleChime}
              title={isChimeActive ? "New order chime active (click to mute)" : "New order chime muted (click to enable)"}
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${isChimeActive
                  ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/25 shadow-sm'
                  : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
                }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim shrink-0">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                {!isChimeActive && <line x1="2" y1="2" x2="22" y2="22" />}
              </svg>
              <span className="hidden lg:inline">{isChimeActive ? 'Chime Alert On' : 'Chime Muted'}</span>
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2.5 pl-1.5 sm:pl-3 border-l border-border-glass/40 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-2 cursor-pointer bg-transparent border-none p-1 rounded-xl hover:bg-white/5 transition-all text-left group shrink-0"
                title="Account Settings"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/20 text-primary border border-primary/30 group-hover:border-primary/70 flex items-center justify-center font-bold text-xs transition-all shrink-0">
                  {user?.username?.substring(0, 2).toUpperCase() || 'OP'}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-bold text-text-main leading-tight truncate max-w-[120px] group-hover:text-primary transition-colors">
                    {user?.username || 'Operator'}
                  </span>
                  <span className="text-[0.62rem] text-primary font-bold uppercase tracking-wider">
                    {user?.role || 'employee'}
                  </span>
                </div>
              </button>

              <button
                onClick={async () => {
                  isLoggingOutRef.current = true;
                  router.replace('/');
                  await logout();
                }}
                className="bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-none shrink-0"
                title="Log out of session"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                <span className="hidden sm:inline text-[0.75rem]">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1500px] w-full mx-auto p-4 sm:p-8 pb-24 scrollbar-thin overflow-x-hidden">
          {renderTabContent()}
        </main>
      </div>

      {/* Modals */}



      {/* Direct Handover Confirmation Modal */}
      <GlassModal
        isOpen={!!confirmingHandoverOrder}
        onClose={() => setConfirmingHandoverOrder(null)}
        title="Confirm Counter Handover"
        maxWidth="max-w-[440px]"
      >
        {confirmingHandoverOrder && (
          <div className="flex flex-col gap-4 text-left">
            <div className="p-4 rounded-xl bg-white/5 border border-border-glass flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Claim Slip on Bag</span>
                <span className="px-3 py-1 rounded-lg bg-white/5 border border-border-glass font-mono font-bold text-text-main text-sm">
                  {confirmingHandoverOrder.claimCode || confirmingHandoverOrder.personalization?.claimCode || `#A-${(confirmingHandoverOrder.orderId || '').slice(-4).toUpperCase()}`}
                </span>
              </div>

              <p className="text-[11px] text-text-dim">
                Find the packaged bag on the side matching this claim code, hand it to the customer, and confirm below.
              </p>

              <div className="border-t border-white/5 pt-3 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-dim">Customer:</span>
                  <span className="font-bold text-text-main">{confirmingHandoverOrder.client || 'Counter Customer'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-dim">Order ID:</span>
                  <span className="font-mono font-bold text-text-main">{confirmingHandoverOrder.orderId}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-dim">Total:</span>
                  <span className="font-mono font-bold text-text-main">
                    ₱{parseFloat(confirmingHandoverOrder.totalAmount || confirmingHandoverOrder.amount || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingHandoverOrder(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim hover:text-text-main text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmingHandoverOrder;
                  setConfirmingHandoverOrder(null);
                  await advanceOrderStatus(target, 'Completed', 100);
                  showToast(`Order #${target.orderId} marked Completed!`, 'success');
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-primary/20"
              >
                Confirm Handover
              </button>
            </div>
          </div>
        )}
      </GlassModal>

      {/* Process Order Modal */}
      <GlassModal
        isOpen={isProcessModalOpen}
        onClose={() => {
          setIsProcessModalOpen(false);
          setSelectedOrder(null);
        }}
        title="Process Order Ticket"
        maxWidth="max-w-[450px]"
      >
        {selectedOrder && (
          <form onSubmit={handleUpdateOrderStatus} className="flex flex-col gap-4 text-left">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-dim">Order ID</span>
              <span className="font-mono font-bold text-text-main text-base">{selectedOrder.orderId}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-text-main">Order Status</label>
              <GlassSelect
                value={orderStatusInput}
                onChange={(status) => {
                  setOrderStatusInput(status);
                  // Map status to dynamic defaults
                  const progressMap: Record<string, string> = {
                    'In Queue': '15',
                    'Preparing Order': '50',
                    'Ready For Pick Up': '90',
                    'Completed': '100',
                    'Order Canceled': '0'
                  };
                  if (progressMap[status] !== undefined) {
                    setOrderProgressInput(progressMap[status]);
                  }
                }}
                options={[
                  'In Queue',
                  'Preparing Order',
                  'Ready For Pick Up',
                  'Completed',
                  'Order Canceled'
                ]}
                cols={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-text-main">Progress Percentage</label>
                <span className="text-primary font-mono font-bold text-sm">{orderProgressInput}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={orderProgressInput}
                onChange={(e) => setOrderProgressInput(e.target.value)}
                className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button
                type="submit"
                className="flex-1 bg-bg-surface hover:bg-primary/15 border border-primary/50 hover:border-primary text-text-main hover:text-white font-bold py-2.5 rounded-xl transition-all cursor-pointer text-sm"
              >
                Update Ticket
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsProcessModalOpen(false);
                  setSelectedOrder(null);
                }}
                className="bg-white/5 border border-border-glass text-text-main font-bold py-2.5 px-4 rounded-xl hover:bg-white/10 transition-all cursor-pointer text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </GlassModal>



      {/* Authentic Store Thermal Receipt Modal */}
      <InvoiceModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setViewingReceiptOrder(null);
        }}
        order={viewingReceiptOrder}
        transaction={viewingReceiptOrder}
        user={viewingReceiptOrder?.user || viewingReceiptOrder?.customer}
        transactionId={viewingReceiptOrder?.transactionID || viewingReceiptOrder?.transactionId || viewingReceiptOrder?.receiptID || viewingReceiptOrder?.receiptId || viewingReceiptOrder?.orderId}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      {/* Persistent AI Assistant */}
      <PersistentAssistant />
    </div>
  );
}

