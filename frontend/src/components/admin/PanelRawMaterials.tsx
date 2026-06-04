'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface InlineStockAdjusterProps {
  material: any;
  refreshData: () => Promise<void>;
  fetchAuditLogs: () => Promise<void>;
}

function InlineStockAdjuster({ material, refreshData, fetchAuditLogs }: InlineStockAdjusterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(material.count.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setInputValue(material.count.toString());
  }, [material.count]);

  const handleIncrement = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: material.count,
        action: 'Add',
        amount: 1,
        minThreshold: material.minThreshold || 10
      });
      showToast(`Incremented stock (+1 spool of ${material.item})`, 'success');
      await refreshData();
      await fetchAuditLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to increment stockpile', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecrement = async () => {
    if (isSubmitting) return;
    if (material.count <= 0) {
      showToast('Stock count cannot go below zero!', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: material.count,
        action: 'Deduct',
        amount: 1,
        minThreshold: material.minThreshold || 10
      });
      showToast(`Decremented stock (-1 spool of ${material.item})`, 'success');
      await refreshData();
      await fetchAuditLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to decrement stockpile', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAbsoluteSubmit = async () => {
    const newVal = parseInt(inputValue);
    if (isNaN(newVal) || newVal < 0) {
      showToast('Please enter a valid stock level', 'error');
      setInputValue(material.count.toString());
      setIsEditing(false);
      return;
    }

    if (newVal === material.count) {
      setIsEditing(false);
      return;
    }

    setIsSubmitting(true);
    const diff = newVal - material.count;
    const action = diff > 0 ? 'Add' : 'Deduct';
    const amount = Math.abs(diff);

    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: material.count,
        action: action,
        amount: amount,
        minThreshold: material.minThreshold || 10
      });
      showToast(`Stock updated to ${newVal} (${action === 'Add' ? '+' : '-'}${amount})`, 'success');
      await refreshData();
      await fetchAuditLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to alter stockpile spool level', 'error');
      setInputValue(material.count.toString());
    } finally {
      setIsEditing(false);
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAbsoluteSubmit();
    } else if (e.key === 'Escape') {
      setInputValue(material.count.toString());
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {/* Decrement Button */}
      <button
        onClick={handleDecrement}
        disabled={isSubmitting}
        className="bg-white/5 border border-border-glass hover:bg-danger/20 hover:text-danger w-8 h-8 rounded-lg flex items-center justify-center text-text-main font-bold cursor-pointer transition-all border-none"
        title="Decrement stockpile Spool (-1)"
      >
        -
      </button>

      {/* Unified Capsule: adjusts count absolute or increment on click (Fixed Width: w-24) */}
      <div
        onClick={() => {
          if (!isEditing && !isSubmitting) {
            setIsEditing(true);
          }
        }}
        className={`flex items-center justify-center h-8 w-24 flex-shrink-0 rounded-lg border transition-all duration-300 ease-in-out cursor-pointer select-none overflow-hidden
          ${isEditing 
            ? 'bg-white/10 border-primary/50 shadow-[0_0_10px_rgba(99,102,241,0.15)]' 
            : 'bg-white/5 border-border-glass hover:border-primary/30 hover:bg-white/10'
          }
        `}
      >
        {isEditing ? (
          <input
            type="number"
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleAbsoluteSubmit}
            onKeyDown={handleKeyDown}
            className="w-9 bg-transparent border-none outline-none font-mono font-extrabold text-sm text-text-main text-center p-0 m-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        ) : (
          <span className="font-mono font-extrabold text-sm text-text-main text-center w-9">
            {material.count}
          </span>
        )}

        {/* Sliding Unit Label */}
        <span
          className={`text-[0.75rem] font-bold text-text-dim transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
            ${isEditing 
              ? 'max-w-0 opacity-0 ml-0 pointer-events-none' 
              : 'max-w-[42px] opacity-100 ml-1'
            }
          `}
        >
          {material.unit || 'Cones'}
        </span>
      </div>

      {/* Increment Button */}
      <button
        onClick={handleIncrement}
        disabled={isSubmitting}
        className="bg-white/5 border border-border-glass hover:bg-success/20 hover:text-success w-8 h-8 rounded-lg flex items-center justify-center text-text-main font-bold cursor-pointer transition-all border-none"
        title="Increment stockpile Spool (+1)"
      >
        +
      </button>
    </div>
  );
}

