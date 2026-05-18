'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

// Modular Sub-Panels
import AdminSidebar from '@/components/admin/AdminSidebar';
import PanelOverview from '@/components/admin/PanelOverview';
import PanelManageDesigns from '@/components/admin/PanelManageDesigns';
import PanelRawMaterials from '@/components/admin/PanelRawMaterials';
import PanelStaffing from '@/components/admin/PanelStaffing';
import PanelAnalytics from '@/components/admin/PanelAnalytics';

// Common Components
import StaffAuthModal from '@/components/auth/StaffAuthModal';
import PersistentAssistant from '@/components/employee/PersistentAssistant';
import { api, API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import GlassModal from '@/components/ui/GlassModal';
import GlassDatePicker from '@/components/ui/GlassDatePicker';

export default function AdminPage() {
  const router = useRouter();
  const { isAuthenticated, checkAccess } = useAuthStore();
  const { isSidebarOpen, setSidebarOpen } = useUIStore();

  const [activeTab, setActiveTab] = useState('overview');
  const [isHydrated, setIsHydrated] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Sync theme state on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' || 'dark';
      setTheme(currentTheme);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    setTheme(nextTheme);
  };

  // --- Real-time Operational Database State ---
  const [orders, setOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbType, setDbType] = useState<'mongodb' | 'postgres'>('mongodb');

  // Order History Panel specific filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyDate, setHistoryDate] = useState('');

  // Receipt Modal in Order History
  const [historyReceiptOrder, setHistoryReceiptOrder] = useState<any>(null);
  const [historyReceiptDetails, setHistoryReceiptDetails] = useState<any>(null);
  const [isLoadingHistoryReceipt, setIsLoadingHistoryReceipt] = useState(false);

  // Fetch complete admin state
  const fetchAdminData = async () => {
    setIsSyncing(true);
    try {
      const data = await api.get<any>('/api/admin/dashboard-state');
      if (data) {
        setOrders(data.orders || []);
        setInventory(data.inventory || data.rawMaterials || []);
        setProducts(data.products || []);
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to sync admin operations data:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Hydration Check
  useEffect(() => {
    const savedTab = localStorage.getItem('stitch-admin-tab');
    if (savedTab) setActiveTab(savedTab);
    setIsHydrated(true);
  }, []);

  // Database Engine Diagnostic Check
  useEffect(() => {
    api.get<{ dbType: string }>('/api/health')
      .then((res) => {
        if (res && res.dbType) {
          setDbType(res.dbType.trim().toLowerCase() as 'mongodb' | 'postgres');
        }
      })
      .catch((err) => console.error('Engine check fail:', err));
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (isAuthenticated && checkAccess('admin')) {
      fetchAdminData();
    }
  }, [isAuthenticated, checkAccess, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('stitch-admin-tab', activeTab);
    }
  }, [activeTab, isHydrated]);

  // Dynamic Live Socket.IO Event Handler
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let activeSocket: any = null;
    let isCancelled = false;

    const script = document.createElement('script');
    script.src = `${API_BASE}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = () => {
      if (isCancelled) return;

      const io = (window as any).io;
      if (!io) return;

      const socket = io(API_BASE, {
        withCredentials: true,
        transports: ['websocket', 'polling']
      });
      activeSocket = socket;

      socket.on('dataChanged', (data: any) => {
        console.log('[Socket Admin] Live telemetry updated:', data.entity, data.action);

        // Dynamic Toasts & Optimistic UI Synced Locks
        if (data.entity === 'ORDER') {
          if (data.action === 'CREATE') {
            showToast('New Customer Stitched Ticket Received!', 'success');
          } else if (data.action === 'UPDATE') {
            showToast(`Order status updated successfully`, 'info');
          }
          fetchAdminData();
        } else if (data.entity === 'PRODUCT') {
          if (data.action === 'CREATE') {
            showToast('New Custom storefront catalog published!', 'success');
          }
          fetchAdminData();
        } else if (['INVENTORY', 'INVENTORY_LOG'].includes(data.entity)) {
          fetchAdminData();
        }
      });
    };

    document.head.appendChild(script);

    return () => {
      isCancelled = true;
      if (activeSocket) {
        activeSocket.close();
      }
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
      <div className="h-screen w-full flex items-center justify-center bg-transparent text-text-main">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // Auth Gate
  if (!isAuthenticated || !checkAccess('admin')) {
    return <StaffAuthModal role="admin" />;
  }

  // --- Filtering History Queue ---
  const historyOrders = orders.filter((o) => {
    // Only completed or canceled tickets in history panel
    if (!['Order Delivered', 'Completed', 'Order Canceled'].includes(o.status)) return false;

    const matchesSearch =
      !historySearch ||
      o.orderId?.toLowerCase().includes(historySearch.toLowerCase()) ||
      o.client?.toLowerCase().includes(historySearch.toLowerCase()) ||
      o.status?.toLowerCase().includes(historySearch.toLowerCase());

    const matchesDate =
      !historyDate ||
      new Date(o.date || o.createdAt).toISOString().split('T')[0] === historyDate;

    return matchesSearch && matchesDate;
  });

  const viewHistoryReceipt = async (order: any) => {
    const transactionId = order.transactionID || order.transactionId || order.receiptID || order.receiptId;
    if (!transactionId || transactionId === 'undefined') {
      showToast('No secure transaction ID recorded', 'error');
      return;
    }
    setHistoryReceiptOrder(order);
    setHistoryReceiptDetails(null);
    setIsLoadingHistoryReceipt(true);

    try {
      const data = await api.get<any>(`/api/customer/receipt/${transactionId}`);
      if (data) {
        setHistoryReceiptDetails(data);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load transaction receipt details', 'error');
    } finally {
      setIsLoadingHistoryReceipt(false);
    }
  };

  const handleDownloadHistoryReceipt = async (order: any) => {
    const receiptId = historyReceiptDetails?.transactionID || 
                      historyReceiptDetails?.id || 
                      order?.transactionID || 
                      order?.transactionId || 
                      order?.receiptID || 
                      order?.receiptId || 
                      order?.orderId || 
                      order?.id || 
                      order?._id;

    if (!receiptId || receiptId === 'undefined') {
      showToast('No archived receipt reference available for download', 'error');
      return;
    }

    try {
      showToast('Preparing secure archived receipt download...', 'info');
      await api.download(`/api/customer/receipt/${receiptId}/download`, `STITCH_OPT_ARCHIVED_RECEIPT_${receiptId}.pdf`);
      showToast('Archived Receipt PDF downloaded successfully', 'success');
    } catch (err) {
      console.error('Download failed:', err);
      showToast('Downloading archived receipt PDF failed', 'error');
    }
  };

  // Render Tabs Panel Router Switch
  const renderContentPanel = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <PanelOverview
            orders={orders}
            isSyncing={isSyncing}
            refreshData={fetchAdminData}
            dbType={dbType}
          />
        );
      case 'products':
        return (
          <PanelManageDesigns
            products={products}
            inventory={inventory}
            isSyncing={isSyncing}
            refreshData={fetchAdminData}
          />
        );
      case 'materials':
        return (
          <PanelRawMaterials
            inventory={inventory}
            isSyncing={isSyncing}
            refreshData={fetchAdminData}
          />
        );
      case 'staffing':
        return (
          <PanelStaffing
            users={users}
            isSyncing={isSyncing}
            refreshData={fetchAdminData}
          />
        );
      case 'analytics':
        return <PanelAnalytics orders={orders} />;

      case 'production':
        // Renders active operational machinery spools & maintenance logs
        return (
          <section className="animate-[fadeIn_0.3s_ease-out] flex flex-col h-full text-left font-sans">
            <header className="mb-6 flex flex-col">
              <h1 className="text-3xl font-extrabold mb-1">Live Production Spools</h1>
              <p className="text-text-dim text-[0.95rem] m-0">Monitor active embroidery spools and machinery health dials.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6 pr-2">
              <div className="bg-bg-card border border-border-glass p-5 rounded-[20px] flex items-center gap-4 text-left">
                <div className="w-3.5 h-3.5 rounded-full bg-success shadow-[0_0_12px_rgba(34,197,94,0.6)]"></div>
                <div className="flex flex-col">
                  <span className="font-bold text-md text-white">Embroidery Machine M#1 Happy</span>
                  <span className="text-text-dim text-xs mt-1">Stitching Swoosh_Gold_v2.dst • Running at 850 RPM</span>
                </div>
              </div>

              <div className="bg-bg-card border border-border-glass p-5 rounded-[20px] flex items-center gap-4 text-left">
                <div className="w-3.5 h-3.5 rounded-full bg-warning shadow-[0_0_12px_rgba(251,191,36,0.6)]"></div>
                <div className="flex flex-col">
                  <span className="font-bold text-md text-white">Embroidery Machine M#2 Brother</span>
                  <span className="text-text-dim text-xs mt-1">Idle • Ready for custom thread spool dropoff</span>
                </div>
              </div>

              <div className="bg-bg-card border border-border-glass p-5 rounded-[20px] flex items-center gap-4 text-left">
                <div className="w-3.5 h-3.5 rounded-full bg-[#3b82f6] shadow-[0_0_12px_rgba(59,130,246,0.6)]"></div>
                <div className="flex flex-col">
                  <span className="font-bold text-md text-white">Manual Stitched Station B</span>
                  <span className="text-text-dim text-xs mt-1">Active • Artisan Alice processing order #ST-9024</span>
                </div>
              </div>
            </div>

            <div className="glass-card p-5 border border-border-glass rounded-[24px] text-left pr-2">
              <h3 className="text-xl font-bold m-0 mb-3 text-text-main">Hardware Spool Dials</h3>
              <p className="text-xs text-text-dim leading-relaxed mb-4">
                Operational note: The business coordinates manual stitched towel/fan and customized clothing items under manual hardware configurations. No direct IoT hardware telemetry endpoints exist. Staff members must adjust spools count manually under stockpile logs.
              </p>
            </div>
          </section>
        );

      case 'history':
        // Renders complete database logs for delivered tickets
        return (
          <section className="animate-[fadeIn_0.3s_ease-out] flex flex-col h-full text-left font-sans">
            <header className="mb-6 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-extrabold mb-1">Archived Order History</h1>
                <p className="text-text-dim text-[0.95rem] m-0">Historical database logs of all delivered customer tickets.</p>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <GlassDatePicker
                  value={historyDate}
                  onChange={(val) => setHistoryDate(val)}
                  placeholder="Filter dropoff date"
                />
                <input
                  type="text"
                  placeholder="Search ID or client..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
                />
              </div>
            </header>

            <div className="glass-card p-5 border border-border-glass rounded-[24px] flex-1 pr-2">
              {/* Desktop Table */}
              <div className="glass-table-container max-[1024px]:hidden">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th className="glass-th text-left">Order ID</th>
                      <th className="glass-th text-left">Client & Date Completed</th>
                      <th className="glass-th text-left">Items Detailed</th>
                      <th className="glass-th text-left">Receipt Amount</th>
                      <th className="glass-th text-right">Archived Audit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyOrders.length === 0 ? (
                      <tr className="glass-tr">
                        <td colSpan={5} className="glass-td text-center text-text-dim py-4">
                          No archived completed tickets matching filters.
                        </td>
                      </tr>
                    ) : (
                      historyOrders.map((o) => {
                        const id = o.id || o._id;
                        return (
                          <tr key={id} className="glass-tr hover:bg-white/5 transition-all">
                            <td className="glass-td font-mono font-bold text-sm text-text-main text-left">
                              {o.orderId}
                            </td>
                            <td className="glass-td text-left text-sm">
                              <div className="font-semibold text-text-main">{o.client || 'Valued Customer'}</div>
                              <div className="text-[0.75rem] text-text-dim mt-0.5">
                                {new Date(o.date || o.createdAt).toLocaleString()}
                              </div>
                            </td>
                            <td className="glass-td text-left text-sm">
                              {o.items && Array.isArray(o.items) ? (
                                <div className="flex flex-col gap-0.5 truncate max-w-[250px]">
                                  {o.items.map((item: any, idx: number) => (
                                    <span key={idx} className="truncate">
                                      {item.quantity}x {item.name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span>{o.design || 'Embroidery Design'}</span>
                              )}
                            </td>
                            <td className="glass-td font-mono text-sm font-bold text-primary text-left">
                              ${parseFloat(o.totalAmount || o.amount || 0).toFixed(2)}
                            </td>
                            <td className="glass-td text-right">
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => viewHistoryReceipt(o)}
                                  className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/25 transition-all cursor-pointer"
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

              {/* Mobile Card Blocks */}
              <div className="min-[1025px]:hidden grid grid-cols-2 gap-4">
                {historyOrders.map((o) => {
                  const id = o.id || o._id;
                  return (
                    <div
                      key={id}
                      onClick={() => viewHistoryReceipt(o)}
                      className="bg-bg-card border border-border-glass rounded-[20px] p-4 flex flex-col gap-3 text-left relative cursor-pointer"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-mono text-sm font-bold text-text-main">{o.orderId}</span>
                        <span className="text-[0.65rem] text-success font-bold bg-success/15 px-2 py-0.5 rounded-full border border-success/20">
                          {o.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs font-medium">
                        <div>
                          <span className="text-[0.65rem] text-text-dim block mb-0.5">Completed Date</span>
                          <span className="text-text-main">
                            {new Date(o.date || o.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-[0.65rem] text-text-dim block mb-0.5">Paid Total</span>
                          <span className="font-mono text-primary font-bold text-sm">
                            ${parseFloat(o.totalAmount || o.amount || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          viewHistoryReceipt(o);
                        }}
                        className="w-full bg-primary/10 border border-primary/20 text-primary py-2.5 rounded-xl text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer mt-auto text-center"
                      >
                        Archived Receipt Details
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal: View Receipt Details */}
            <GlassModal
              isOpen={!!historyReceiptOrder}
              onClose={() => setHistoryReceiptOrder(null)}
              title="Secure Archived Transaction Receipt"
            >
              {isLoadingHistoryReceipt ? (
                <div className="py-8 text-center text-text-dim">Retrieving archival transaction details...</div>
              ) : historyReceiptDetails ? (
                <div className="flex flex-col gap-4 text-left font-sans">
                  <div className="border-b border-border-glass pb-3 flex justify-between items-center">
                    <div>
                      <span className="text-xs text-text-dim uppercase font-semibold">Transaction ID</span>
                      <p className="font-mono text-sm font-bold text-primary m-0">
                        {historyReceiptDetails.transactionID}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadHistoryReceipt(historyReceiptOrder)}
                      className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer"
                    >
                      Download PDF
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm font-medium">
                    <div>
                      <span className="text-xs text-text-dim block">Customer Name</span>
                      <span className="font-bold text-text-main">{historyReceiptDetails.client || 'Guest'}</span>
                    </div>
                    <div>
                      <span className="text-xs text-text-dim block">Date & Time</span>
                      <span className="font-bold text-text-main">
                        {new Date(historyReceiptDetails.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-text-dim block">Payment Status</span>
                      <span className="font-bold text-success capitalize">{historyReceiptDetails.status}</span>
                    </div>
                    <div>
                      <span className="text-xs text-text-dim block">Total Paid</span>
                      <span className="font-bold text-primary font-mono">
                        ${parseFloat(historyReceiptDetails.amount || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <span className="text-xs text-text-dim block mb-2 font-bold uppercase tracking-wider">Items Stitched</span>
                    <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                      {historyReceiptDetails.items && historyReceiptDetails.items.length > 0 ? (
                        historyReceiptDetails.items.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex justify-between items-center bg-white/5 border border-border-glass p-2.5 rounded-lg text-sm"
                          >
                            <span className="font-medium text-text-main">
                              {item.name} <b className="text-primary ml-1">x{item.quantity}</b>
                            </span>
                            <span className="font-mono text-text-dim">
                              ${(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-text-dim italic m-0">No item details available.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-danger">Failed to fetch receipt data.</div>
              )}
            </GlassModal>
          </section>
        );

      case 'settings':
        return (
          <section className="animate-[fadeIn_0.3s_ease-out] flex flex-col h-full text-left font-sans">
            <header className="mb-6 flex flex-col">
              <h1 className="text-3xl font-extrabold mb-1">System Settings</h1>
              <p className="text-text-dim text-[0.95rem] m-0">Configure overall application parameters.</p>
            </header>

            <div className="glass-card p-5 border border-border-glass rounded-[24px] pr-2">
              <h3 className="text-xl font-bold m-0 mb-4 text-text-main">Visual Display Parameters</h3>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between bg-white/5 border border-border-glass p-4 rounded-xl">
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-white">Default Theme Configuration</span>
                    <span className="text-xs text-text-dim mt-1">Locks standard premium dark-mode visuals across auth panels</span>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-2 text-xs font-bold text-primary bg-primary/10 px-4 py-2.5 rounded-full border border-primary/20 hover:bg-primary/20 cursor-pointer transition-all active:scale-95 duration-200"
                  >
                    {theme === 'dark' ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                        Premium Dark Mode Enabled
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                        Premium Light Mode Enabled
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-full flex bg-transparent text-text-main overflow-hidden relative font-sans">
      {/* Dynamic sliding drawer sidebar */}
      <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative h-full">
        {/* Sticky Mobile header container */}
        <header className="min-[651px]:hidden bg-bg-sidebar/95 backdrop-blur-[12px] border-b border-border-glass p-4 flex items-center justify-between sticky top-0 z-[1900] shrink-0">
          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="w-10 h-10 rounded-xl bg-white/5 border border-border-glass flex items-center justify-center text-white cursor-pointer hover:bg-white/10"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <span className="font-extrabold text-[1rem] bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent tracking-tight">
            Stitch-Opt Admin
          </span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-xs">
            AD
          </div>
        </header>

        {/* Content injection viewport */}
        <main className="dash-main flex-1 max-w-[1500px] w-full mx-auto pb-24">
          {renderContentPanel()}
        </main>
      </div>

      {/* Persistent AI Draggable Assistant */}
      <PersistentAssistant />
    </div>
  );
}
