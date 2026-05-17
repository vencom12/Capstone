'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import EmployeeSidebar from '@/components/employee/EmployeeSidebar';
import PersistentAssistant from '@/components/employee/PersistentAssistant';
import StaffAuthModal from '@/components/auth/StaffAuthModal';
import GlassModal from '@/components/ui/GlassModal';
import { api, API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import GlassDatePicker from '@/components/ui/GlassDatePicker';
import GlassSelect from '@/components/ui/GlassSelect';
import PanelRawMaterials from '@/components/admin/PanelRawMaterials';
import PanelManageDesigns from '@/components/admin/PanelManageDesigns';

export default function EmployeePage() {
  const router = useRouter();
  const { isAuthenticated, checkAccess } = useAuthStore();
  const { fetchProducts } = useProductStore();

  const [activeTab, setActiveTab] = useState('workbench');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  // --- Live DB State ---
  const [orders, setOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [dbType, setDbType] = useState<'mongodb' | 'postgres'>('mongodb');
  const [isSyncing, setIsSyncing] = useState(false);

  // Search & Filters State
  const [ordersSearchQuery, setOrdersSearchQuery] = useState('');
  const [ordersDateFilter, setOrdersDateFilter] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState('');

  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState('');

  // Modals for Actions
  const [selectedOrder, setSelectedOrder] = useState<any>(null); // For processing order
  const [orderStatusInput, setOrderStatusInput] = useState('In Queue');
  const [orderProgressInput, setOrderProgressInput] = useState('10');
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);

  // Receipt Modal State
  const [viewingReceiptOrder, setViewingReceiptOrder] = useState<any>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const fetchEmployeeData = async () => {
    setIsSyncing(true);
    try {
      const data = await api.get<any>('/api/employee/dashboard-state');
      if (data) {
        setOrders(data.orders || []);
        setInventory(data.inventory || data.rawMaterials || []);
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Failed to fetch employee state:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const savedTab = localStorage.getItem('stitch-employee-tab');
    if (savedTab) setActiveTab(savedTab);
    setIsHydrated(true);
  }, []);

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
    if (isAuthenticated && checkAccess('employee')) {
      fetchEmployeeData();
    }
  }, [isAuthenticated, checkAccess, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('stitch-employee-tab', activeTab);
    }
  }, [activeTab, isHydrated]);

  // Real-time Socket.IO Sync Listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const script = document.createElement('script');
    script.src = `${API_BASE}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = () => {
      const io = (window as any).io;
      if (!io) return;

      const socket = io(API_BASE, {
        withCredentials: true,
        transports: ['websocket', 'polling']
      });

      socket.on('dataChanged', (data: any) => {
        console.log('[Socket] Data sync received:', data.entity, data.action);
        if (['PRODUCT', 'INVENTORY', 'ORDER'].includes(data.entity)) {
          fetchEmployeeData();
          showToast(`Dashboard updated in real-time (${data.entity.toLowerCase()})`, 'info');
        }
      });
    };

    document.head.appendChild(script);

    return () => {
      const scripts = document.head.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        if (scripts[i].src.includes('/socket.io/socket.io.js')) {
          document.head.removeChild(scripts[i]);
          break;
        }
      }
    };
  }, []);

  if (!isHydrated) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0f172a] text-white">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated || !checkAccess('employee')) {
    return <StaffAuthModal role="employee" />;
  }

  // --- Action Handlers ---
  const handleUpdateOrderStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      const orderId = selectedOrder.id || selectedOrder._id;
      const url = dbType === 'postgres'
        ? `/api/employee/orders/${orderId}/status`
        : `/api/employee/orders/${orderId}`;
      const method = dbType === 'postgres' ? 'PATCH' : 'PUT';

      const response = await fetch(`${API_BASE}${url}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: orderStatusInput, progress: parseInt(orderProgressInput) }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      showToast('Order status updated successfully', 'success');
      setIsProcessModalOpen(false);
      fetchEmployeeData();
    } catch (err) {
      showToast('Failed to update status', 'error');
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

    return matchesSearch && matchesDate;
  });

  const historyOrders = orders.filter(o => {
    if (!['Order Delivered', 'Completed', 'Order Canceled'].includes(o.status)) return false;

    const matchesSearch = !historySearchQuery || (
      o.orderId.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      o.client?.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      o.status?.toLowerCase().includes(historySearchQuery.toLowerCase())
    );

    const matchesDate = !historyDateFilter || (
      new Date(o.date || o.createdAt).toISOString().split('T')[0] === historyDateFilter
    );

    return matchesSearch && matchesDate;
  });


  const renderTabContent = () => {
    switch (activeTab) {
      case 'workbench':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out] flex flex-col h-full">
            <header className="mb-6 flex flex-col">
              <h1 className="text-3xl font-extrabold mb-1">Workbench: Station B</h1>
              <p className="text-text-dim text-[0.95rem] m-0">Good morning. There are currently {activeOrders.length} active orders pending.</p>
            </header>
            
            <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-5 glass-card max-[1100px]:grid-cols-1 mb-6">
              {/* Left: Job Info */}
              <div className="flex flex-col pr-5 max-[1100px]:pr-0 border-r border-border-glass max-[1100px]:border-r-0 max-[1100px]:border-b max-[1100px]:pb-5">
                 <div className="text-[0.75rem] uppercase tracking-wider text-text-dim font-bold mb-2">Current Active Job</div>
                 <h3 className="text-xl font-bold m-0 mb-1 text-primary">Corporate Polos - Nike Team</h3>
                 <div className="text-[0.85rem] text-text-dim mb-6">Design: <span className="text-text-main">Swoosh_Gold_v2.dst</span></div>
                 <div className="flex gap-2 mt-auto">
                    <button className="bg-danger/10 text-danger border border-danger/20 px-4 py-2 rounded-lg font-bold text-[0.85rem] flex-1 hover:bg-danger/20 transition-all cursor-pointer">Emergency Stop</button>
                    <button className="bg-white/5 border border-border-glass px-4 py-2 rounded-lg text-text-main text-[0.85rem] hover:bg-white/10 transition-all cursor-pointer">Log Maintenance</button>
                 </div>
              </div>
              
              {/* Middle: Thread Config */}
              <div className="flex flex-col px-5 max-[1100px]:px-0 border-r border-border-glass max-[1100px]:border-r-0 max-[1100px]:border-b max-[1100px]:pb-5">
                 <div className="text-[0.75rem] uppercase tracking-wider text-text-dim font-bold mb-3">Thread Configuration</div>
                 <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between bg-black/20 p-2.5 rounded-lg border border-border-glass/50">
                       <span className="bg-white/10 w-6 h-6 rounded flex items-center justify-center text-[0.7rem] font-bold">N1</span>
                       <span className="text-[0.85rem] font-medium text-[#fbbf24]">Gold Metallic</span>
                       <span className="text-[0.75rem] text-text-dim font-mono">Madeira 1024</span>
                    </div>
                    <div className="flex items-center justify-between bg-black/20 p-2.5 rounded-lg border border-border-glass/50">
                       <span className="bg-white/10 w-6 h-6 rounded flex items-center justify-center text-[0.7rem] font-bold">N2</span>
                       <span className="text-[0.85rem] font-medium text-[#60a5fa]">Deep Navy</span>
                       <span className="text-[0.75rem] text-text-dim font-mono">Madeira 1103</span>
                    </div>
                 </div>
              </div>

              {/* Right: Live Progress */}
              <div className="flex flex-col pl-5 max-[1100px]:pl-0">
                 <div className="text-[0.75rem] uppercase tracking-wider text-text-dim font-bold mb-3">Live Progress</div>
                 <div className="flex items-center justify-between mb-4">
                    <span className="bg-success/20 text-success border border-success/30 px-3 py-1 rounded-full text-[0.75rem] font-bold">Running</span>
                    <div className="font-mono">
                      <span className="text-2xl font-extrabold text-white">6,500</span>
                      <span className="text-text-dim text-[0.9rem]"> / 10,000</span>
                    </div>
                 </div>
                 <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full animate-[progressPulse_2s_infinite]" style={{ width: '65%' }}></div>
                 </div>
              </div>
            </div>

            {/* Machine Strip */}
            <div className="grid grid-cols-2 gap-3 md:flex md:gap-4">
               <div className="bg-bg-surface border border-border-glass p-3 px-4 rounded-xl flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                  <div className="flex flex-col">
                    <span className="font-bold text-[0.8rem] md:text-[0.85rem]">M#1 Happy</span>
                    <span className="text-text-dim text-[0.65rem] md:text-[0.7rem]">Batch #42A</span>
                  </div>
               </div>
               <div className="bg-bg-surface border border-border-glass p-3 px-4 rounded-xl flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-warning"></div>
                  <div className="flex flex-col">
                    <span className="font-bold text-[0.8rem] md:text-[0.85rem]">M#2 Brother</span>
                    <span className="text-text-dim text-[0.65rem] md:text-[0.7rem]">Idle / Ready</span>
                  </div>
               </div>
            </div>
          </section>
        );
      
      case 'orders':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out]">
             <header className="mb-6 flex justify-between items-end flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-extrabold mb-1">Active Order Queue</h1>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                  <GlassDatePicker 
                    value={ordersDateFilter}
                    onChange={(val) => setOrdersDateFilter(val)}
                    placeholder="Filter date"
                  />
                 <input 
                   type="text" 
                   placeholder="Search queue..." 
                   value={ordersSearchQuery}
                   onChange={(e) => setOrdersSearchQuery(e.target.value)}
                   className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]" 
                 />
                 
              </div>
            </header>
            <div className="glass-table-container max-[1100px]:hidden">
               <table className="glass-table">
                 <thead>
                    <tr>
                      <th className="glass-th text-left">Order ID & Status</th>
                      <th className="glass-th text-left">Client & Date</th>
                      <th className="glass-th text-left">Design / Items</th>
                      <th className="glass-th text-left">Total</th>
                      <th className="glass-th text-right">Action</th>
                    </tr>
                 </thead>
                 <tbody>
                    {isSyncing && orders.length === 0 ? (
                      <tr className="glass-tr"><td colSpan={5} className="glass-td text-center text-text-dim">Syncing active queue with database...</td></tr>
                    ) : activeOrders.length === 0 ? (
                      <tr className="glass-tr"><td colSpan={5} className="glass-td text-center text-text-dim">No active orders in queue.</td></tr>
                    ) : (
                      activeOrders.map((o) => {
                        return (
                          <tr key={o.id || o._id} className="glass-tr hover:bg-white/5 transition-all">
                            <td className="glass-td">
                              <div className="flex flex-col text-left">
                                <span className="font-mono text-sm font-bold text-text-main">{o.orderId}</span>
                                <span className={`inline-block text-[0.7rem] px-2 py-0.5 rounded-full font-bold w-fit mt-1
                                  ${o.status === 'Preparing Order' ? 'bg-primary/20 text-primary border border-primary/30' :
                                    o.status === 'In Transit' ? 'bg-warning/20 text-warning border border-warning/30' :
                                    o.status === 'Ready For Pick Up' ? 'bg-success/20 text-success border border-success/30' :
                                    'bg-white/10 text-text-dim border border-white/20'
                                  }
                                `}>
                                  {o.status} ({o.progress || 0}%)
                                </span>
                              </div>
                            </td>
                            <td className="glass-td text-text-main text-sm font-medium text-left">
                              <div>{o.client || 'Valued Customer'}</div>
                              <div className="text-[0.75rem] text-text-dim mt-0.5">
                                {new Date(o.date || o.createdAt).toLocaleString()}
                              </div>
                            </td>
                            <td className="glass-td text-text-main text-sm text-left">
                              {o.items && Array.isArray(o.items) ? (
                                <div className="flex flex-col gap-0.5">
                                  {o.items.map((item: any, idx: number) => (
                                    <span key={idx} className="line-clamp-1">
                                      {item.quantity}x {item.name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span>{o.design || 'Embroidery Design'}</span>
                              )}
                            </td>
                            <td className="glass-td text-primary font-mono font-bold text-sm text-left">
                              ${parseFloat(o.totalAmount || o.amount || 0).toFixed(2)}
                            </td>
                            <td className="glass-td text-right">
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => {
                                    setSelectedOrder(o);
                                    setOrderStatusInput(o.status || 'In Queue');
                                    setOrderProgressInput((o.progress || 10).toString());
                                    setIsProcessModalOpen(true);
                                  }}
                                  className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/25 transition-all cursor-pointer"
                                >
                                  Process
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
              {isSyncing && orders.length === 0 ? (
                <div className="glass-card p-6 text-center text-text-dim">Syncing active queue with database...</div>
              ) : activeOrders.length === 0 ? (
                <div className="glass-card p-6 text-center text-text-dim">No active orders in queue.</div>
              ) : (
                activeOrders.map((o) => {
                  return (
                    <div key={o.id || o._id} className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-[20px] p-5 flex flex-col justify-between text-left relative group h-[260px]">
                      <div className="grid grid-cols-2 gap-4 py-1 text-sm flex-1 overflow-hidden mb-3">
                        {/* Left Side: ID & Timestamp, Status Badge, Client Name */}
                        <div className="flex flex-col gap-2.5 text-left justify-between h-full">
                          {/* Status Badge */}
                          <span className={`inline-block text-[0.7rem] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider w-fit
                            ${o.status === 'Preparing Order' ? 'bg-primary/20 text-primary border border-primary/30' :
                              o.status === 'In Transit' ? 'bg-warning/20 text-warning border border-warning/30' :
                              o.status === 'Ready For Pick Up' ? 'bg-success/20 text-success border border-success/30' :
                              'bg-white/10 text-text-dim border border-white/20'
                            }
                          `}>
                            {o.status} ({o.progress || 0}%)
                          </span>

                          {/* Upper Left: ID & Timestamp */}
                          <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold text-text-main truncate max-w-[120px]">{o.orderId}</span>
                            <span className="text-[0.65rem] text-text-dim mt-0.5">{new Date(o.date || o.createdAt).toLocaleString()}</span>
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
                              o.items.map((item: any, idx: number) => (
                                <div key={idx} className="py-0.5 border-b border-white/5 last:border-0 truncate">
                                  {item.quantity}x {item.name}
                                </div>
                              ))
                            ) : (
                              <div className="py-0.5">{o.design || 'Embroidery Design'}</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Underneath Button */}
                      <button
                        onClick={() => {
                          setSelectedOrder(o);
                          setOrderStatusInput(o.status || 'In Queue');
                          setOrderProgressInput((o.progress || 10).toString());
                          setIsProcessModalOpen(true);
                        }}
                        className="w-full bg-primary/10 border border-primary/20 text-primary py-2.5 rounded-xl text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer mt-auto text-center"
                      >
                        Process Ticket
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        );

      case 'products':
        return (
          <PanelManageDesigns
            products={products}
            inventory={inventory}
            isSyncing={isSyncing}
            refreshData={fetchEmployeeData}
          />
        );

      case 'materials':
        return (
          <PanelRawMaterials
            inventory={inventory}
            isSyncing={isSyncing}
            refreshData={fetchEmployeeData}
          />
        );

      case 'history':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-6 flex justify-between items-end flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-extrabold mb-1">Order History</h1>
              </div>
              <div className="flex gap-3 items-center">
                 <GlassDatePicker 
                    value={historyDateFilter}
                    onChange={(val) => setHistoryDateFilter(val)}
                    placeholder="Filter date"
                  />
                 <input 
                   type="text" 
                   placeholder="Search history..." 
                   value={historySearchQuery}
                   onChange={(e) => setHistorySearchQuery(e.target.value)}
                   className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]" 
                 />
              </div>
            </header>
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
                    {isSyncing && orders.length === 0 ? (
                      <tr className="glass-tr"><td colSpan={6} className="glass-td text-center text-text-dim">Syncing history with database...</td></tr>
                    ) : historyOrders.length === 0 ? (
                      <tr className="glass-tr"><td colSpan={6} className="glass-td text-center text-text-dim">No historical completed or canceled orders found.</td></tr>
                    ) : (
                      historyOrders.map((o) => {
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
                                  className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/25 transition-all cursor-pointer"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => handleDownloadReceipt(o)}
                                  className="bg-secondary/10 border border-secondary/20 text-secondary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-secondary/25 transition-all cursor-pointer"
                                >
                                  Receipt
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
              {isSyncing && orders.length === 0 ? (
                <div className="glass-card p-6 text-center text-text-dim">Syncing history with database...</div>
              ) : historyOrders.length === 0 ? (
                <div className="glass-card p-6 text-center text-text-dim">No historical completed or canceled orders found.</div>
              ) : (
                historyOrders.map((o) => {
                  return (
                    <div key={o.id || o._id} className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-[20px] p-5 flex flex-col justify-between text-left relative group h-[260px]">
                      <div className="grid grid-cols-2 gap-4 py-1 text-sm flex-1 overflow-hidden mb-3">
                        {/* Left Side: ID & Timestamp, Status Badge, Client Name */}
                        <div className="flex flex-col gap-2.5 text-left justify-between h-full">
                          {/* Status Badge */}
                          <span className={`inline-block text-[0.7rem] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider w-fit
                            ${o.status === 'Completed' || o.status === 'Order Delivered' ? 'bg-success/20 text-success border border-success/30' :
                              'bg-danger/20 text-danger border border-danger/30'
                            }
                          `}>
                            {o.status}
                          </span>

                          {/* Upper Left: ID & Timestamp */}
                          <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold text-text-main truncate max-w-[120px]">{o.orderId}</span>
                            <span className="text-[0.65rem] text-text-dim mt-0.5">{new Date(o.date || o.createdAt).toLocaleDateString()}</span>
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

                      {/* Underneath Designated Buttons */}
                      <div className="flex gap-3 w-full mt-1">
                        <button
                          onClick={() => {
                            setViewingReceiptOrder(o);
                            setIsReceiptModalOpen(true);
                          }}
                          className="flex-1 bg-primary/10 border border-primary/20 text-primary py-2.5 rounded-xl text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer text-center"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleDownloadReceipt(o)}
                          className="flex-1 bg-secondary/10 border border-secondary/20 text-secondary py-2.5 rounded-xl text-xs font-bold hover:bg-secondary/20 transition-all cursor-pointer text-center"
                        >
                          Receipt
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        );

      case 'support':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-8">
              <h1 className="text-3xl font-extrabold mb-1">Support Helpdesk</h1>
              <p className="text-text-dim text-[0.95rem] m-0">Contact tech support or view machine manuals.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-bg-card backdrop-blur-[12px] border border-border-glass p-6 rounded-[20px] flex flex-col items-start text-left hover:-translate-y-1 transition-all duration-300 hover:border-white/20">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center mb-4">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                  </div>
                  <h3 className="font-bold text-lg m-0 mb-2">Machine Manuals</h3>
                  <p className="text-text-dim text-[0.85rem] m-0 mb-6 leading-relaxed flex-1">Access PDF documentation for Happy and Brother embroidery machines.</p>
                  <button className="w-full bg-transparent border border-border-glass text-text-main py-2 rounded-lg text-[0.85rem] font-medium hover:bg-white/5 cursor-pointer mt-auto">View Library</button>
               </div>
               
               <div className="bg-bg-card backdrop-blur-[12px] border border-border-glass p-6 rounded-[20px] flex flex-col items-start text-left hover:-translate-y-1 transition-all duration-300 hover:border-white/20">
                  <div className="w-12 h-12 rounded-xl bg-[#10b981]/20 text-[#10b981] flex items-center justify-center mb-4">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  </div>
                  <h3 className="font-bold text-lg m-0 mb-2">Technical Support</h3>
                  <p className="text-text-dim text-[0.85rem] m-0 mb-6 leading-relaxed flex-1">Direct line to the maintenance department and lead technician.</p>
                  <button className="w-full bg-transparent border border-border-glass text-text-main py-2 rounded-lg text-[0.85rem] font-medium hover:bg-white/5 cursor-pointer mt-auto">Open Ticket</button>
               </div>

               <div className="bg-bg-card backdrop-blur-[12px] border border-border-glass p-6 rounded-[20px] flex flex-col items-start text-left hover:-translate-y-1 transition-all duration-300 hover:border-white/20">
                  <div className="w-12 h-12 rounded-xl bg-[#ef4444]/20 text-[#ef4444] flex items-center justify-center mb-4">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                  </div>
                  <h3 className="font-bold text-lg m-0 mb-2">Emergency Protocols</h3>
                  <p className="text-text-dim text-[0.85rem] m-0 mb-6 leading-relaxed flex-1">Standard operating procedures for power failure or needle breaks.</p>
                  <button className="w-full bg-transparent border border-border-glass text-text-main py-2 rounded-lg text-[0.85rem] font-medium hover:bg-white/5 cursor-pointer mt-auto">Read Protocols</button>
               </div>
            </div>
          </section>
        );

      case 'settings':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out]">
            <header className="mb-8">
              <h1 className="text-3xl font-extrabold mb-1">Portal Settings</h1>
              <p className="text-text-dim text-[0.95rem] m-0">Personalize your workspace experience.</p>
            </header>
            <div className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-[20px] p-8 max-w-[600px] flex flex-col gap-5">
              <h3 className="text-lg font-bold m-0 mb-2">Interface Preferences</h3>
              
              <div className="flex items-center justify-between bg-bg-surface p-5 rounded-xl border border-border-glass">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line></svg>
                   </div>
                   <div className="text-left">
                     <h4 className="m-0 text-[1rem] font-bold">Display Mode</h4>
                     <p className="m-0 mt-1 text-[0.85rem] text-text-dim">Switch between Light and Dark themes</p>
                   </div>
                </div>
                <button onClick={() => {
                  const html = document.documentElement;
                  html.setAttribute('data-theme', html.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
                }} className="bg-primary text-white font-bold px-5 py-2.5 rounded-lg text-[0.9rem] hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] cursor-pointer transition-all">Toggle Theme</button>
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
      {/* Mobile Top Bar */}
      <div className="hidden max-[650px]:flex items-center justify-between w-full h-[60px] px-4 border-b border-border-glass bg-bg-header backdrop-blur-md fixed top-0 left-0 z-[1000]">
         <button onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)} className="bg-transparent border-none text-text-main cursor-pointer p-1">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
         </button>
         <div className="font-extrabold text-[1.1rem] bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">Stitch-Opt</div>
         <div className="w-[32px]"></div> {/* Spacer */}
      </div>

      <div className={`
        max-[650px]:fixed max-[650px]:top-0 max-[650px]:left-0 max-[650px]:h-full max-[650px]:z-[2000] max-[650px]:transition-transform max-[650px]:duration-300
        ${isMobilePanelOpen ? 'max-[650px]:translate-x-0' : 'max-[650px]:-translate-x-full'}
      `}>
         <EmployeeSidebar activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setIsMobilePanelOpen(false); }} />
      </div>

      {/* Mobile Overlay */}
      {isMobilePanelOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1900] hidden max-[650px]:block"
          onClick={() => setIsMobilePanelOpen(false)}
        />
      )}
      
      <main className="flex-1 h-full overflow-y-auto p-8 max-[650px]:p-4 max-[650px]:pt-[80px] scrollbar-thin">
        {renderTabContent()}
      </main>

      {/* Modals */}



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
                    'In Queue': '10',
                    'Preparing Order': '30',
                    'In Transit': '70',
                    'Ready For Pick Up': '90',
                    'Order Delivered': '100',
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
                  'In Transit',
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
                className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all cursor-pointer text-sm"
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



      {/* Receipt Details Modal */}
      <GlassModal 
        isOpen={isReceiptModalOpen} 
        onClose={() => {
          setIsReceiptModalOpen(false);
          setViewingReceiptOrder(null);
        }}
        title="Transaction Receipt Details"
        maxWidth="max-w-[450px]"
      >
        {viewingReceiptOrder && (
          <div className="flex flex-col gap-4 text-left font-sans">
            <div className="flex flex-col items-center border-b border-border-glass pb-4 mb-2">
              <span className="text-[1.8rem] font-extrabold tracking-wider bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">STITCH-OPT</span>
              <span className="text-xs text-text-dim font-mono mt-1">RECEIPT ID: {viewingReceiptOrder.receiptID || viewingReceiptOrder.receiptId || viewingReceiptOrder.receiptRef || 'N/A'}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col">
                <span className="text-xs text-text-dim">Order ID</span>
                <span className="font-bold font-mono text-text-main">{viewingReceiptOrder.orderId}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-text-dim">Date</span>
                <span className="font-medium text-text-main">{new Date(viewingReceiptOrder.date || viewingReceiptOrder.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex flex-col mt-2">
                <span className="text-xs text-text-dim">Client Name</span>
                <span className="font-bold text-text-main">{viewingReceiptOrder.client || 'Valued Client'}</span>
              </div>
              <div className="flex flex-col items-end mt-2">
                <span className="text-xs text-text-dim">Payment Method</span>
                <span className="font-medium uppercase text-text-main">{viewingReceiptOrder.paymentMethod || 'cash'}</span>
              </div>
            </div>

            <div className="border-t border-b border-border-glass py-3 my-2">
              <div className="text-xs font-bold text-text-dim uppercase tracking-wider mb-2">Items Purchased</div>
              <div className="flex flex-col gap-2">
                {viewingReceiptOrder.items && Array.isArray(viewingReceiptOrder.items) ? (
                  viewingReceiptOrder.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="text-text-main font-medium">{item.quantity}x {item.name}</span>
                      <span className="font-mono text-text-main font-bold">${(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-text-main font-medium">{viewingReceiptOrder.design || 'Custom Embroidery'}</span>
                    <span className="font-mono text-text-main font-bold">${parseFloat(viewingReceiptOrder.totalAmount || viewingReceiptOrder.amount || 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center font-mono py-2">
              <span className="text-base font-bold text-text-main">TOTAL AMOUNT:</span>
              <span className="text-lg font-extrabold text-primary">${parseFloat(viewingReceiptOrder.totalAmount || viewingReceiptOrder.amount || 0).toFixed(2)}</span>
            </div>

            <div className="flex gap-3 mt-4">
              <button 
                onClick={() => handleDownloadReceipt(viewingReceiptOrder)}
                className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all cursor-pointer text-center text-sm"
              >
                Download PDF
              </button>
              <button 
                onClick={() => {
                  setIsReceiptModalOpen(false);
                  setViewingReceiptOrder(null);
                }}
                className="bg-white/5 border border-border-glass text-text-main font-bold py-2.5 px-4 rounded-xl hover:bg-white/10 transition-all cursor-pointer text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </GlassModal>

      {/* Persistent AI Assistant */}
      <PersistentAssistant />
    </div>
  );
}
