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
    showToast(`+1 ${material.item}`, 'success');

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
      refreshData().catch(() => {});
      fetchAuditLogs().catch(() => {});
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
      refreshData().catch(() => {});
      fetchAuditLogs().catch(() => {});
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
      showToast('Enter a valid threshold', 'error');
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
      showToast(`Threshold set to ${newVal}`, 'success');
      await refreshData();
      await fetchAuditLogs();
    } catch (err) {
      console.error(err);
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
        ? `Cost set to ₱${parsed.toFixed(2)}`
        : 'Cost cleared',
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
      showToast('Failed to update cost', 'error');
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

  // Materials at or below threshold
  const lowStockItems = inventory.filter((i) => i.count <= (i.minThreshold || 10));

  // Wholesale Restock Calculation: brings stock up to 2x threshold rounded up to clean commercial pack size
  const calculateSuggestedRestockQty = (item: any): number => {
    if (!item) return 20;
    const minVal = item.minThreshold || 10;
    const target = minVal * 2;
    const rawDeficit = Math.max(1, target - (item.count || 0));
    const step = minVal >= 20 ? 10 : (minVal >= 10 ? 5 : 1);
    return Math.ceil(rawDeficit / step) * step;
  };

  const openDraftPoModal = (materialId?: string) => {
    const targetId =
      materialId ||
      (lowStockItems.length > 0
        ? lowStockItems[0].id || lowStockItems[0]._id
        : inventory[0]?.id || inventory[0]?._id || '');

    setDraftPoMaterialId(targetId);

    const targetItem = inventory.find((i) => (i.id || i._id) === targetId);
    if (targetItem) {
      const suggested = calculateSuggestedRestockQty(targetItem);
      setDraftPoQuantity(suggested.toString());
      const est = targetItem.supplierUnitCost
        ? targetItem.supplierUnitCost * suggested
        : suggested * 5;
      setDraftPoEstCost(est.toString());
    } else {
      setDraftPoQuantity('20');
      setDraftPoEstCost('100');
    }
    setIsDraftPoOpen(true);
  };

  const handleCopyLowStockRequisition = () => {
    if (lowStockItems.length === 0) {
      showToast('All items are in stock.', 'info');
      return;
    }
    const phone = businessPhone || '0928 810 3928';
    let text = `SUPPLIER RESTOCK ORDER — EDS TOWELS & CAPS\nDelivery Hub: Ground Floor, Pacific Mall Lucena City\nContact: ${phone}\n\nGood day! We would like to order the following raw materials:\n`;
    lowStockItems.forEach((item) => {
      const suggested = calculateSuggestedRestockQty(item);
      text += `• ${suggested} ${item.unit || 'units'} — ${item.item}\n`;
    });
    text += `\nPlease confirm availability, current invoice pricing, and estimated delivery date. Thank you!`;

    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied ${lowStockItems.length} items to clipboard`, 'success');
    }).catch(() => {
      showToast('Failed to copy to clipboard', 'error');
    });
  };

  const handleBatchStageLowStockPos = async () => {
    if (lowStockItems.length === 0) {
      showToast('No low stock items to order.', 'info');
      return;
    }
    setIsSubmittingPo(true);
    try {
      let stagedCount = 0;
      for (const item of lowStockItems) {
        const suggested = calculateSuggestedRestockQty(item);
        const estCost = item.supplierUnitCost ? item.supplierUnitCost * suggested : suggested * 5;
        await api.post('/api/admin/purchase-orders', {
          inventoryId: item.id || item._id,
          quantity: suggested,
          estimatedCost: estCost,
          status: 'Approved'
        });
        stagedCount++;
      }
      showToast(`Created ${stagedCount} orders`, 'success');
      setIsDraftPoOpen(false);
      await fetchPurchaseOrders();
    } catch (err: any) {
      console.error(err);
      showToast('Failed to create orders', 'error');
    } finally {
      setIsSubmittingPo(false);
    }
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

  const generateShoppingListImage = (): Promise<{ blob: Blob; dataUrl: string } | null> => {
    return new Promise((resolve) => {
      const items = lowStockItems.length > 0 ? lowStockItems : inventory;
      if (!items || items.length === 0) {
        showToast('No materials to generate list for', 'error');
        resolve(null);
        return;
      }

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

        const suggestedQty = calculateSuggestedRestockQty(item);
        const unit = item.unit || 'units';

        // Material name
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0F172A';
        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        const truncatedName = item.item.length > 42 ? `${item.item.slice(0, 40)}...` : item.item;
        ctx.fillText(truncatedName, 38, currentY + 5);

        // Order quantity (clean number + unit, no plus sign)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${suggestedQty} ${unit}`, width - 38, currentY + 5);

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
      const result = await generateShoppingListImage();
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

  const handlePreviewPoPdf = async (poId: string) => {
    setIsLoadingPdf(true);
    try {
      showToast('Loading order PDF...', 'info');
      const blob = await api.getBlob(`/api/admin/purchase-orders/${poId}/pdf`);
      const url = URL.createObjectURL(blob);
      const targetPo = purchaseOrders.find((p) => (p.id || p._id) === poId);
      const dateStr = targetPo?.createdAt ? new Date(targetPo.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      setPdfPreviewUrl(url);
      setPdfPreviewTitle(`Purchase Order #PO-${dateStr} (PDF)`);
      setIsPdfModalOpen(true);
    } catch (err: any) {
      console.error('PO PDF Preview failed:', err);
      showToast('Failed to load order PDF', 'error');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleCopyPoForMessenger = (po: any) => {
    const dateStr = po.createdAt ? new Date(po.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const poNum = `PO-${dateStr}`;
    const phone = businessPhone || '0928 810 3928';
    const text = `PURCHASE ORDER — EDS TOWELS & CAPS\nPO Number: #${poNum}\nDelivery Hub: Ground Floor, Pacific Mall Lucena City\nContact: ${phone}\n\nGood day! We would like to order the following embroidery materials:\n• ${po.quantity} ${po.inventory?.unit || 'Cones'} — ${po.inventory?.item || 'Embroidery Material'}\n${po.estimatedCost ? `Estimated Total: ₱${po.estimatedCost.toFixed(2)}\n` : ''}\nPlease confirm price invoice and expected delivery date. Thank you!`;
    
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied order #${poNum} to clipboard`, 'success');
    }).catch(() => {
      showToast('Failed to copy to clipboard', 'error');
    });
  };

  const handleEmailPo = async (poId: string) => {
    try {
      const res = await api.post<{ success: boolean; message: string }>(`/api/admin/purchase-orders/${poId}/email`, {});
      showToast(res.message || 'Order sent to email', 'success');
      await fetchPurchaseOrders();
    } catch (err: any) {
      showToast('Failed to send email', 'error');
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
      showToast(`Received ${po.quantity} ${po.inventory?.unit || 'units'} of ${po.inventory?.item}.`, 'success');
      await fetchPurchaseOrders();
      await refreshData();
      await fetchAuditLogs();
    } catch (err: any) {
      showToast('Failed to update order', 'error');
    }
  };

  const handleCreateDraftPo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPoMaterialId) {
      showToast('Select a material', 'error');
      return;
    }
    const qty = parseInt(draftPoQuantity);
    if (isNaN(qty) || qty <= 0) {
      showToast('Enter a valid quantity', 'error');
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
      showToast('Order created', 'success');
      setIsDraftPoOpen(false);
      await fetchPurchaseOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to create order', 'error');
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
      showToast('Select a material', 'error');
      return;
    }
    const qty = parseInt(restockAmount);
    if (isNaN(qty) || qty <= 0) {
      showToast('Enter a valid quantity', 'error');
      return;
    }

    const targetMaterial = inventory.find((i) => (i.id || i._id) === selectedRestockMaterialId);
    if (!targetMaterial) {
      showToast('Item not found', 'error');
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

    showToast(`Received ${qty} ${targetMaterial.unit || 'units'} of ${targetMaterial.item}`, 'success');

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
      showToast('Failed to update stock', 'error');
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
    if (!resolvedName) return showToast('Item name is required', 'error');

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
      showToast('Failed to add material', 'error');
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
      refreshData().catch(() => {});
      fetchAuditLogs().catch(() => {});
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
      <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search materials..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[220px]"
        />
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="bg-bg-surface border border-border-glass w-10 h-10 rounded-xl flex items-center justify-center text-text-dim hover:text-text-main hover:bg-white/5 cursor-pointer transition"
              title="Inventory Threshold Settings"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white font-bold px-4 py-2.5 rounded-xl text-[0.85rem] cursor-pointer border-none shadow-sm transition flex items-center gap-1.5"
            >
              <span>+ Add Material</span>
            </button>
          </div>
        )}
      </div>

      {/* Main materials dashboard panel */}
      <div className="w-full glass-card">
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
                    onClick={() => openDraftPoModal()}
                    className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                    title="Open acquisition form to order supplies, check low stocks, or stage purchase orders"
                  >
                    <span>+</span> Create Acquisition Form
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
                    Create an acquisition form to check low stocks, copy orders to Messenger, or stage purchase orders for your supplier.
                  </span>
                  <button
                    type="button"
                    onClick={() => openDraftPoModal()}
                    className="mt-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer"
                  >
                    + Create Acquisition Form
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {purchaseOrders.map((po) => {
                    const dateStr = po.createdAt ? new Date(po.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                    const poNum = `PO-${dateStr}`;
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

          {/* Restock Alert Banner */}
          {lowStockItems.length > 0 ? (
            <div className="bg-danger/10 border border-danger/20 p-3.5 rounded-xl flex justify-between items-center flex-wrap gap-3 mb-4 text-left animate-fade">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-danger/15 flex items-center justify-center text-danger shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-danger">
                    {lowStockItems.length} {lowStockItems.length === 1 ? 'item' : 'items'} running low on stock
                  </span>
                  <span className="text-xs text-text-dim mt-0.5">
                    {lowStockItems.map((i) => i.item).slice(0, 3).join(', ')}
                    {lowStockItems.length > 3 ? '...' : ''}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => openRestockModal(lowStockItems[0])}
                  className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Directly intake arriving boxes for critical stock"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>+ Restock Now</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenShoppingListImage}
                  disabled={isGeneratingImage}
                  className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-emerald-500/25 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Generate restock slip image to copy directly to Messenger or Viber"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>{isGeneratingImage ? 'Creating Image...' : 'Copy Order Image'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-center gap-2 mb-4 text-left animate-fade">
              <span className="text-xs font-semibold text-emerald-400">All shop materials are well stocked</span>
            </div>
          )}

          {/* Simple 2-pill Stock Filter */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
            {[
              { id: 'all', label: 'All Items', count: inventory.length },
              { id: 'low', label: 'Needs Restock', count: lowStockItems.length },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStockTierFilter(pill.id as StockLevelTier)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border transition-all flex items-center gap-2 ${
                  stockTierFilter === pill.id
                    ? 'bg-primary text-white border-primary/40 shadow-sm'
                    : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                }`}
              >
                <span>{pill.label}</span>
                <span className="text-[0.68rem] px-2 py-0.5 rounded-full bg-white/10 font-bold font-mono">
                  {pill.count}
                </span>
              </button>
            ))}
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
                    <th className="glass-th text-left">Material Name</th>
                    <th className="glass-th text-left">Current Stock</th>
                    <th className="glass-th text-left">Supplier Cost / Unit</th>
                    <th className="glass-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.length === 0 ? (
                    <tr className="glass-tr">
                      <td colSpan={4} className="glass-td text-center text-text-dim">
                        No materials match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedInventory.map((i) => {
                    const id = i.id || i._id;
                    const isLow = i.count <= (i.minThreshold || 10);
                    return (
                      <tr key={id} className="glass-tr hover:bg-white/5 transition-all">
                        <td className="glass-td font-bold text-sm text-text-main text-left">
                          {i.item}
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
                          <InlineSupplierCostAdjuster
                            material={i}
                            refreshData={refreshData}
                            isAdmin={isAdmin}
                            setInventory={setInventory}
                          />
                        </td>
                        <td className="glass-td text-right">
                          <div className="flex gap-2 justify-end items-center">
                            <button
                              type="button"
                              onClick={() => openRestockModal(i)}
                              className="bg-success/10 border border-success/20 text-success hover:bg-success/20 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                              title={`Receive supplier delivery for ${i.item}`}
                            >
                              + Add Stock
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setDeletingMaterial(i)}
                                className="bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 hover:border-danger/50 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                                title={`Delete ${i.item}`}
                              >
                                Delete
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

      {/* Modal: Add Material */}
      <GlassModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add Material">
        <form onSubmit={handleCreateSubmit} className="modal-stack text-left">
          {/* Material Category Selector */}
          <div className="modal-section">
            <label className="modal-label">Product / Material Category</label>
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
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
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
              <label className="modal-label">Custom Product / Material Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Sports Cap, Canvas Tote Bag, Face Towel"
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
                <option value="Cones">Cones</option>
                <option value="Rolls">Rolls</option>
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

          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between mt-2">
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Audit Trail Registry (Mandatory)</span>
              </span>
              <span className="text-[0.68rem] text-text-dim mt-0.5">
                Physical adjustments and arrivals are permanently recorded in DB logs for accounting and fraud prevention.
              </span>
            </div>
            <span className="text-emerald-400 text-[0.65rem] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 shrink-0 ml-2">
              ALWAYS ON
            </span>
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
                    Current: <b className="text-white font-mono">{current}</b> {unit} &nbsp;→&nbsp; After Intake: <b className="text-emerald-400 font-mono text-sm">+{added} = {finalCount}</b> {unit}
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
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
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
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Copy Text</span>
                </button>
              </div>
            </div>

            <div className="bg-black/30 border border-white/10 rounded-2xl p-3 flex justify-center items-center max-h-[60vh] overflow-y-auto">
              <img
                src={shoppingListImageUrl}
                alt="Supplier Restock Slip"
                className="w-full max-w-md rounded-xl shadow-md border border-white/10 object-contain cursor-pointer"
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

      {/* --- Supply Acquisition Form Modal --- */}
      {isDraftPoOpen && (
        <GlassModal
          isOpen={isDraftPoOpen}
          onClose={() => setIsDraftPoOpen(false)}
          title={`Supply Acquisition Form — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
        >
          <div className="flex flex-col gap-4 text-left max-w-3xl w-full">
            {/* Header info & quick action bar */}
            <div className="flex justify-between items-center flex-wrap gap-2 pb-2 border-b border-white/10">
              <div>
                <p className="text-xs text-text-dim m-0">
                  Supply acquisition form for restock orders, low-stock reference, and Messenger inquiries.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleOpenShoppingListImage}
                  disabled={isGeneratingImage || lowStockItems.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Generate restock slip image to copy directly to Messenger or Viber"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Copy Order Image</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLowStockRequisition}
                  disabled={lowStockItems.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold hover:bg-blue-500/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Copy full requisition list formatted for Messenger / Viber"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Copy for Messenger</span>
                </button>
              </div>
            </div>

            {/* Low Stock Reference Panel */}
            {lowStockItems.length > 0 ? (
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5 flex flex-col gap-2.5">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-xs font-bold text-amber-300">
                      Low stock ({lowStockItems.length} items below threshold):
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleBatchStageLowStockPos}
                    disabled={isSubmittingPo}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-bold border border-amber-500/30 transition cursor-pointer flex items-center gap-1"
                    title="Stage purchase orders for all low stock items automatically"
                  >
                    <span>Batch Stage All ({lowStockItems.length})</span>
                  </button>
                </div>

                <div className="max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-bg-surface/60 divide-y divide-white/5">
                  {lowStockItems.map((item) => {
                    const minVal = item.minThreshold || 10;
                    const suggested = calculateSuggestedRestockQty(item);
                    const isSelected = (item.id || item._id) === draftPoMaterialId;

                    return (
                      <div
                        key={item.id || item._id}
                        className={`p-2.5 flex items-center justify-between gap-3 text-xs transition ${
                          isSelected ? 'bg-primary/15 border-l-2 border-primary' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-text-main">{item.item}</span>
                          <span className="text-[11px] text-text-dim">
                            Current Stock: <b className="text-danger font-mono">{item.count}</b> / {minVal} {item.unit || 'units'} &nbsp;|&nbsp; Suggested Order: <span className="text-amber-400 font-mono">{suggested}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-bold text-[11px]">
                            {suggested} {item.unit || 'units'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setDraftPoMaterialId(item.id || item._id);
                              setDraftPoQuantity(suggested.toString());
                              const est = item.supplierUnitCost ? item.supplierUnitCost * suggested : suggested * 5;
                              setDraftPoEstCost(est.toString());
                              showToast(`Loaded ${item.item} into form`, 'info');
                            }}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer transition ${
                              isSelected
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-white/10 hover:bg-white/20 text-text-main'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Use in Form'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>All items in stock</span>
              </div>
            )}

            {/* The PO Form */}
            <form onSubmit={handleCreateDraftPo} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1">
                  Material Item to Order <span className="text-red-400">*</span>
                </label>
                <select
                  value={draftPoMaterialId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setDraftPoMaterialId(newId);
                    const found = inventory.find(i => (i.id || i._id) === newId);
                    if (found) {
                      const suggested = calculateSuggestedRestockQty(found);
                      setDraftPoQuantity(suggested.toString());
                      const est = found.supplierUnitCost ? found.supplierUnitCost * suggested : suggested * 5;
                      setDraftPoEstCost(est.toString());
                    }
                  }}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none cursor-pointer"
                >
                  {inventory.map((inv) => {
                    const isLow = inv.count <= (inv.minThreshold || 10);
                    return (
                      <option key={inv.id || inv._id} value={inv.id || inv._id} className="bg-bg-surface text-text-main">
                        {inv.item} — Stock: {inv.count} {inv.unit} {isLow ? '[LOW STOCK]' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-text-dim">
                      Quantity to Order ({inventory.find(i => (i.id || i._id) === draftPoMaterialId)?.unit || 'Units'}) <span className="text-red-400">*</span>
                    </label>
                    {(() => {
                      const cur = inventory.find(i => (i.id || i._id) === draftPoMaterialId);
                      if (cur) {
                        const suggested = calculateSuggestedRestockQty(cur);
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setDraftPoQuantity(suggested.toString());
                              const est = cur.supplierUnitCost ? cur.supplierUnitCost * suggested : suggested * 5;
                              setDraftPoEstCost(est.toString());
                            }}
                            className="text-[10px] text-primary hover:underline cursor-pointer bg-transparent border-none"
                          >
                            Reset to Suggested ({suggested})
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="number"
                      min="1"
                      value={draftPoQuantity}
                      onChange={(e) => setDraftPoQuantity(e.target.value)}
                      className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none font-bold font-mono"
                    />
                    <div className="flex gap-1 shrink-0">
                      {['+10', '+25', '+50'].map((pill) => (
                        <button
                          key={pill}
                          type="button"
                          onClick={() => {
                            const currentVal = parseInt(draftPoQuantity) || 0;
                            const added = parseInt(pill.replace('+', ''));
                            setDraftPoQuantity((currentVal + added).toString());
                          }}
                          className="bg-white/5 border border-border-glass hover:bg-white/10 text-text-main text-[11px] px-2 py-2 rounded-lg font-mono cursor-pointer"
                        >
                          {pill}
                        </button>
                      ))}
                    </div>
                  </div>
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
                    placeholder="e.g. 250"
                    className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none font-bold font-mono"
                  />
                </div>
              </div>

              {/* Stock Projection Card */}
              {(() => {
                const target = inventory.find(i => (i.id || i._id) === draftPoMaterialId);
                const current = target ? target.count : 0;
                const added = parseInt(draftPoQuantity) || 0;
                const finalCount = current + added;
                const unit = target?.unit || 'units';

                return (
                  <div className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between text-xs text-text-dim">
                    <span>
                      Stockpile Projection: Current <b className="text-white font-mono">{current}</b> {unit} &nbsp;→&nbsp; After Delivery: <b className="text-emerald-400 font-mono">+{added} = {finalCount}</b> {unit}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const targetItem = inventory.find(i => (i.id || i._id) === draftPoMaterialId);
                        const qty = parseInt(draftPoQuantity) || 0;
                        const cost = parseFloat(draftPoEstCost);
                        const phone = businessPhone || '0928 810 3928';
                        const msg = `PURCHASE INQUIRY — EDS TOWELS & CAPS\nDelivery Hub: Ground Floor, Pacific Mall Lucena City\nContact: ${phone}\n\nGood day! We would like to order:\n• ${qty} ${targetItem?.unit || 'Cones'} — ${targetItem?.item || 'Embroidery Material'}\n${cost ? `Estimated Cost: ₱${cost.toFixed(2)}\n` : ''}\nPlease confirm invoice pricing and delivery time. Thank you!`;
                        navigator.clipboard.writeText(msg).then(() => {
                          showToast('Copied to clipboard', 'success');
                        });
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer bg-transparent border-none"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Copy Inquiry</span>
                    </button>
                  </div>
                );
              })()}

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsDraftPoOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold hover:bg-white/10 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPo}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold cursor-pointer transition shadow-sm"
                >
                  {isSubmittingPo ? 'Saving...' : 'Save Acquisition Order'}
                </button>
              </div>
            </form>
          </div>
        </GlassModal>
      )}
    </section>
  );
}
