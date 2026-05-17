'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface PanelRawMaterialsProps {
  inventory: any[];
  isSyncing: boolean;
  refreshData: () => Promise<void>;
}

export default function PanelRawMaterials({
  inventory,
  isSyncing,
  refreshData
}: PanelRawMaterialsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Settings
  const [auditLogToggle, setAuditLogToggle] = useState(true);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Form Fields
  const [itemName, setItemName] = useState('');
  const [itemCount, setItemCount] = useState('');
  const [itemUnit, setItemUnit] = useState('Cones');
  const [itemThreshold, setItemThreshold] = useState('10');

  // Patch Quantity Fields
  const [patchAction, setPatchAction] = useState<'Add' | 'Deduct'>('Add');
  const [patchQty, setPatchQty] = useState('');

  // Global Settings Field
  const [globalThreshold, setGlobalThreshold] = useState('10');

  // 1. Fetch Audit Trail logs
  const fetchAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await api.get<any>('/api/admin/inventory/logs');
      if (data) {
        setAuditLogs(data || []);
      }
    } catch (err) {
      console.error('Failed to load raw material logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
    // Fetch global settings
    api.get<any>('/api/admin/settings')
      .then((settings) => {
        if (settings) {
          setAuditLogToggle(!!settings.inventoryAuditLog);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  // 2. Filter Inventory list
  const filteredInventory = inventory.filter((i) => {
    const query = searchQuery.toLowerCase();
    return !searchQuery || i.item?.toLowerCase().includes(query) || i.unit?.toLowerCase().includes(query);
  });

  // 3. Create New Material
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return showToast('Material item name is required', 'error');

    try {
      await api.post('/api/admin/inventory', {
        item: itemName.trim(),
        count: parseInt(itemCount) || 0,
        unit: itemUnit,
        minThreshold: parseInt(itemThreshold) || 10
      });
      showToast('New thread spool cataloged successfully', 'success');
      setIsAddOpen(false);
      setItemName('');
      setItemCount('');
      setItemUnit('Cones');
      setItemThreshold('10');
      refreshData();
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to create material spool', 'error');
    }
  };

  // 4. Update / Patch Stock
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    const qty = parseInt(patchQty);
    if (isNaN(qty) || qty <= 0) return showToast('Please enter a valid stock amount', 'error');

    try {
      const materialId = editingMaterial.id || editingMaterial._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: editingMaterial.count, // backend handles individual logic
        action: patchAction,
        amount: qty,
        minThreshold: parseInt(itemThreshold) || 10
      });
      showToast('Inventory stock adjusted successfully', 'success');
      setEditingMaterial(null);
      setPatchQty('');
      refreshData();
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to patch stock quantity', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this thread material from stockpile?')) return;
    try {
      await api.delete(`/api/admin/inventory/${id}`);
      showToast('Material deleted from stockpile', 'success');
      refreshData();
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete material spool', 'error');
    }
  };

  // 5. Global Settings Update
  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Update global threshold
      await api.patch('/api/admin/inventory/global', {
        minThreshold: parseInt(globalThreshold) || 10
      });

      // Update Audit Toggle setting
      await api.patch('/api/admin/settings', {
        inventoryAuditLog: auditLogToggle
      });

      showToast('Global stockpile parameters updated', 'success');
      setIsSettingsOpen(false);
      refreshData();
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to apply settings', 'error');
    }
  };

  return (
    <section className="animate-fade flex flex-col h-full text-left">
      <header className="dash-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="dash-title">Raw Materials</h1>
          <p className="dash-subtitle">Stock stockpile management and audit logs.</p>
        </div>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Search spools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
          />
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="bg-bg-surface border border-border-glass w-10 h-10 rounded-xl flex items-center justify-center text-text-main hover:bg-white/5 cursor-pointer"
            title=" stockpile Settings"
          >
            ⚙️
          </button>
          <button
            onClick={() => setIsAddOpen(true)}
            className="bg-primary text-white font-bold px-4 py-2.5 rounded-xl text-[0.85rem] cursor-pointer border-none"
          >
            + Add Material
          </button>
        </div>
      </header>

      {/* Main split dashboard panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start pr-2">
        {/* Left side: Materials stockpile table */}
        <div className="xl:col-span-2 glass-card">
          <h3 className="text-xl font-bold m-0 mb-4 text-text-main">Stock Spool Registry</h3>

          {/* Desktop Table View */}
          <div className="glass-table-container max-[650px]:hidden">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="glass-th text-left">Material Spool</th>
                  <th className="glass-th text-left">Current Count</th>
                  <th className="glass-th text-left">Low Warning</th>
                  <th className="glass-th text-left">Status</th>
                  <th className="glass-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isSyncing && inventory.length === 0 ? (
                  <tr className="glass-tr">
                    <td colSpan={5} className="glass-td text-center text-text-dim">
                      Syncing stockpile records...
                    </td>
                  </tr>
                ) : filteredInventory.length === 0 ? (
                  <tr className="glass-tr">
                    <td colSpan={5} className="glass-td text-center text-text-dim">
                      No stockpile thread spools cataloged.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((i) => {
                    const id = i.id || i._id;
                    const isLow = i.count <= (i.minThreshold || 10);
                    return (
                      <tr key={id} className="glass-tr hover:bg-white/5 transition-all">
                        <td className="glass-td font-bold text-sm text-text-main text-left">
                          {i.item}
                        </td>
                        <td className="glass-td font-mono font-bold text-sm text-text-main text-left">
                          {i.count} {i.unit || 'Cones'}
                        </td>
                        <td className="glass-td font-mono text-sm text-text-dim text-left">
                          {i.minThreshold || 10} {i.unit || 'Cones'}
                        </td>
                        <td className="glass-td text-left">
                          <span
                            className={`inline-block text-[0.7rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider
                              ${isLow
                                ? 'bg-danger/20 text-danger border border-danger/30 animate-pulse'
                                : 'bg-success/20 text-success border border-success/30'
                              }
                            `}
                          >
                            {isLow ? 'Low Stock' : 'Healthy'}
                          </span>
                        </td>
                        <td className="glass-td text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setEditingMaterial(i);
                                setItemThreshold((i.minThreshold || 10).toString());
                                setPatchAction('Add');
                                setPatchQty('');
                              }}
                              className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/25 transition-all cursor-pointer"
                            >
                              Adjust Stock
                            </button>
                            <button
                              onClick={() => handleDelete(id)}
                              className="bg-danger/10 border border-danger/20 text-danger px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-danger/25 transition-all cursor-pointer"
                            >
                              Delete
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

          {/* Mobile Card Blocks View */}
          <div className="min-[651px]:hidden flex flex-col gap-4">
            {filteredInventory.map((i) => {
              const id = i.id || i._id;
              const isLow = i.count <= (i.minThreshold || 10);
              return (
                <div
                  key={id}
                  className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-[20px] p-4 flex flex-col gap-3 text-left relative"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-text-main text-sm">{i.item}</span>
                    <span
                      className={`inline-block text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider
                        ${isLow
                          ? 'bg-danger/20 text-danger border border-danger/30'
                          : 'bg-success/20 text-success border border-success/30'
                        }
                      `}
                    >
                      {isLow ? 'Low Stock' : 'Healthy'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs font-medium">
                    <div>
                      <span className="text-[0.65rem] text-text-dim block mb-0.5">Current Count</span>
                      <span className="font-mono text-text-main text-sm font-bold">
                        {i.count} {i.unit || 'Cones'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[0.65rem] text-text-dim block mb-0.5">Low Warning Limit</span>
                      <span className="font-mono text-text-dim text-sm font-bold">
                        {i.minThreshold || 10} {i.unit || 'Cones'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 w-full mt-2">
                    <button
                      onClick={() => {
                        setEditingMaterial(i);
                        setItemThreshold((i.minThreshold || 10).toString());
                        setPatchAction('Add');
                        setPatchQty('');
                      }}
                      className="flex-1 bg-primary/10 border border-primary/20 text-primary py-2.5 rounded-xl text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer"
                    >
                      Adjust Stock
                    </button>
                    <button
                      onClick={() => handleDelete(id)}
                      className="flex-1 bg-danger/10 border border-danger/20 text-danger py-2.5 rounded-xl text-xs font-bold hover:bg-danger/20 transition-all cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right side: Stockpile audit logs trail */}
        <div className="glass-card">
          <h3 className="text-xl font-bold m-0 mb-4 text-text-main">Audit Trail Feed</h3>
          <div className="flex flex-col gap-3 max-h-[450px] overflow-y-auto pr-1">
            {isLoadingLogs ? (
              <p className="text-xs text-text-dim italic text-center py-4">Syncing audit logs trail...</p>
            ) : auditLogs.length === 0 ? (
              <p className="text-xs text-text-dim italic text-center py-4">No audit transactions recorded.</p>
            ) : (
              auditLogs.map((log, idx) => (
                <div
                  key={log.id || log._id || idx}
                  className="modal-box flex flex-col gap-1 text-left"
                >
                  <div className="flex justify-between items-start">
                    <span className="bg-primary/20 text-primary border border-primary/30 text-[0.6rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      {log.action}
                    </span>
                    <span className="text-[0.65rem] text-text-dim font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-text-main m-0 leading-relaxed font-semibold mt-1">
                    {log.details}
                  </p>
                  <div className="flex justify-between items-center mt-1 text-[0.6rem] text-text-dim font-mono">
                    <span>Operator: {log.user || 'Staff'}</span>
                    <span>Date: {new Date(log.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Add spool */}
      <GlassModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Create stockpile Thread Spool">
        <form onSubmit={handleCreateSubmit} className="modal-stack text-left">
          <div className="modal-section">
            <label className="modal-label">Thread Color / Item Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Metallic Gold"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="modal-section">
              <label className="modal-label">Initial Stock stockpile</label>
              <input
                type="number"
                placeholder="e.g. 50"
                value={itemCount}
                onChange={(e) => setItemCount(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
              />
            </div>
            <div className="modal-section">
              <label className="modal-label">Measurement Unit</label>
              <select
                value={itemUnit}
                onChange={(e) => setItemUnit(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
              >
                <option value="Cones">Cones</option>
                <option value="Spools">Spools</option>
                <option value="Meters">Meters</option>
                <option value="Yards">Yards</option>
                <option value="Units">Units</option>
              </select>
            </div>
          </div>

          <div className="modal-section">
            <label className="modal-label">Low Warning Limit</label>
            <input
              type="number"
              value={itemThreshold}
              onChange={(e) => setItemThreshold(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-[0_10px_20px_rgba(99,102,241,0.3)] text-center w-full text-sm font-sans"
          >
            Establish Material Spool
          </button>
        </form>
      </GlassModal>

      {/* Modal: Stock Adjustments */}
      <GlassModal isOpen={!!editingMaterial} onClose={() => setEditingMaterial(null)} title="Adjust stockpile Spool">
        {editingMaterial && (
          <form onSubmit={handleEditSubmit} className="modal-stack text-left">
            <div className="modal-box">
              <span className="modal-label">Material Item</span>
              <p className="modal-text-sm font-bold text-white m-0 mt-0.5">{editingMaterial.item}</p>
              <div className="flex gap-4 mt-2 text-xs font-mono text-text-dim">
                <span>Current Stock: {editingMaterial.count} {editingMaterial.unit}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="modal-section">
                <label className="modal-label">Stockpile Action</label>
                <select
                  value={patchAction}
                  onChange={(e) => setPatchAction(e.target.value as 'Add' | 'Deduct')}
                  className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
                >
                  <option value="Add">Add Count</option>
                  <option value="Deduct">Deduct Count</option>
                </select>
              </div>

              <div className="modal-section">
                <label className="modal-label">Quantity Amount</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 5"
                  value={patchQty}
                  onChange={(e) => setPatchQty(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
                />
              </div>
            </div>

            <div className="modal-section border-t border-border-glass pt-3">
              <label className="modal-label">Individual Low Stock Threshold</label>
              <input
                type="number"
                value={itemThreshold}
                onChange={(e) => setItemThreshold(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
              />
            </div>

            <button
              type="submit"
              className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-[0_10px_20px_rgba(99,102,241,0.3)] text-center w-full text-sm font-sans"
            >
              Adjust Spool Stockpile
            </button>
          </form>
        )}
      </GlassModal>

      {/* Modal: Global settings stockpile config */}
      <GlassModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Stockpile Parameters">
        <form onSubmit={handleSettingsSubmit} className="modal-stack text-left">
          <div className="modal-section">
            <label className="modal-label">Global Low Stock Threshold</label>
            <input
              type="number"
              placeholder="e.g. 10"
              value={globalThreshold}
              onChange={(e) => setGlobalThreshold(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
            />
          </div>

          <div className="modal-box flex items-center justify-between mt-2">
            <div className="flex flex-col text-left">
              <span className="modal-label text-text-main">Audit trail logs registry</span>
              <span className="text-[0.65rem] text-text-dim mt-0.5">Records thread stock adjustments in DB logs</span>
            </div>
            <input
              type="checkbox"
              checked={auditLogToggle}
              onChange={(e) => setAuditLogToggle(e.target.checked)}
              className="w-5 h-5 cursor-pointer rounded border-border-glass bg-transparent"
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-[0_10px_20px_rgba(99,102,241,0.3)] text-center w-full text-sm font-sans"
          >
            Apply Global Parameters
          </button>
        </form>
      </GlassModal>
    </section>
  );
}
