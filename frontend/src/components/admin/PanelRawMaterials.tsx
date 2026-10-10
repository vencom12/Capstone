'use client';

import { useState, useEffect } from 'react';
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
  fetchAuditLogs: () => Promise<void>;
  isAdmin?: boolean;
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
    showToast(`Incremented stock (+1 spool of ${material.item})`, 'success');

    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: prev,
        action: 'Add',
        amount: 1,
        minThreshold: material.minThreshold || 10
      });
      refreshData().catch(() => {});
      fetchAuditLogs().catch(() => {});
    } catch (err) {
      setOptimisticCount(prev);
      setInputValue(prev.toString());
      console.error(err);
      showToast('Failed to increment stockpile. Reverted.', 'error');
    }
  };

  const handleDecrement = async () => {
    if (optimisticCount <= 0) {
      showToast('Stock count cannot go below zero!', 'error');
      return;
    }
    const prev = optimisticCount;
    const next = prev - 1;
    setOptimisticCount(next);
    setInputValue(next.toString());
    showToast(`Decremented stock (-1 spool of ${material.item})`, 'success');

    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: prev,
        action: 'Deduct',
        amount: 1,
        minThreshold: material.minThreshold || 10
      });
      refreshData().catch(() => {});
      fetchAuditLogs().catch(() => {});
    } catch (err) {
      setOptimisticCount(prev);
      setInputValue(prev.toString());
      console.error(err);
      showToast('Failed to decrement stockpile. Reverted.', 'error');
    }
  };

  const handleAbsoluteSubmit = async () => {
    const newVal = parseInt(inputValue);
    if (isNaN(newVal) || newVal < 0) {
      showToast('Please enter a valid stock level', 'error');
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
    showToast(`Stock updated to ${newVal} (${action === 'Add' ? '+' : '-'}${amount})`, 'success');

    try {
      const materialId = material.id || material._id;
      await api.patch(`/api/admin/inventory/${materialId}`, {
        count: prev,
        action: action,
        amount: amount,
        minThreshold: material.minThreshold || 10
      });
      refreshData().catch(() => {});
      fetchAuditLogs().catch(() => {});
    } catch (err) {
      setOptimisticCount(prev);
      setInputValue(prev.toString());
      console.error(err);
      showToast('Failed to alter stockpile. Reverted.', 'error');
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

function InlineThresholdAdjuster({ material, refreshData, fetchAuditLogs, isAdmin = true }: InlineStockAdjusterProps) {
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setInputValue(material.supplierUnitCost != null ? String(material.supplierUnitCost) : '');
  }, [material.supplierUnitCost]);

  if (!isAdmin) {
    return (
      <span className="font-mono text-xs text-text-dim px-2 py-1 select-none">
        {material.supplierUnitCost != null ? `₱${Number(material.supplierUnitCost).toFixed(2)}` : '—'}
      </span>
    );
  }

  const handleSubmit = async () => {
    const parsed = inputValue.trim() === '' ? null : parseFloat(inputValue);
    if (inputValue.trim() !== '' && (isNaN(parsed!) || parsed! < 0)) {
      showToast('Enter a valid cost (or leave blank to clear)', 'error');
      setInputValue(material.supplierUnitCost != null ? String(material.supplierUnitCost) : '');
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
        ? `Supplier cost set to ₱${parsed.toFixed(2)} for ${material.item}`
        : `Supplier cost cleared for ${material.item}`,
      'success'
    );

    try {
      await api.patch(`/api/admin/inventory/${materialId}`, { supplierUnitCost: parsed });
      refreshData().catch(() => {});
    } catch (err) {
      console.error(err);
      if (setInventory) {
        setInventory((prev) =>
          prev.map((m) => ((m.id || m._id) === materialId ? { ...m, supplierUnitCost: prevCost } : m))
        );
      }
      showToast('Failed to update supplier cost — reverted', 'error');
      setInputValue(prevCost != null ? String(prevCost) : '');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    else if (e.key === 'Escape') {
      setInputValue(material.supplierUnitCost != null ? String(material.supplierUnitCost) : '');
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5 animate-fade" onClick={(e) => e.stopPropagation()}>
        <span className="text-text-dim text-xs font-bold select-none">₱</span>
        <input
          type="number"
          autoFocus
          min="0"
          step="0.5"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          placeholder="0.00"
          className="w-20 bg-white/10 border border-primary/50 px-2 py-0.5 rounded text-center text-text-main font-mono font-bold outline-none text-xs"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      disabled={isSubmitting}
      className="bg-transparent hover:bg-white/5 border-none px-2 py-1 rounded font-mono text-xs cursor-pointer transition-all flex items-center gap-1 group"
      title="Click to set the supplier cost per unit (used for real profit tracking)"
    >
      {material.supplierUnitCost != null ? (
        <span className="text-emerald-400 font-bold">₱{Number(material.supplierUnitCost).toFixed(2)}</span>
      ) : (
        <span className="text-text-dim/50 group-hover:text-text-dim italic">Set cost...</span>
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
      showToast('This material is already linked to this product recipe', 'info');
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
      showToast(`Linked "${materialName}" to "${targetProduct.name}"!`, 'success');
      setLinkingMaterial(null);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to link material to product', 'error');
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
      showToast(`Unlinked material from "${targetProduct.name}"`, 'success');
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to unlink material', 'error');
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Settings
  const [auditLogToggle, setAuditLogToggle] = useState(true);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Smart Material Form Fields
  const [materialCategory, setMaterialCategory] = useState('Thread Spool');
  const [spoolColor, setSpoolColor] = useState('Black');
  const [customColor, setCustomColor] = useState('');
  const [customName, setCustomName] = useState('');
  const [itemCount, setItemCount] = useState('');
  const [itemUnit, setItemUnit] = useState('PCs');
  const [itemThreshold, setItemThreshold] = useState('10');
  const [itemSupplierCost, setItemSupplierCost] = useState('');

  // Delete modal state
  const [deletingMaterial, setDeletingMaterial] = useState<any>(null);

  // Patch Quantity Fields
  const [patchAction, setPatchAction] = useState<'Add' | 'Deduct'>('Add');
  const [patchQty, setPatchQty] = useState('');

  // Global Settings Field
  const [globalThreshold, setGlobalThreshold] = useState('10');

  // Supplier Shipment / Delivery Intake Modal State
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [selectedRestockMaterialId, setSelectedRestockMaterialId] = useState<string>('');
  const [restockAmount, setRestockAmount] = useState<string>('20');
  const [restockSupplier, setRestockSupplier] = useState<string>('Madeira Thread Philippines');
  const [restockDrNumber, setRestockDrNumber] = useState<string>('');
  const [restockDyeLot, setRestockDyeLot] = useState<string>('');
  const [restockNotes, setRestockNotes] = useState<string>('');
  const [isSubmittingRestock, setIsSubmittingRestock] = useState(false);

  // Sub-View Switcher: 'inventory' | 'purchase_orders'
  const [activeView, setActiveView] = useState<'inventory' | 'purchase_orders'>('inventory');

  // Purchase Orders & Supplier State
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [isLoadingPOs, setIsLoadingPOs] = useState(false);
  const [isDraftPoOpen, setIsDraftPoOpen] = useState(false);
  const [draftPoMaterialId, setDraftPoMaterialId] = useState('');
  const [draftPoQuantity, setDraftPoQuantity] = useState('20');
  const [draftPoEstCost, setDraftPoEstCost] = useState('100');
  const [isSubmittingPo, setIsSubmittingPo] = useState(false);

  // PDF Inline Preview Modal State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('Procurement Document Preview');
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  const fetchPurchaseOrders = async () => {
    setIsLoadingPOs(true);
    try {
      const data = await api.get<any[]>('/api/admin/purchase-orders');
      if (Array.isArray(data)) {
        setPurchaseOrders(data);
      }
    } catch (err) {
      console.error('Failed to fetch purchase orders:', err);
    } finally {
      setIsLoadingPOs(false);
    }
  };

  useEffect(() => {
    fetchPurchaseOrders();
  }, []);

  const handlePreviewRestockList = async () => {
    if (lowStockItems.length === 0) {
      showToast('All stockpile spools are healthy. No restocks required!', 'info');
      return;
    }
    setIsLoadingPdf(true);
    try {
      showToast('Generating restock procurement list preview...', 'info');
      const blob = await api.getBlob('/api/admin/inventory/shopping-list/pdf?inline=true');
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfPreviewTitle('Restock Procurement Shopping List (PDF)');
      setIsPdfModalOpen(true);
    } catch (err: any) {
      console.error('PDF Preview failed:', err);
      showToast(err.message || 'Failed to generate procurement PDF preview', 'error');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handlePreviewPoPdf = async (poId: string) => {
    setIsLoadingPdf(true);
    try {
      showToast('Generating official Purchase Order PDF...', 'info');
      const blob = await api.getBlob(`/api/admin/purchase-orders/${poId}/pdf`);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfPreviewTitle(`Purchase Order #${poId.slice(-6).toUpperCase()} (PDF)`);
      setIsPdfModalOpen(true);
    } catch (err: any) {
      console.error('PO PDF Preview failed:', err);
      showToast(err.message || 'Failed to preview PO PDF', 'error');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleCopyPoForMessenger = (po: any) => {
    const poNum = `PO-${po.id.slice(-6).toUpperCase()}`;
    const text = `📦 PURCHASE ORDER — EDS TOWELS & CAPS\nPO Number: #${poNum}\nDelivery Hub: Ground Floor, Pacific Mall Lucena City\nContact: 0917-888-THREAD\n\nGood day! We would like to order the following embroidery materials:\n• ${po.quantity} ${po.inventory?.unit || 'Cones'} — ${po.inventory?.item || 'Embroidery Material'}\n${po.estimatedCost ? `Estimated Total: ₱${po.estimatedCost.toFixed(2)}\n` : ''}\nPlease confirm price invoice and expected delivery date. Thank you!`;
    
    navigator.clipboard.writeText(text).then(() => {
      showToast(`📋 Copied PO #${poNum} for Messenger/Viber!`, 'success');
    }).catch(() => {
      showToast('Failed to copy to clipboard', 'error');
    });
  };

  const handleEmailPo = async (poId: string) => {
    try {
      const res = await api.post<{ success: boolean; message: string }>(`/api/admin/purchase-orders/${poId}/email`, {});
      showToast(res.message || 'Purchase Order dispatched to supplier email!', 'success');
      await fetchPurchaseOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to email supplier', 'error');
    }
  };

  const handleMarkPoReceived = async (po: any) => {
    const dr = window.prompt(`Confirm arrival of ${po.quantity} ${po.inventory?.unit || 'units'} of ${po.inventory?.item}.\nEnter Supplier Delivery Receipt (DR) # (optional):`, 'DR-');
    if (dr === null) return;

    try {
      await api.put(`/api/admin/purchase-orders/${po.id}/status`, {
        status: 'Received',
        deliveryReceipt: dr.trim() || undefined
      });
      showToast(`🎉 Received +${po.quantity} ${po.inventory?.unit} of ${po.inventory?.item}! Inventory automatically replenished.`, 'success');
      await fetchPurchaseOrders();
      await refreshData();
      await fetchAuditLogs();
    } catch (err: any) {
      showToast(err.message || 'Failed to mark PO as received', 'error');
    }
  };

  const handleCreateDraftPo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPoMaterialId) {
      showToast('Please select a material', 'error');
      return;
    }
    const qty = parseInt(draftPoQuantity);
    if (isNaN(qty) || qty <= 0) {
      showToast('Please enter a valid quantity', 'error');
      return;
    }

    setIsSubmittingPo(true);
    try {
      await api.post('/api/admin/purchase-orders', {
        inventoryId: draftPoMaterialId,
        quantity: qty,
        estimatedCost: parseFloat(draftPoEstCost) || null,
        status: 'Approved'
      });
      showToast('🎉 Purchase Order staged successfully!', 'success');
      setIsDraftPoOpen(false);
      await fetchPurchaseOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to draft PO', 'error');
    } finally {
      setIsSubmittingPo(false);
    }
  };

  const openRestockModal = (material?: any) => {
    if (material) {
      setSelectedRestockMaterialId(material.id || material._id);
    } else if (inventory.length > 0) {
      setSelectedRestockMaterialId(inventory[0].id || inventory[0]._id);
    }
    setRestockAmount('20');
    setRestockDrNumber('');
    setRestockDyeLot('');
    setRestockNotes('');
    setIsRestockModalOpen(true);
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRestockMaterialId) {
      showToast('Please select a material to restock', 'error');
      return;
    }
    const qty = parseInt(restockAmount);
    if (isNaN(qty) || qty <= 0) {
      showToast('Please enter a valid delivered quantity (> 0)', 'error');
      return;
    }

    const targetMaterial = inventory.find((i) => (i.id || i._id) === selectedRestockMaterialId);
    if (!targetMaterial) {
      showToast('Material not found', 'error');
      return;
    }

    const prevCount = targetMaterial.count;
    const materialId = selectedRestockMaterialId;

    // Optimistically update stock count in state immediately (0ms latency)
    if (setInventory) {
      setInventory((prev) =>
        prev.map((m) =>
          (m.id || m._id) === materialId ? { ...m, count: (m.count || 0) + qty } : m
        )
      );
    }

    const supplierTag = restockSupplier ? ` from ${restockSupplier}` : '';
    const drTag = restockDrNumber ? ` (DR#: ${restockDrNumber})` : '';
    showToast(`Successfully received +${qty} ${targetMaterial.unit || 'units'} of ${targetMaterial.item}${supplierTag}${drTag}!`, 'success');

    setIsRestockModalOpen(false);

    try {
      await api.patch(`/api/admin/inventory/${selectedRestockMaterialId}`, {
        count: targetMaterial.count,
        action: 'Add',
        amount: qty,
        supplier: restockSupplier.trim(),
        deliveryReceipt: restockDrNumber.trim(),
        dyeLot: restockDyeLot.trim(),
        notes: restockNotes.trim()
      });

      refreshData().catch(() => {});
      fetchAuditLogs().catch(() => {});
    } catch (err) {
      console.error(err);
      if (setInventory) {
        setInventory((prev) =>
          prev.map((m) =>
            (m.id || m._id) === materialId ? { ...m, count: prevCount } : m
          )
        );
      }
      showToast('Failed to record supplier shipment intake — reverted', 'error');
    } finally {
      setIsSubmittingRestock(false);
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
          setAuditLogToggle(!!settings.inventoryAuditLog);
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
    const level = computeStockLevel(i.count, i.minThreshold || 10);
    return level.tier === stockTierFilter;
  });

  // Pagination for Inventory Table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, stockTierFilter]);

  const paginatedInventory = filteredInventory.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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
    if (!resolvedName) return showToast('Material item name is required', 'error');

    const tempId = `temp_mat_${Date.now()}`;
    const newMaterial = {
      id: tempId,
      _id: tempId,
      item: resolvedName,
      count: parseInt(itemCount) || 0,
      unit: itemUnit,
      minThreshold: parseInt(itemThreshold) || 10,
      supplierUnitCost: itemSupplierCost !== '' ? parseFloat(itemSupplierCost) : undefined
    };

    const prevInventory = [...inventory];
    if (setInventory) {
      setInventory((prev) => [newMaterial, ...prev]);
    }

    showToast(`Material "${resolvedName}" cataloged successfully`, 'success');
    setIsAddOpen(false);
    setMaterialCategory('Thread Spool');
    setSpoolColor('Black');
    setCustomColor('');
    setCustomName('');
    setItemCount('');
    setItemUnit('PCs');
    setItemThreshold('10');
    setItemSupplierCost('');

    try {
      const res: any = await api.post('/api/admin/inventory', {
        item: resolvedName,
        count: parseInt(itemCount) || 0,
        unit: itemUnit,
        minThreshold: parseInt(itemThreshold) || 10,
        supplierUnitCost: itemSupplierCost !== '' ? parseFloat(itemSupplierCost) : undefined
      });

      if (res?.data && setInventory) {
        setInventory((prev) =>
          prev.map((m) => (m.id === tempId || m._id === tempId ? { ...m, ...res.data } : m))
        );
      }
      refreshData().catch(() => {});
      fetchAuditLogs().catch(() => {});
    } catch (err) {
      console.error(err);
      if (setInventory) {
        setInventory(prevInventory);
      }
      showToast('Failed to create material — reverted', 'error');
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
    showToast('Material deleted from inventory', 'success');

    try {
      await api.delete(`/api/admin/inventory/${id}`);
      refreshData().catch(() => {});
      fetchAuditLogs().catch(() => {});
    } catch (err) {
      console.error(err);
      if (setInventory) {
        setInventory(prevInventory);
      }
      showToast('Failed to delete material — restored', 'error');
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
      {/* Compact Top Action Toolbar */}
      <div className="flex justify-start items-center flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search materials..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
        />
        {isAdmin && (
          <>
            <button
              onClick={() => openRestockModal()}
              className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold px-3.5 py-2.5 rounded-xl text-[0.85rem] cursor-pointer hover:bg-emerald-500/25 transition-all text-center"
              title="Intake arriving shipment / delivery from supplier"
            >
              Receive Shipment
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="bg-bg-surface border border-border-glass w-10 h-10 rounded-xl flex items-center justify-center text-text-main hover:bg-white/5 cursor-pointer"
              title="Inventory Settings"
            >
              <svg className="w-4 h-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              onClick={() => setIsAddOpen(true)}
              className="bg-primary text-white font-bold px-4 py-2.5 rounded-xl text-[0.85rem] cursor-pointer border-none shadow-sm hover:shadow-md"
            >
              + Add Material
            </button>
          </>
        )}
      </div>

      {/* Main split dashboard panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start pr-2">
        {/* Left side: Materials inventory card with alert and table */}
        <div className="xl:col-span-2 glass-card">
          {/* Sub-view Navigation Bar */}
          <div className="flex items-center gap-3 mb-5 border-b border-white/10 pb-2">
            <button
              type="button"
              onClick={() => setActiveView('inventory')}
              className={`pb-2 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeView === 'inventory'
                  ? 'border-primary text-text-main'
                  : 'border-transparent text-text-dim hover:text-text-main'
              }`}
            >
              <svg className="w-4 h-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Materials Registry ({inventory.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('purchase_orders');
                fetchPurchaseOrders();
              }}
              className={`pb-2 px-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeView === 'purchase_orders'
                  ? 'border-primary text-text-main'
                  : 'border-transparent text-text-dim hover:text-text-main'
              }`}
            >
              <svg className="w-4 h-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Purchase Orders &amp; Suppliers</span>
              {purchaseOrders.filter(p => p.status !== 'Received').length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary border border-primary/30">
                  {purchaseOrders.filter(p => p.status !== 'Received').length} open
                </span>
              )}
            </button>
          </div>

          {activeView === 'purchase_orders' ? (
            <div className="flex flex-col gap-4 animate-fade text-left">
              <div className="flex justify-between items-center flex-wrap gap-3 pb-3 border-b border-white/5">
                <div>
                  <h4 className="text-base font-bold text-text-main m-0">Supplier Purchase Orders</h4>
                  <p className="text-xs text-text-dim m-0">Auto-staged by AI velocity forecasting or manual dispatch.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (inventory.length > 0) setDraftPoMaterialId(inventory[0].id || inventory[0]._id);
                      setDraftPoQuantity('20');
                      setDraftPoEstCost('100');
                      setIsDraftPoOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <span>+</span> Draft New PO
                  </button>
                  <button
                    type="button"
                    onClick={fetchPurchaseOrders}
                    className="p-2 rounded-xl bg-bg-surface border border-border-glass text-text-dim hover:text-text-main text-xs transition cursor-pointer"
                    title="Refresh orders"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              {isLoadingPOs ? (
                <div className="text-center py-8 text-xs text-text-dim">Loading purchase orders...</div>
              ) : purchaseOrders.length === 0 ? (
                <div className="p-8 text-center bg-bg-surface/40 rounded-2xl border border-dashed border-border-glass flex flex-col items-center gap-2">
                  <svg className="w-8 h-8 text-text-dim opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-sm font-bold text-text-main">No Purchase Orders Created</span>
                  <span className="text-xs text-text-dim max-w-sm">
                    When materials reach critical threshold, the AI auto-drafts a PO here. You can also manually draft a PO to send to your supplier.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (inventory.length > 0) setDraftPoMaterialId(inventory[0].id || inventory[0]._id);
                      setIsDraftPoOpen(true);
                    }}
                    className="mt-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer"
                  >
                    + Draft First PO
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {purchaseOrders.map((po) => {
                    const poNum = `PO-${po.id.slice(-6).toUpperCase()}`;
                    const isReceived = po.status === 'Received';
                    const isOrdered = po.status === 'Ordered';
                    const isApproved = po.status === 'Approved';

                    return (
                      <div
                        key={po.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isReceived
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : isOrdered
                            ? 'bg-amber-500/5 border-amber-500/20'
                            : 'bg-bg-surface/70 border-border-glass'
                        }`}
                      >
                        <div className="flex flex-col gap-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-text-main">#{poNum}</span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase ${
                                isReceived
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : isOrdered
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : isApproved
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-white/10 text-gray-300 border border-white/20'
                              }`}
                            >
                              {po.status}
                            </span>
                            <span className="text-[11px] text-text-dim">
                              {new Date(po.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="text-sm font-bold text-text-main">
                            {po.inventory?.item || 'Material Item'}
                          </div>

                          <div className="text-xs text-text-dim flex items-center gap-3">
                            <span>Quantity: <strong className="text-text-main">{po.quantity} {po.inventory?.unit || 'units'}</strong></span>
                            {po.estimatedCost && <span>Est. Cost: <strong className="text-emerald-400">₱{po.estimatedCost.toFixed(2)}</strong></span>}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handlePreviewPoPdf(po.id)}
                            className="px-3 py-1.5 rounded-xl bg-bg-surface border border-border-glass hover:bg-white/10 text-text-main text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                            title="Preview official Purchase Order PDF on screen without downloading"
                          >
                            <svg className="w-3.5 h-3.5 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round"/>
                              <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>Preview Slip</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyPoForMessenger(po)}
                            className="px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 hover:bg-blue-500/25 text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                            title="Copy ready-to-send text message for Facebook Messenger / Viber"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>Copy Messenger</span>
                          </button>

                          {!isReceived && (
                            <button
                              type="button"
                              onClick={() => handleEmailPo(po.id)}
                              className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-purple-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                              title="Send official PO email to supplier"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>Email</span>
                            </button>
                          )}

                          {!isReceived ? (
                            <button
                              type="button"
                              onClick={() => handleMarkPoReceived(po)}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                              title="Confirm delivery arrival and automatically replenish inventory stock"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>Mark Received</span>
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-400 font-bold px-2 py-1 flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>Stock Replenished</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>

          {/* Smart Purchase Requisition Alert Banner */}
          {lowStockItems.length > 0 ? (
            <div className="bg-danger/10 border border-danger/20 p-4 rounded-2xl flex justify-between items-center flex-wrap gap-3 mb-4 text-left animate-fade">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-danger/15 flex items-center justify-center text-danger shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-danger">Stock Alert: Restock Recommended!</span>
                  <span className="text-xs text-text-dim mt-0.5">
                    {lowStockItems.length} materials are currently below their low stock thresholds.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => openRestockModal(lowStockItems[0])}
                  className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Directly intake arriving boxes for critical stock"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Intake Received Delivery</span>
                </button>
                <button
                  type="button"
                  onClick={handlePreviewRestockList}
                  disabled={isLoadingPdf}
                  className="bg-primary/20 border border-primary/30 text-primary font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-primary/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="View formatted PDF procurement shopping list directly on screen without downloading"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Preview Procurement PDF</span>
                </button>
                <button
                  onClick={handleDownloadRestockList}
                  className="bg-danger/20 border border-danger/30 text-danger font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-danger/30 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-success/10 border border-success/20 p-3.5 rounded-xl flex items-center gap-2 mb-4 text-left animate-fade">
              <span className="text-xs font-bold text-success">Stock Healthy! All inventory materials are above safety margins.</span>
            </div>
          )}

          {/* Stock Level Filter Chips */}
          <div className="flex items-center gap-2 flex-wrap mb-4 pb-3 border-b border-white/5">
            <span className="text-xs text-text-dim font-medium mr-1">Stock Level:</span>
            {[
              { id: 'all', label: 'All Materials', count: inventory.length },
              { id: 'critical', label: 'Critical', count: inventoryMetrics.critical },
              { id: 'low', label: 'Low Stock', count: inventoryMetrics.low },
              { id: 'moderate', label: 'Moderate', count: inventoryMetrics.moderate },
              { id: 'high', label: 'High Stock', count: inventoryMetrics.high },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStockTierFilter(pill.id as StockLevelTier)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
                  stockTierFilter === pill.id
                    ? 'bg-primary text-white border-primary/40 shadow-sm'
                    : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                <span>{pill.label}</span>
                <span className="text-[0.68rem] px-1.5 py-0.2 rounded-full bg-white/10 font-bold font-mono">
                  {pill.count}
                </span>
              </button>
            ))}
          </div>

          {isSyncing && inventory.length === 0 ? (
            <div className="max-[1024px]:hidden mb-4 w-full animate-pulse">
              <TableSkeleton rows={5} cols={5} />
            </div>
          ) : (
            <div className="glass-table-container max-[1024px]:hidden">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th className="glass-th text-left">Material Name</th>
                    <th className="glass-th text-left">Linked Products / Variants</th>
                    <th className="glass-th text-left">Current Count</th>
                    <th className="glass-th text-left">Supplier Cost / Unit</th>
                    <th className="glass-th text-left">Stock Level</th>
                    <th className="glass-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.length === 0 ? (
                    <tr className="glass-tr">
                      <td colSpan={6} className="glass-td text-center text-text-dim">
                        No materials match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedInventory.map((i) => {
                    const id = i.id || i._id;
                    const stockLevel = computeStockLevel(i.count, i.minThreshold || 10);
                    const linkedProducts = getLinkedProductsForMaterial(id, i.item);
                    return (
                      <tr key={id} className="glass-tr hover:bg-white/5 transition-all">
                        <td className="glass-td font-bold text-sm text-text-main text-left">
                          {i.item}
                        </td>
                        <td className="glass-td text-left">
                          {linkedProducts.length === 0 ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[0.7rem] text-text-dim italic">Unlinked</span>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openLinkProductModal(i)}
                                  className="text-[0.68rem] text-primary hover:text-primary-hover font-bold hover:underline cursor-pointer"
                                  title={`Link ${i.item} to a store product`}
                                >
                                  + Link Product
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 max-w-[220px]">
                              {linkedProducts.slice(0, 3).map((link, lIdx) => (
                                <span
                                  key={lIdx}
                                  className="text-[0.68rem] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-text-main truncate inline-flex items-center justify-between gap-1 group"
                                  title={`${link.productName}${link.variantName ? ` (${link.variantName})` : ''}`}
                                >
                                  <span className="truncate">
                                    <strong className="text-primary">{link.productName}</strong>
                                    {link.variantName && <span className="text-text-dim"> - {link.variantName}</span>}
                                  </span>
                                  {isAdmin && link.type === 'recipe' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnlinkMaterialFromProduct(link.productId, id);
                                      }}
                                      className="text-text-dim hover:text-red-400 font-bold ml-1 opacity-60 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                                      title={`Unlink from ${link.productName}`}
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                              {linkedProducts.length > 3 && (
                                <span className="text-[0.65rem] text-text-dim font-bold">
                                  +{linkedProducts.length - 3} more products
                                </span>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openLinkProductModal(i)}
                                  className="text-[0.65rem] text-primary hover:text-primary-hover font-bold self-start mt-0.5 hover:underline cursor-pointer"
                                >
                                  + Link Product
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="glass-td text-left">
                          {/* Read-only Current Count display with stock progress gauge */}
                          <div className="flex flex-col gap-1.5 w-fit">
                            <div className="flex items-center gap-1.5 font-mono font-extrabold text-sm text-text-main bg-white/5 border border-border-glass px-3 py-1.5 rounded-lg w-fit select-none" title="Current Count (Read-only)">
                              <span>{i.count}</span>
                              <span className="text-[0.7rem] text-text-dim font-bold">{i.unit || 'PCs'}</span>
                            </div>
                            {/* Micro gauge bar */}
                            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden" title={`${stockLevel.label} (${i.count} / ${i.minThreshold || 10})`}>
                              <div 
                                className="h-full rounded-full transition-all duration-300"
                                style={{ 
                                   width: `${Math.min(100, Math.max(6, (i.count / ((i.minThreshold || 10) * 2.5)) * 100))}%`,
                                  backgroundColor: stockLevel.dotColor
                                }}
                              />
                            </div>
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
                        <td className="glass-td text-left">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[0.7rem] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider backdrop-blur-md ${stockLevel.badgeClass}`}
                            title={stockLevel.description}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stockLevel.dotColor }} />
                            {stockLevel.label}
                          </span>
                        </td>
                        <td className="glass-td text-right">
                          <div className="flex gap-2 justify-end items-center">
                            <button
                              type="button"
                              onClick={() => openRestockModal(i)}
                              className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                              title={`Receive supplier delivery for ${i.item}`}
                            >
                              Restock
                            </button>
                            {isAdmin ? (
                              <button
                                type="button"
                                onClick={() => setDeletingMaterial(i)}
                                className="bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 hover:border-danger/50 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                                title={`Delete ${i.item}`}
                              >
                                Delete
                              </button>
                            ) : (
                              <span className="text-xs text-text-dim/60 italic font-mono px-2">Tracked</span>
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
                    className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-[20px] p-4 flex flex-col gap-3 text-left relative"
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
                    </div>

                    <div className="flex gap-2 w-full mt-2">
                      <button
                        type="button"
                        onClick={() => openRestockModal(i)}
                        className="flex-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-500/25 transition-all cursor-pointer text-center shadow-sm"
                      >
                        Receive Stock
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeletingMaterial(i)}
                          className="flex-1 bg-danger/10 border border-danger/30 text-danger py-2.5 rounded-xl text-xs font-bold hover:bg-danger/20 transition-all cursor-pointer text-center shadow-sm"
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
            itemLabel="materials"
          />
            </>
          )}
        </div>

        {/* Right side: Stock audit logs trail */}
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

      {/* Modal: Add Material */}
      <GlassModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add Material">
        <form onSubmit={handleCreateSubmit} className="modal-stack text-left">
          {/* Material Category Selector */}
          <div className="modal-section">
            <label className="modal-label">Material Name / Category</label>
            <select
              value={materialCategory}
              onChange={(e) => setMaterialCategory(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
            >
              <option value="Thread Spool">Thread Spool</option>
              <option value="Pillion / Pillow Insert">Pillion / Pillow Insert</option>
              <option value="Machine Oil">Machine Oil</option>
              <option value="Paper Bag">Paper Bag</option>
              <option value="Gift Bag">Gift Bag</option>
              <option value="Eco Bag">Eco Bag</option>
              <option value="Custom">Custom Material...</option>
            </select>
          </div>

          {/* Conditional Color Selector for Thread Spool */}
          {materialCategory === 'Thread Spool' && (
            <div className="modal-section animate-fade">
              <label className="modal-label">Thread Color</label>
              <select
                value={spoolColor}
                onChange={(e) => setSpoolColor(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
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
                  className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans mt-2 animate-fade"
                />
              )}
            </div>
          )}

          {/* Custom Material Name if Custom is chosen */}
          {materialCategory === 'Custom' && (
            <div className="modal-section animate-fade">
              <label className="modal-label">Custom Material Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Backing Paper, Needles #14"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="modal-section">
              <label className="modal-label">Amount</label>
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
                <option value="PCs">PCs</option>
                <option value="Ea">Ea</option>
              </select>
            </div>
          </div>

          <div className="modal-section">
            <label className="modal-label">Low Stock Threshold</label>
            <input
              type="number"
              value={itemThreshold}
              onChange={(e) => setItemThreshold(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
            />
          </div>

          {/* Supplier Cost per Unit — drives real profit in analytics */}
          <div className="modal-section">
            <label className="modal-label">
              Supplier Cost per Unit (₱)
              <span className="ml-2 text-[0.65rem] text-emerald-400 font-normal normal-case bg-emerald-500/10 px-2 py-0.5 rounded">
                Powers real profit calculation
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim font-bold text-sm select-none">₱</span>
              <input
                type="number"
                min="0"
                step="0.50"
                placeholder="e.g. 45.00"
                value={itemSupplierCost}
                onChange={(e) => setItemSupplierCost(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 pl-7 rounded-xl text-text-main text-sm outline-none w-full font-mono"
              />
            </div>
            <p className="text-[0.67rem] text-text-dim mt-1 m-0">
              How much you pay the supplier per {itemUnit || 'unit'}. Leave blank if not applicable (e.g. thread spools).
            </p>
          </div>

          <button
            type="submit"
            className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-sm hover:shadow-md text-center w-full text-sm font-sans"
          >
            Add Material
          </button>
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
        <form onSubmit={handleLinkProductSubmit} className="modal-stack text-left flex flex-col gap-4">
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
              <span className="text-[0.65rem] text-text-dim mt-0.5">Records material stock adjustments in DB logs</span>
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
            className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-sm hover:shadow-md text-center w-full text-sm font-sans"
          >
            Apply Global Parameters
          </button>
        </form>
      </GlassModal>

      {/* Modal: Supplier Shipment Delivery Intake */}
      <GlassModal
        isOpen={isRestockModalOpen}
        onClose={() => setIsRestockModalOpen(false)}
        title="Receive Supplier Shipment"
      >
        <form onSubmit={handleRestockSubmit} className="modal-stack text-left">
          <p className="text-xs text-text-dim m-0 mb-1 leading-relaxed">
            Record physical inventory arrivals from suppliers, check in delivered materials, and generate a verified audit trail log.
          </p>

          {/* Material Selection */}
          <div className="modal-section">
            <label className="modal-label">Material to Replenish</label>
            <select
              value={selectedRestockMaterialId}
              onChange={(e) => setSelectedRestockMaterialId(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
              required
            >
              {inventory.map((item) => {
                const id = item.id || item._id;
                const isLow = item.count <= (item.minThreshold || 10);
                return (
                  <option key={id} value={id}>
                    {item.item} — In Stock: {item.count} {item.unit || 'units'} {isLow ? '[LOW STOCK]' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Delivered Quantity + Quick Increment Pills */}
          <div className="modal-section">
            <label className="modal-label">
              Delivered Quantity ({inventory.find(i => (i.id || i._id) === selectedRestockMaterialId)?.unit || 'Units'})
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="1"
                required
                value={restockAmount}
                onChange={(e) => setRestockAmount(e.target.value)}
                placeholder="e.g. 25"
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none flex-1 font-mono font-bold"
              />
              <div className="flex gap-1.5 shrink-0">
                {['+10', '+25', '+50', '+100'].map((pill) => (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => {
                      const base = parseInt(restockAmount) || 0;
                      const add = parseInt(pill.replace('+', ''));
                      setRestockAmount(String(base + add));
                    }}
                    className="bg-white/5 border border-border-glass hover:bg-white/10 text-text-main text-xs px-2.5 py-2.5 rounded-xl font-mono cursor-pointer transition-all"
                  >
                    {pill}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Supplier Name & Delivery Receipt */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="modal-section">
              <label className="modal-label">Supplier / Vendor</label>
              <input
                type="text"
                list="supplier-suggestions"
                value={restockSupplier}
                onChange={(e) => setRestockSupplier(e.target.value)}
                placeholder="e.g. Madeira Thread Philippines"
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full"
                required
              />
              <datalist id="supplier-suggestions">
                <option value="Madeira Thread Philippines" />
                <option value="Gunold Embroidery Supplies" />
                <option value="Gildan Lucena Wholesaler" />
                <option value="Winner Garments Manila" />
                <option value="Blue Corner Apparel" />
                <option value="Pacific Mall Haberdashery" />
              </datalist>
            </div>

            <div className="modal-section">
              <label className="modal-label">Delivery Receipt (DR) / Invoice #</label>
              <input
                type="text"
                value={restockDrNumber}
                onChange={(e) => setRestockDrNumber(e.target.value)}
                placeholder="e.g. DR-2026-8812"
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
              />
            </div>
          </div>

          {/* Dye-Lot & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="modal-section">
              <label className="modal-label">Dye-Lot / Batch # (Optional)</label>
              <input
                type="text"
                value={restockDyeLot}
                onChange={(e) => setRestockDyeLot(e.target.value)}
                placeholder="e.g. LOT-4029-B"
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
              />
            </div>

            <div className="modal-section">
              <label className="modal-label">Intake Notes / QA Remarks</label>
              <input
                type="text"
                value={restockNotes}
                onChange={(e) => setRestockNotes(e.target.value)}
                placeholder="e.g. Inspected, clean spools"
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full"
              />
            </div>
          </div>

          {/* Live Calculation Preview Banner */}
          {(() => {
            const target = inventory.find(i => (i.id || i._id) === selectedRestockMaterialId);
            const current = target ? target.count : 0;
            const added = parseInt(restockAmount) || 0;
            const finalCount = current + added;
            const unit = target?.unit || 'units';

            return (
              <div className="bg-emerald-500/10 border border-emerald-500/25 p-3.5 rounded-2xl flex justify-between items-center gap-2 mt-1">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-emerald-400">Stockpile Projection:</span>
                  <span className="text-[0.75rem] text-text-dim">
                    Current: <b className="text-white font-mono">{current}</b> {unit} &nbsp;➔&nbsp; After Intake: <b className="text-emerald-400 font-mono text-sm">+{added} = {finalCount}</b> {unit}
                  </span>
                </div>
                <svg className="w-5 h-5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 6l-9.5 9.5-5-5L1 18" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M17 6h6v6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            );
          })()}

          {/* Submit Actions */}
          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={() => setIsRestockModalOpen(false)}
              className="px-4 py-3 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingRestock}
              className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer border-none shadow-sm flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{isSubmittingRestock ? 'Recording Intake...' : 'Confirm & Check-in Shipment'}</span>
            </button>
          </div>
        </form>
      </GlassModal>

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
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 14h12v8H6z" strokeLinecap="round" strokeLinejoin="round"/>
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
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Save File</span>
                </button>
              </div>
            </div>
          </div>
        </GlassModal>
      )}

      {/* --- Draft PO Modal --- */}
      {isDraftPoOpen && (
        <GlassModal
          isOpen={isDraftPoOpen}
          onClose={() => setIsDraftPoOpen(false)}
          title="Draft Supplier Purchase Order"
        >
          <form onSubmit={handleCreateDraftPo} className="flex flex-col gap-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-text-dim mb-1">
                Material Item to Order <span className="text-red-400">*</span>
              </label>
              <select
                value={draftPoMaterialId}
                onChange={(e) => setDraftPoMaterialId(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none"
              >
                {inventory.map((inv) => (
                  <option key={inv.id || inv._id} value={inv.id || inv._id} className="bg-bg-surface text-text-main">
                    {inv.item} (Current Stock: {inv.count} {inv.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1">
                  Quantity to Order <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={draftPoQuantity}
                  onChange={(e) => setDraftPoQuantity(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1">
                  Estimated Total Cost (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={draftPoEstCost}
                  onChange={(e) => setDraftPoEstCost(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none font-bold"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => setIsDraftPoOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingPo}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold cursor-pointer"
              >
                {isSubmittingPo ? 'Staging PO...' : 'Create & Stage Purchase Order'}
              </button>
            </div>
          </form>
        </GlassModal>
      )}
    </section>
  );
}
