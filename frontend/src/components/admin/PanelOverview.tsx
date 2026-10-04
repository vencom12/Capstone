'use client';

import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip
} from 'recharts';
import GlassDatePicker from '@/components/ui/GlassDatePicker';
import GlassSelect from '@/components/ui/GlassSelect';
import GlassModal from '@/components/ui/GlassModal';
import WaybillModal from '@/components/dashboard/WaybillModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeletons';

interface PanelOverviewProps {
  orders: any[];
  isSyncing: boolean;
  refreshData: () => Promise<void>;
  dbType?: string;
}

export default function PanelOverview({
  orders,
  isSyncing,
  refreshData,
  dbType
}: PanelOverviewProps) {
  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState('');
  const [queueTab, setQueueTab] = useState<string>('all');

  // Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptDetails, setReceiptDetails] = useState<any>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  // Edit Order Modal State
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editNote, setEditNote] = useState('');
  const [waybillOrder, setWaybillOrder] = useState<any>(null);

  // High-Volume Logistics State (Batch Thermal Labels & Courier Manifest)
  const [batchPrintOrders, setBatchPrintOrders] = useState<any[]>([]);
  const [isManifestOpen, setIsManifestOpen] = useState(false);

  const printIsolatedElement = (elementId: string, docTitle: string, isContinuousThermal = false) => {
    const el = document.getElementById(elementId);
    if (!el) {
      window.print();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${docTitle}</title>
          <style>
            @page {
              size: ${isContinuousThermal ? '100mm 150mm' : 'auto'};
              margin: ${isContinuousThermal ? '4mm' : '10mm'};
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, monospace;
              background: #fff;
              color: #000;
              padding: 0;
              margin: 0;
            }
            ${isContinuousThermal ? `
              .print\\\\:break-after-page {
                page-break-after: always !important;
                break-after: page !important;
                margin-bottom: 8mm;
              }
            ` : ''}
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000; padding: 6px; }
            .border-b-2 { border-bottom: 2px solid #000; }
            .border-b { border-bottom: 1px solid #000; }
            .border-t-2 { border-top: 2px solid #000; }
            .border-t { border-top: 1px solid #000; }
            .border-r { border-right: 1px solid #000; }
            .border { border: 1px solid #000; }
            .border-black { border-color: #000 !important; }
            .flex { display: flex; }
            .flex-col { flex-direction: column; }
            .flex-1 { flex: 1; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: 1fr 1fr; }
            .gap-2 { gap: 8px; }
            .gap-4 { gap: 16px; }
            .gap-6 { gap: 24px; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .font-black { font-weight: 900; }
            .uppercase { text-transform: uppercase; }
            .bg-emerald-700 { background: #047857 !important; color: #fff !important; }
            .bg-\\\\[\\\\#e11d48\\\\] { background: #e11d48 !important; color: #fff !important; }
            .bg-black { background: #000 !important; color: #fff !important; }
            .text-white { color: #fff !important; }
            .rounded-xl { border-radius: 8px; }
            .p-4 { padding: 12px; }
            .p-6 { padding: 18px; }
            svg { display: block; }
          </style>
        </head>
        <body>
          ${el.outerHTML}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 250);
  };

  const openEditModal = (order: any) => {
    setEditingOrder(order);
    setEditStatus(order.status || 'In Queue');
    const existingTracking = (order.personalization && typeof order.personalization === 'object' && order.personalization.trackingNumber)
      ? order.personalization.trackingNumber
      : '';
    setEditTrackingNumber(existingTracking || '');
    setEditNote('');
  };

  const generateTrackingCode = () => {
    if (!editingOrder) return;
    const cleanId = (editingOrder.orderId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
    const code = `JNT-PH-78${cleanId}`;
    setEditTrackingNumber(code);
    showToast(`Generated J&T Express code: ${code}`, 'info');
  };

  // 1. Filtering Logic
  const activeOrders = orders.filter((o) => {
    // Hide delivered and canceled in primary Overview queue
    if (['Order Delivered', 'Completed', 'Order Canceled'].includes(o.status)) return false;

    const matchesSearch =
      !searchQuery ||
      o.orderId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.client?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.status?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDate =
      !dateFilter ||
      new Date(o.date || o.createdAt).toISOString().split('T')[0] === dateFilter;

    const matchesTab = queueTab === 'all' || o.status === queueTab;

    return matchesSearch && matchesDate && matchesTab;
  });

  // Calculate Queued and Realized Revenue
  const pendingOrders = orders.filter(o =>
    ['In Queue', 'Preparing Order', 'In Transit', 'Ready For Pick Up'].includes(o.status)
  );
  const completedOrders = orders.filter(o => o.status === 'Order Delivered');

  const queuedRevenue = pendingOrders.reduce((sum, o) => sum + (o.totalAmount || o.amount || 0), 0);
  const realizedRevenue = completedOrders.reduce((sum, o) => sum + (o.totalAmount || o.amount || 0), 0);

  const totalProjected = realizedRevenue + queuedRevenue;
  const progressPercent = totalProjected > 0 ? (realizedRevenue / totalProjected) * 100 : 0;

  // Group pending orders by status for Pie Chart
  const statusCounts = pendingOrders.reduce((acc: Record<string, number>, order) => {
    const status = order.status || 'In Queue';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: status,
    value: count
  }));

  const STATUS_COLORS: Record<string, string> = {
    'In Queue': '#a855f7',         // Purple
    'Preparing Order': '#6366f1',  // Indigo/Primary
    'In Transit': '#fbbf24',       // Amber/Warning
    'Ready For Pick Up': '#10b981'  // Emerald/Success
  };


  // 2. Fetch Receipt Details
  const viewReceipt = async (order: any) => {
    const transactionId = order.transactionID || order.transactionId || order.receiptID || order.receiptId;
    if (!transactionId || transactionId === 'undefined') {
      showToast('No secure transaction ID recorded for this order', 'error');
      return;
    }
    setSelectedReceipt(order);
    setReceiptDetails(null);
    setIsLoadingReceipt(true);
    setIsReceiptModalOpen(true);

    try {
      const data = await api.get<any>(`/api/customer/receipt/${transactionId}`);
      if (data) {
        setReceiptDetails(data);
      } else {
        throw new Error('No data received');
      }
    } catch (err) {
      console.error('Failed to load transaction receipt:', err);
      showToast('Retrieving receipt data failed', 'error');
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  const handleDownloadReceipt = async (order: any) => {
    const receiptId = receiptDetails?.transactionID || 
                      receiptDetails?.id || 
                      order?.transactionID || 
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

  // 3. Batch Status Apply (Auto-triggered upon dropdown selection)
  const handleBatchStatusApply = async (statusOverride?: string) => {
    const targetStatus = statusOverride || batchStatus;
    if (selectedIds.length === 0) {
      showToast('Select orders first from the queue checkbox', 'error');
      setBatchStatus('');
      return;
    }
    if (!targetStatus) return;

    try {
      await api.post('/api/admin/orders/batch-status', {
        ids: selectedIds,
        status: targetStatus
      });
      showToast(`Batch updated ${selectedIds.length} orders to "${targetStatus}"`, 'success');
      setSelectedIds([]);
      setBatchStatus('');
      refreshData();
    } catch (err) {
      console.error(err);
      showToast('Failed to apply batch updates', 'error');
    }
  };

  // 4. Single Edit Order Status
  const handleEditOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    try {
      const orderId = editingOrder.id || editingOrder._id;
      const hub = editStatus.includes('Transit') || editStatus.includes('Delivery')
        ? 'J&T Express South Luzon Sort Hub'
        : 'Eds Towels Pacific Mall Lucena Hub';

      await api.post('/api/admin/orders/batch-status', {
        ids: [orderId],
        status: editStatus,
        trackingNumber: editTrackingNumber.trim() || undefined,
        note: editNote.trim() || undefined,
        hub,
        courier: 'J&T Express'
      });
      showToast('Order and logistics milestone updated!', 'success');
      setEditingOrder(null);
      refreshData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save status update', 'error');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === activeOrders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(activeOrders.map((o) => o.id || o._id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left">


      {/* Main split grid */}
      <div className="flex flex-col lg:flex-row gap-5 items-start mb-6 w-full">
        {/* Left Column: Active orders queue (70%) */}
        <div className="glass-card flex-1 w-full min-w-0 p-5 border border-border-glass rounded-[24px]">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold m-0 text-text-main">Active Orders Queue</h3>
              <span className="text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                ₱{queuedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Total Value
              </span>
            </div>
            <div className="flex gap-3 items-center flex-wrap">
              <GlassDatePicker
                value={dateFilter}
                onChange={(val) => setDateFilter(val)}
                placeholder="Filter date"
              />
              <input
                type="text"
                placeholder="Search ID or Customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
              />
            </div>
          </div>

          {/* Status Tab Navigation */}
          {(() => {
            const ALL_STATUSES = ['In Queue', 'Preparing Order', 'In Transit', 'Ready For Pick Up'];
            const allActiveOrders = orders.filter((o) => !['Order Delivered', 'Completed', 'Order Canceled'].includes(o.status));
            const tabs = [
              { key: 'all', label: 'All Active', count: allActiveOrders.length },
              ...ALL_STATUSES.map((s) => ({ key: s, label: s, count: allActiveOrders.filter(o => o.status === s).length }))
            ];
            return (
              <div className="flex gap-2 flex-wrap mb-3 border-b border-border-glass/30 pb-3">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setQueueTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      queueTab === tab.key
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                    }`}
                  >
                    {tab.label}
                    <span className={`px-1.5 py-0.5 rounded-full text-[0.6rem] font-extrabold ${
                      queueTab === tab.key ? 'bg-white/20 text-white' : 'bg-white/10 text-text-dim'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Batch operations desk (auto-applies when a status is selected) */}
          <div className="flex items-center gap-3 bg-white/5 border border-border-glass p-2.5 rounded-xl mb-3 flex-wrap">
            <span className="text-[0.8rem] text-text-dim font-bold">
              Batch Action ({selectedIds.length} selected):
            </span>
            <div className="w-[200px]">
              <GlassSelect
                value={batchStatus}
                onChange={(val) => {
                  setBatchStatus(val);
                  if (val) {
                    handleBatchStatusApply(val);
                  }
                }}
                options={[
                  { value: '', label: 'Select Status to Apply...' },
                  { value: 'Preparing Order', label: 'Preparing Order' },
                  { value: 'In Transit', label: 'In Transit' },
                  { value: 'Ready For Pick Up', label: 'Ready For Pick Up' },
                  { value: 'Order Delivered', label: 'Order Delivered' }
                ]}
              />
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const selectedList = orders.filter((o) => selectedIds.includes(o.id || o._id));
                    setBatchPrintOrders(selectedList);
                  }}
                  className="px-3 py-2 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Print continuous 4x6 inch thermal dispatch labels for selected orders"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  <span>Batch Print Labels ({selectedIds.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsManifestOpen(true)}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-text-main border border-border-glass text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Generate a 1-page courier pickup handover sheet for rider signature"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span>Handover Manifest</span>
                </button>
              </div>
            )}

            {selectedIds.length > 0 && (
              <span className="text-xs text-primary font-medium animate-fade">
                Selecting a status applies immediately to {selectedIds.length} order(s)
              </span>
            )}
          </div>

          {isSyncing && orders.length === 0 ? (
            <div className="max-[1100px]:hidden mb-4 w-full animate-pulse">
              <TableSkeleton rows={5} cols={7} />
            </div>
          ) : (
            <div className="glass-table-container max-[1100px]:hidden">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th className="glass-th w-[45px] text-center">
                      <input
                        type="checkbox"
                        checked={activeOrders.length > 0 && selectedIds.length === activeOrders.length}
                        onChange={toggleSelectAll}
                        className="cursor-pointer"
                      />
                    </th>
                    <th className="glass-th text-left">Order ID</th>
                    <th className="glass-th text-left">Client & Date</th>
                    <th className="glass-th text-left">Items / Custom Design</th>
                    <th className="glass-th text-left">Amount</th>
                    <th className="glass-th text-left">Status</th>
                    <th className="glass-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOrders.length === 0 ? (
                    <tr className="glass-tr">
                      <td colSpan={7} className="glass-td text-center text-text-dim">
                        No active orders found.
                      </td>
                    </tr>
                  ) : (
                    activeOrders.map((o) => {
                    const id = o.id || o._id;
                    const isChecked = selectedIds.includes(id);
                    return (
                      <tr
                        key={id}
                        className="glass-tr hover:bg-white/5 transition-all cursor-pointer"
                        onClick={() => viewReceipt(o)}
                      >
                        <td className="glass-td text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(id)}
                            className="cursor-pointer"
                          />
                        </td>
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
                            <div className="flex flex-col gap-1 max-w-[250px]">
                              {o.items.map((item: any, idx: number) => {
                                const variantText = [item.selectedVariant, item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');
                                return (
                                  <div key={idx} className="flex items-center gap-1.5 text-xs truncate">
                                    {item.selectedColor && (
                                      <span className="w-2 h-2 rounded-full border border-white/20 inline-block shrink-0" style={{ backgroundColor: item.selectedColor }} />
                                    )}
                                    <span className="font-medium">{item.quantity}x {item.name}</span>
                                    {variantText && <span className="text-text-dim text-[0.7rem] font-sans">({variantText})</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span>{o.design || 'Embroidery Design'}</span>
                          )}
                        </td>
                        <td className="glass-td text-left font-mono font-bold text-sm text-primary">
                          ₱{parseFloat(o.totalAmount || o.amount || 0).toFixed(2)}
                        </td>
                        <td className="glass-td text-left">
                          <span
                            className={`inline-block text-[0.7rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider
                              ${o.status === 'Preparing Order'
                                ? 'bg-primary/20 text-primary border border-primary/30'
                                : o.status === 'In Transit'
                                  ? 'bg-warning/20 text-warning border border-warning/30'
                                  : o.status === 'Ready For Pick Up'
                                    ? 'bg-success/20 text-success border border-success/30'
                                    : 'bg-white/10 text-text-dim border border-white/20'
                              }
                            `}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="glass-td text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                openEditModal(o);
                              }}
                              className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/25 transition-all cursor-pointer"
                            >
                              Update
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

          {/* Mobile Grid layout */}
          <div className="min-[1101px]:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
            {isSyncing && orders.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))
            ) : activeOrders.length === 0 ? (
              <div className="glass-card p-6 text-center text-text-dim col-span-full">No active orders found.</div>
            ) : (
              activeOrders.map((o) => {
              const id = o.id || o._id;
              const isChecked = selectedIds.includes(id);
              return (
                <div
                  key={id}
                  onClick={() => viewReceipt(o)}
                  className={`bg-bg-card backdrop-blur-[12px] border rounded-[20px] p-5 flex flex-col justify-between text-left relative group h-[260px] cursor-pointer hover:border-primary/50 transition-all ${isChecked ? 'border-primary shadow-sm' : 'border-border-glass'
                    }`}
                >
                  {/* Select Toggle Box */}
                  <div
                    className="absolute top-4 right-4 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelect(id)}
                      className="w-5 h-5 cursor-pointer rounded border-border-glass bg-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-1 text-sm flex-1 overflow-hidden mb-3">
                    {/* Left Column */}
                    <div className="flex flex-col gap-2.5 text-left justify-between h-full">
                      <span
                        className={`inline-block text-[0.7rem] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider w-fit
                          ${o.status === 'Preparing Order'
                            ? 'bg-primary/20 text-primary border border-primary/30'
                            : o.status === 'In Transit'
                              ? 'bg-warning/20 text-warning border border-warning/30'
                              : o.status === 'Ready For Pick Up'
                                ? 'bg-success/20 text-success border border-success/30'
                                : 'bg-white/10 text-text-dim border border-white/20'
                          }
                        `}
                      >
                        {o.status}
                      </span>

                      <div className="flex flex-col">
                        <span className="font-mono text-sm font-bold text-text-main truncate max-w-[120px]">
                          {o.orderId}
                        </span>
                        <span className="text-[0.65rem] text-text-dim mt-0.5">
                          {new Date(o.date || o.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex flex-col text-left">
                        <span className="text-text-dim text-[0.7rem] uppercase tracking-wider block font-semibold mb-0.5">
                          Client
                        </span>
                        <span className="font-bold text-text-main truncate max-w-[140px]">
                          {o.client || 'Valued Customer'}
                        </span>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="flex flex-col gap-1 text-left border-l border-border-glass/20 pl-4 h-full overflow-hidden">
                      <span className="text-text-dim text-[0.7rem] uppercase tracking-wider block font-semibold">
                        Items
                      </span>
                      <div className="flex-1 overflow-y-auto pr-1 text-xs text-text-main font-medium scrollbar-thin">
                        {o.items && Array.isArray(o.items) ? (
                          o.items.map((item: any, idx: number) => {
                            const variantText = [item.selectedVariant, item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');
                            return (
                              <div key={idx} className="py-1 border-b border-white/5 last:border-0 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 truncate">
                                  {item.selectedColor && (
                                    <span className="w-2.5 h-2.5 rounded-full border border-white/20 inline-block shrink-0" style={{ backgroundColor: item.selectedColor }} />
                                  )}
                                  <span className="truncate">{item.quantity}x {item.name}</span>
                                </div>
                                {variantText && <span className="text-text-dim text-[0.7rem] shrink-0 font-sans">({variantText})</span>}
                              </div>
                            );
                          })
                        ) : (
                          <div className="py-0.5">{o.design || 'Embroidery Design'}</div>
                        )}
                      </div>
                      <div className="mt-2 pt-2 border-t border-white/5 font-mono font-bold text-primary text-sm text-left">
                        ₱{parseFloat(o.totalAmount || o.amount || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Edit Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(o);
                    }}
                    className="w-full bg-primary/10 border border-primary/20 text-primary py-2.5 rounded-xl text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer mt-auto text-center"
                  >
                    Edit Status Panel
                  </button>
                </div>
              );
            })
          )}
          </div>
        </div>

        {/* Right Column: Queue distribution donut chart (30%) */}
        <div className="glass-card w-full lg:w-[350px] shrink-0 p-5 flex flex-col relative overflow-hidden text-left min-h-[350px] border border-border-glass rounded-[24px]">
          <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-secondary/5 rounded-full blur-[50px] pointer-events-none"></div>
          <h3 className="text-xs font-bold text-text-dim uppercase tracking-wider mb-4">Queue Distribution</h3>
          {pendingOrders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-text-dim text-xs italic">
              ✨ Queue is clear! All orders fulfilled.
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-full h-[180px] text-xs font-medium">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#a855f7'} />
                      ))}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }: any) => {
                        if (active && payload && payload.length) {
                          const p = payload[0];
                          return (
                            <div className="bg-[#1e293b]/90 backdrop-blur-[12px] border border-border-glass px-2.5 py-1.5 rounded-lg shadow-md text-xs font-bold">
                              <span className="text-white">{p.name}: {p.value} order(s)</span>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Status Labels Legend */}
              <div className="w-full flex flex-col gap-1.5 mt-3 pt-3 border-t border-border-glass/40">
                {pieData.map((entry, idx) => {
                  const color = STATUS_COLORS[entry.name] || '#a855f7';
                  const pct = ((entry.value / pendingOrders.length) * 100).toFixed(0);
                  return (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2 text-text-main font-semibold font-sans">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="truncate max-w-[180px]">{entry.name}</span>
                      </div>
                      <span className="font-mono text-text-dim font-bold">{entry.value} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: View Receipt Details */}
      <GlassModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        title="Secure Checkout Receipt"
      >
        {isLoadingReceipt ? (
          <div className="py-8 text-center text-text-dim">Retrieving transaction details...</div>
        ) : receiptDetails ? (
          <div className="modal-stack text-left font-sans">
            <div className="border-b border-border-glass pb-3 flex justify-between items-center">
              <div>
                <span className="modal-label">Transaction ID</span>
                <p className="font-mono text-sm font-bold text-primary m-0">{receiptDetails.transactionID}</p>
              </div>
              <button
                onClick={() => handleDownloadReceipt(selectedReceipt)}
                className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer"
              >
                Download PDF
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="modal-box">
                <span className="modal-label block">Customer Name</span>
                <span className="modal-text-sm font-bold">{receiptDetails.client || 'Guest'}</span>
              </div>
              <div className="modal-box">
                <span className="modal-label block">Date & Time</span>
                <span className="modal-text-sm font-bold">
                  {new Date(receiptDetails.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="modal-box">
                <span className="modal-label block">Payment Status</span>
                <span className="modal-text-sm font-bold text-success capitalize">{receiptDetails.status}</span>
              </div>
              <div className="modal-box">
                <span className="modal-label block">Total Paid</span>
                <span className="modal-text-sm font-extrabold text-primary font-mono">
                  ₱{parseFloat(receiptDetails.amount || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="modal-section mt-2">
              <span className="modal-label block">Stitched Items</span>
              <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                {receiptDetails.items && receiptDetails.items.length > 0 ? (
                  receiptDetails.items.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="modal-box flex justify-between items-center text-sm"
                    >
                      <span className="font-medium text-text-main">
                        {item.name} <b className="text-primary ml-1">x{item.quantity}</b>
                      </span>
                      <span className="font-mono text-text-dim font-bold">
                        ₱{(item.price * item.quantity).toFixed(2)}
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

      {/* Modal: Edit Status */}
      <GlassModal
        isOpen={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        title="Update Operational & Logistics Status"
      >
        {editingOrder && (
          <form onSubmit={handleEditOrderSubmit} className="modal-stack text-left flex flex-col gap-4">
            <div className="modal-box bg-white/5 p-3 rounded-xl border border-white/10 flex justify-between items-center">
              <div>
                <span className="modal-label text-text-dim text-xs">Active Order ID</span>
                <p className="font-mono font-bold text-white text-sm m-0 mt-0.5">{editingOrder.orderId}</p>
              </div>
              <button
                type="button"
                onClick={() => setWaybillOrder(editingOrder)}
                className="bg-[#e11d48]/20 hover:bg-[#e11d48]/30 border border-[#e11d48]/40 text-[#f43f5e] font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>🏷️ Print Waybill</span>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-text-main">Production & Delivery Status</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'In Queue',
                  'Preparing Order',
                  'In Transit',
                  'Ready For Pick Up',
                  'Out for Delivery',
                  'Order Delivered'
                ].map((status) => {
                  const isActive = editStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setEditStatus(status)}
                      className={`py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer border text-center
                        ${isActive
                          ? 'bg-primary text-white border-transparent shadow-sm'
                          : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                        }
                      `}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* J&T Tracking Number Input */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-text-main flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#e11d48]"></span>
                  J&T Express Tracking Number
                </label>
                <button
                  type="button"
                  onClick={generateTrackingCode}
                  className="text-[0.7rem] text-primary hover:underline font-bold cursor-pointer bg-transparent border-none p-0"
                >
                  Generate J&T Code
                </button>
              </div>
              <input
                type="text"
                value={editTrackingNumber}
                onChange={(e) => setEditTrackingNumber(e.target.value)}
                placeholder="e.g. JNT-PH-78..."
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-primary transition-all"
              />
            </div>

            {/* Logistics Milestone Note */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-main">Milestone Log Note (Visible to Customer)</label>
              <input
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="e.g. Scanned at Pacific Mall Lucena, handed over to J&T Courier"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary transition-all"
              />
            </div>

            <button
              type="submit"
              className="bg-primary text-white font-bold py-3 rounded-xl mt-1 hover:bg-primary-light transition-all cursor-pointer border-none shadow-sm hover:shadow-md text-center w-full text-sm font-sans"
            >
              Save Operational Status & Tracking
            </button>
          </form>
        )}
      </GlassModal>

      {/* Single Parcel Waybill Thermal Sticker Modal */}
      <WaybillModal
        isOpen={!!waybillOrder}
        onClose={() => setWaybillOrder(null)}
        order={waybillOrder}
      />

      {/* Batch Thermal Dispatch Labels Modal (Continuous 4x6 Roll Printing) */}
      <GlassModal
        isOpen={batchPrintOrders.length > 0}
        onClose={() => setBatchPrintOrders([])}
        title={`Batch Shipping Labels (${batchPrintOrders.length} Parcels)`}
        maxWidth="max-w-[540px]"
      >
        <div className="flex flex-col gap-4 font-sans text-text-main">
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary shrink-0">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
              <div>
                <p className="font-bold text-text-main m-0">Continuous 4x6" Thermal Print Feed</p>
                <p className="text-[0.7rem] text-text-dim m-0">
                  Formatted for thermal sticker roll printers with auto page-breaks
                </p>
              </div>
            </div>
            <button
              onClick={() => printIsolatedElement('batch-thermal-labels', 'Batch Thermal Labels', true)}
              className="px-3 py-1.5 rounded-lg bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer border-none shadow-sm flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print All Labels</span>
            </button>
          </div>

          {/* Scrollable preview & continuous print container */}
          <div
            id="batch-thermal-labels"
            className="flex flex-col gap-6 max-h-[70vh] overflow-y-auto pr-1"
          >
            {batchPrintOrders.map((ord, idx) => {
              const pers = (ord.personalization && typeof ord.personalization === 'object') ? ord.personalization : {};
              const cleanCode = (ord.orderId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
              const isPick = pers.fulfillmentType === 'pickup' ||
                (typeof ord.address === 'string' && ord.address.toLowerCase().includes('pick-up')) ||
                (pers.trackingNumber && pers.trackingNumber.startsWith('PU-'));
              const trackNo = pers.trackingNumber || (isPick ? `PU-LUC-${cleanCode}` : `JNT-PH-78${cleanCode}`);
              const qrInfo = `DISPATCH|TRACK:${trackNo}|ORDER:${ord.orderId}|CLIENT:${encodeURIComponent(ord.client || 'Customer')}`;
              const qrImg = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrInfo)}&size=120x120&margin=0`;

              return (
                <div
                  key={ord.id || ord._id || idx}
                  className="bg-white text-black p-4 rounded-xl border border-black shadow-md flex flex-col gap-2 font-mono text-[10px] leading-tight select-all print:border-none print:shadow-none print:p-0 print:m-0 print:w-full print:break-after-page"
                >
                  {/* Top Bar */}
                  <div className="border-b-2 border-black pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <div className={`${isPick ? 'bg-emerald-700' : 'bg-[#e11d48]'} text-white px-2 py-0.5 font-black text-xs tracking-wider rounded-sm`}>
                        {isPick ? 'COUNTER' : 'DISPATCH'}
                      </div>
                      <span className="font-black text-xs">{isPick ? 'STORE PICKUP' : 'J&T EXPRESS'}</span>
                      <span className="text-[9px] font-bold text-black/60">EDS TOWELS & CAPS</span>
                    </div>
                    <div className="text-right">
                      <span className="bg-black text-white px-2 py-0.5 text-[8.5px] font-black uppercase">
                        PACKAGE #{idx + 1} OF {batchPrintOrders.length}
                      </span>
                    </div>
                  </div>

                  {/* Tracking Number Header */}
                  <div className="flex justify-between items-center py-1 border-b border-black">
                    <div>
                      <span className="text-[8px] text-black/60 block font-sans">TRACKING / WAYBILL NO.</span>
                      <span className="font-mono text-xs font-black tracking-wider">{trackNo}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] text-black/60 block font-sans">ORDER REF</span>
                      <span className="font-mono text-[11px] font-black">#{ord.orderId}</span>
                    </div>
                  </div>

                  {/* Route & Hub */}
                  <div className="grid grid-cols-2 border-b-2 border-black divide-x-2 divide-black text-center py-1">
                    <div className="p-0.5">
                      <span className="text-[7.5px] text-black/60 block font-sans">ORIGIN HUB</span>
                      <span className="font-black text-[11px]">LCN-PAC-01</span>
                      <span className="text-[7.5px] block text-black/60">Pacific Mall Lucena</span>
                    </div>
                    <div className="p-0.5">
                      <span className="text-[7.5px] text-black/60 block font-sans">DISPATCH ROUTE</span>
                      <span className="font-black text-[11px]">CAL-MNL-STD</span>
                      <span className="text-[7.5px] block text-black/60">Standard Transit</span>
                    </div>
                  </div>

                  {/* Shipper & Consignee */}
                  <div className="grid grid-cols-2 border-b-2 border-black divide-x-2 divide-black py-1 text-[9.5px]">
                    <div className="pr-1">
                      <span className="font-sans font-black text-[8px] uppercase block text-black/70">SHIPPER:</span>
                      <p className="font-bold m-0">Eds Towels & Caps</p>
                      <p className="m-0 text-[8.5px] text-black/80">Pacific Mall Lucena, Quezon</p>
                      <p className="m-0 text-[8.5px] font-bold">0928 810 3928</p>
                    </div>
                    <div className="pl-1">
                      <span className="font-sans font-black text-[8px] uppercase block text-black/70">RECIPIENT:</span>
                      <p className="font-bold m-0">{ord.client || 'Customer'}</p>
                      <p className="m-0 text-[8.5px] line-clamp-2">{ord.address || 'Pacific Mall Counter Pickup'}</p>
                    </div>
                  </div>

                  {/* Footer & QR */}
                  <div className="flex items-center justify-between pt-1 gap-2 border-t border-black">
                    <div className="flex-1 text-[8.5px]">
                      <span className="font-sans font-black text-[7.5px] uppercase block text-black/60">ITEMS:</span>
                      <p className="font-bold m-0 truncate">
                        {ord.items && ord.items.length > 0
                          ? ord.items.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')
                          : ord.design || 'Custom Embroidery'}
                      </p>
                      <p className="text-[7.5px] text-black/60 m-0 mt-0.5">
                        Amount: ₱{(ord.totalAmount || 0).toFixed(2)} • {ord.paymentMethod?.toUpperCase()}
                      </p>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrImg} alt="QR" className="w-12 h-12 border border-black p-0.5 shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </GlassModal>

      {/* Courier Handover Manifest Modal (1-Page Printable Rider Transmittal) */}
      <GlassModal
        isOpen={isManifestOpen}
        onClose={() => setIsManifestOpen(false)}
        title="Courier Handover Manifest / Transmittal Sheet"
        maxWidth="max-w-[700px]"
      >
        <div className="flex flex-col gap-4 font-sans text-text-main">
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <div>
                <p className="font-bold text-text-main m-0">Standard 1-Page Courier Transmittal Sheet</p>
                <p className="text-[0.7rem] text-text-dim m-0">
                  Proof of parcel handover for DSP courier rider or pickup logistics partner
                </p>
              </div>
            </div>
            <button
              onClick={() => printIsolatedElement('courier-handover-manifest', 'Courier Handover Manifest', false)}
              className="px-3 py-1.5 rounded-lg bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer border-none shadow-sm flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print Transmittal</span>
            </button>
          </div>

          {/* Printable Manifest Document Container */}
          <div
            id="courier-handover-manifest"
            className="bg-white text-black p-6 rounded-xl border border-black shadow-md flex flex-col gap-4 font-sans text-xs select-all print:border-none print:shadow-none print:p-0 print:m-0 print:w-full"
          >
            {/* Header */}
            <div className="border-b-2 border-black pb-3 flex justify-between items-start">
              <div>
                <h3 className="font-black text-base uppercase tracking-tight m-0 text-black">
                  EDS TOWELS & CAPS — PARCEL HANDOVER MANIFEST
                </h3>
                <p className="text-[11px] text-black/70 m-0 mt-0.5">
                  Origin: Pacific Mall Lucena, M.L. Tagarao St., Lucena City, Quezon Province
                </p>
                <p className="text-[10px] text-black/60 m-0">Contact: 0928 810 3928 • Shop Admin Desk</p>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs font-black block">
                  MANIFEST NO: MNF-{new Date().toISOString().slice(0, 10).replace(/-/g, '')}-{(selectedIds.length).toString().padStart(2, '0')}
                </span>
                <span className="text-[10px] text-black/70 block mt-0.5">
                  Date: {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="text-[10px] font-bold text-black block">Total Packages: {selectedIds.length}</span>
              </div>
            </div>

            {/* Table of Dispatched Parcels */}
            <div className="border border-black overflow-hidden">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-black/10 border-b border-black">
                    <th className="p-2 border-r border-black font-black text-center w-8">#</th>
                    <th className="p-2 border-r border-black font-black">Order ID</th>
                    <th className="p-2 border-r border-black font-black">Tracking Number</th>
                    <th className="p-2 border-r border-black font-black">Recipient</th>
                    <th className="p-2 border-r border-black font-black">Destination</th>
                    <th className="p-2 border-r border-black font-black text-right">Amount</th>
                    <th className="p-2 font-black text-center w-16">Pouch Check</th>
                  </tr>
                </thead>
                <tbody>
                  {orders
                    .filter((o) => selectedIds.includes(o.id || o._id))
                    .map((ord, idx) => {
                      const pers = (ord.personalization && typeof ord.personalization === 'object') ? ord.personalization : {};
                      const cleanCode = (ord.orderId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
                      const isPick = pers.fulfillmentType === 'pickup' ||
                        (typeof ord.address === 'string' && ord.address.toLowerCase().includes('pick-up'));
                      const trackNo = pers.trackingNumber || (isPick ? `PU-LUC-${cleanCode}` : `JNT-PH-78${cleanCode}`);

                      return (
                        <tr key={ord.id || ord._id || idx} className="border-b border-black/30">
                          <td className="p-2 border-r border-black text-center font-bold">{idx + 1}</td>
                          <td className="p-2 border-r border-black font-mono font-bold">#{ord.orderId}</td>
                          <td className="p-2 border-r border-black font-mono text-[10px]">{trackNo}</td>
                          <td className="p-2 border-r border-black font-bold">{ord.client || 'Valued Customer'}</td>
                          <td className="p-2 border-r border-black text-[10px] truncate max-w-[150px]">
                            {ord.address?.split('(Landmark:')[0]?.trim() || ord.address || 'Pacific Mall Counter'}
                          </td>
                          <td className="p-2 border-r border-black font-mono font-bold text-right">
                            ₱{(ord.totalAmount || 0).toFixed(2)}
                          </td>
                          <td className="p-2 text-center font-mono">[  ]</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Signature & Handover Sign-off Box */}
            <div className="grid grid-cols-2 gap-6 pt-4 border-t-2 border-black">
              <div className="border border-black p-3 rounded flex flex-col justify-between h-24">
                <span className="font-bold text-[10px] uppercase text-black/70">
                  DISPATCHED BY (EDS TOWELS & CAPS STAFF):
                </span>
                <div className="border-t border-black pt-1 flex justify-between text-[10px]">
                  <span>Signature over Printed Name</span>
                  <span>Date & Time</span>
                </div>
              </div>
              <div className="border border-black p-3 rounded flex flex-col justify-between h-24">
                <span className="font-bold text-[10px] uppercase text-black/70">
                  RECEIVED BY (COURIER RIDER / DSP PARTNER):
                </span>
                <div className="border-t border-black pt-1 flex justify-between text-[10px]">
                  <span>Rider Name & Vehicle / Plate No.</span>
                  <span>Signature & Date</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GlassModal>
    </section>
  );
}