function InlineThresholdAdjuster({ material, refreshData, fetchAuditLogs }: InlineStockAdjusterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState((material.minThreshold || 10).toString());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setInputValue((material.minThreshold || 10).toString());
  }, [material.minThreshold]);

  const handleAbsoluteSubmit = async () => {
    const newVal = parseInt(inputValue);
    if (isNaN(newVal) || newVal < 0) {
      showToast('Please enter a valid warning limit', 'error');
      setInputValue((material.minThreshold || 10).toString());
      setIsEditing(false);
      return;
    }

    if (newVal === (material.minThreshold || 10)) {
      setIsEditing(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: material.count,
        action: 'Update',
        amount: 0,
        minThreshold: newVal
      });
      showToast(`Safety limit set to ${newVal} for ${material.item}`, 'success');
      await refreshData();
      await fetchAuditLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to update safety warning limit', 'error');
      setInputValue((material.minThreshold || 10).toString());
    } finally {
      setIsEditing(false);
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAbsoluteSubmit();
    } else if (e.key === 'Escape') {
      setInputValue((material.minThreshold || 10).toString());
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5 animate-fade" onClick={(e) => e.stopPropagation()}>
        <input
          type="number"
          autoFocus
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleAbsoluteSubmit}
          onKeyDown={handleKeyDown}
          className="w-14 bg-white/10 border border-primary/50 px-2 py-0.5 rounded text-center text-text-main font-mono font-bold outline-none text-xs"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      disabled={isSubmitting}
      className="bg-transparent hover:bg-white/5 border-none px-2 py-1 rounded font-mono text-xs text-text-dim cursor-pointer transition-all flex items-center gap-1"
      title="Click to edit safety safety threshold"
    >
      {material.minThreshold || 10} <span className="text-[0.65rem] text-text-dim/60">⚙️</span>
    </button>
  );
}

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

  const lowStockItems = inventory.filter((i) => i.count <= (i.minThreshold || 10));

  const handleDownloadRestockList = async () => {
    if (lowStockItems.length === 0) {
      showToast('All stockpile spools are healthy. No restocks required!', 'info');
      return;
    }

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      await api.download('/api/admin/inventory/shopping-list/pdf', `STITCH_OPT_RESTOCK_LIST_${dateStr}.pdf`);
      showToast('Restock purchase shopping list PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to download restock shopping list PDF', 'error');
    }
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left">
      <header className="dash-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="dash-title">Materials Stockpile</h1>
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
        {/* Left side: Materials stockpile card with alert and table */}
        <div className="xl:col-span-2 glass-card">
          <h3 className="text-xl font-bold m-0 mb-4 text-text-main">Materials Stockpile</h3>

          {/* Smart Purchase Requisition Alert Banner */}
          {lowStockItems.length > 0 ? (
            <div className="bg-danger/10 border border-danger/20 p-4 rounded-2xl flex justify-between items-center flex-wrap gap-3 mb-5 text-left animate-fade">
              <div className="flex items-center gap-3">
                <span className="text-2xl animate-pulse">⚠️</span>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-danger">Stock Alert: Restock Recommended!</span>
                  <span className="text-xs text-text-dim mt-0.5">
                    {lowStockItems.length} thread colors are currently below their safety safety thresholds.
                  </span>
                </div>
              </div>
              <button
                onClick={handleDownloadRestockList}
                className="bg-primary border border-primary/30 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary-light transition-all cursor-pointer flex items-center gap-1 shadow-[0_4px_15px_rgba(99,102,241,0.2)]"
              >
                📥 Download Shopping List
              </button>
            </div>
          ) : (
            <div className="bg-success/10 border border-success/20 p-3.5 rounded-xl flex items-center gap-2 mb-5 text-left animate-fade">
              <span className="text-base">🎉</span>
              <span className="text-xs font-bold text-success">Stockpile Healthy! All thread spools are above safety margins.</span>
            </div>
          )}

          {/* Desktop Table View */}
          <div className="glass-table-container max-[1024px]:hidden">
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
                        <td className="glass-td text-left">
                          <InlineStockAdjuster
                            material={i}
                            refreshData={refreshData}
                            fetchAuditLogs={fetchAuditLogs}
                          />
                        </td>
                        <td className="glass-td text-left">
                          <InlineThresholdAdjuster
                            material={i}
                            refreshData={refreshData}
                            fetchAuditLogs={fetchAuditLogs}
                          />
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
                              onClick={() => handleDelete(id)}
                              className="bg-danger/10 border border-danger/20 text-danger px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-danger/25 transition-all cursor-pointer border-none"
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
          <div className="min-[1025px]:hidden grid grid-cols-2 gap-4 animate-fade">
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

                  <div className="flex flex-col gap-2.5 text-xs font-medium">
                    <div>
                      <span className="text-[0.65rem] text-text-dim block mb-1">Current Count</span>
                      <InlineStockAdjuster
                        material={i}
                        refreshData={refreshData}
                        fetchAuditLogs={fetchAuditLogs}
                      />
                    </div>
                    <div>
                      <span className="text-[0.65rem] text-text-dim block mb-1">Low Warning Limit</span>
                      <InlineThresholdAdjuster
                        material={i}
                        refreshData={refreshData}
                        fetchAuditLogs={fetchAuditLogs}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 w-full mt-2">
                    <button
                      onClick={() => handleDelete(id)}
                      className="flex-1 bg-danger/10 border border-danger/20 text-danger py-2.5 rounded-xl text-xs font-bold hover:bg-danger/20 transition-all cursor-pointer border-none"
                    >
                      Delete Material
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right side: Stockpile audit logs trail */}
        <div className="glass-card w-full">
          <h3 className="text-xl font-bold m-0 mb-4 text-text-main">Audit Trail Feed</h3>
          <div className="flex flex-col gap-3 max-h-[580px] overflow-y-auto pr-1">
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
                    {log.details || `${log.action}ed stock for ${log.inventory?.item}`}
                  </p>
                  <div className="flex justify-between items-center mt-1 text-[0.6rem] text-text-dim font-mono">
                    <span>Operator: {log.user || log.userId || 'Staff'}</span>
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
