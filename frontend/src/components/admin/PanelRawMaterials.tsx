'use client';

import { useState, useEffect, useMemo } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeletons';
import { computeStockLevel, StockLevelTier } from '@/lib/inventoryUtils';
import Pagination from '@/components/ui/Pagination';
import { useAuthStore } from '@/stores/useAuthStore';

interface InlineStockAdjusterProps {
  material: any;
  refreshData: () => Promise<void>;
  fetchAuditLogs?: () => Promise<void>;
  isAdmin?: boolean;
  setInventory?: React.Dispatch<React.SetStateAction<any[]>>;
}

function InlineStockAdjuster({ material, refreshData, fetchAuditLogs }: InlineStockAdjusterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [optimisticCount, setOptimisticCount] = useState<number>(material.count);
  const [inputValue, setInputValue] = useState(material.count.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setOptimisticCount(material.count);
    setInputValue(material.count.toString());
  }, [material.count]);

  const handleIncrement = async () => {
    const prev = optimisticCount;
    const next = prev + 1;
    setOptimisticCount(next);
    setInputValue(next.toString());
    showToast(`+1 ${material.item}`, 'success');

    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: prev,
        action: 'Add',
        amount: 1,
        minThreshold: material.minThreshold || 10
      });
      refreshData().catch(() => { });
      fetchAuditLogs?.().catch(() => { });
    } catch (err) {
      setOptimisticCount(prev);
      setInputValue(prev.toString());
      console.error(err);
      showToast('Failed to update stock', 'error');
    }
  };

  const handleDecrement = async () => {
    if (optimisticCount <= 0) {
      showToast('Stock cannot be negative', 'error');
      return;
    }
    const prev = optimisticCount;
    const next = prev - 1;
    setOptimisticCount(next);
    setInputValue(next.toString());
    showToast(`-1 ${material.item}`, 'success');

    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: prev,
        action: 'Deduct',
        amount: 1,
        minThreshold: material.minThreshold || 10
      });
      refreshData().catch(() => { });
      fetchAuditLogs?.().catch(() => { });
    } catch (err) {
      setOptimisticCount(prev);
      setInputValue(prev.toString());
      console.error(err);
      showToast('Failed to update stock', 'error');
    }
  };

  const handleAbsoluteSubmit = async () => {
    const newVal = parseInt(inputValue);
    if (isNaN(newVal) || newVal < 0) {
      showToast('Enter a valid number', 'error');
      setInputValue(optimisticCount.toString());
      setIsEditing(false);
      return;
    }

    if (newVal === optimisticCount) {
      setIsEditing(false);
      return;
    }

    const prev = optimisticCount;
    setOptimisticCount(newVal);
    setIsEditing(false);

    const diff = newVal - prev;
    const action = diff > 0 ? 'Add' : 'Deduct';
    const amount = Math.abs(diff);
    showToast(`Stock set to ${newVal}`, 'success');

    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: prev,
        action: action,
        amount: amount,
        minThreshold: material.minThreshold || 10
      });
      refreshData().catch(() => { });
      fetchAuditLogs?.().catch(() => { });
    } catch (err) {
      setOptimisticCount(prev);
      setInputValue(prev.toString());
      console.error(err);
      showToast('Failed to update stock', 'error');
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
            ? 'bg-white/10 border-primary/50 shadow-sm'
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
            {optimisticCount}
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

function InlineThresholdAdjuster({ material, refreshData, fetchAuditLogs, isAdmin = true, setInventory }: InlineStockAdjusterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState((material.minThreshold || 10).toString());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setInputValue((material.minThreshold || 10).toString());
  }, [material.minThreshold]);

  if (!isAdmin) {
    return (
      <span className="font-mono text-xs text-text-dim px-2 py-1 select-none" title="Safety warning limit (Configured by Administrator)">
        {material.minThreshold || 10}
      </span>
    );
  }

  const handleAbsoluteSubmit = async () => {
    const newVal = parseInt(inputValue);
    if (isNaN(newVal) || newVal < 0) {
      showToast('Enter a valid threshold', 'error');
      setInputValue((material.minThreshold || 10).toString());
      setIsEditing(false);
      return;
    }

    if (newVal === (material.minThreshold || 10)) {
      setIsEditing(false);
      return;
    }

    const prevThreshold = material.minThreshold || 10;
    const materialId = material.id || material._id;

    if (setInventory) {
      setInventory((prev) =>
        prev.map((m) => ((m.id || m._id) === materialId ? { ...m, minThreshold: newVal } : m))
      );
    }

    setIsSubmitting(true);
    try {
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: material.count,
        action: 'Update',
        amount: 0,
        minThreshold: newVal
      });
      showToast(`Threshold set to ${newVal}`, 'success');
      await refreshData();
      if (fetchAuditLogs) await fetchAuditLogs();
    } catch (err) {
      console.error(err);
      if (setInventory) {
        setInventory((prev) =>
          prev.map((m) => ((m.id || m._id) === materialId ? { ...m, minThreshold: prevThreshold } : m))
        );
      }
      showToast('Failed to update threshold', 'error');
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
      {material.minThreshold || 10}
    </button>
  );
}

interface InlineSupplierCostAdjusterProps {
  material: any;
  refreshData: () => Promise<void>;
  isAdmin?: boolean;
  setInventory?: React.Dispatch<React.SetStateAction<any[]>>;
}

