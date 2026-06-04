'use client';

import { useState, useEffect } from 'react';
import GlassDatePicker from '@/components/ui/GlassDatePicker';
import GlassSelect from '@/components/ui/GlassSelect';
import GlassModal from '@/components/ui/GlassModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeletons';

interface PanelOverviewProps {
  orders: any[];
  isSyncing: boolean;
  refreshData: () => Promise<void>;
  dbType: 'mongodb' | 'postgres';
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

  // Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptDetails, setReceiptDetails] = useState<any>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  // Edit Order Modal State
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editStatus, setEditStatus] = useState('');

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

    return matchesSearch && matchesDate;
  });

  // Calculate Queued and Realized Revenue
  const pendingOrders = orders.filter(o =>
    ['In Queue', 'Preparing Order', 'In Transit', 'Ready For Pick Up'].includes(o.status)
  );
  const completedOrders = orders.filter(o => o.status === 'Order Delivered');

  const queuedRevenue = pendingOrders.reduce((sum, o) => sum + (o.totalAmount || o.amount || 0), 0);
  const realizedRevenue = completedOrders.reduce((sum, o) => sum + (o.totalAmount || o.amount || 0), 0);

  // AI Main Tip text based on pending queue size
  let aiTipText = '';
  if (pendingOrders.length > 10) {
    aiTipText = `Revenue Alert: High volume detected. ${pendingOrders.length} orders are currently generating value in the queue.`;
  } else if (pendingOrders.length > 0) {
    aiTipText = `Operational Health: Stable. You have ${pendingOrders.length} active orders moving through the system.`;
  } else {
    aiTipText = `System Status: Ready. All orders have been fulfilled. Awaiting new designs or customer checkout.`;
  }

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

  // 3. Batch Status Apply
  const handleBatchStatusApply = async () => {
    if (selectedIds.length === 0) {
      showToast('Select orders first for batch actions', 'error');
      return;
    }
    if (!batchStatus) {
      showToast('Please select a target status', 'error');
      return;
    }

    try {
      await api.post('/api/admin/orders/batch-status', {
        ids: selectedIds,
        status: batchStatus
      });
      showToast(`Batch updated ${selectedIds.length} orders successfully`, 'success');
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
      await api.post('/api/admin/orders/batch-status', {
        ids: [editingOrder.id || editingOrder._id],
        status: editStatus
      });
      showToast('Order status updated successfully', 'success');
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


      {/* AI Master Banner */}
      <div className="glass-card mb-4 relative overflow-hidden flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-gradient-to-br from-primary to-secondary w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 text-sm font-bold">
            🤖
          </div>
          <div className="flex flex-col text-left">
            <span className="font-extrabold text-[0.9rem] text-text-main leading-tight">StitchMaster AI Production Insights</span>
            <span className="text-[0.75rem] text-text-dim mt-0.5" id="ai-main-tip">{aiTipText}</span>
          </div>
        </div>

        {/* insights card container */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1" id="ai-insights-container">
          <div className="bg-white/5 border border-border-glass p-2.5 rounded-xl flex flex-col text-left">
            <span className="text-[0.65rem] font-bold text-text-dim uppercase tracking-wider">Queued Revenue</span>
            <span className="text-base font-extrabold text-success mt-0.5">${queuedRevenue.toFixed(2)}</span>
          </div>
          <div className="bg-white/5 border border-border-glass p-2.5 rounded-xl flex flex-col text-left">
            <span className="text-[0.65rem] font-bold text-text-dim uppercase tracking-wider">Realized Revenue</span>
            <span className="text-base font-extrabold text-primary mt-0.5">${realizedRevenue.toFixed(2)}</span>
          </div>
          <div className="bg-white/5 border border-border-glass p-2.5 rounded-xl flex flex-col text-left">
            <span className="text-[0.65rem] font-bold text-text-dim uppercase tracking-wider">Catalog Velocity</span>
            <span className="text-base font-extrabold text-white mt-0.5">{pendingOrders.length} active</span>
          </div>
          <div className="bg-white/5 border border-border-glass p-2.5 rounded-xl flex flex-col text-left">
            <span className="text-[0.65rem] font-bold text-text-dim uppercase tracking-wider">Order Load</span>
            <span className="text-base font-extrabold text-secondary mt-0.5">{orders.length} total</span>
          </div>
        </div>
      </div>

      {/* Action desk */}
      <div className="glass-card mb-4">
        <div className="flex justify-between items-center flex-wrap gap-3 mb-3">
          <h3 className="text-xl font-bold m-0 text-text-main">Active Orders Queue</h3>
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

        {/* Batch operations desk */}
        <div className="flex items-center gap-3 bg-white/5 border border-border-glass p-2.5 rounded-xl mb-3 flex-wrap">
          <span className="text-[0.8rem] text-text-dim font-bold">
            Batch Action ({selectedIds.length} selected):
          </span>
          <div className="w-[180px]">
            <GlassSelect
              value={batchStatus}
              onChange={(val) => setBatchStatus(val)}
              options={[
                { value: '', label: 'Select Status...' },
                { value: 'Preparing Order', label: 'Preparing Order' },
                { value: 'In Transit', label: 'In Transit' },
                { value: 'Ready For Pick Up', label: 'Ready For Pick Up' },
                { value: 'Order Delivered', label: 'Order Delivered' }
              ]}
            />
          </div>
          <button
            onClick={handleBatchStatusApply}
            className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-xs hover:bg-primary-light transition-all cursor-pointer border-none"
          >
            Apply Change
          </button>
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
                          <div className="flex flex-col gap-0.5 max-w-[250px] truncate">
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
                      <td className="glass-td text-left font-mono font-bold text-sm text-primary">
                        ${parseFloat(o.totalAmount || o.amount || 0).toFixed(2)}
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
                              setEditingOrder(o);
                              setEditStatus(o.status);
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
                className={`bg-bg-card backdrop-blur-[12px] border rounded-[20px] p-5 flex flex-col justify-between text-left relative group h-[260px] cursor-pointer hover:border-primary/50 transition-all ${isChecked ? 'border-primary shadow-[0_4px_15px_rgba(99,102,241,0.2)]' : 'border-border-glass'
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
                        o.items.map((item: any, idx: number) => (
                          <div key={idx} className="py-0.5 border-b border-white/5 last:border-0 truncate">
                            {item.quantity}x {item.name}
                          </div>
                        ))
                      ) : (
                        <div className="py-0.5">{o.design || 'Embroidery Design'}</div>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-white/5 font-mono font-bold text-primary text-sm text-left">
                      ${parseFloat(o.totalAmount || o.amount || 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Edit Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingOrder(o);
                    setEditStatus(o.status);
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
                  ${parseFloat(receiptDetails.amount || 0).toFixed(2)}
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

      {/* Modal: Edit Status */}
      <GlassModal
        isOpen={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        title="Update Order Status"
      >
        {editingOrder && (
          <form onSubmit={handleEditOrderSubmit} className="modal-stack text-left">
            <div className="modal-box">
              <span className="modal-label">Active Order ID</span>
              <p className="modal-text-sm font-mono font-bold text-white m-0 mt-0.5">{editingOrder.orderId}</p>
            </div>

            <div className="modal-section">
              <label className="modal-label">Select Status</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'Preparing Order',
                  'In Transit',
                  'Ready For Pick Up',
                  'Order Delivered'
                ].map((status) => {
                  const isActive = editStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setEditStatus(status)}
                      className={`py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer border
                        ${isActive
                          ? 'bg-primary text-white border-transparent shadow-[0_0_12px_rgba(99,102,241,0.4)]'
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

            <button
              type="submit"
              className="bg-primary text-white font-bold py-3.5 rounded-xl mt-2 hover:bg-primary-light transition-all cursor-pointer border-none shadow-[0_10px_20px_rgba(99,102,241,0.3)] text-center w-full text-sm font-sans"
            >
              Save Operational Status
            </button>
          </form>
        )}
      </GlassModal>
    </section>
  );
}
