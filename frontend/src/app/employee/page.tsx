'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import EmployeeSidebar from '@/components/employee/EmployeeSidebar';
import dynamic from 'next/dynamic';

const PersistentAssistant = dynamic(() => import('@/components/employee/PersistentAssistant'), {
  ssr: false,
});
import GlassModal from '@/components/ui/GlassModal';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeletons';
import { api, API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import GlassDatePicker from '@/components/ui/GlassDatePicker';
import GlassSelect from '@/components/ui/GlassSelect';
import PanelRawMaterials from '@/components/admin/PanelRawMaterials';
import PanelManageDesigns from '@/components/admin/PanelManageDesigns';

export default function EmployeePage() {
  const router = useRouter();
  const { user, isAuthenticated, checkAccess } = useAuthStore();
  const { fetchProducts } = useProductStore();

  const [activeTab, setActiveTab] = useState('workbench');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  // --- Live DB State ---
  const [orders, setOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [dbType, setDbType] = useState<'mongodb' | 'postgres'>('mongodb');
  const [isSyncing, setIsSyncing] = useState(false);
  const [shiftStatus, setShiftStatus] = useState('offline');

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
  const [orderMachineInput, setOrderMachineInput] = useState('');

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
        setMachines(data.machines || []);
      }
    } catch (err) {
      console.error('Failed to fetch employee state:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleMachineStatus = async (machine: any) => {
    try {
      const nextStatus = machine.status === 'Idle' ? 'Running' : machine.status === 'Running' ? 'Maintenance' : 'Idle';
      await api.put(`/api/machines/${machine.id}`, { status: nextStatus, name: machine.name, type: machine.type });
      fetchEmployeeData();
      showToast(`${machine.name} marked as ${nextStatus}`, 'success');
    } catch (err) {
      showToast('Failed to toggle machine status', 'error');
    }
  };

  const handleToggleShift = async () => {
    try {
      const res: any = await api.put('/api/employee/shift', {});
      const newStatus = res?.shiftStatus || (shiftStatus === 'clocked_in' ? 'offline' : 'clocked_in');
      setShiftStatus(newStatus);
      showToast(newStatus === 'clocked_in' ? 'Clocked in! You are now on shift.' : 'Clocked out. Have a good rest!', 'success');
    } catch (err) {
      showToast('Failed to toggle shift status', 'error');
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

  const autoAllotOrders = async () => {
    const unassignedOrders = orders.filter(
      (o: any) => (o.status === 'In Queue' || o.status === 'Preparing Order') && !o.machineId
    );
    const myMachines = machines.filter((m: any) => m.assignedUserId === user?.id);
    const runningMachines = myMachines.filter((m: any) => m.status === 'Running');

    // Find which running machines already have orders assigned in the database
    const assignedMachineIds = new Set(
      orders
        .filter((o: any) => o.machineId && (o.status === 'In Queue' || o.status === 'Preparing Order'))
        .map((o: any) => o.machineId)
    );

    const idleRunningMachines = runningMachines.filter((m: any) => !assignedMachineIds.has(m.id));

    if (unassignedOrders.length > 0 && idleRunningMachines.length > 0) {
      for (let i = 0; i < Math.min(unassignedOrders.length, idleRunningMachines.length); i++) {
        const order = unassignedOrders[i];
        const machine = idleRunningMachines[i];
        const orderId = order.id || order._id;
        const url = dbType === 'postgres'
          ? `/api/employee/orders/${orderId}/status`
          : `/api/employee/orders/${orderId}`;

        const payload = {
          status: 'Preparing Order',
          progress: 30,
          machineId: machine.id
        };

        try {
          if (dbType === 'postgres') {
            await api.patch(url, payload);
          } else {
            await api.put(url, payload);
          }
        } catch (err) {
          console.error('Failed to auto-allot order:', err);
        }
      }
      fetchEmployeeData();
    }
  };

  useEffect(() => {
    if (machines.length > 0 && orders.length > 0) {
      autoAllotOrders();
    }
  }, [machines, orders]);

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
        transports: ['websocket', 'polling']
      });
      activeSocket = socket;

      socket.on('dataChanged', (data: any) => {
        console.log('[Socket] Data sync received:', data.entity, data.action);
        if (['PRODUCT', 'INVENTORY', 'ORDER', 'MACHINE'].includes(data.entity)) {
          fetchEmployeeData();
          showToast(`Dashboard updated in real-time (${data.entity.toLowerCase()})`, 'info');
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

  // client-side redirect gate if unauthenticated or not employee
  useEffect(() => {
    if (isHydrated) {
      if (!isAuthenticated || !checkAccess('employee')) {
        router.replace('/?auth=login&role=employee');
      }
    }
  }, [isHydrated, isAuthenticated, checkAccess, router]);

  if (!isHydrated || !isAuthenticated || !checkAccess('employee')) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0f172a] text-white">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // --- Action Handlers ---
  const handleUpdateOrderStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const orderId = selectedOrder.id || selectedOrder._id;
    try {
      const url = dbType === 'postgres'
        ? `/api/employee/orders/${orderId}/status`
        : `/api/employee/orders/${orderId}`;

      const payload = {
        status: orderStatusInput,
        progress: parseInt(orderProgressInput),
        machineId: orderMachineInput || null
      };

      if (dbType === 'postgres') {
        await api.patch(url, payload);
      } else {
        await api.put(url, payload);
      }

      showToast('Order status updated successfully', 'success');
      setIsProcessModalOpen(false);
      fetchEmployeeData();
    } catch (err) {
      showToast('Failed to update status', 'error');
    }
  };

  const completeMachineTask = async (order: any, nextStatus: string, machineId: string) => {
    try {
      const orderId = order.id || order._id;
      const url = dbType === 'postgres'
        ? `/api/employee/orders/${orderId}/status`
        : `/api/employee/orders/${orderId}`;

      const payload = {
        status: nextStatus,
        progress: 100,
        machineId: null
      };

      if (dbType === 'postgres') {
        await api.patch(url, payload);
      } else {
        await api.put(url, payload);
      }

      showToast(`Order marked as ${nextStatus}`, 'success');
      fetchEmployeeData();
    } catch (err) {
      showToast('Failed to complete task', 'error');
    }
  };

  const setMachineStatus = async (machine: any, status: string) => {
    try {
      await api.put(`/api/machines/${machine.id}`, { status, name: machine.name, type: machine.type });
      
      // If the machine is set to Idle or Maintenance, and there was an active order assigned to it,
      // we release that order by setting its machineId to null.
      if (status !== 'Running') {
        const assignedOrder = orders.find(
          (o: any) => o.machineId === machine.id && (o.status === 'In Queue' || o.status === 'Preparing Order')
        );
        if (assignedOrder) {
          const orderId = assignedOrder.id || assignedOrder._id;
          const url = dbType === 'postgres'
            ? `/api/employee/orders/${orderId}/status`
            : `/api/employee/orders/${orderId}`;
          const payload = {
            status: 'In Queue',
            progress: 10,
            machineId: null
          };
          if (dbType === 'postgres') {
            await api.patch(url, payload);
          } else {
            await api.put(url, payload);
          }
        }
      }
      
      fetchEmployeeData();
      showToast(`${machine.name} marked as ${status}`, 'success');
    } catch (err) {
      showToast('Failed to change machine status', 'error');
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
            <header className="mb-6 flex justify-between items-center flex-wrap gap-4">
              <div className="flex flex-col">
                <h1 className="text-3xl font-extrabold mb-1">Workbench: Station B</h1>
                <p className="text-text-dim text-[0.95rem] m-0">Good morning. There are currently {activeOrders.length} active orders pending.</p>
              </div>
              <button
                onClick={handleToggleShift}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-bold text-[0.85rem] transition-all cursor-pointer border-none ${
                  shiftStatus === 'clocked_in'
                    ? 'bg-success/20 text-success border border-success/30 hover:bg-success/30'
                    : 'bg-white/5 text-text-dim border border-border-glass hover:bg-white/10'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${shiftStatus === 'clocked_in' ? 'bg-success animate-pulse' : 'bg-text-dim'}`}></span>
                {shiftStatus === 'clocked_in' ? 'On Shift — Clock Out' : 'Clock In'}
              </button>
            </header>
            
            {/* Machine Workstations Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-4">
               {(() => {
                   const myMachines = machines.filter((m: any) => m.assignedUserId === user?.id);
                   if (myMachines.length === 0) {
                     return (
                       <div className="col-span-full py-12 text-center opacity-50 bg-white/5 rounded-2xl border border-white/10">
                         No machines are currently assigned to you.
                       </div>
                     );
                   }

                   const pendingOrders = activeOrders.filter(o => o.status === 'In Queue' || o.status === 'Preparing Order');
                   const machineOrderMap = new Map();
                   myMachines.forEach(m => {
                     const order = pendingOrders.find(o => o.machineId === m.id);
                     if (order) {
                       machineOrderMap.set(m.id, order);
                     }
                   });
                   return myMachines.map(m => {
                      const assignedOrder = machineOrderMap.get(m.id);
                      const score = assignedOrder?.priorityScore ?? 0;

                      // Dynamic card borders and subtle neon glow based on status
                      const cardBorderClass = m.status === 'Running'
                        ? 'border-emerald-500/30 hover:border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.03)]'
                        : m.status === 'Idle'
                        ? 'border-amber-500/20 hover:border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.02)]'
                        : 'border-rose-500/30 hover:border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.03)]';

                      return (
                        <div 
                          key={m.id} 
                          className={`glass-card flex flex-col border relative overflow-hidden min-h-[400px] transition-all duration-300 ${cardBorderClass}`}
                        >
                           {/* Header: Machine Name & Status & 3 Buttons */}
                           <div className="flex justify-between items-center mb-6 pb-4 border-b border-border-glass max-[650px]:flex-col max-[650px]:items-start max-[650px]:gap-4">
                             <div className="flex items-center gap-3">
                               <div className="w-3.5 h-3.5 rounded-full shrink-0 relative flex items-center justify-center">
                                 {m.status === 'Running' ? (
                                   <>
                                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                     <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]"></span>
                                   </>
                                 ) : m.status === 'Idle' ? (
                                   <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]"></span>
                                 ) : (
                                   <>
                                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                     <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.8)]"></span>
                                   </>
                                 )}
                               </div>
                               <h3 className="m-0 font-bold text-xl text-text-main">{m.name}</h3>
                               {m.status === 'Running' && assignedOrder && (
                                <span className={`text-[0.65rem] font-extrabold px-2 py-0.5 rounded-full uppercase border ${
                                  assignedOrder.priorityScore >= 80 ? 'bg-danger/20 border-danger/30 text-danger shadow-[0_0_8px_rgba(239,68,68,0.2)]' :
                                  assignedOrder.priorityScore >= 40 ? 'bg-warning/20 border-warning/30 text-warning' :
                                  'bg-primary/20 border-primary/30 text-primary'
                                }`}>
                                  Score: {assignedOrder.priorityScore !== undefined ? assignedOrder.priorityScore.toFixed(0) : '0'}
                                </span>
                              )}
                             </div>
                             <div className="flex gap-2 max-[650px]:w-full">
                                <button onClick={() => setMachineStatus(m, 'Idle')} className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-all border cursor-pointer ${m.status === 'Idle' ? 'bg-warning/20 text-warning border-warning/30 font-extrabold' : 'bg-white/5 text-text-dim border-transparent hover:bg-white/10'}`}>Idle</button>
                                <button onClick={() => setMachineStatus(m, 'Running')} className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-all border cursor-pointer ${m.status === 'Running' ? 'bg-success/20 text-success border-success/30 font-extrabold' : 'bg-white/5 text-text-dim border-transparent hover:bg-white/10'}`}>Running</button>
                                <button onClick={() => setMachineStatus(m, 'Maintenance')} className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-all border cursor-pointer ${m.status === 'Maintenance' ? 'bg-danger/20 text-danger border-danger/30 font-extrabold' : 'bg-white/5 text-text-dim border-transparent hover:bg-white/10'}`}>Maintenance</button>
                             </div>
                           </div>

                           {/* Task HUD */}
                           {m.status === 'Running' ? (
                             assignedOrder ? (
                               <div className="flex flex-col flex-1">
                                  <div className="flex justify-between items-start mb-4">
                                     <div className="flex flex-col text-left">
                                        <span className="text-[0.7rem] uppercase text-text-dim font-bold mb-0.5">Assigned Tag ID</span>
                                        <span className="text-2xl font-bold font-mono text-primary">{assignedOrder.orderId}</span>
                                     </div>

                                     {/* Radial Urgency / Priority Gauge */}
                                     <div className="flex items-center gap-3">
                                       <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                                         <svg className="w-full h-full transform -rotate-90">
                                           {/* Background track circle */}
                                           <circle
                                             cx="28"
                                             cy="28"
                                             r="22"
                                             className="stroke-white/10"
                                             strokeWidth="4"
                                             fill="transparent"
                                           />
                                           {/* Active progress circle */}
                                           <circle
                                             cx="28"
                                             cy="28"
                                             r="22"
                                             className="transition-all duration-500 ease-out"
                                             style={{
                                               stroke: score >= 80 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#6366f1',
                                               filter: `drop-shadow(0 0 4px ${score >= 80 ? 'rgba(239,68,68,0.5)' : score >= 40 ? 'rgba(245,158,11,0.5)' : 'rgba(99,102,241,0.5)'})`
                                             }}
                                             strokeWidth="4"
                                             fill="transparent"
                                             strokeDasharray={2 * Math.PI * 22}
                                             strokeDashoffset={2 * Math.PI * 22 - (Math.min(Math.max(score, 0), 100) / 100) * 2 * Math.PI * 22}
                                             strokeLinecap="round"
                                           />
                                         </svg>
                                         <div className="absolute flex flex-col items-center justify-center">
                                           <span className="text-[0.8rem] font-black text-white leading-none">{score.toFixed(0)}</span>
                                           <span className="text-[0.45rem] uppercase text-text-dim font-bold mt-0.5 leading-none">PRI</span>
                                         </div>
                                       </div>

                                       <span className="bg-primary/20 text-primary px-3 py-1.5 rounded-full text-xs font-bold border border-primary/30 shrink-0">
                                         Processing
                                       </span>
                                     </div>
                                  </div>

                                  <div className="flex-1 bg-black/30 p-6 rounded-2xl border border-white/5 mb-6 flex flex-col items-center justify-center text-center shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)]">
                                     <h2 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: assignedOrder.personalization?.font || 'inherit' }}>
                                        {assignedOrder.personalization?.text || assignedOrder.client}
                                     </h2>
                                     <div className="flex items-center gap-4 mt-2">
                                       <p className="text-sm text-text-dim italic m-0">Font: {assignedOrder.personalization?.font || 'Standard'}</p>
                                       <div className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded-md border border-white/10">
                                          <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: assignedOrder.personalization?.color || '#fbbf24' }}></div>
                                          <span className="font-bold text-xs text-white">{assignedOrder.personalization?.color || 'Gold'}</span>
                                       </div>
                                     </div>

                                     {assignedOrder.items && Array.isArray(assignedOrder.items) && (
                                        <div className="mt-4 pt-4 border-t border-white/10 w-full flex flex-wrap gap-2 justify-center">
                                          {assignedOrder.items.map((item: any, idx: number) => (
                                             <span key={idx} className="bg-white/5 px-2 py-1 rounded text-xs font-medium text-text-dim">
                                               {item.quantity}x {item.name}
                                             </span>
                                          ))}
                                        </div>
                                     )}
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="grid grid-cols-2 gap-4 mt-auto">
                                     <button 
                                       onClick={() => completeMachineTask(assignedOrder, 'Ready For Pick Up', m.id)}
                                       className="bg-success/10 border border-success/30 text-success hover:bg-success/20 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-[0_4px_15px_rgba(34,197,94,0.15)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                                     >
                                       Ready for Pick Up
                                     </button>
                                     <button 
                                       onClick={() => completeMachineTask(assignedOrder, 'In Transit', m.id)}
                                       className="bg-warning/10 border border-warning/30 text-warning hover:bg-warning/20 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-[0_4px_15px_rgba(245,158,11,0.15)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                                     >
                                       In Transit (Online)
                                     </button>
                                  </div>
                               </div>
                             ) : (
                               <div className="flex-1 flex flex-col items-center justify-center text-text-dim font-medium py-10">
                                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                                  <p className="m-0 text-sm">No pending orders in queue.</p>
                                  <p className="text-xs mt-1 opacity-60">Machine is idling.</p>
                               </div>
                             )
                           ) : (
                              <div className="flex-1 flex flex-col items-center justify-center text-text-dim font-medium py-10">
                                 <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-30"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                 <p className="m-0 text-sm">Machine is {m.status.toLowerCase()}.</p>
                                 <p className="text-xs mt-1 opacity-60">Switch to Running to auto-assign tasks.</p>
                              </div>
                           )}
                        </div>
                      );
                    });
                 })()
               }
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
                          activeOrders.map((o) => {
                         const isBatchMatched = o.status === 'In Queue' && o.design && activeDesigns.includes(o.design.toLowerCase().trim());
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
                             <td className="glass-td text-left">
                               <div className="flex flex-col">
                                 <div className="flex items-center gap-1.5">
                                   <span className={`w-2 h-2 rounded-full ${
                                     o.priorityScore >= 80 ? 'bg-danger animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.7)]' :
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
                                   🕒 Est: {o.estimatedTime !== undefined && o.estimatedTime !== null ? `${o.estimatedTime}m` : 'N/A'}
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
                                   📅 {getRelativeTime(o.dueDate)}
                                 </div>
                               )}
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
                                 <span className="font-semibold">{o.design || 'Embroidery Design'}</span>
                               )}
                               {isBatchMatched && (
                                 <div className="mt-1">
                                   <span className="inline-flex items-center gap-0.5 text-[0.65rem] bg-secondary/25 text-secondary border border-secondary/30 font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                     ⚡ Batch Match
                                   </span>
                                 </div>
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
                activeOrders.map((o) => {
                  return (
                    <div key={o.id || o._id} className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-[20px] p-5 flex flex-col justify-between text-left relative group h-[260px]">
                      <div className="grid grid-cols-2 gap-4 py-1 text-sm flex-1 overflow-hidden mb-3">
                        {/* Left Side: ID & Status Badge, Client, Priority Details */}
                        <div className="flex flex-col gap-2 text-left justify-between h-full">
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

                          {/* Upper Left: ID & Timestamp & Priority */}
                          <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold text-text-main truncate max-w-[120px]">{o.orderId}</span>
                            <span className="text-[0.65rem] text-text-dim mt-0.5">{new Date(o.date || o.createdAt).toLocaleString()}</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                o.priorityScore >= 80 ? 'bg-danger animate-pulse' :
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
                              🕒 Est: {o.estimatedTime !== undefined && o.estimatedTime !== null ? `${o.estimatedTime}m` : 'N/A'}
                            </span>
                            {o.dueDate && (
                              <span className={`text-[0.65rem] font-bold mt-0.5 uppercase ${new Date(o.dueDate).getTime() < Date.now() ? 'text-danger animate-pulse' : 'text-primary'}`}>
                                📅 {getRelativeTime(o.dueDate)}
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
                              o.items.map((item: any, idx: number) => (
                                <div key={idx} className="py-0.5 border-b border-white/5 last:border-0 truncate">
                                  {item.quantity}x {item.name}
                                </div>
                              ))
                            ) : (
                              <div className="py-0.5">{o.design || 'Embroidery Design'}</div>
                            )}
                          </div>
                          {o.status === 'In Queue' && o.design && activeDesigns.includes(o.design.toLowerCase().trim()) && (
                            <span className="inline-flex items-center justify-center gap-0.5 text-[0.6rem] bg-secondary/25 text-secondary border border-secondary/30 font-extrabold px-1 py-0.5 rounded uppercase tracking-wider w-full mt-1">
                              ⚡ Batch Match
                            </span>
                          )}
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
             {isSyncing && orders.length === 0 ? (
               <div className="max-[1100px]:hidden mb-4 w-full">
                 <TableSkeleton rows={5} cols={6} />
               </div>
             ) : (
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
                       {historyOrders.length === 0 ? (
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
            )}

            {/* Tablet & Mobile Card Block View */}
            <div className="min-[1101px]:hidden grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pr-1">
              {isSyncing && orders.length === 0 ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))
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
            {machines.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-text-main">Assign Machine</label>
                <select
                  value={orderMachineInput}
                  onChange={(e) => setOrderMachineInput(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
                >
                  <option value="">— No Machine —</option>
                  {machines.filter(m => m.status !== 'Maintenance' && m.status !== 'Offline').map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.status})</option>
                  ))}
                </select>
              </div>
            )}
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