function InlineSupplierCostAdjuster({ material, refreshData, isAdmin = true, setInventory }: InlineSupplierCostAdjusterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(
    material.supplierUnitCost != null ? String(material.supplierUnitCost) : ''
  );
  const [inputMode, setInputMode] = useState<'unit' | 'pack'>('unit');
  const [packInputValue, setPackInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const packSize = material.packSize && material.packSize > 1 ? material.packSize : 1;
  const unitCost = material.supplierUnitCost != null ? Number(material.supplierUnitCost) : null;
  const packCost = unitCost != null && packSize > 1 ? unitCost * packSize : null;

  useEffect(() => {
    setInputValue(material.supplierUnitCost != null ? String(material.supplierUnitCost) : '');
    setPackInputValue(packCost != null ? packCost.toFixed(2) : '');
  }, [material.supplierUnitCost, packCost]);

  const handleUnitChange = (val: string) => {
    setInputValue(val);
    const num = parseFloat(val);
    if (!isNaN(num) && packSize > 1) {
      setPackInputValue((num * packSize).toFixed(2));
    } else {
      setPackInputValue('');
    }
  };

  const handlePackChange = (val: string) => {
    setPackInputValue(val);
    const num = parseFloat(val);
    if (!isNaN(num) && packSize > 1) {
      setInputValue((num / packSize).toFixed(2));
    } else {
      setInputValue('');
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col text-left font-mono select-none">
        <span className="text-xs text-text-dim">
          {unitCost != null ? `₱${unitCost.toFixed(2)}` : '—'}
        </span>
        {packCost != null && (
          <span className="text-[10px] text-text-dim/70">
            ₱{packCost.toFixed(2)} / pack of {packSize}
          </span>
        )}
      </div>
    );
  }

  const handleSubmit = async () => {
    const parsed = inputValue.trim() === '' ? null : parseFloat(inputValue);
    if (inputValue.trim() !== '' && (isNaN(parsed!) || parsed! < 0)) {
      showToast('Enter a valid cost (or leave blank to clear)', 'error');
      setInputValue(material.supplierUnitCost != null ? String(material.supplierUnitCost) : '');
      setPackInputValue(packCost != null ? packCost.toFixed(2) : '');
      setIsEditing(false);
      return;
    }
    if (parsed === material.supplierUnitCost || (parsed == null && material.supplierUnitCost == null)) {
      setIsEditing(false);
      return;
    }

    const materialId = material.id || material._id;
    const prevCost = material.supplierUnitCost;

    // Optimistically update in state immediately
    if (setInventory) {
      setInventory((prev) =>
        prev.map((m) => ((m.id || m._id) === materialId ? { ...m, supplierUnitCost: parsed } : m))
      );
    }
    setIsEditing(false);
    showToast(
      parsed != null
        ? `Cost set to ₱${parsed.toFixed(2)} / ${material.unit || 'PC'}`
        : 'Cost cleared',
      'success'
    );

    try {
      await api.patch(`/api/admin/inventory/${materialId}`, { supplierUnitCost: parsed });
      refreshData().catch(() => { });
    } catch (err) {
      console.error(err);
      if (setInventory) {
        setInventory((prev) =>
          prev.map((m) => ((m.id || m._id) === materialId ? { ...m, supplierUnitCost: prevCost } : m))
        );
      }
      showToast('Failed to update cost', 'error');
      setInputValue(prevCost != null ? String(prevCost) : '');
      setPackInputValue(packCost != null ? packCost.toFixed(2) : '');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    else if (e.key === 'Escape') {
      setInputValue(material.supplierUnitCost != null ? String(material.supplierUnitCost) : '');
      setPackInputValue(packCost != null ? packCost.toFixed(2) : '');
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1.5 animate-fade bg-black/40 border border-primary/40 p-2 rounded-lg" onClick={(e) => e.stopPropagation()}>
        {packSize > 1 && (
          <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded text-[9px] font-bold self-start">
            <button
              type="button"
              onClick={() => setInputMode('unit')}
              className={`px-1.5 py-0.5 rounded cursor-pointer transition ${inputMode === 'unit' ? 'bg-primary text-white' : 'text-text-dim hover:text-text-main'}`}
            >
              / {material.unit || 'PC'}
            </button>
            <button
              type="button"
              onClick={() => setInputMode('pack')}
              className={`px-1.5 py-0.5 rounded cursor-pointer transition ${inputMode === 'pack' ? 'bg-primary text-white' : 'text-text-dim hover:text-text-main'}`}
            >
              / Pack ({packSize})
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-text-dim text-xs font-bold select-none">₱</span>
          {packSize > 1 && inputMode === 'pack' ? (
            <input
              type="number"
              autoFocus
              min="0"
              step="1"
              value={packInputValue}
              onChange={(e) => handlePackChange(e.target.value)}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
              placeholder="0.00"
              className="w-20 bg-white/10 border border-primary/50 px-2 py-0.5 rounded text-center text-text-main font-mono font-bold outline-none text-xs"
            />
          ) : (
            <input
              type="number"
              autoFocus
              min="0"
              step="0.5"
              value={inputValue}
              onChange={(e) => handleUnitChange(e.target.value)}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
              placeholder="0.00"
              className="w-20 bg-white/10 border border-primary/50 px-2 py-0.5 rounded text-center text-text-main font-mono font-bold outline-none text-xs"
            />
          )}
        </div>

        {packSize > 1 && inputValue && !isNaN(parseFloat(inputValue)) && (
          <span className="text-[10px] text-primary font-mono whitespace-nowrap">
            ₱{(parseFloat(inputValue) * packSize).toFixed(2)}/pack ÷ {packSize} = ₱{parseFloat(inputValue).toFixed(2)}/PC
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      disabled={isSubmitting}
      className="bg-transparent hover:bg-white/5 border-none px-2 py-1 rounded text-xs cursor-pointer transition-all flex flex-col text-left group"
      title={packSize > 1 ? `₱${unitCost?.toFixed(2)}/PC (₱${packCost?.toFixed(2)} for pack of ${packSize})` : "Click to set supplier cost"}
    >
      {unitCost != null ? (
        <>
          <span className="text-primary font-bold font-mono">
            ₱{unitCost.toFixed(2)}
            <span className="text-[10px] text-text-dim font-normal ml-0.5">/{material.unit || 'PC'}</span>
          </span>
          {packCost != null && (
            <span className="text-[10px] text-text-dim font-mono">
              ₱{packCost.toFixed(2)} / pack of {packSize}
            </span>
          )}
        </>
      ) : (
        <span className="text-text-dim/50 group-hover:text-text-dim italic font-mono">Set cost...</span>
      )}
    </button>
  );
}

interface PanelRawMaterialsProps {
  inventory: any[];
  products?: any[];
  isSyncing: boolean;
  refreshData: () => Promise<void>;
  setInventory?: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function PanelRawMaterials({
  inventory,
  products = [],
  isSyncing,
  refreshData,
  setInventory
}: PanelRawMaterialsProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  // Helper: Find all products and variants linked to a specific material
  const getLinkedProductsForMaterial = (matId: string, matName: string) => {
    if (!products || products.length === 0) return [];
    const links: { productId: string; productName: string; variantName?: string; type: 'variant' | 'recipe' }[] = [];

    for (const p of products) {
      const pId = p.id || p._id || '';
      // 1. Check if linked to any variant
      if (p.variants && Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (v.materialId === matId || (v.materialName && v.materialName.toLowerCase() === matName.toLowerCase())) {
            links.push({ productId: pId, productName: p.name, variantName: v.name, type: 'variant' });
          }
        }
      }
      // 2. Check if linked in recipe BOM
      if (p.recipe && Array.isArray(p.recipe)) {
        for (const r of p.recipe) {
          if (r.inventoryId === matId || (r.name && r.name.toLowerCase() === matName.toLowerCase())) {
            links.push({ productId: pId, productName: p.name, type: 'recipe' });
          }
        }
      }
    }
    return links;
  };

  // Link Material to Product Modal State
  const [linkingMaterial, setLinkingMaterial] = useState<any | null>(null);
  const [selectedTargetProductId, setSelectedTargetProductId] = useState<string>('');
  const [linkingQuantity, setLinkingQuantity] = useState<number>(1);
  const [isLinkingSubmitting, setIsLinkingSubmitting] = useState<boolean>(false);

  const openLinkProductModal = (material: any) => {
    setLinkingMaterial(material);
    if (products && products.length > 0) {
      setSelectedTargetProductId(products[0].id || products[0]._id || '');
    }
    setLinkingQuantity(1);
  };

  const handleLinkProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingMaterial || !selectedTargetProductId) return;

    const targetProduct = products.find(p => (p.id || p._id) === selectedTargetProductId);
    if (!targetProduct) return;

    setIsLinkingSubmitting(true);
    const materialId = linkingMaterial.id || linkingMaterial._id;
    const materialName = linkingMaterial.item;
    const currentRecipe = Array.isArray(targetProduct.recipe) ? [...targetProduct.recipe] : [];

    // Check if already in recipe
    if (currentRecipe.some((r: any) => r.inventoryId === materialId)) {
      showToast('Item already linked', 'info');
      setIsLinkingSubmitting(false);
      return;
    }

    const updatedRecipe = [
      ...currentRecipe,
      {
        inventoryId: materialId,
        name: materialName,
        quantity: linkingQuantity || 1
      }
    ];

    try {
      await api.put(`/api/admin/products/${selectedTargetProductId}`, {
        recipe: updatedRecipe
      });
      showToast('Item linked to product', 'success');
      setLinkingMaterial(null);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to link item', 'error');
    } finally {
      setIsLinkingSubmitting(false);
    }
  };

  const handleUnlinkMaterialFromProduct = async (productId: string, materialId: string) => {
    const targetProduct = products.find(p => (p.id || p._id) === productId);
    if (!targetProduct) return;

    const currentRecipe = Array.isArray(targetProduct.recipe) ? targetProduct.recipe : [];
    const updatedRecipe = currentRecipe.filter((r: any) => r.inventoryId !== materialId);

    try {
      await api.put(`/api/admin/products/${productId}`, {
        recipe: updatedRecipe
      });
      showToast('Item unlinked', 'success');
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to unlink item', 'error');
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Settings
  const [businessPhone, setBusinessPhone] = useState('0928 810 3928');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Smart Material Form Fields
  const [materialCategory, setMaterialCategory] = useState('Bath Towel');
  const [spoolColor, setSpoolColor] = useState('Black');
  const [customColor, setCustomColor] = useState('');
  const [customName, setCustomName] = useState('');
  const [itemCount, setItemCount] = useState('');
  const [itemUnit, setItemUnit] = useState('PCs');
  const [itemThreshold, setItemThreshold] = useState('10');
  const [itemSupplierCost, setItemSupplierCost] = useState('');
  const [itemPackSize, setItemPackSize] = useState('1');
  const [itemPackCost, setItemPackCost] = useState('');

  const handleAddPackCostChange = (val: string) => {
    setItemPackCost(val);
    const pSize = Math.max(1, parseInt(itemPackSize) || 1);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setItemSupplierCost((num / pSize).toFixed(2));
    } else if (val === '') {
      setItemSupplierCost('');
    }
  };

  const handleAddUnitCostChange = (val: string) => {
    setItemSupplierCost(val);
    const pSize = Math.max(1, parseInt(itemPackSize) || 1);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setItemPackCost((num * pSize).toFixed(2));
    } else if (val === '') {
      setItemPackCost('');
    }
  };

  const handleAddPackSizeChange = (val: string) => {
    setItemPackSize(val);
    const pSize = Math.max(1, parseInt(val) || 1);
    if (itemSupplierCost !== '') {
      const uNum = parseFloat(itemSupplierCost);
      if (!isNaN(uNum)) {
        setItemPackCost((uNum * pSize).toFixed(2));
      }
    } else if (itemPackCost !== '') {
      const pNum = parseFloat(itemPackCost);
      if (!isNaN(pNum)) {
        setItemSupplierCost((pNum / pSize).toFixed(2));
      }
    }
  };

  // Delete modal state
  const [deletingMaterial, setDeletingMaterial] = useState<any>(null);

  // Edit Material Details Modal State
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemCount, setEditItemCount] = useState('');
  const [editItemUnit, setEditItemUnit] = useState('PCs');
  const [editItemThreshold, setEditItemThreshold] = useState('10');
  const [editItemSupplierCost, setEditItemSupplierCost] = useState('');
  const [editItemPackSize, setEditItemPackSize] = useState('1');
  const [editItemPackCost, setEditItemPackCost] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const handleEditPackCostChange = (val: string) => {
    setEditItemPackCost(val);
    const pSize = Math.max(1, parseInt(editItemPackSize) || 1);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setEditItemSupplierCost((num / pSize).toFixed(2));
    } else if (val === '') {
      setEditItemSupplierCost('');
    }
  };

  const handleEditUnitCostChange = (val: string) => {
    setEditItemSupplierCost(val);
    const pSize = Math.max(1, parseInt(editItemPackSize) || 1);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setEditItemPackCost((num * pSize).toFixed(2));
    } else if (val === '') {
      setEditItemPackCost('');
    }
  };

  const handleEditPackSizeChange = (val: string) => {
    setEditItemPackSize(val);
    const pSize = Math.max(1, parseInt(val) || 1);
    if (editItemSupplierCost !== '') {
      const uNum = parseFloat(editItemSupplierCost);
      if (!isNaN(uNum)) {
        setEditItemPackCost((uNum * pSize).toFixed(2));
      }
    } else if (editItemPackCost !== '') {
      const pNum = parseFloat(editItemPackCost);
      if (!isNaN(pNum)) {
        setEditItemSupplierCost((pNum / pSize).toFixed(2));
      }
    }
  };

  // Patch Quantity Fields
  const [patchAction, setPatchAction] = useState<'Add' | 'Deduct'>('Add');
  const [patchQty, setPatchQty] = useState('');

  // Global Settings Field
  const [globalThreshold, setGlobalThreshold] = useState('10');

  // Materials at or below threshold
  const lowStockItems = inventory.filter((i) => i.count <= (i.minThreshold || 10));

  // Restock Calculation: 3x threshold converted into whole supplier wholesale packs
  const calculateSuggestedRestockPacks = (item: any): number => {
    if (!item) return 1;
    const minVal = item.minThreshold || 10;
    const neededPieces = minVal * 3;
    const packSize = item.packSize && item.packSize > 1 ? item.packSize : 1;
    return Math.max(1, Math.ceil(neededPieces / packSize));
  };

  // State for user-customized order quantities on the restock slip
  const [customSlipQuantities, setCustomSlipQuantities] = useState<Record<string, number>>({});

  // Batch Delivery Intake State
  interface BatchReceiveItem {
    id: string;
    item: string;
    currentCount: number;
    unit: string;
    packSize: number;
    packs: number;
    selected: boolean;
  }
  const [isBatchReceiveOpen, setIsBatchReceiveOpen] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchReceiveItem[]>([]);
  const [batchSupplier, setBatchSupplier] = useState('Standard Thread Supply');
  const [batchDrNumber, setBatchDrNumber] = useState('');
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  const openBatchReceiveModal = () => {
    const sourceList = lowStockItems.length > 0 ? lowStockItems : inventory;
    const items: BatchReceiveItem[] = sourceList.map((i) => {
      const id = i.id || i._id;
      const packSize = i.packSize && i.packSize > 1 ? i.packSize : 1;
      const initialPacks = customSlipQuantities[id] !== undefined
        ? customSlipQuantities[id]
        : calculateSuggestedRestockPacks(i);
      return {
        id,
        item: i.item,
        currentCount: i.count,
        unit: i.unit || 'PCs',
        packSize,
        packs: initialPacks,
        selected: lowStockItems.length > 0 ? true : false,
      };
    });

    setBatchItems(items);
    setBatchSupplier('Standard Thread Supply');
    setBatchDrNumber('');
    setIsBatchReceiveOpen(true);
  };

  const handleBatchReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeItems = batchItems.filter((i) => i.selected && i.packs > 0);
    if (activeItems.length === 0) {
      showToast('Select at least one material to check in', 'error');
      return;
    }

    setIsSubmittingBatch(true);

    // Optimistically update stock count in state (instant response)
    if (setInventory) {
      setInventory((prev) =>
        prev.map((m) => {
          const mId = m.id || m._id;
          const match = activeItems.find((a) => a.id === mId);
          if (match) {
            const addedPieces = match.packs * match.packSize;
            return { ...m, count: (m.count || 0) + addedPieces };
          }
          return m;
        })
      );
    }

    setIsBatchReceiveOpen(false);
    showToast(`Checked in ${activeItems.length} materials into inventory!`, 'success');

    try {
      await Promise.all(
        activeItems.map((item) => {
          const addedPieces = item.packs * item.packSize;
          return api.patch(`/api/admin/inventory/${item.id}`, {
            action: 'Add',
            amount: addedPieces,
            supplier: batchSupplier.trim(),
            deliveryReceipt: batchDrNumber.trim(),
            notes: `Delivery intake: ${item.packs} packs (${addedPieces} ${item.unit})`
          });
        })
      );

      refreshData().catch(() => { });
      fetchAuditLogs().catch(() => { });
    } catch (err) {
      console.error(err);
      refreshData().catch(() => { });
      showToast('Failed to save some delivery items', 'error');
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const handleCopyLowStockRequisition = () => {
    const items = lowStockItems.length > 0 ? lowStockItems : inventory;
    if (items.length === 0) {
      showToast('All items are in stock.', 'info');
      return;
    }
    const phone = businessPhone || '0928 810 3928';
    let text = `SUPPLIER RESTOCK ORDER — EDS TOWELS & CAPS\nDelivery Hub: Ground Floor, Pacific Mall Lucena City\nContact: ${phone}\n\nGood day! We would like to order the following raw materials:\n`;
    items.forEach((item) => {
      const id = item.id || item._id;
      const packSize = item.packSize && item.packSize > 1 ? item.packSize : 1;
      const packs = customSlipQuantities[id] !== undefined ? customSlipQuantities[id] : calculateSuggestedRestockPacks(item);
      if (packSize > 1) {
        text += `• ${packs} ${packs === 1 ? 'Pack' : 'Packs'} (${packs * packSize} ${item.unit || 'units'} total, ${packSize}/pack) — ${item.item}\n`;
      } else {
        text += `• ${packs} ${item.unit || 'units'} — ${item.item}\n`;
      }
    });
    text += `\nPlease confirm availability, current invoice pricing, and estimated delivery date. Thank you!`;

    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied ${items.length} items to clipboard`, 'success');
    }).catch(() => {
      showToast('Failed to copy to clipboard', 'error');
    });
  };


  // PDF Inline Preview Modal State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('Procurement Document Preview');
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Image Restock Slip State
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [shoppingListImageUrl, setShoppingListImageUrl] = useState<string | null>(null);
  const [shoppingListImageBlob, setShoppingListImageBlob] = useState<Blob | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const generateShoppingListImage = (overrides?: Record<string, number>): Promise<{ blob: Blob; dataUrl: string } | null> => {
    return new Promise((resolve) => {
      const items = lowStockItems.length > 0 ? lowStockItems : inventory;
      if (!items || items.length === 0) {
        showToast('No materials to generate list for', 'error');
        resolve(null);
        return;
      }
      const qtyMap = overrides || customSlipQuantities;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      const scale = 2; // High-res retina
      const width = 560;
      const baseHeaderHeight = 175;
      const itemRowHeight = 44;
      const footerHeight = 135;
      const height = baseHeaderHeight + (items.length * itemRowHeight) + footerHeight;

      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.scale(scale, scale);

      // Background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Top Brand Banner Accent
      ctx.fillStyle = '#059669'; // Emerald brand accent
      ctx.fillRect(0, 0, width, 6);

      // Header
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
      ctx.fillText('EDS TOWELS & CAPS', width / 2, 38);

      ctx.fillStyle = '#64748B';
      ctx.font = '500 11px system-ui, -apple-system, sans-serif';
      ctx.fillText('Ground Floor, Pacific Mall Lucena City • 0928 810 3928', width / 2, 56);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.fillText('SUPPLIER RESTOCK ORDER', width / 2, 85);

      const dateStr = new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const timeStr = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      ctx.fillStyle = '#64748B';
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.fillText(`Date: ${dateStr} at ${timeStr}`, width / 2, 103);

      // Divider line
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(25, 118);
      ctx.lineTo(width - 25, 118);
      ctx.stroke();

      // Table Header (Clean 2 columns)
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(25, 128, width - 50, 30);
      ctx.strokeStyle = '#E2E8F0';
      ctx.strokeRect(25, 128, width - 50, 30);

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('ITEM / DESCRIPTION', 38, 147);

      ctx.textAlign = 'right';
      ctx.fillText('QUANTITY', width - 38, 147);

      // Items list
      let currentY = 176;
      items.forEach((item, index) => {
        // Alternating row background
        if (index % 2 === 1) {
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(25, currentY - 14, width - 50, itemRowHeight);
        }

        const id = item.id || item._id;
        const packSize = item.packSize && item.packSize > 1 ? item.packSize : 1;
        const packs = qtyMap[id] !== undefined ? qtyMap[id] : calculateSuggestedRestockPacks(item);
        const unit = item.unit || 'units';

        // Material name
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        const displayName = packSize > 1 ? `${item.item} (${packSize} pcs/pack)` : item.item;
        const truncatedName = displayName.length > 38 ? `${displayName.slice(0, 36)}...` : displayName;
        ctx.fillText(truncatedName, 38, currentY + 5);

        // Order quantity (clean number + unit or packs)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
        const qtyLabel = packSize > 1
          ? `${packs} ${packs === 1 ? 'Pack' : 'Packs'} (${packs * packSize} ${unit})`
          : `${packs} ${unit}`;
        ctx.fillText(qtyLabel, width - 38, currentY + 5);

        // Row separator
        ctx.strokeStyle = '#F1F5F9';
        ctx.beginPath();
        ctx.moveTo(25, currentY + 22);
        ctx.lineTo(width - 25, currentY + 22);
        ctx.stroke();

        currentY += itemRowHeight;
      });

      // Summary & Footer
      currentY += 12;
      ctx.strokeStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.moveTo(25, currentY);
      ctx.lineTo(width - 25, currentY);
      ctx.stroke();

      currentY += 22;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(`TOTAL ITEMS NEEDED: ${items.length} ${items.length === 1 ? 'item' : 'items'}`, 38, currentY);

      currentY += 20;
      ctx.fillStyle = '#64748B';
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.fillText('• Delivery to: Eds Towels & Caps, Ground Floor, Pacific Mall Lucena City', 38, currentY);

      currentY += 16;
      ctx.fillText('• Please reply with price quotation and expected delivery date. Salamat!', 38, currentY);

      // Export as blob and dataUrl
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ blob, dataUrl });
      }, 'image/png');
    });
  };

  const handleOpenShoppingListImage = async () => {
    setIsGeneratingImage(true);
    try {
      const items = lowStockItems.length > 0 ? lowStockItems : inventory;
      const initialMap: Record<string, number> = {};
      items.forEach((item) => {
        const id = item.id || item._id;
        initialMap[id] = calculateSuggestedRestockPacks(item);
      });
      setCustomSlipQuantities(initialMap);
      const result = await generateShoppingListImage(initialMap);
      if (result) {
        setShoppingListImageUrl(result.dataUrl);
        setShoppingListImageBlob(result.blob);
        setIsImageModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to generate image:', err);
      showToast('Failed to create shopping list image', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSlipQuantityChange = async (materialId: string, newQty: number) => {
    const updated = {
      ...customSlipQuantities,
      [materialId]: newQty
    };
    setCustomSlipQuantities(updated);
    const result = await generateShoppingListImage(updated);
    if (result) {
      setShoppingListImageUrl(result.dataUrl);
      setShoppingListImageBlob(result.blob);
    }
  };

  const handleCopyShoppingListImage = async () => {
    if (!shoppingListImageBlob) {
      showToast('Image not ready yet', 'error');
      return;
    }

    try {
      if (navigator.clipboard && typeof window !== 'undefined' && 'ClipboardItem' in window) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ 'image/png': shoppingListImageBlob })
        ]);
        showToast('Image copied to clipboard. Paste directly into Messenger or Viber.', 'success');
        return;
      }
    } catch (err: any) {
      console.warn('Clipboard write image failed:', err);
    }
    showToast('Right-click or press and hold the image below to copy', 'info');
  };

  const handleDownloadShoppingListImage = () => {
    if (!shoppingListImageUrl) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = shoppingListImageUrl;
    a.download = `EDS_RESTOCK_LIST_${dateStr}.png`;
    a.click();
    showToast('Image saved', 'success');
  };

  const handlePreviewRestockList = async () => {
    if (lowStockItems.length === 0) {
      showToast('All items are in stock.', 'info');
      return;
    }
    setIsLoadingPdf(true);
    try {
      showToast('Loading preview...', 'info');
      const blob = await api.getBlob('/api/admin/inventory/shopping-list/pdf?inline=true');
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfPreviewTitle('Restock Procurement Shopping List (PDF)');
      setIsPdfModalOpen(true);
    } catch (err: any) {
      console.error('PDF Preview failed:', err);
      showToast('Failed to load preview', 'error');
    } finally {
      setIsLoadingPdf(false);
    }
  };



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
          if (settings.businessContact) {
            setBusinessPhone(settings.businessContact);
          }
        }
      })
      .catch((err) => console.warn('Could not load inventory settings:', err?.message || err));
  }, []);

  // Stock Level Filter State
  const [stockTierFilter, setStockTierFilter] = useState<StockLevelTier>('all');

  // Compute metrics across all 4 stock tiers
  const inventoryMetrics = inventory.reduce(
    (acc, i) => {
      const level = computeStockLevel(i.count, i.minThreshold || 10);
      acc[level.tier] = (acc[level.tier] || 0) + 1;
      return acc;
    },
    { critical: 0, low: 0, moderate: 0, high: 0 } as Record<string, number>
  );

  // 2. Filter Inventory list
  const filteredInventory = inventory.filter((i) => {
    const query = searchQuery.toLowerCase();
    const matchesQuery = !searchQuery || i.item?.toLowerCase().includes(query) || i.unit?.toLowerCase().includes(query);
    if (!matchesQuery) return false;
    if (stockTierFilter === 'all') return true;
    if ((stockTierFilter as string) === 'low' || (stockTierFilter as string) === 'critical') {
      return i.count <= (i.minThreshold || 10);
    }
    const level = computeStockLevel(i.count, i.minThreshold || 10);
    return level.tier === stockTierFilter;
  });

  // Sorting for Inventory Table
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'threshold' | 'cost'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'name' | 'stock' | 'threshold' | 'cost') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const sortedInventory = useMemo(() => {
    return [...filteredInventory].sort((a, b) => {
      let diff = 0;
      if (sortBy === 'name') diff = (a.item || '').localeCompare(b.item || '');
      else if (sortBy === 'stock') diff = (a.count || 0) - (b.count || 0);
      else if (sortBy === 'threshold') diff = (a.minThreshold || 10) - (b.minThreshold || 10);
      else if (sortBy === 'cost') diff = (a.supplierUnitCost || 0) - (b.supplierUnitCost || 0);
      return sortOrder === 'asc' ? diff : -diff;
    });
  }, [filteredInventory, sortBy, sortOrder]);

  // Pagination for Inventory Table
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, stockTierFilter, sortBy, sortOrder]);

  const paginatedInventory = sortedInventory.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const openEditModal = (material: any) => {
    setEditingMaterial(material);
    setEditItemName(material.item || '');
    setEditItemCount(String(material.count ?? 0));
    setEditItemUnit(material.unit || 'PCs');
    setEditItemThreshold(String(material.minThreshold ?? 10));
    const uCost = material.supplierUnitCost != null ? Number(material.supplierUnitCost) : null;
    const pSize = material.packSize != null && material.packSize > 1 ? material.packSize : 1;
    setEditItemSupplierCost(uCost != null ? String(uCost) : '');
    setEditItemPackSize(String(pSize));
    setEditItemPackCost(uCost != null && pSize > 1 ? (uCost * pSize).toFixed(2) : '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;
    const materialId = editingMaterial.id || editingMaterial._id;
    const trimmedName = editItemName.trim();
    if (!trimmedName) return showToast('Item name is required', 'error');

    const newCount = parseInt(editItemCount);
    if (isNaN(newCount) || newCount < 0) return showToast('Enter a valid stock count', 'error');

    const newThreshold = parseInt(editItemThreshold);
    if (isNaN(newThreshold) || newThreshold < 0) return showToast('Enter a valid safety threshold', 'error');

    const newCost = editItemSupplierCost !== '' ? parseFloat(editItemSupplierCost) : null;
    const newUnit = editItemUnit.trim() || 'PCs';
    const newPackSize = Math.max(1, parseInt(editItemPackSize) || 1);

    setIsSubmittingEdit(true);

    const prevInventory = [...inventory];
    if (setInventory) {
      setInventory((prev) =>
        prev.map((m) =>
          (m.id || m._id) === materialId
            ? {
              ...m,
              item: trimmedName,
              count: newCount,
              unit: newUnit,
              minThreshold: newThreshold,
              supplierUnitCost: newCost,
              packSize: newPackSize
            }
            : m
        )
      );
    }

    showToast(`Updated ${trimmedName} details`, 'success');
    setEditingMaterial(null);

    try {
      await api.patch(`/api/admin/inventory/${materialId}`, {
        item: trimmedName,
        count: newCount,
        unit: newUnit,
        minThreshold: newThreshold,
        supplierUnitCost: newCost,
        packSize: newPackSize
      });
      refreshData().catch(() => { });
      fetchAuditLogs().catch(() => { });
    } catch (err: any) {
      console.error(err);
      if (setInventory) {
        setInventory(prevInventory);
      }
      showToast(err.message || 'Failed to update material', 'error');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const getComputedItemName = () => {
    if (materialCategory === 'Thread Spool') {
      const color = spoolColor === 'Custom' ? customColor.trim() : spoolColor;
      return color ? `Thread Spool (${color})` : 'Thread Spool';
    }
    if (materialCategory === 'Custom') {
      return customName.trim();
    }
    return materialCategory;
  };

  // 3. Create New Material
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedName = getComputedItemName();
    if (!resolvedName) return showToast('Item name is required', 'error');

    // Prevent duplicate materials (case-insensitive)
    const existing = inventory.find(
      (m) => (m.item || '').trim().toLowerCase() === resolvedName.trim().toLowerCase()
    );
    if (existing) {
      showToast(`"${resolvedName}" already exists in materials. Please edit or adjust its stock instead.`, 'error');
      return;
    }

    const countVal = parseInt(itemCount) || 0;
    const unitVal = itemUnit || 'PCs';
    const minThresholdVal = parseInt(itemThreshold) || 10;
    const supplierCostVal = itemSupplierCost !== '' ? parseFloat(itemSupplierCost) : undefined;
    const newPackSize = Math.max(1, parseInt(itemPackSize) || 1);

    const tempId = `temp_mat_${Date.now()}`;
    const newMaterial = {
      id: tempId,
      _id: tempId,
      item: resolvedName,
      count: countVal,
      unit: unitVal,
      minThreshold: minThresholdVal,
      supplierUnitCost: supplierCostVal,
      packSize: newPackSize
    };

    const prevInventory = [...inventory];
    if (setInventory) {
      setInventory((prev) => [...prev, newMaterial]);
    }

    showToast(`Added ${resolvedName}`, 'success');
    setIsAddOpen(false);
    setMaterialCategory('Bath Towel');
    setSpoolColor('Black');
    setCustomColor('');
    setCustomName('');
    setItemCount('');
    setItemUnit('PCs');
    setItemThreshold('10');
    setItemSupplierCost('');
    setItemPackSize('1');
    setItemPackCost('');

    try {
      const res: any = await api.post('/api/admin/inventory', {
        item: resolvedName,
        count: countVal,
        unit: unitVal,
        minThreshold: minThresholdVal,
        supplierUnitCost: supplierCostVal,
        packSize: newPackSize
      });

      if (res?.data && setInventory) {
        setInventory((prev) =>
          prev.map((m) => (m.id === tempId || m._id === tempId ? { ...m, ...res.data } : m))
        );
      }
      refreshData().catch(() => { });
      fetchAuditLogs().catch(() => { });
    } catch (err: any) {
      console.error(err);
      if (setInventory) {
        setInventory(prevInventory);
      }
      showToast(err?.message || 'Failed to add material', 'error');
    }
  };

  const confirmDeleteMaterial = async () => {
    if (!deletingMaterial) return;
    const id = deletingMaterial.id || deletingMaterial._id;
    const prevInventory = [...inventory];

    if (setInventory) {
      setInventory((prev) => prev.filter((m) => (m.id || m._id) !== id));
    }
    setDeletingMaterial(null);
    showToast('Item deleted', 'success');

    try {
      await api.delete(`/api/admin/inventory/${id}`);
      refreshData().catch(() => { });
      fetchAuditLogs().catch(() => { });
    } catch (err) {
      console.error(err);
      if (setInventory) {
        setInventory(prevInventory);
      }
      showToast('Failed to delete item', 'error');
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

      showToast('Inventory parameters updated', 'success');
      setIsSettingsOpen(false);
      refreshData();
      fetchAuditLogs();
    } catch (err) {
      console.error(err);
      showToast('Failed to save settings', 'error');
    }
  };

  const handleDownloadRestockList = async () => {
    if (lowStockItems.length === 0) {
      showToast('All items in stock', 'info');
      return;
    }

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      await api.download('/api/admin/inventory/shopping-list/pdf', `STITCH_OPT_RESTOCK_LIST_${dateStr}.pdf`);
      showToast('Downloaded PDF', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to download PDF', 'error');
    }
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left">
      {/* Compact Top Action Toolbar */}
      <div className="flex justify-start items-center flex-wrap gap-3 mb-4">
        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white font-bold px-4 py-2.5 rounded-xl text-[0.85rem] cursor-pointer border-none shadow-sm transition flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>+ Add Material</span>
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="bg-bg-surface border border-border-glass w-10 h-10 rounded-xl flex items-center justify-center text-text-dim hover:text-text-main hover:bg-white/5 cursor-pointer transition shrink-0"
            title="Inventory Threshold Settings"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <input
          type="text"
          placeholder="Search materials..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[220px]"
        />
      </div>

      {/* Main materials dashboard panel */}
      <div className="w-full glass-card">
        {/* Simple 2-pill Stock Filter + Restock Slip Action */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            {[
              { id: 'all', label: 'All Items', count: inventory.length },
              { id: 'low', label: 'Needs Restock', count: lowStockItems.length },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStockTierFilter(pill.id as StockLevelTier)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border transition-all flex items-center gap-2 ${stockTierFilter === pill.id
                    ? 'bg-primary text-white border-primary/40 shadow-sm'
                    : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                  }`}
              >
                <span>{pill.label}</span>
                <span className={`text-[0.68rem] px-2 py-0.5 rounded-full font-bold font-mono ${pill.id === 'low' && lowStockItems.length > 0
                    ? 'bg-danger/20 text-danger'
                    : 'bg-white/10'
                  }`}>
                  {pill.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openBatchReceiveModal}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm bg-primary/20 border border-primary/40 text-primary-light hover:bg-primary/30"
              title="Quickly check in multiple delivered packs from suppliers"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span>Receive Delivery</span>
            </button>

            <button
              type="button"
              onClick={handleOpenShoppingListImage}
              disabled={isGeneratingImage}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${lowStockItems.length > 0
                  ? 'bg-bg-surface hover:bg-white/10 border border-border-glass text-text-main'
                  : 'bg-white/5 border border-border-glass text-text-dim hover:text-text-main hover:bg-white/10'
                }`}
              title="Generate restock order slip to send to supplier via Messenger or Viber"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>{isGeneratingImage ? 'Generating...' : 'Order Restock Slip'}</span>
              {lowStockItems.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/25 text-white font-mono">
                  {lowStockItems.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {isSyncing && inventory.length === 0 ? (
          <div className="max-[1024px]:hidden mb-4 w-full animate-pulse">
            <TableSkeleton rows={5} cols={4} />
          </div>
        ) : (
          <div className="glass-table-container max-[1024px]:hidden">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="glass-th text-left cursor-pointer select-none hover:text-text-main transition" onClick={() => handleSort('name')} title="Click to sort by Name">
                    <div className="flex items-center gap-1.5">
                      <span>Material Name</span>
                      {sortBy === 'name' && (
                        <span className="text-primary font-mono text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="glass-th text-left cursor-pointer select-none hover:text-text-main transition" onClick={() => handleSort('stock')} title="Click to sort by Stock Count">
                    <div className="flex items-center gap-1.5">
                      <span>Current Stock</span>
                      {sortBy === 'stock' && (
                        <span className="text-primary font-mono text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="glass-th text-left cursor-pointer select-none hover:text-text-main transition" onClick={() => handleSort('threshold')} title="Click to sort by Safety Threshold">
                    <div className="flex items-center gap-1.5">
                      <span>Safety Threshold</span>
                      {sortBy === 'threshold' && (
                        <span className="text-primary font-mono text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="glass-th text-left cursor-pointer select-none hover:text-text-main transition" onClick={() => handleSort('cost')} title="Click to sort by Supplier Cost">
                    <div className="flex items-center gap-1.5">
                      <span>Supplier Cost / Unit</span>
                      {sortBy === 'cost' && (
                        <span className="text-primary font-mono text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="glass-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length === 0 ? (
                  <tr className="glass-tr">
                    <td colSpan={5} className="glass-td text-center text-text-dim">
                      No materials match the selected filters.
                    </td>
                  </tr>
                ) : (
                  paginatedInventory.map((i) => {
                    const id = i.id || i._id;
                    const isLow = i.count <= (i.minThreshold || 10);
                    return (
                      <tr key={id} className={`glass-tr hover:bg-white/5 transition-all ${isLow ? 'bg-primary/[0.04]' : ''}`}>
                        <td className="glass-td font-bold text-sm text-text-main text-left">
                          <div>{i.item}</div>
                          {i.packSize && i.packSize > 1 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary-light font-medium mt-1">
                              📦 {i.packSize} {i.unit || 'PCs'}/pack
                            </span>
                          ) : null}
                        </td>
                        <td className="glass-td text-left">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 font-mono font-extrabold text-sm text-text-main bg-white/5 border border-border-glass px-3 py-1.5 rounded-lg select-none">
                              <span>{i.count}</span>
                              <span className="text-[0.7rem] text-text-dim font-bold">{i.unit || 'PCs'}</span>
                            </div>
                            {isLow ? (
                              <span className="inline-flex items-center gap-1 text-[0.68rem] px-2.5 py-0.5 rounded-full font-bold bg-danger/10 border border-danger/20 text-danger">
                                Low Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[0.68rem] px-2.5 py-0.5 rounded-full font-bold bg-success/10 border border-success/20 text-success">
                                In Stock
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="glass-td text-left">
                          <div className="flex items-center gap-1.5">
                            <InlineThresholdAdjuster
                              material={i}
                              refreshData={refreshData}
                              fetchAuditLogs={fetchAuditLogs}
                              isAdmin={isAdmin}
                              setInventory={setInventory}
                            />
                            <span className="text-[0.7rem] text-text-dim font-bold">{i.unit || 'PCs'}</span>
                          </div>
                        </td>
                        <td className="glass-td text-left">
                          <InlineSupplierCostAdjuster
                            material={i}
                            refreshData={refreshData}
                            isAdmin={isAdmin}
                            setInventory={setInventory}
                          />
                        </td>
                        <td className="glass-td text-right">
                          <div className="flex gap-2 justify-end items-center">
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => openEditModal(i)}
                                className="bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                                title={`Edit details for ${i.item}`}
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span>Edit</span>
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setDeletingMaterial(i)}
                                className="bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 hover:border-danger/50 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1"
                                title={`Delete ${i.item}`}
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span>Delete</span>
                              </button>
                            )}
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

        {/* Mobile Card Blocks View */}
        <div className="min-[1025px]:hidden grid grid-cols-2 gap-4 animate-fade">
          {isSyncing && inventory.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))
          ) : filteredInventory.length === 0 ? (
            <div className="glass-card p-6 text-center text-text-dim col-span-full">No materials cataloged.</div>
          ) : (
            paginatedInventory.map((i) => {
              const id = i.id || i._id;
              const stockLevel = computeStockLevel(i.count, i.minThreshold || 10);
              return (
                <div
                  key={id}
                  className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-lg p-4 flex flex-col gap-3 text-left relative"
                >
                  <div className="flex justify-between items-start gap-1">
                    <span className="font-bold text-text-main text-sm truncate">{i.item}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-[0.62rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 backdrop-blur-md ${stockLevel.badgeClass}`}
                      title={stockLevel.description}
                    >
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: stockLevel.dotColor }} />
                      {stockLevel.label}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 text-xs font-medium">
                    <div>
                      <span className="text-[0.65rem] text-text-dim block mb-1">Current Count</span>
                      {/* Read-only Current Count display with stock gauge */}
                      <div className="flex items-center gap-1.5 font-mono font-extrabold text-sm text-text-main bg-white/5 border border-border-glass px-3 py-1.5 rounded-lg w-fit select-none">
                        <span>{i.count}</span>
                        <span className="text-[0.7rem] text-text-dim font-bold">{i.unit || 'PCs'}</span>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-1.5">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.max(6, (i.count / ((i.minThreshold || 10) * 2.5)) * 100))}%`,
                            backgroundColor: stockLevel.dotColor
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[0.72rem] text-text-dim pt-1 border-t border-white/5">
                      <span>Threshold: <b className="text-text-main font-mono">{i.minThreshold || 10} {i.unit || 'PCs'}</b></span>
                      <span>Cost: <b className="text-primary font-mono">{i.supplierUnitCost != null ? `₱${Number(i.supplierUnitCost).toFixed(2)}` : '—'}</b></span>
                    </div>
                  </div>

                  <div className="flex gap-2 w-full mt-2">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => openEditModal(i)}
                        className="flex-1 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center shadow-sm"
                      >
                        Edit
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setDeletingMaterial(i)}
                        className="flex-1 bg-danger/10 border border-danger/30 text-danger py-2 px-3 rounded-xl text-xs font-bold hover:bg-danger/20 transition-all cursor-pointer text-center shadow-sm"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredInventory.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          pageSizeOptions={[5, 10, 20, 50]}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Modal: Add Material */}
      <GlassModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Material"
        onDiscard={() => {
          setMaterialCategory('Bath Towel');
          setSpoolColor('Black');
          setCustomColor('');
          setCustomName('');
          setItemCount('');
          setItemUnit('PCs');
          setItemThreshold('10');
          setItemSupplierCost('');
          setItemPackSize('1');
        }}
        maxWidth="max-w-[500px]"
      >
        <form noValidate onSubmit={handleCreateSubmit} className="space-y-3 text-left text-xs">
          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Product / Material Category</label>
            <select
              value={materialCategory}
              onChange={(e) => {
                const val = e.target.value;
                setMaterialCategory(val);
                if (val === 'Thread Spool') {
                  setItemUnit('Cones');
                } else {
                  setItemUnit('PCs');
                }
              }}
              className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full cursor-pointer font-sans focus:border-primary/50 transition"
            >
              <optgroup label="Products Being Sold (Blanks & Garments)">
                <option value="Bath Towel">Bath Towel</option>
                <option value="Hand Towel / Face Towel">Hand Towel / Face Towel</option>
                <option value="Cap / Hat">Cap / Hat</option>
                <option value="Chinese Fan">Chinese Fan</option>
                <option value="Regular Fan">Regular Fan</option>
                <option value="Pillow / Pillowcase">Pillow / Pillowcase</option>
                <option value="Eco Bag / Tote Bag">Eco Bag / Tote Bag</option>
                <option value="Gift Bag / Paper Bag">Gift Bag / Paper Bag</option>
              </optgroup>

              {products && products.length > 0 && (
                <optgroup label="Store Catalog Products">
                  {Array.from(new Set(products.map((p: any) => p.name)))
                    .filter((name: any) => ![
                      'Bath Towel',
                      'Hand Towel / Face Towel',
                      'Cap / Hat',
                      'Chinese Fan',
                      'Regular Fan',
                      'Pillow / Pillowcase',
                      'Eco Bag / Tote Bag',
                      'Gift Bag / Paper Bag'
                    ].includes(name))
                    .map((pName: any) => (
                      <option key={pName} value={pName}>{pName}</option>
                    ))}
                </optgroup>
              )}

              <optgroup label="Embroidery Supplies">
                <option value="Thread Spool">Thread Spool</option>
              </optgroup>

              <option value="Custom">Custom Product / Material...</option>
            </select>
          </div>

          {/* Conditional Color Selector for Thread Spool */}
          {materialCategory === 'Thread Spool' && (
            <div className="flex flex-col gap-1 animate-fade">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Thread Color</label>
              <select
                value={spoolColor}
                onChange={(e) => setSpoolColor(e.target.value)}
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full cursor-pointer font-sans"
              >
                <option value="Black">Black</option>
                <option value="White">White</option>
                <option value="Red">Red</option>
                <option value="Blue">Blue</option>
                <option value="Navy">Navy</option>
                <option value="Gold">Metallic Gold</option>
                <option value="Silver">Silver</option>
                <option value="Green">Green</option>
                <option value="Yellow">Yellow</option>
                <option value="Pink">Pink</option>
                <option value="Purple">Purple</option>
                <option value="Custom">Custom Color...</option>
              </select>

              {spoolColor === 'Custom' && (
                <input
                  type="text"
                  required
                  placeholder="Specify custom thread color (e.g. Lavender, Emerald)"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full font-sans mt-1 animate-fade"
                />
              )}
            </div>
          )}

          {/* Custom Material Name if Custom is chosen */}
          {materialCategory === 'Custom' && (
            <div className="flex flex-col gap-1 animate-fade">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Custom Material Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Sports Cap, Canvas Tote Bag"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full font-sans"
              />
            </div>
          )}

          {/* Stock Count & Measurement Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Initial Stock</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 50"
                value={itemCount}
                onChange={(e) => setItemCount(e.target.value)}
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Measurement Unit</label>
              <select
                value={itemUnit}
                onChange={(e) => setItemUnit(e.target.value)}
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full cursor-pointer font-sans focus:border-primary/50 transition"
              >
                <option value="PCs">PCs</option>
                <option value="Ea">Ea</option>
                <option value="Cones">Cones</option>
                <option value="Rolls">Rolls</option>
                <option value="Meters">Meters</option>
                <option value="Sets">Sets</option>
              </select>
            </div>
          </div>

          {/* Low Stock Threshold & Wholesale Pack Size */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Min. Threshold</label>
                <span className="text-[0.62rem] text-text-dim font-medium">Low-stock alert</span>
              </div>
              <input
                type="number"
                min="0"
                value={itemThreshold}
                onChange={(e) => setItemThreshold(e.target.value)}
                placeholder="e.g. 10"
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Wholesale Pack</label>
                <span className="text-[0.62rem] text-primary-light font-medium">Units / pack</span>
              </div>
              <input
                type="number"
                min="1"
                placeholder="1 if loose (e.g. 8)"
                value={itemPackSize}
                onChange={(e) => handleAddPackSizeChange(e.target.value)}
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
              />
            </div>
          </div>

          {/* Supplier Cost Section (Live two-way calculation if packSize > 1) */}
          {(parseInt(itemPackSize) || 1) > 1 ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-text-main flex items-center gap-1.5 text-[0.72rem]">
                  <span>📦 Wholesale Pack Pricing</span>
                  <span className="text-[0.62rem] text-primary-light font-mono px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                    {parseInt(itemPackSize)} {itemUnit}/pack
                  </span>
                </span>
                <span className="text-[0.62rem] text-primary font-medium">Live auto-calculation</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Wholesale Pack Cost */}
                <div className="flex flex-col gap-1">
                  <label className="text-[0.65rem] font-bold uppercase text-text-dim">Wholesale Pack Cost</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim font-bold text-xs select-none">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.50"
                      placeholder="e.g. 80.00"
                      value={itemPackCost}
                      onChange={(e) => handleAddPackCostChange(e.target.value)}
                      className="bg-bg-surface border border-border-glass py-1.5 pl-6 pr-2 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
                    />
                  </div>
                  <span className="text-[0.6rem] text-text-dim">Invoice cost for 1 pack</span>
                </div>

                {/* Unit Cost */}
                <div className="flex flex-col gap-1">
                  <label className="text-[0.65rem] font-bold uppercase text-text-dim">Cost per Unit ({itemUnit})</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary font-bold text-xs select-none">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 10.00"
                      value={itemSupplierCost}
                      onChange={(e) => handleAddUnitCostChange(e.target.value)}
                      className="bg-bg-surface border border-border-glass py-1.5 pl-6 pr-2 rounded-lg text-primary text-xs outline-none w-full font-mono font-bold focus:border-primary transition"
                    />
                  </div>
                  <span className="text-[0.6rem] text-primary/80">Powers recipe & profit</span>
                </div>
              </div>

              {itemPackCost && itemSupplierCost && (
                <div className="flex items-center justify-between text-[0.68rem] bg-black/20 px-2.5 py-1 rounded-lg border border-white/5 font-mono">
                  <span className="text-text-dim">
                    🧮 ₱{parseFloat(itemPackCost || '0').toFixed(2)} ÷ {itemPackSize} {itemUnit}
                  </span>
                  <span className="font-bold text-primary">
                    = ₱{parseFloat(itemSupplierCost || '0').toFixed(2)} / {itemUnit}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Supplier Cost per Unit</label>
                <span className="text-[0.62rem] text-primary font-medium">Powers profit analytics</span>
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim font-bold text-xs select-none">₱</span>
                <input
                  type="number"
                  min="0"
                  step="0.50"
                  placeholder="e.g. 45.00"
                  value={itemSupplierCost}
                  onChange={(e) => handleAddUnitCostChange(e.target.value)}
                  className="bg-bg-surface border border-border-glass py-2 pl-6 pr-3 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
                />
              </div>
            </div>
          )}

          {/* Add Material Button */}
          <button
            type="submit"
            className="bg-primary text-white font-bold py-2.5 rounded-lg mt-2 hover:bg-primary-light transition-all cursor-pointer border-none shadow-sm hover:shadow text-center w-full text-xs font-sans"
          >
            Add Material
          </button>
        </form>
      </GlassModal>

      {/* Modal: Edit Material Details */}
      <GlassModal
        isOpen={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        title={`Edit Material: ${editingMaterial?.item || ''}`}
        onDiscard={() => setEditingMaterial(null)}
        maxWidth="max-w-[500px]"
      >
        <form noValidate onSubmit={handleEditSubmit} className="space-y-3 text-left text-xs">
          {/* Material Name */}
          <div className="flex flex-col gap-1">
            <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Material Name</label>
            <input
              type="text"
              required
              value={editItemName}
              onChange={(e) => setEditItemName(e.target.value)}
              placeholder="e.g. Bath Towel, Hoodie Black"
              className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full font-sans focus:border-primary/50 transition"
            />
          </div>

          {/* Current Stock Count & Measurement Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Current Stock</label>
              <input
                type="number"
                min="0"
                value={editItemCount}
                onChange={(e) => setEditItemCount(e.target.value)}
                placeholder="e.g. 20"
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Measurement Unit</label>
              <select
                value={editItemUnit}
                onChange={(e) => setEditItemUnit(e.target.value)}
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full cursor-pointer font-sans focus:border-primary/50 transition"
              >
                <option value="PCs">PCs</option>
                <option value="Ea">Ea</option>
                <option value="Cones">Cones</option>
                <option value="Rolls">Rolls</option>
                <option value="Meters">Meters</option>
                <option value="Sets">Sets</option>
              </select>
            </div>
          </div>

          {/* Safety Threshold & Wholesale Pack Size */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Min. Threshold</label>
                <span className="text-[0.62rem] text-text-dim font-medium">Low-stock alert</span>
              </div>
              <input
                type="number"
                min="0"
                value={editItemThreshold}
                onChange={(e) => setEditItemThreshold(e.target.value)}
                placeholder="e.g. 10"
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Pack Size</label>
                <span className="text-[0.62rem] text-primary-light font-medium">Units / pack</span>
              </div>
              <input
                type="number"
                min="1"
                value={editItemPackSize}
                onChange={(e) => handleEditPackSizeChange(e.target.value)}
                placeholder="1 if loose (e.g. 8)"
                className="bg-bg-surface border border-border-glass py-2 px-3 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
              />
            </div>
          </div>

          {/* Supplier Cost Section (Live two-way calculation if packSize > 1) */}
          {(parseInt(editItemPackSize) || 1) > 1 ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-text-main flex items-center gap-1.5 text-[0.72rem]">
                  <span>📦 Wholesale Pack Pricing</span>
                  <span className="text-[0.62rem] text-primary-light font-mono px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                    {parseInt(editItemPackSize)} {editItemUnit}/pack
                  </span>
                </span>
                <span className="text-[0.62rem] text-primary font-medium">Live auto-calculation</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Wholesale Pack Cost */}
                <div className="flex flex-col gap-1">
                  <label className="text-[0.65rem] font-bold uppercase text-text-dim">Wholesale Pack Cost</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim font-bold text-xs select-none">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.50"
                      placeholder="e.g. 80.00"
                      value={editItemPackCost}
                      onChange={(e) => handleEditPackCostChange(e.target.value)}
                      className="bg-bg-surface border border-border-glass py-1.5 pl-6 pr-2 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
                    />
                  </div>
                  <span className="text-[0.6rem] text-text-dim">Invoice cost for 1 pack</span>
                </div>

                {/* Unit Cost */}
                <div className="flex flex-col gap-1">
                  <label className="text-[0.65rem] font-bold uppercase text-text-dim">Cost per Unit ({editItemUnit})</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary font-bold text-xs select-none">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 10.00"
                      value={editItemSupplierCost}
                      onChange={(e) => handleEditUnitCostChange(e.target.value)}
                      className="bg-bg-surface border border-border-glass py-1.5 pl-6 pr-2 rounded-lg text-primary text-xs outline-none w-full font-mono font-bold focus:border-primary transition"
                    />
                  </div>
                  <span className="text-[0.6rem] text-primary/80">Powers recipe & profit</span>
                </div>
              </div>

              {editItemPackCost && editItemSupplierCost && (
                <div className="flex items-center justify-between text-[0.68rem] bg-black/20 px-2.5 py-1 rounded-lg border border-white/5 font-mono">
                  <span className="text-text-dim">
                    🧮 ₱{parseFloat(editItemPackCost || '0').toFixed(2)} ÷ {editItemPackSize} {editItemUnit}
                  </span>
                  <span className="font-bold text-primary">
                    = ₱{parseFloat(editItemSupplierCost || '0').toFixed(2)} / {editItemUnit}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">Supplier Cost per Unit</label>
                <span className="text-[0.62rem] text-primary font-medium">Powers profit analytics</span>
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim font-bold text-xs select-none">₱</span>
                <input
                  type="number"
                  min="0"
                  step="0.50"
                  placeholder="0.00"
                  value={editItemSupplierCost}
                  onChange={(e) => handleEditUnitCostChange(e.target.value)}
                  className="bg-bg-surface border border-border-glass py-2 pl-6 pr-3 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold focus:border-primary/50 transition"
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 justify-end pt-3 border-t border-white/10 mt-1">
            <button
              type="button"
              onClick={() => setEditingMaterial(null)}
              className="px-3.5 py-2 rounded-lg bg-white/5 border border-border-glass text-text-main text-xs font-semibold hover:bg-white/10 cursor-pointer transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingEdit}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold cursor-pointer transition shadow-sm"
            >
              {isSubmittingEdit ? 'Saving...' : 'Save Material Details'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Delete Confirmation Glass Modal */}
      <GlassModal
        isOpen={!!deletingMaterial}
        onClose={() => setDeletingMaterial(null)}
        title="Confirm Delete Material"
      >
        <div className="modal-stack text-left">
          <p className="text-sm text-text-main m-0 leading-relaxed">
            Are you sure you want to permanently delete the material <b className="text-danger font-bold">"{deletingMaterial?.item}"</b>?
          </p>
          <p className="text-xs text-text-dim m-0">
            This action cannot be undone. Any inventory tracking records for this material will be cleared.
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={() => setDeletingMaterial(null)}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteMaterial}
              className="px-4 py-2.5 rounded-xl bg-danger text-white text-xs font-bold hover:bg-danger-light cursor-pointer border-none shadow-sm"
            >
              Delete Material
            </button>
          </div>
        </div>
      </GlassModal>

      {/* Modal: Link Material to Catalog Product */}
      <GlassModal
        isOpen={!!linkingMaterial}
        onClose={() => setLinkingMaterial(null)}
        title="Link Material to Catalog Product"
      >
        <form noValidate onSubmit={handleLinkProductSubmit} className="modal-stack text-left flex flex-col gap-4">
          <div className="modal-section">
            <label className="modal-label">Raw Material</label>
            <div className="p-3 rounded-xl bg-white/5 border border-border-glass text-sm font-bold text-text-main flex items-center justify-between">
              <span>{linkingMaterial?.item}</span>
              <span className="text-xs text-text-dim font-mono">{linkingMaterial?.count} {linkingMaterial?.unit || 'in stock'}</span>
            </div>
          </div>

          <div className="modal-section">
            <label className="modal-label">Target Product to Link</label>
            <select
              value={selectedTargetProductId}
              onChange={(e) => setSelectedTargetProductId(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
            >
              {products.map((p: any) => (
                <option key={p.id || p._id} value={p.id || p._id}>
                  {p.name} (₱{p.price})
                </option>
              ))}
            </select>
            <p className="text-[0.7rem] text-text-dim mt-1 m-0">
              When an order for this product is placed or finished, this material will be tied to its bill of materials.
            </p>
          </div>

          <div className="modal-section">
            <label className="modal-label">Quantity Consumed per Product</label>
            <input
              type="number"
              min="0.01"
              step="any"
              required
              value={linkingQuantity}
              onChange={(e) => setLinkingQuantity(parseFloat(e.target.value) || 1)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
            />
            <p className="text-[0.7rem] text-text-dim mt-1 m-0">
              e.g. 1 for a blank towel, or 0.1 for thread spool consumption estimate.
            </p>
          </div>

          <div className="flex gap-3 justify-end mt-2">
            <button
              type="button"
              onClick={() => setLinkingMaterial(null)}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLinkingSubmitting}
              className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-light cursor-pointer border-none shadow-sm disabled:opacity-50"
            >
              {isLinkingSubmitting ? 'Linking...' : 'Save Product Link'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal: Global settings inventory config */}
      <GlassModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Inventory Parameters">
        <form noValidate onSubmit={handleSettingsSubmit} className="modal-stack text-left">
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

          <button
            type="submit"
            className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-sm hover:shadow-md text-center w-full text-sm font-sans"
          >
            Apply Global Parameters
          </button>
        </form>
      </GlassModal>



      {/* Modal: Batch Supplier Delivery Check-In */}
      <GlassModal
        isOpen={isBatchReceiveOpen}
        onClose={() => setIsBatchReceiveOpen(false)}
        title="Check-In Supplier Delivery"
        maxWidth="max-w-[620px]"
      >
        <form noValidate onSubmit={handleBatchReceiveSubmit} className="space-y-3 text-left text-xs">
          <div className="flex justify-between items-center text-text-dim text-[0.72rem] pb-1 border-b border-white/5">
            <span>Check off delivered items. Quantities are shown in wholesale packs.</span>
            <span className="text-primary font-semibold font-mono">
              {batchItems.filter(b => b.selected).length} of {batchItems.length} selected
            </span>
          </div>

          {/* Optional Supplier & DR # */}
          <div className="grid grid-cols-2 gap-2.5 bg-white/[0.02] border border-border-glass p-2.5 rounded-lg">
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] font-bold uppercase text-text-dim">Supplier / Vendor</label>
              <input
                type="text"
                value={batchSupplier}
                onChange={(e) => setBatchSupplier(e.target.value)}
                placeholder="e.g. Standard Thread Supply"
                className="bg-bg-surface border border-border-glass py-1.5 px-2.5 rounded-md text-text-main text-xs outline-none w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] font-bold uppercase text-text-dim">Delivery Receipt (DR) #</label>
              <input
                type="text"
                value={batchDrNumber}
                onChange={(e) => setBatchDrNumber(e.target.value)}
                placeholder="e.g. DR-2026-8812 (optional)"
                className="bg-bg-surface border border-border-glass py-1.5 px-2.5 rounded-md text-text-main text-xs outline-none w-full font-mono"
              />
            </div>
          </div>

          {/* Checklist of Delivered Items */}
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {batchItems.length === 0 ? (
              <div className="text-center py-6 text-text-dim">No materials in checklist. Add one below.</div>
            ) : (
              batchItems.map((item, idx) => {
                const isPack = item.packSize > 1;
                const totalUnitsToAdd = item.packs * item.packSize;
                const newTotal = item.currentCount + totalUnitsToAdd;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition ${item.selected
                        ? 'bg-primary/5 border-primary/30 text-text-main'
                        : 'bg-white/[0.02] border-border-glass opacity-60 text-text-dim'
                      }`}
                  >
                    {/* Checkbox & Item info */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => {
                          const updated = [...batchItems];
                          updated[idx].selected = e.target.checked;
                          setBatchItems(updated);
                        }}
                        className="w-4 h-4 rounded text-primary cursor-pointer accent-primary shrink-0"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-xs truncate">{item.item}</span>
                        <span className="text-[0.68rem] text-text-dim">
                          In Stock: <b className="font-mono text-text-main">{item.currentCount}</b> {item.unit}
                          {isPack && <span className="text-primary-light ml-1.5">({item.packSize}/pack)</span>}
                        </span>
                      </div>
                    </div>

                    {/* Stepper & Math preview */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="flex items-center bg-bg-surface border border-border-glass rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...batchItems];
                            updated[idx].packs = Math.max(1, updated[idx].packs - 1);
                            setBatchItems(updated);
                          }}
                          className="px-2 py-1 text-text-dim hover:text-text-main hover:bg-white/10 transition cursor-pointer font-bold text-xs"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.packs}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            const updated = [...batchItems];
                            updated[idx].packs = val;
                            setBatchItems(updated);
                          }}
                          className="w-12 text-center bg-transparent text-text-main font-mono font-bold text-xs outline-none py-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...batchItems];
                            updated[idx].packs = updated[idx].packs + 1;
                            setBatchItems(updated);
                          }}
                          className="px-2 py-1 text-text-dim hover:text-text-main hover:bg-white/10 transition cursor-pointer font-bold text-xs"
                        >
                          +
                        </button>
                      </div>

                      <div className="w-24 text-right flex flex-col justify-center">
                        <span className="font-mono font-bold text-primary text-xs">
                          +{totalUnitsToAdd} {item.unit}
                        </span>
                        <span className="text-[0.62rem] text-text-dim font-mono">
                          New: {newTotal}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setBatchItems(batchItems.filter((_, i) => i !== idx));
                        }}
                        className="text-text-dim hover:text-danger p-1 rounded transition cursor-pointer"
                        title="Remove from shipment"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Another Material Dropdown */}
          {(() => {
            const availableToAdd = inventory.filter(
              (inv) => !batchItems.some((b) => b.id === (inv.id || inv._id))
            );
            if (availableToAdd.length === 0) return null;

            return (
              <div className="pt-1">
                <select
                  value=""
                  onChange={(e) => {
                    const chosen = inventory.find((i) => (i.id || i._id) === e.target.value);
                    if (chosen) {
                      const id = chosen.id || chosen._id;
                      const packSize = chosen.packSize && chosen.packSize > 1 ? chosen.packSize : 1;
                      setBatchItems([
                        ...batchItems,
                        {
                          id,
                          item: chosen.item,
                          currentCount: chosen.count,
                          unit: chosen.unit || 'PCs',
                          packSize,
                          packs: 1,
                          selected: true,
                        },
                      ]);
                    }
                  }}
                  className="bg-white/5 border border-dashed border-border-glass py-1.5 px-3 rounded-lg text-text-dim hover:text-text-main text-xs outline-none w-full cursor-pointer transition"
                >
                  <option value="" disabled>+ Add another material to this delivery...</option>
                  {availableToAdd.map((mat) => (
                    <option key={mat.id || mat._id} value={mat.id || mat._id}>
                      {mat.item} (In stock: {mat.count} {mat.unit || 'PCs'})
                    </option>
                  ))}
                </select>
              </div>
            );
          })()}

          {/* Summary & Submit */}
          {(() => {
            const active = batchItems.filter((i) => i.selected && i.packs > 0);
            const totalUnits = active.reduce((sum, i) => sum + i.packs * i.packSize, 0);

            return (
              <div className="pt-2 border-t border-white/10 flex justify-between items-center gap-3">
                <div className="text-xs text-text-dim">
                  Checking in <b className="text-text-main font-mono">{active.length}</b> items (
                  <b className="text-primary font-mono">+{totalUnits}</b> units total)
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBatchReceiveOpen(false)}
                    className="px-3.5 py-2 rounded-lg bg-white/5 border border-border-glass text-text-main text-xs font-semibold hover:bg-white/10 cursor-pointer transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBatch || active.length === 0}
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{isSubmittingBatch ? 'Checking in...' : `Check-in Delivery (+${totalUnits})`}</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </form>
      </GlassModal>

      {/* --- Image Restock Slip Modal (Direct Copy for Messenger / Viber) --- */}
      {isImageModalOpen && shoppingListImageUrl && (
        <GlassModal
          isOpen={isImageModalOpen}
          onClose={() => setIsImageModalOpen(false)}
          title="Supplier Restock Slip"
        >
          <div className="flex flex-col gap-3.5 text-left max-w-xl w-full">
            <div className="flex justify-between items-center flex-wrap gap-2 pb-2 border-b border-white/10">
              <span className="text-xs text-text-dim">
                Copy and paste directly into Messenger or Viber without saving files.
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyShoppingListImage}
                  className="px-3.5 py-2 rounded-xl bg-bg-surface hover:bg-white/10 border border-border-glass text-text-main text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Copy image to clipboard so you can press Ctrl+V in Messenger"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy Image</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadShoppingListImage}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-border-glass hover:bg-white/10 text-text-main text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                  title="Download image to your device"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Save Image</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLowStockRequisition}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-border-glass hover:bg-white/10 text-text-dim hover:text-text-main text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                  title="Copy formatted text message as backup"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Copy Text</span>
                </button>
              </div>
            </div>

            {/* Editable Order Quantities */}
            <div className="bg-bg-surface/90 border border-border-glass rounded-xl p-3 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs pb-1.5 border-b border-white/5">
                <span className="font-bold text-text-main flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Customize Order Quantities
                </span>
                <span className="text-[11px] text-text-dim">
                  Type any precise quantity to update slip live
                </span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                {(lowStockItems.length > 0 ? lowStockItems : inventory).map((item) => {
                  const id = item.id || item._id;
                  const packSize = item.packSize && item.packSize > 1 ? item.packSize : 1;
                  const currentVal = customSlipQuantities[id] !== undefined ? customSlipQuantities[id] : calculateSuggestedRestockPacks(item);
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-3 text-xs bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-semibold text-text-main text-[0.82rem]">{item.item}</span>
                        <span className="text-[10px] text-text-dim">
                          Current: {item.count} {item.unit || 'PCs'} • Threshold: {item.minThreshold || 10}
                          {packSize > 1 ? ` • ${packSize} pcs/pack` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min="0"
                          value={currentVal === 0 ? '' : currentVal}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                            handleSlipQuantityChange(id, isNaN(val) ? 0 : val);
                          }}
                          className="w-18 px-2 py-1 text-center bg-bg-surface border border-border-glass rounded-lg text-xs font-bold text-text-main focus:border-primary focus:outline-none"
                          placeholder="0"
                        />
                        <span className="text-text-dim text-[11px] font-medium min-w-20 text-left">
                          {packSize > 1 ? `Packs (${currentVal * packSize} ${item.unit || 'PCs'})` : (item.unit || 'PCs')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-bg-surface border border-border-glass rounded-xl p-3 flex justify-center items-center max-h-[50vh] overflow-y-auto">
              <img
                src={shoppingListImageUrl}
                alt="Supplier Restock Slip"
                className="w-full max-w-md rounded-xl shadow-md border border-border-glass object-contain cursor-pointer"
                title="Right-click or press and hold to copy"
              />
            </div>

            <div className="text-[11px] text-text-dim text-center">
              Tip: Click <b>Copy Image</b>, open <b>Messenger</b> or <b>Viber</b>, and press <b>Ctrl + V</b> (or Paste) to send!
            </div>
          </div>
        </GlassModal>
      )}

      {/* --- PDF Preview Modal (No download required) --- */}
      {isPdfModalOpen && pdfPreviewUrl && (
        <GlassModal
          isOpen={isPdfModalOpen}
          onClose={() => {
            setIsPdfModalOpen(false);
            if (pdfPreviewUrl) {
              URL.revokeObjectURL(pdfPreviewUrl);
              setPdfPreviewUrl(null);
            }
          }}
          title={pdfPreviewTitle}
        >
          <div className="flex flex-col gap-3">
            <div className="w-full h-[65vh] rounded-xl overflow-hidden border border-border-glass bg-neutral-900 shadow-inner">
              <iframe
                src={pdfPreviewUrl}
                title="Procurement PDF Preview"
                className="w-full h-full border-0"
              />
            </div>
            <div className="flex justify-between items-center gap-3 pt-2 flex-wrap">
              <div className="text-xs text-text-dim">
                Document previewed directly on screen without downloading to your computer.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const iframe = document.querySelector('iframe');
                    iframe?.contentWindow?.print();
                  }}
                  className="px-4 py-2 rounded-xl bg-bg-surface border border-border-glass hover:bg-white/10 text-text-main text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6 14h12v8H6z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = pdfPreviewUrl;
                    a.download = `${pdfPreviewTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
                    a.click();
                  }}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Save File</span>
                </button>
              </div>
            </div>
          </div>
        </GlassModal>
      )}
    </section>
  );
}
