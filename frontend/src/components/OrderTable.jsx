import { useState } from 'react';
import StatusPill from './ui/StatusPill';
import Modal from './ui/Modal';
import { formatOrderDesign, formatDate } from '../utils/formatters';

const ORDER_STATUSES = ['In Queue', 'Preparing Order', 'In Transit', 'Ready For Pick Up', 'Order Delivered', 'Order Canceled'];

export default function OrderTable({ orders, onUpdate, onBatchUpdate, showCheckboxes = true, showActions = true, filterCompleted = false }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchStatus, setBatchStatus] = useState('');
  const [editOrder, setEditOrder] = useState(null);
  const [editStatus, setEditStatus] = useState('');

  const filtered = filterCompleted
    ? orders.filter(o => o.status === 'Completed' || o.status === 'Order Canceled' || o.status === 'Order Delivered')
    : orders.filter(o => o.status !== 'Completed' && o.status !== 'Order Canceled' && o.status !== 'Order Delivered');

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map(o => o._id));
  };

  const handleBatchApply = () => {
    if (!batchStatus || selectedIds.length === 0) return;
    onBatchUpdate(selectedIds, batchStatus);
    setSelectedIds([]);
    setBatchStatus('');
  };

  const handleEditSave = (e) => {
    e.preventDefault();
    if (!editOrder || !editStatus) return;
    const progress = editStatus === 'Order Delivered' || editStatus === 'Completed' ? 100
      : editStatus === 'Order Canceled' ? 100
      : editStatus === 'Ready For Pick Up' ? 80
      : editStatus === 'In Transit' ? 60
      : editStatus === 'Preparing Order' ? 30 : 0;
    onUpdate(editOrder._id, { status: editStatus, progress });
    setEditOrder(null);
  };

  return (
    <>
      <div className="glass p-6 overflow-x-auto">
        {showCheckboxes && (
          <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
            <h3 className="text-lg font-semibold">{filterCompleted ? 'Completed & Canceled Orders' : 'Recent Orders'}</h3>
            {!filterCompleted && (
              <div className="flex gap-3 items-center">
                <select value={batchStatus} onChange={(e) => setBatchStatus(e.target.value)}
                  className="input-field !py-1.5 !px-3 !rounded-lg !text-sm" style={{ maxWidth: '200px' }}>
                  <option value="">Batch Status Update</option>
                  {ORDER_STATUSES.filter(s => s !== 'Order Canceled').map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={handleBatchApply} className="btn-primary !py-2 !px-4 !text-sm">Apply</button>
              </div>
            )}
          </div>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr>
              {showCheckboxes && !filterCompleted && (
                <th className="text-left p-3 text-text-dim font-normal border-b" style={{ borderColor: 'var(--color-border-glass)', width: '40px' }}>
                  <input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleAll} />
                </th>
              )}
              <th className="text-left p-3 text-text-dim font-normal border-b" style={{ borderColor: 'var(--color-border-glass)' }}>Order ID</th>
              <th className="text-left p-3 text-text-dim font-normal border-b" style={{ borderColor: 'var(--color-border-glass)' }}>Client</th>
              <th className="text-left p-3 text-text-dim font-normal border-b" style={{ borderColor: 'var(--color-border-glass)' }}>Design</th>
              <th className="text-left p-3 text-text-dim font-normal border-b" style={{ borderColor: 'var(--color-border-glass)' }}>Status</th>
              {showActions && !filterCompleted && (
                <th className="text-left p-3 text-text-dim font-normal border-b" style={{ borderColor: 'var(--color-border-glass)' }}>Action</th>
              )}
              {filterCompleted && (
                <th className="text-left p-3 text-text-dim font-normal border-b" style={{ borderColor: 'var(--color-border-glass)' }}>Date</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center text-text-dim p-10">
                  {filterCompleted ? 'No historical orders found.' : 'No active orders.'}
                </td>
              </tr>
            ) : filtered.map(order => (
              <tr key={order._id} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {showCheckboxes && !filterCompleted && (
                  <td className="p-4">
                    <input type="checkbox" checked={selectedIds.includes(order._id)} onChange={() => toggleSelect(order._id)} />
                  </td>
                )}
                <td className="p-4 font-medium">{order.orderId}</td>
                <td className="p-4">{order.client}</td>
                <td className="p-4 text-sm text-text-dim max-w-[200px] truncate">{formatOrderDesign(order)}</td>
                <td className="p-4"><StatusPill status={order.status} /></td>
                {showActions && !filterCompleted && (
                  <td className="p-4">
                    <button onClick={() => { setEditOrder(order); setEditStatus(order.status); }}
                      className="text-sm bg-transparent border-none cursor-pointer"
                      style={{ color: 'var(--color-primary)' }}>Edit</button>
                  </td>
                )}
                {filterCompleted && <td className="p-4 text-sm text-text-dim">{formatDate(order.date)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Order Modal */}
      <Modal isOpen={!!editOrder} onClose={() => setEditOrder(null)} title={`Edit Order ${editOrder?.orderId || ''}`}>
        <form onSubmit={handleEditSave} className="flex flex-col gap-5">
          <div>
            <label className="block mb-2 text-text-dim text-sm">Status</label>
            <div className="flex flex-wrap gap-2">
              {ORDER_STATUSES.map(s => (
                <button key={s} type="button" onClick={() => setEditStatus(s)}
                  className="px-4 py-2 rounded-full text-sm font-medium cursor-pointer border transition-all"
                  style={{
                    background: editStatus === s ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                    borderColor: editStatus === s ? 'var(--color-primary)' : 'var(--color-border-glass)',
                    color: editStatus === s ? 'white' : 'var(--color-text-dim)',
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="btn-primary w-full !py-4">Save Process Updates</button>
        </form>
      </Modal>
    </>
  );
}
