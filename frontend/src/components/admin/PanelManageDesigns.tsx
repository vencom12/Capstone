'use client';

import React, { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api, API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { ProductCardSkeleton } from '@/components/ui/Skeletons';
import { detectColorFromName } from '@/lib/colorUtils';
import { computeStockLevel, StockLevelTier } from '@/lib/inventoryUtils';
import Pagination from '@/components/ui/Pagination';
import { useAuthStore } from '@/stores/useAuthStore';

interface PanelManageDesignsProps {
  products: any[];
  inventory: any[];
  isSyncing: boolean;
  refreshData: () => Promise<void>;
  setProducts?: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function PanelManageDesigns({
  products,
  inventory,
  isSyncing,
  refreshData,
  setProducts
}: PanelManageDesignsProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [searchQuery, setSearchQuery] = useState('');

  // Design modal state
  const [isOpen, setIsOpen] = useState(false);
  const [editingDesign, setEditingDesign] = useState<any>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [tag, setTag] = useState('towel');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [count, setCount] = useState('');
  const [minThreshold, setMinThreshold] = useState('');

  // Recipe Builder Fields
  const [recipe, setRecipe] = useState<{ inventoryId: string; name: string; quantity: number }[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [materialQty, setMaterialQty] = useState('');

  // Variant Builder Fields
  interface AdminVariantItem {
    name: string;
    color: string;
    priceOverride?: string;
    stock?: string | number;
    materialId?: string;
    materialName?: string;
  }

  const [variants, setVariants] = useState<AdminVariantItem[]>([]);
  const [variantName, setVariantName] = useState('');
  const [variantColor, setVariantColor] = useState('#6366f1');
  const [variantPrice, setVariantPrice] = useState('');
  const [variantMaterialId, setVariantMaterialId] = useState('');
  const [editingVariantIndex, setEditingVariantIndex] = useState<number | null>(null);
  const [colorNotice, setColorNotice] = useState<string | null>(null);
  const [variantToDeleteIndex, setVariantToDeleteIndex] = useState<number | null>(null);
  const [lastDeletedVariant, setLastDeletedVariant] = useState<{
    variant: AdminVariantItem;
    index: number;
  } | null>(null);

  // Stock Filter State
  const [stockFilter, setStockFilter] = useState<StockLevelTier>('all');

  // 1. Filtering Designs
  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase();
    const matchesQuery = (
      !searchQuery ||
      p.name?.toLowerCase().includes(query) ||
      p.tag?.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
    );
    if (!matchesQuery) return false;
    if (stockFilter === 'all') return true;

    const availableStock = p.availableStock !== undefined ? p.availableStock : Math.max(0, (p.count || 0) - (p.reservedCount || 0));
    const levelInfo = computeStockLevel(availableStock, p.minThreshold || 5);
    return levelInfo.tier === stockFilter;
  });

  // Pagination for Products Grid
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, stockFilter]);

  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Calculate stock metrics for all products
  const productStockMetrics = products.reduce(
    (acc, p) => {
      const available = p.availableStock !== undefined ? p.availableStock : Math.max(0, (p.count || 0) - (p.reservedCount || 0));
      const info = computeStockLevel(available, p.minThreshold || 5);
      acc[info.tier] = (acc[info.tier] || 0) + 1;
      return acc;
    },
    { critical: 0, low: 0, moderate: 0, high: 0 } as Record<string, number>
  );

  // 2. Open Modal
  const openModal = (design?: any) => {
    if (design) {
      setEditingDesign(design);
      setName(design.name || '');
      setPrice(design.price?.toString() || '');
      setTag(design.tag || 'towel');
      setDescription(design.description || '');
      setRecipe(design.recipe || []);
      setVariants(design.variants || []);
      setCount(design.count?.toString() || '0');
      setMinThreshold(design.minThreshold?.toString() || '5');
    } else {
      setEditingDesign(null);
      setName('');
      setPrice('');
      setTag('towel');
      setDescription('');
      setRecipe([]);
      setVariants([]);
      setCount('0');
      setMinThreshold('5');
    }
    setImageFile(null);
    setSelectedMaterialId('');
    setMaterialQty('');
    handleCancelVariantEdit();
    setVariantToDeleteIndex(null);
    setLastDeletedVariant(null);
    setIsOpen(true);
  };

  // Real-time automatic color detection when typing variant name
  const handleVariantNameInput = (val: string) => {
    setVariantName(val);
    const detected = detectColorFromName(val);
    if (detected) {
      setVariantColor(detected.hex);
      setColorNotice(`Switched color to ${detected.colorName} (${detected.hex})`);
    } else {
      setColorNotice(null);
    }
  };

  // Add or Update Variant Option
  const handleSaveVariant = () => {
    if (!variantName.trim()) {
      showToast('Variant name is required', 'error');
      return;
    }

    // Check duplicate variant names
    const isDuplicate = variants.some((v, idx) => 
      idx !== editingVariantIndex && v.name.toLowerCase() === variantName.trim().toLowerCase()
    );
    if (isDuplicate) {
      showToast('Another variant already has this name', 'error');
      return;
    }

    const selectedMat = inventory.find((i) => (i.id || i._id) === variantMaterialId);
    const updatedVariant: AdminVariantItem = {
      name: variantName.trim(),
      color: variantColor,
      priceOverride: variantPrice.trim() ? variantPrice.trim() : undefined,
      materialId: variantMaterialId || undefined,
      materialName: selectedMat ? selectedMat.item : undefined
    };

    if (editingVariantIndex !== null) {
      setVariants((prev) => prev.map((v, idx) => (idx === editingVariantIndex ? updatedVariant : v)));
      showToast(`Updated variant "${updatedVariant.name}"`, 'success');
    } else {
      setVariants((prev) => [...prev, updatedVariant]);
      showToast(`Added variant "${updatedVariant.name}"`, 'success');
    }

    handleCancelVariantEdit();
  };

  const handleStartEditVariant = (index: number) => {
    const v = variants[index];
    if (!v) return;
    setVariantToDeleteIndex(null);
    setEditingVariantIndex(index);
    setVariantName(v.name);
    setVariantColor(v.color || '#6366f1');
    setVariantPrice(v.priceOverride ? v.priceOverride.toString() : '');
    setVariantMaterialId(v.materialId || '');
    setColorNotice(null);
  };

  const handleCancelVariantEdit = () => {
    setEditingVariantIndex(null);
    setVariantName('');
    setVariantColor('#6366f1');
    setVariantPrice('');
    setVariantMaterialId('');
    setColorNotice(null);
  };

  // Safe variant removal flow with confirmation, toast notification, and undo option
  const handleInitiateDeleteVariant = (index: number) => {
    setVariantToDeleteIndex(index);
  };

  const handleCancelDeleteVariant = () => {
    setVariantToDeleteIndex(null);
  };

  const handleConfirmRemoveVariant = (index: number) => {
    const targetVariant = variants[index];
    if (!targetVariant) return;

    if (editingVariantIndex === index) {
      handleCancelVariantEdit();
    } else if (editingVariantIndex !== null && editingVariantIndex > index) {
      setEditingVariantIndex(editingVariantIndex - 1);
    }

    setLastDeletedVariant({ variant: targetVariant, index });
    setVariants((prev) => prev.filter((_, idx) => idx !== index));
    setVariantToDeleteIndex(null);

    showToast(`Variant "${targetVariant.name}" removed`, 'info');
  };

  const handleUndoDeleteVariant = () => {
    if (!lastDeletedVariant) return;
    const { variant, index } = lastDeletedVariant;
    setVariants((prev) => {
      const copy = [...prev];
      const insertIdx = Math.min(index, copy.length);
      copy.splice(insertIdx, 0, variant);
      return copy;
    });
    const restoredName = lastDeletedVariant.variant.name;
    setLastDeletedVariant(null);
    showToast(`Restored variant "${restoredName}"`, 'success');
  };

  // 3. Add Material to Recipe
  const addRecipeItem = () => {
    if (!selectedMaterialId) {
      showToast('Please select a material first', 'error');
      return;
    }
    const qty = parseFloat(materialQty);
    if (isNaN(qty) || qty <= 0) {
      showToast('Please enter a valid material quantity', 'error');
      return;
    }

    const materialItem = inventory.find((i) => (i.id || i._id) === selectedMaterialId);
    if (!materialItem) return;

    // Check duplication
    if (recipe.some((r) => r.inventoryId === selectedMaterialId)) {
      showToast('Material already added to recipe list', 'error');
      return;
    }

    setRecipe((prev) => [
      ...prev,
      {
        inventoryId: selectedMaterialId,
        name: materialItem.item,
        quantity: qty
      }
    ]);
    setSelectedMaterialId('');
    setMaterialQty('');
  };

  const removeRecipeItem = (index: number) => {
    setRecipe((prev) => prev.filter((_, idx) => idx !== index));
  };

  // 4. Submit Design Forms
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setIsOpen(false);
      return;
    }

    if (!name.trim()) return showToast('Design name is required', 'error');
    if (!price.trim() || isNaN(parseFloat(price))) return showToast('Valid price is required', 'error');

    const formattedVariants = variants.map((v) => ({
      name: v.name,
      color: v.color,
      priceOverride: v.priceOverride ? parseFloat(v.priceOverride as any) : undefined,
      materialId: v.materialId || undefined,
      materialName: v.materialName || undefined
    }));

    // Auto-capitalize first letter of name and tag
    const capitalizedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
    const capitalizedTag = tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1);

    const formData = new FormData();
    formData.append('name', capitalizedName);
    formData.append('price', price.trim());
    formData.append('tag', capitalizedTag);
    formData.append('description', description.trim());
    formData.append('recipe', JSON.stringify(recipe));
    formData.append('variants', JSON.stringify(formattedVariants));
    formData.append('count', count.trim());
    formData.append('minThreshold', minThreshold.trim());

    if (imageFile) {
      formData.append('image', imageFile);
    }

    const numericPrice = parseFloat(price.trim());
    const numericCount = count ? parseInt(count.trim(), 10) : (editingDesign?.count ?? 0);
    const numericMin = minThreshold ? parseInt(minThreshold.trim(), 10) : (editingDesign?.minThreshold ?? 5);

    const optimisticProduct = {
      ...(editingDesign || {}),
      name: capitalizedName,
      price: numericPrice,
      tag: capitalizedTag,
      description: description.trim(),
      recipe,
      variants: formattedVariants,
      count: numericCount,
      minThreshold: numericMin,
      ...(imageFile ? { imageUrl: URL.createObjectURL(imageFile) } : {})
    };

    const prevProducts = [...products];
    const isEdit = !!editingDesign;
    const tempId = `temp_${Date.now()}`;

    // Optimistically update products immediately (0ms UI latency)
    if (setProducts) {
      if (isEdit) {
        const targetId = editingDesign.id || editingDesign._id;
        setProducts((prev) =>
          prev.map((p) => ((p.id || p._id) === targetId ? { ...p, ...optimisticProduct } : p))
        );
      } else {
        setProducts((prev) => [{ ...optimisticProduct, id: tempId, _id: tempId }, ...prev]);
      }
    }

    setIsOpen(false);
    showToast(
      isEdit ? 'Catalog design details updated' : 'New storefront design published successfully',
      'success'
    );

    try {
      const method = isEdit ? 'PATCH' : 'POST';
      const path = isEdit ? `/api/admin/products/${editingDesign.id || editingDesign._id}` : '/api/admin/products';

      const response = await fetch(`${API_BASE}${path}`, {
        method,
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Server returned an error');
      }

      const resData = await response.json().catch(() => null);
      if (!isEdit && resData?.product && setProducts) {
        setProducts((prev) =>
          prev.map((p) => (p.id === tempId || p._id === tempId ? { ...p, ...resData.product } : p))
        );
      }

      // Quiet background synchronization
      refreshData().catch(() => {});
    } catch (err) {
      console.error(err);
      if (setProducts) {
        setProducts(prevProducts);
      }
      showToast('Failed to save storefront design — reverted', 'error');
    }
  };

  // Delete confirmation modal state
  const [deletingProduct, setDeletingProduct] = useState<any>(null);

  const confirmDelete = async () => {
    if (!isAdmin || !deletingProduct) return;
    const id = deletingProduct.id || deletingProduct._id;
    const prevProducts = [...products];

    // Optimistically remove product immediately
    if (setProducts) {
      setProducts((prev) => prev.filter((p) => (p.id || p._id) !== id));
    }
    setDeletingProduct(null);
    showToast('Product deleted successfully', 'success');

    try {
      await api.delete(`/api/admin/products/${id}`);
      refreshData().catch(() => {});
    } catch (err) {
      console.error(err);
      if (setProducts) {
        setProducts(prevProducts);
      }
      showToast('Failed to delete product — restored', 'error');
    }
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left">
      {/* Compact Top Filter & Action Toolbar */}
      <div className="flex justify-start items-center flex-wrap gap-3 mb-4">
        {isAdmin && (
          <button
            onClick={() => openModal()}
            className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl text-[0.85rem] hover:shadow-md transition-all cursor-pointer whitespace-nowrap border-none"
          >
            + New Product
          </button>
        )}
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
        />

        {/* Stock Level Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-wrap">
          <span className="text-xs text-text-dim font-medium whitespace-nowrap mr-1">Stock:</span>
          {[
            { id: 'all', label: 'All Products', count: products.length },
            { id: 'critical', label: 'Critical', count: productStockMetrics.critical },
            { id: 'low', label: 'Low Stock', count: productStockMetrics.low },
            { id: 'moderate', label: 'Moderate', count: productStockMetrics.moderate },
            { id: 'high', label: 'High Stock', count: productStockMetrics.high },
          ].map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => setStockFilter(tier.id as StockLevelTier)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
                stockFilter === tier.id
                  ? 'bg-primary text-white border-primary/40 shadow-sm'
                  : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              <span>{tier.label}</span>
              <span className="text-[0.68rem] px-1.5 py-0.2 rounded-full bg-white/10 font-bold font-mono">
                {tier.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Product card grid layout */}
      <div className="w-full pr-2 flex-1">
        {isSyncing && products.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="glass-card text-center text-text-dim py-12">
            No products match the selected filters.{isAdmin ? ' Click "+ New Product" to create one.' : ''}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {paginatedProducts.map((p) => {
              const id = p.id || p._id;
              const availableStock = p.availableStock !== undefined ? p.availableStock : Math.max(0, (p.count || 0) - (p.reservedCount || 0));
              const dynamicReserved = p.dynamicReserved !== undefined ? p.dynamicReserved : (p.reservedCount || 0);
              const stockInfo = computeStockLevel(availableStock, p.minThreshold || 5);
              return (
                <div
                  key={id}
                  className="glass-card overflow-hidden flex flex-col gap-3 p-4 relative group text-left"
                >
                  <div
                    className="w-full h-[160px] rounded-xl bg-cover bg-center border border-border-glass"
                    style={{ backgroundImage: `url(${p.imageUrl || '/icons/icon.ico'})` }}
                  />
                  <div className="flex flex-col gap-1 text-left flex-1">
                    <span className="text-[0.7rem] uppercase tracking-wider text-primary font-extrabold">
                      {p.tag}
                    </span>
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-bold text-[1rem] m-0 text-text-main line-clamp-1">{p.name}</h4>
                      <span className="font-mono text-primary font-bold text-[0.95rem]">
                        ₱{parseFloat(p.price || 0).toFixed(2)}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-[0.8rem] text-text-dim m-0 line-clamp-2 leading-relaxed mt-1">
                        {p.description}
                      </p>
                    )}

                    {/* Variants / Color Swatches */}
                    {p.variants && p.variants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.variants.map((v: any, vi: number) => (
                          <div
                            key={vi}
                            title={`${v.name}${v.stock !== undefined ? ` (Stock: ${v.stock} pcs)` : ''}${v.materialName ? ` • Mat: ${v.materialName}` : ''}${v.priceOverride ? ` — ₱${parseFloat(v.priceOverride).toFixed(2)}` : ''}`}
                            className="flex items-center gap-1 bg-white/5 border border-border-glass/50 px-2 py-0.5 rounded-full text-[0.68rem] font-semibold text-text-dim"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0 inline-block"
                              style={{ backgroundColor: v.color || '#6366f1' }}
                            />
                            <span>{v.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Visual Stock Indicators */}
                    <div className="flex justify-between items-center text-[0.75rem] border-t border-white/5 pt-2 mt-2">
                      <span className="text-text-dim">
                        Stock: <b className="text-text-main">{p.count || 0}</b>
                        {dynamicReserved > 0 && (
                          <span className="text-amber-500 font-bold ml-1" title="Reserved count locked for queue orders">
                            ({dynamicReserved} locked)
                          </span>
                        )}
                      </span>
                      <span className="text-text-dim flex items-center gap-1">
                        Available: <b style={{ color: stockInfo.dotColor }} className="font-mono font-bold">
                          {availableStock}
                        </b>
                      </span>
                    </div>
                  </div>
                  
                  {/* Stock Level Tier Pill Badge */}
                  <span
                    className={`absolute top-2 right-2 text-[0.65rem] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-lg flex items-center gap-1.5 backdrop-blur-md ${stockInfo.badgeClass}`}
                    title={stockInfo.description}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stockInfo.dotColor }} />
                    {stockInfo.label}
                  </span>
                  
                  <div className="flex gap-2 w-full mt-auto pt-2">
                    {isAdmin ? (
                      <>
                        <button
                          onClick={() => openModal(p)}
                          className="flex-1 bg-primary/10 border border-primary/20 text-primary py-2 rounded-lg text-[0.8rem] font-bold hover:bg-primary/20 transition-all cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingProduct(p)}
                          className="flex-1 bg-danger/10 border border-danger/20 text-danger py-2 rounded-lg text-[0.8rem] font-bold hover:bg-danger/20 transition-all cursor-pointer"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => openModal(p)}
                        className="w-full bg-white/5 border border-border-glass text-text-main py-2 rounded-lg text-[0.8rem] font-semibold hover:bg-white/10 hover:border-primary/40 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <span>View Specs</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalItems={filteredProducts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          itemLabel="products"
        />
      </div>

      {/* Modal: Create / Edit / Inspect Product Form */}
      <GlassModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          setVariantToDeleteIndex(null);
          setLastDeletedVariant(null);
        }}
        title={!isAdmin ? 'Product Specifications' : (editingDesign ? 'Edit Product Details' : 'Create New Product')}
      >
        <form onSubmit={handleSubmit} className="modal-stack text-left max-h-[80vh] overflow-y-auto pr-1">
          <div className="modal-section">
            <label className="modal-label">Product Name</label>
            <input
              type="text"
              required
              disabled={!isAdmin}
              placeholder="e.g. Premium Embroidered Towel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="modal-section">
              <label className="modal-label">Price (₱)</label>
              <input
                type="number"
                step="0.01"
                required
                disabled={!isAdmin}
                placeholder="e.g. 19.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>
            <div className="modal-section">
              <label className="modal-label">Product Categories</label>
              <select
                value={tag}
                disabled={!isAdmin}
                onChange={(e) => setTag(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans disabled:opacity-75 disabled:cursor-not-allowed"
              >
                <option value="towel">Towel</option>
                <option value="bath towel">Bath Towel</option>
                <option value="fan">Fan</option>
                <option value="clothing">Custom Clothing</option>
                <option value="custom">General Custom</option>
              </select>
            </div>
          </div>

          <div className="modal-section">
            <label className="modal-label">Description</label>
            <textarea
              placeholder="Explain stitched features or customization limitations..."
              rows={2}
              disabled={!isAdmin}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full leading-relaxed font-sans disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="modal-section">
              <div className="flex justify-between items-center mb-1">
                <label className="modal-label m-0">Stocks (Total Available)</label>
              </div>
              <input
                type="number"
                required
                disabled={!isAdmin}
                placeholder="e.g. 50"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>
            <div className="modal-section">
              <label className="modal-label">Low Stock Threshold</label>
              <input
                type="number"
                required
                disabled={!isAdmin}
                placeholder="e.g. 5"
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Product Variants / Color Options Builder */}
          <div className="modal-section border border-border-glass p-3.5 rounded-xl bg-white/5">
            <label className="modal-label text-primary font-bold flex justify-between items-center mb-1">
              <span className="flex items-center gap-2">
                <span>Color / Style Variants (Assorted Supplies)</span>
                {isAdmin && editingVariantIndex !== null && (
                  <span className="text-[0.68rem] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold border border-primary/40">
                    Editing Variant #{editingVariantIndex + 1}
                  </span>
                )}
              </span>
              <span className="text-[0.7rem] text-text-dim font-normal">Pooled Stock</span>
            </label>
            {isAdmin && (
              <>
                <p className="text-xs text-text-dim mb-2.5">
                  Supplies are acquired from suppliers in assorted mixed colors. Configure color swatches and options below — all variants automatically share this product's unified stock pool (<b>{count || 0} pcs</b>).
                </p>

                {/* Real-time Color Auto-Detection Toast/Banner */}
                {colorNotice && (
                  <div className="mb-2 px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/30 text-primary text-[0.75rem] font-medium flex items-center gap-2 animate-fade">
                    <span className="w-3 h-3 rounded-full border border-white/20 shrink-0 shadow-sm" style={{ backgroundColor: variantColor }} />
                    <span>{colorNotice}</span>
                  </div>
                )}

                {/* Variant Configuration Form Fields */}
                <div className="bg-bg-surface/60 border border-border-glass rounded-xl p-3.5 mb-3 flex flex-col gap-3">
                  {/* Row 1: Name & Color Swatch */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-8">
                      <label className="text-[0.7rem] text-text-dim font-bold block mb-1">
                        Variant Name <span className="text-primary">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Royal Blue / 30x60cm"
                        value={variantName}
                        onChange={(e) => handleVariantNameInput(e.target.value)}
                        className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none w-full focus:border-primary/50 transition-all font-medium"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="text-[0.7rem] text-text-dim font-bold block mb-1">
                        Color Swatch
                      </label>
                      <div className="flex items-center gap-2 bg-bg-surface border border-border-glass p-1.5 rounded-xl h-[38px]">
                        <input
                          type="color"
                          value={variantColor}
                          onChange={(e) => {
                            setVariantColor(e.target.value);
                            setColorNotice(null);
                          }}
                          className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent shrink-0"
                          title="Choose exact color swatch"
                        />
                        <span className="text-xs font-mono font-bold text-text-main truncate">{variantColor}</span>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Price Override */}
                  <div>
                    <label className="text-[0.7rem] text-text-dim font-bold block mb-1">
                      Price Override (₱ Optional — leave blank if same price)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 250.00"
                      value={variantPrice}
                      onChange={(e) => setVariantPrice(e.target.value)}
                      className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none font-mono font-bold w-full focus:border-primary/50 transition-all"
                    />
                  </div>

                  {/* Row 3: Linked Blank Material Dropdown */}
                  <div>
                    <label className="text-[0.7rem] text-text-dim font-bold block mb-1">
                      Linked Blank Material in Raw Inventory (Optional)
                    </label>
                    <select
                      value={variantMaterialId}
                      onChange={(e) => setVariantMaterialId(e.target.value)}
                      className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none w-full cursor-pointer focus:border-primary/50 transition-all"
                    >
                      <option value="">— None (No direct blank material link) —</option>
                      {inventory.map((item) => (
                        <option key={item.id || item._id} value={item.id || item._id}>
                          {item.item} ({item.count || 0} {item.unit || 'units'} available in stock)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveVariant}
                      className="flex-1 font-bold text-xs py-2.5 px-4 rounded-xl cursor-pointer transition-all border flex items-center justify-center gap-1.5 shadow-sm bg-primary/20 hover:bg-primary/30 border-primary/40 text-primary"
                    >
                      <span>{editingVariantIndex !== null ? 'Save Changes to Variant' : '+ Add Variant Option'}</span>
                    </button>
                    {editingVariantIndex !== null && (
                      <button
                        type="button"
                        onClick={handleCancelVariantEdit}
                        className="bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim hover:text-text-main text-xs py-2.5 px-4 rounded-xl cursor-pointer transition-all font-semibold"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Current Variants List with Edit and Safe Delete actions */}
            {variants.length > 0 ? (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
                <span className="text-[0.7rem] font-semibold text-text-dim uppercase tracking-wider mb-0.5">
                  Configured Variants ({variants.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v, idx) => (
                    isAdmin && variantToDeleteIndex === idx ? (
                      /* Warning / Confirmation state before removal */
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border border-danger/60 bg-danger/15 text-text-main shadow-md animate-[fadeIn_0.2s_ease-out]"
                      >
                        <span className="w-2 h-2 rounded-full bg-danger shrink-0 animate-ping" />
                        <span className="font-semibold text-danger-light">
                          Remove <strong className="text-white">"{v.name}"</strong>?
                        </span>
                        <div className="flex items-center gap-1.5 ml-1">
                          <button
                            type="button"
                            onClick={() => handleConfirmRemoveVariant(idx)}
                            className="px-2.5 py-0.5 rounded-md bg-danger hover:bg-danger-light text-white font-bold text-[0.7rem] cursor-pointer transition-all border-0 shadow-sm"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelDeleteVariant}
                            className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-text-dim hover:text-white text-[0.7rem] cursor-pointer transition-all border-0"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Standard Variant Pill */
                      <div
                        key={idx}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border transition-all ${
                          editingVariantIndex === idx
                            ? 'bg-primary/20 border-primary shadow-sm text-white'
                            : 'bg-bg-surface border-border-glass text-text-main'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0 inline-block shadow-sm"
                          style={{ backgroundColor: v.color || '#6366f1' }}
                        />
                        <span className="font-bold">{v.name}</span>
                        {v.materialName && (
                          <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[0.65rem] font-semibold" title={`Linked to Inventory Item: ${v.materialName}`}>
                            {v.materialName}
                          </span>
                        )}
                        {v.priceOverride && (
                          <span className="text-primary font-mono text-[0.7rem] bg-primary/10 px-1.5 py-0.5 rounded-md">
                            ₱{parseFloat(v.priceOverride as any).toFixed(2)}
                          </span>
                        )}
                        
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEditVariant(idx)}
                              className="text-text-dim hover:text-primary p-1 rounded-md hover:bg-white/10 cursor-pointer border-0 bg-transparent transition-all ml-1 flex items-center justify-center"
                              title="Edit variant"
                              aria-label="Edit variant"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                <path d="m15 5 4 4"/>
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleInitiateDeleteVariant(idx)}
                              className="text-text-dim hover:text-danger p-1 rounded-md hover:bg-white/10 cursor-pointer border-0 bg-transparent transition-all flex items-center justify-center"
                              title="Remove variant"
                              aria-label="Remove variant"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )
                  ))}
                </div>

                {/* Inline Undo Notification Banner after removal */}
                {isAdmin && lastDeletedVariant && (
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-text-dim animate-fadeIn mt-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      Removed variant <strong className="text-text-main">"{lastDeletedVariant.variant.name}"</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleUndoDeleteVariant}
                      className="text-primary hover:text-primary-light font-bold cursor-pointer bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-md border border-primary/30 text-xs transition-all flex items-center gap-1"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7v6h6" />
                        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                      </svg>
                      Undo
                    </button>
                  </div>
                )}
              </div>
            ) : !isAdmin ? (
              <p className="text-xs text-text-dim italic m-0 pt-2 border-t border-white/5">No specific color variants configured for this product.</p>
            ) : null}
          </div>

          {isAdmin ? (
            <div className="modal-section">
              <label className="modal-label">Upload Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setImageFile(e.target.files[0]);
                  }
                }}
                className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-dim text-xs cursor-pointer w-full file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white file:cursor-pointer"
              />
            </div>
          ) : editingDesign?.imageUrl ? (
            <div className="modal-section">
              <label className="modal-label">Product Image</label>
              <div 
                className="w-full h-44 rounded-xl bg-cover bg-center border border-border-glass" 
                style={{ backgroundImage: `url(${editingDesign.imageUrl})` }} 
              />
            </div>
          ) : null}

          {isAdmin ? (
            <button
              type="submit"
              className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-sm hover:shadow-md text-center w-full text-sm font-sans"
            >
              {editingDesign ? 'Save Product Details' : 'Create Product'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="bg-white/10 border border-border-glass text-text-main font-bold py-3.5 rounded-xl mt-4 hover:bg-white/15 transition-all cursor-pointer shadow-sm text-center w-full text-sm font-sans"
            >
              Close Specifications
            </button>
          )}
        </form>
      </GlassModal>

      {/* Delete Confirmation Glass Modal */}
      <GlassModal
        isOpen={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        title="Confirm Delete Product"
      >
        <div className="modal-stack text-left">
          <p className="text-sm text-text-main m-0 leading-relaxed">
            Are you sure you want to permanently delete the product <b className="text-danger font-bold">"{deletingProduct?.name}"</b>?
          </p>
          <p className="text-xs text-text-dim m-0">
            This action cannot be undone. Any storefront listings associated with this product will be removed.
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={() => setDeletingProduct(null)}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="px-4 py-2.5 rounded-xl bg-danger text-white text-xs font-bold hover:bg-danger-light cursor-pointer border-none shadow-sm"
            >
              Delete Product
            </button>
          </div>
        </div>
      </GlassModal>
    </section>
  );
}
