'use client';

import React, { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api, API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { ProductCardSkeleton } from '@/components/ui/Skeletons';
import { detectColorFromName } from '@/lib/colorUtils';
import Pagination from '@/components/ui/Pagination';
import { useAuthStore } from '@/stores/useAuthStore';
import InlineError from '@/components/ui/InlineError';

interface PanelManageDesignsProps {
  products: any[];
  inventory: any[];
  isSyncing: boolean;
  refreshData: () => Promise<void>;
  setProducts?: React.Dispatch<React.SetStateAction<any[]>>;
}

const DEFAULT_CATEGORIES = ['Towel', 'Bath Towel', 'Fan', 'Clothing', 'Custom'];

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

  // Dynamic available categories list aggregated from existing products + defaults
  const availableCategories = React.useMemo(() => {
    const set = new Set<string>();
    DEFAULT_CATEGORIES.forEach((c) => set.add(c));
    (products || []).forEach((p) => {
      if (p.tag) {
        const trimmed = p.tag.trim();
        if (trimmed) {
          const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
          set.add(formatted);
        }
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Form Fields
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [tag, setTag] = useState('Towel');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [count, setCount] = useState('');
  const [minThreshold, setMinThreshold] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; price?: string }>({});
  const [touched, setTouched] = useState<{ name?: boolean; price?: boolean }>({});
  const [shakeKey, setShakeKey] = useState(0);

  const validateProductField = (field: 'name' | 'price', val: string) => {
    let err = '';
    const clean = val.trim();
    if (field === 'name') {
      if (!clean) err = 'Product name is required';
      else if (clean.length < 2) err = 'Must be at least 2 characters';
    } else if (field === 'price') {
      if (!clean) err = 'Price is required';
      else {
        const num = parseFloat(clean);
        if (isNaN(num) || num < 0) err = 'Please enter a valid price (₱0.00 or higher)';
      }
    }
    setFieldErrors((prev) => ({ ...prev, [field]: err }));
    return err;
  };

  const handleProductBlur = (field: 'name' | 'price') => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = field === 'name' ? name : price;
    validateProductField(field, val);
  };

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
  const [variantColor, setVariantColor] = useState('#b91c1c');
  const [variantPrice, setVariantPrice] = useState('');
  const [variantMaterialId, setVariantMaterialId] = useState('');
  const [editingVariantIndex, setEditingVariantIndex] = useState<number | null>(null);
  const [colorNotice, setColorNotice] = useState<string | null>(null);
  const [variantToDeleteIndex, setVariantToDeleteIndex] = useState<number | null>(null);
  const [lastDeletedVariant, setLastDeletedVariant] = useState<{
    variant: AdminVariantItem;
    index: number;
  } | null>(null);

  // Stock Filter State ('all' | 'low' | 'normal')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'normal'>('all');

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
    const isLow = availableStock <= (p.minThreshold || 5);
    return stockFilter === 'low' ? isLow : !isLow;
  });

  // Pagination for Products Grid
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, stockFilter]);

  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Calculate stock metrics for all products (Low vs Normal)
  const productStockMetrics = products.reduce(
    (acc, p) => {
      const available = p.availableStock !== undefined ? p.availableStock : Math.max(0, (p.count || 0) - (p.reservedCount || 0));
      const isLow = available <= (p.minThreshold || 5);
      if (isLow) {
        acc.low += 1;
      } else {
        acc.normal += 1;
      }
      return acc;
    },
    { low: 0, normal: 0 }
  );

  // 2. Open Modal
  const openModal = (design?: any) => {
    setFieldErrors({});
    setTouched({});
    if (design) {
      setEditingDesign(design);
      setName(design.name || '');
      setPrice(design.price?.toString() || '');
      const rawTag = design.tag ? design.tag.trim() : 'Towel';
      const formattedTag = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
      setTag(formattedTag);
      setIsCustomCategory(false);
      setCustomCategory('');
      setDescription(design.description || '');
      setRecipe(design.recipe || []);
      setVariants(design.variants || []);
      setCount(design.count?.toString() || '0');
      setMinThreshold(design.minThreshold?.toString() || '5');
    } else {
      setEditingDesign(null);
      setName('');
      setPrice('');
      setTag(availableCategories[0] || 'Towel');
      setIsCustomCategory(false);
      setCustomCategory('');
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
      showToast('Variant already exists', 'error');
      return;
    }

    const selectedMat = inventory.find((i) => (i.id || i._id) === variantMaterialId);
    const resolvedStock = selectedMat ? (selectedMat.count || 0) : 0;

    const updatedVariant: AdminVariantItem = {
      name: variantName.trim(),
      color: variantColor,
      priceOverride: variantPrice.trim() ? variantPrice.trim() : undefined,
      stock: resolvedStock,
      materialId: variantMaterialId || undefined,
      materialName: selectedMat ? selectedMat.item : undefined
    };

    if (editingVariantIndex !== null) {
      setVariants((prev) => prev.map((v, idx) => (idx === editingVariantIndex ? updatedVariant : v)));
      showToast(`Updated variant ${updatedVariant.name}`, 'success');
    } else {
      setVariants((prev) => [...prev, updatedVariant]);
      showToast(`Added variant ${updatedVariant.name}`, 'success');
    }

    handleCancelVariantEdit();
  };

  const handleStartEditVariant = (index: number) => {
    const v = variants[index];
    if (!v) return;
    setVariantToDeleteIndex(null);
    setEditingVariantIndex(index);
    setVariantName(v.name);
    setVariantColor(v.color || '#b91c1c');
    setVariantPrice(v.priceOverride ? v.priceOverride.toString() : '');
    setVariantMaterialId(v.materialId || '');
    setColorNotice(null);
  };

  const handleCancelVariantEdit = () => {
    setEditingVariantIndex(null);
    setVariantName('');
    setVariantColor('#b91c1c');
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

    showToast(`Removed variant ${targetVariant.name}`, 'info');
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
    showToast(`Restored variant ${restoredName}`, 'success');
  };

  // 3. Add Material to Recipe
  const addRecipeItem = () => {
    if (!selectedMaterialId) {
      showToast('Select a material', 'error');
      return;
    }
    const qty = parseFloat(materialQty);
    if (isNaN(qty) || qty <= 0) {
      showToast('Enter a valid quantity', 'error');
      return;
    }

    const materialItem = inventory.find((i) => (i.id || i._id) === selectedMaterialId);
    if (!materialItem) return;

    // Check duplication
    if (recipe.some((r) => r.inventoryId === selectedMaterialId)) {
      showToast('Material already added', 'error');
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

    const errName = validateProductField('name', name);
    const errPrice = validateProductField('price', price);

    if (errName || errPrice) {
      setTouched({ name: true, price: true });
      setShakeKey((k) => k + 1);
      showToast({
        title: 'Form Validation Error',
        message: errName || errPrice || 'Please fix the highlighted product fields',
        type: 'error'
      });
      return;
    }

    // Derive total stock from variants (deduplicating shared raw materials):
    const countedMatIds = new Set<string>();
    const totalVariantStock = variants.length === 0
      ? (parseInt(count, 10) || 0)
      : variants.reduce((sum, v) => {
          if (v.materialId) {
            if (!countedMatIds.has(v.materialId)) {
              countedMatIds.add(v.materialId);
              const mat = inventory.find((i) => (i.id || i._id) === v.materialId);
              return sum + (mat ? (mat.count || 0) : (typeof v.stock === 'number' ? v.stock : (parseInt(v.stock?.toString() || '0', 10) || 0)));
            }
            return sum; // Shared material already counted once
          }
          const s = typeof v.stock === 'number' ? v.stock : (parseInt(v.stock?.toString() || '0', 10) || 0);
          return sum + Math.max(0, s);
        }, 0);

    const formattedVariants = variants.map((v) => {
      let resolvedStock = 0;
      if (v.materialId) {
        const mat = inventory.find((i) => (i.id || i._id) === v.materialId);
        resolvedStock = mat ? (mat.count || 0) : (typeof v.stock === 'number' ? v.stock : (parseInt(v.stock?.toString() || '0', 10) || 0));
      } else {
        resolvedStock = typeof v.stock === 'number' ? v.stock : (parseInt(v.stock?.toString() || '0', 10) || 0);
      }
      return {
        name: v.name,
        color: v.color,
        priceOverride: v.priceOverride ? parseFloat(v.priceOverride as any) : undefined,
        stock: resolvedStock,
        materialId: v.materialId || undefined,
        materialName: v.materialName || undefined
      };
    });

    const resolvedTag = (isCustomCategory ? customCategory : tag).trim();
    if (!resolvedTag) {
      setShakeKey((k) => k + 1);
      showToast({
        title: 'Form Validation Error',
        message: 'Product category is required',
        type: 'error'
      });
      return;
    }

    // Auto-capitalize first letter of name and tag
    const capitalizedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
    const capitalizedTag = resolvedTag.charAt(0).toUpperCase() + resolvedTag.slice(1);

    const formData = new FormData();
    formData.append('name', capitalizedName);
    formData.append('price', price.trim());
    formData.append('tag', capitalizedTag);
    formData.append('description', description.trim());
    formData.append('recipe', JSON.stringify(recipe));
    formData.append('variants', JSON.stringify(formattedVariants));
    formData.append('count', totalVariantStock.toString());
    formData.append('minThreshold', minThreshold.trim());

    if (imageFile) {
      formData.append('image', imageFile);
    }

    const numericPrice = parseFloat(price.trim());
    const numericCount = totalVariantStock;
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
      availableStock: numericCount,
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
    showToast(isEdit ? 'Product updated' : 'Product created', 'success');

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
      showToast('Failed to save product', 'error');
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
    showToast('Product deleted', 'success');

    try {
      await api.delete(`/api/admin/products/${id}`);
      refreshData().catch(() => {});
    } catch (err) {
      console.error(err);
      if (setProducts) {
        setProducts(prevProducts);
      }
      showToast('Failed to delete product', 'error');
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
            { id: 'low', label: 'Low Stock', count: productStockMetrics.low },
            { id: 'normal', label: 'Normal Stock', count: productStockMetrics.normal },
          ].map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => setStockFilter(tier.id as 'all' | 'low' | 'normal')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border transition-all flex items-center gap-2 ${
                stockFilter === tier.id
                  ? 'bg-primary text-white border-primary/40 shadow-sm'
                  : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
              }`}
            >
              <span>{tier.label}</span>
              <span className={`text-[0.68rem] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                stockFilter === tier.id ? 'bg-white/20 text-white' : 'bg-white/10 text-text-dim'
              }`}>
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
              const minThreshold = p.minThreshold || 5;
              const isOut = availableStock <= 0;
              const isLow = availableStock <= minThreshold;

              const stockBadge = isOut ? {
                label: 'Out of Stock',
                className: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
                color: '#f43f5e'
              } : isLow ? {
                label: 'Low Stock',
                className: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
                color: '#f59e0b'
              } : {
                label: 'Normal Stock',
                className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
                color: '#10b981'
              };
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

                    {/* Variants: Clean Shopify-Style Meta Summary */}
                    {p.variants && p.variants.length > 0 ? (
                      <div className="flex items-center justify-between text-[0.72rem] py-1.5 px-2.5 rounded-lg bg-white/5 border border-white/5 mt-2">
                        <span className="text-text-dim font-medium">
                          {p.variants.length} {p.variants.length === 1 ? 'Option' : 'Options'} available
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-1.5 overflow-hidden py-0.5">
                            {p.variants.slice(0, 5).map((v: any, vi: number) => (
                              <span
                                key={vi}
                                title={`${v.name}${v.stock !== undefined ? ` (${v.stock} in stock)` : ''}`}
                                className="inline-block w-3.5 h-3.5 rounded-full ring-2 ring-bg-surface border border-white/20"
                                style={{ backgroundColor: v.color || '#94a3b8' }}
                              />
                            ))}
                          </div>
                          {p.variants.length > 5 && (
                            <span className="text-[0.65rem] text-text-dim font-bold">
                              +{p.variants.length - 5}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[0.7rem] text-text-dim/60 italic py-1 mt-1">
                        Standard product (No variants)
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
                        Available: <b style={{ color: stockBadge.color }} className="font-mono font-bold">
                          {availableStock}
                        </b>
                      </span>
                    </div>
                  </div>
                  
                  {/* Stock Level Badge */}
                  <span
                    className={`absolute top-2 right-2 text-[0.65rem] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider shadow-lg backdrop-blur-md ${stockBadge.className}`}
                  >
                    {stockBadge.label}
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
          pageSizeOptions={[6, 12, 24, 48]}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          itemLabel="products"
        />
      </div>

      {/* Modal: Create / Edit / Inspect Product Form */}
      <GlassModal
        isOpen={isOpen}
        maxWidth="max-w-[580px]"
        onClose={() => {
          setIsOpen(false);
          setVariantToDeleteIndex(null);
          setLastDeletedVariant(null);
        }}
        onDiscard={() => {
          setEditingDesign(null);
          setName('');
          setPrice('');
          setTag(availableCategories[0] || 'Towel');
          setIsCustomCategory(false);
          setCustomCategory('');
          setDescription('');
          setRecipe([]);
          setVariants([]);
          setCount('0');
          setMinThreshold('5');
          setImageFile(null);
          setSelectedMaterialId('');
          setMaterialQty('');
          handleCancelVariantEdit();
          setVariantToDeleteIndex(null);
          setLastDeletedVariant(null);
        }}
        title={!isAdmin ? 'Product Specifications' : (editingDesign ? 'Edit Product Details' : 'Create New Product')}
      >
        <form
          key={shakeKey}
          noValidate
          onSubmit={handleSubmit}
          className={`text-left max-h-[82vh] overflow-y-auto pr-1 flex flex-col gap-2.5 ${shakeKey > 0 ? 'animate-shake' : ''}`}
        >
          {/* Row 1: Product Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-8 flex flex-col gap-1">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim flex items-center justify-between">
                <span>Product Name</span>
                {touched.name && !fieldErrors.name && name.trim() && (
                  <span className="text-emerald-400 text-[0.65rem] font-bold">✓ Valid</span>
                )}
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                placeholder="e.g. Premium Embroidered Towel"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (touched.name) validateProductField('name', e.target.value);
                }}
                onBlur={() => handleProductBlur('name')}
                className={`bg-bg-surface border h-9 px-3 rounded-lg text-text-main text-xs outline-none w-full font-sans disabled:opacity-75 disabled:cursor-not-allowed transition-all ${
                  touched.name && fieldErrors.name
                    ? 'border-rose-500/70 bg-rose-500/[0.04] ring-1 ring-rose-500/30'
                    : 'border-border-glass focus:border-white/40'
                }`}
              />
              {touched.name && fieldErrors.name && (
                <InlineError message={fieldErrors.name} variant="field" />
              )}
            </div>

            <div className="sm:col-span-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim block">
                  Category
                </label>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCategory((prev) => !prev);
                      if (!isCustomCategory && !customCategory) {
                        setCustomCategory('');
                      }
                    }}
                    className="text-[0.65rem] text-primary hover:underline font-bold cursor-pointer transition-colors bg-transparent border-none p-0"
                  >
                    {isCustomCategory ? '← Existing' : '+ New Category'}
                  </button>
                )}
              </div>

              {isCustomCategory ? (
                <div className="relative flex items-center">
                  <input
                    type="text"
                    disabled={!isAdmin}
                    autoFocus
                    placeholder="e.g. Tote Bag, Hoodies"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="bg-bg-surface border border-primary/50 h-9 px-2.5 pr-7 rounded-lg text-text-main text-xs outline-none w-full font-sans focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                  {customCategory && (
                    <button
                      type="button"
                      onClick={() => setCustomCategory('')}
                      className="absolute right-2 text-text-dim hover:text-text-main text-xs cursor-pointer bg-transparent border-none"
                      title="Clear"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ) : (
                <select
                  value={tag}
                  disabled={!isAdmin}
                  onChange={(e) => {
                    if (e.target.value === '__NEW_CATEGORY__') {
                      setIsCustomCategory(true);
                      setCustomCategory('');
                    } else {
                      setTag(e.target.value);
                    }
                  }}
                  className="bg-bg-surface border border-border-glass h-9 px-2.5 rounded-lg text-text-main text-xs outline-none w-full cursor-pointer font-sans disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  {isAdmin && (
                    <option value="__NEW_CATEGORY__" className="font-bold text-primary">
                      + Add New Category...
                    </option>
                  )}
                </select>
              )}
            </div>
          </div>

          {/* Row 2: Price, Total Stock (Auto), Low Stock Limit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim flex items-center justify-between">
                <span>Price (₱)</span>
                {touched.price && !fieldErrors.price && price.trim() && (
                  <span className="text-emerald-400 text-[0.65rem] font-bold">✓ Valid</span>
                )}
              </label>
              <input
                type="number"
                step="0.01"
                disabled={!isAdmin}
                placeholder="e.g. 45.00"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  if (touched.price) validateProductField('price', e.target.value);
                }}
                onBlur={() => handleProductBlur('price')}
                className={`bg-bg-surface border h-9 px-3 rounded-lg text-text-main text-xs outline-none w-full font-mono font-bold disabled:opacity-75 disabled:cursor-not-allowed transition-all ${
                  touched.price && fieldErrors.price
                    ? 'border-rose-500/70 bg-rose-500/[0.04] ring-1 ring-rose-500/30'
                    : 'border-border-glass focus:border-white/40'
                }`}
              />
              {touched.price && fieldErrors.price && (
                <InlineError message={fieldErrors.price} variant="field" />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">
                  Total Stock
                </label>
                <span className="text-[0.65rem] text-primary font-bold">Auto</span>
              </div>
              <div className="bg-bg-surface border border-border-glass h-9 px-2.5 rounded-lg flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-text-main">
                  {variants.length === 0 ? (count || '0') : (() => {
                    const counted = new Set<string>();
                    return variants.reduce((sum, v) => {
                      if (v.materialId) {
                        if (!counted.has(v.materialId)) {
                          counted.add(v.materialId);
                          const mat = inventory.find((i) => (i.id || i._id) === v.materialId);
                          return sum + (mat?.count ?? 0);
                        }
                        return sum;
                      }
                      return sum + (typeof v.stock === 'number' ? v.stock : parseInt(v.stock?.toString() || '0', 10) || 0);
                    }, 0);
                  })()} pcs
                </span>
                <span className="text-[0.68rem] text-text-dim">
                  {variants.length} var{variants.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim block">
                Low Stock Limit
              </label>
              <input
                type="number"
                required
                disabled={!isAdmin}
                placeholder="e.g. 5"
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                className="bg-bg-surface border border-border-glass h-9 px-3 rounded-lg text-text-main text-xs outline-none w-full font-mono disabled:opacity-75 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Row 3: Description */}
          <div className="flex flex-col gap-1">
            <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim block">
              Description
            </label>
            <textarea
              placeholder="Explain stitched features or customization limitations..."
              rows={2}
              disabled={!isAdmin}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-lg text-text-main text-xs outline-none w-full leading-relaxed font-sans disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>

          {/* Product Variants / Color Options Builder */}
          <div className="border border-border-glass p-3 rounded-xl bg-white/[0.02] flex flex-col gap-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-primary flex items-center gap-2">
                <span>Color / Style Variants</span>
                {isAdmin && editingVariantIndex !== null && (
                  <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold border border-primary/40">
                    Editing Variant #{editingVariantIndex + 1}
                  </span>
                )}
              </span>
              <span className="text-[0.68rem] text-text-dim font-medium">Variant-Driven Stock</span>
            </div>

            {isAdmin && (
              <>
                {/* Real-time Color Auto-Detection Toast/Banner */}
                {colorNotice && (
                  <div className="px-2.5 py-1 rounded-md bg-primary/15 border border-primary/30 text-primary text-[0.72rem] font-medium flex items-center gap-2 animate-fade">
                    <span className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0 shadow-sm" style={{ backgroundColor: variantColor }} />
                    <span>{colorNotice}</span>
                  </div>
                )}

                {/* Compact Variant Configuration Form Fields */}
                <div className="bg-bg-surface/60 border border-border-glass rounded-lg p-2.5 flex flex-col gap-2">
                  {/* Row 1: Name & Color Swatch */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-7 flex flex-col gap-1">
                      <label className="text-[0.68rem] text-text-dim font-bold block">
                        Variant Name <span className="text-primary">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Royal Blue / 30x60cm"
                        value={variantName}
                        onChange={(e) => handleVariantNameInput(e.target.value)}
                        className="bg-bg-surface border border-border-glass h-9 min-h-[36px] px-3 rounded-lg text-text-main text-xs outline-none w-full focus:border-primary/50 transition-all font-medium leading-normal"
                      />
                    </div>
                    <div className="sm:col-span-5 flex flex-col gap-1">
                      <label className="text-[0.68rem] text-text-dim font-bold block">
                        Color Swatch
                      </label>
                      <div className="flex items-center gap-2 bg-bg-surface border border-border-glass px-2.5 rounded-lg h-9 min-h-[36px]">
                        <input
                          type="color"
                          value={variantColor}
                          onChange={(e) => {
                            setVariantColor(e.target.value);
                            setColorNotice(null);
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent shrink-0"
                          title="Choose exact color swatch"
                        />
                        <span className="text-[0.7rem] font-mono font-bold text-text-main truncate">{variantColor}</span>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Linked Material (7 cols) & Price Override (5 cols) */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-7 flex flex-col gap-1">
                      <div className="flex justify-between items-center gap-1">
                        <label className="text-[0.68rem] text-text-dim font-bold block whitespace-nowrap">
                          Linked Blank Material <span className="text-primary">*</span>
                        </label>
                        <span className="text-[0.62rem] text-primary font-bold whitespace-nowrap">Supplies Stock</span>
                      </div>
                      {inventory.length === 0 ? (
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[0.72rem]">
                          No materials in Materials tab. Add raw blanks there first.
                        </div>
                      ) : (
                        <select
                          value={variantMaterialId}
                          onChange={(e) => setVariantMaterialId(e.target.value)}
                          className="bg-bg-surface border border-border-glass h-9 min-h-[36px] py-1.5 px-2.5 rounded-lg text-text-main text-xs outline-none w-full cursor-pointer focus:border-primary/50 transition-all font-medium leading-normal"
                        >
                          <option value="">— No Material Linked (0 Stock) —</option>
                          {inventory.map((item) => (
                            <option key={item.id || item._id} value={item.id || item._id}>
                              {item.item} ({item.count || 0} {item.unit || 'units'})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="sm:col-span-5 flex flex-col gap-1">
                      <label className="text-[0.68rem] text-text-dim font-bold block whitespace-nowrap truncate" title="Price Override (₱ Optional)">
                        Price Override (₱ Optional)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 250.00"
                        value={variantPrice}
                        onChange={(e) => setVariantPrice(e.target.value)}
                        className="bg-bg-surface border border-border-glass h-9 min-h-[36px] px-2.5 rounded-lg text-text-main text-xs outline-none font-mono font-bold w-full focus:border-primary/50 transition-all leading-normal"
                      />
                    </div>
                  </div>

                  {/* Material Linking Status Banner */}
                  <div className="text-[0.7rem]">
                    {variantMaterialId ? (() => {
                      const mat = inventory.find((i) => (i.id || i._id) === variantMaterialId);
                      const matCount = mat ? (mat.count || 0) : 0;
                      return (
                        <span className={matCount > 0 ? "text-emerald-400 font-semibold flex items-center gap-1.5" : "text-amber-400 font-semibold flex items-center gap-1.5"}>
                          <span className={`w-1.5 h-1.5 rounded-full ${matCount > 0 ? "bg-emerald-400" : "bg-amber-400"}`} />
                          <span>Linked to <b>{mat?.item || 'Material'}</b>: <b>{matCount} pcs</b> in stock</span>
                        </span>
                      );
                    })() : (
                      <span className="text-text-dim/70 italic">
                        No material selected (<b>0 stock</b> until linked to an inventory item).
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={handleSaveVariant}
                      className="flex-1 font-bold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-all border flex items-center justify-center gap-1.5 shadow-xs bg-primary/20 hover:bg-primary/30 border-primary/40 text-primary"
                    >
                      <span>{editingVariantIndex !== null ? 'Save Variant Changes' : '+ Add Variant Option'}</span>
                    </button>
                    {editingVariantIndex !== null && (
                      <button
                        type="button"
                        onClick={handleCancelVariantEdit}
                        className="bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim hover:text-text-main text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-all font-semibold"
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
              <div className="flex flex-col gap-1 pt-1.5 border-t border-white/5">
                <span className="text-[0.68rem] font-semibold text-text-dim uppercase tracking-wider mb-0.5">
                  Configured Variants ({variants.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {variants.map((v, idx) => (
                    isAdmin && variantToDeleteIndex === idx ? (
                      /* Warning / Confirmation state before removal */
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs border border-danger/60 bg-danger/15 text-text-main shadow-xs animate-[fadeIn_0.2s_ease-out]"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0 animate-ping" />
                        <span className="font-semibold text-danger-light text-[0.72rem]">
                          Remove <strong className="text-text-main">"{v.name}"</strong>?
                        </span>
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            type="button"
                            onClick={() => handleConfirmRemoveVariant(idx)}
                            className="px-2 py-0.5 rounded bg-danger hover:bg-danger-light text-white font-bold text-[0.65rem] cursor-pointer transition-all border-0 shadow-xs"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelDeleteVariant}
                            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-text-dim hover:text-text-main text-[0.65rem] cursor-pointer transition-all border-0"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Standard Variant Pill */
                      <div
                        key={idx}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all ${
                          editingVariantIndex === idx
                            ? 'bg-primary/20 border-primary shadow-xs text-white'
                            : 'bg-bg-surface border-border-glass text-text-main'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-white/30 shrink-0 inline-block shadow-xs"
                          style={{ backgroundColor: v.color || '#b91c1c' }}
                        />
                        <span className="font-bold text-[0.75rem]">{v.name}</span>
                        {(() => {
                          const mat = v.materialId ? inventory.find((i) => (i.id || i._id) === v.materialId) : null;
                          const count = mat ? (mat.count || 0) : 0;
                          return (
                            <span className={`font-mono text-[0.65rem] px-1 py-0.5 rounded font-bold ${
                              count > 0 ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}>
                              {v.materialId ? (
                                `${count} pcs (${v.materialName || mat?.item || 'Material'})`
                              ) : (
                                '0 pcs'
                              )}
                            </span>
                          );
                        })()}
                        {v.priceOverride && (
                          <span className="text-primary font-mono text-[0.65rem] bg-primary/10 px-1 py-0.5 rounded">
                            ₱{parseFloat(v.priceOverride as any).toFixed(2)}
                          </span>
                        )}
                        
                        {isAdmin && (
                          <div className="flex items-center ml-0.5">
                            <button
                              type="button"
                              onClick={() => handleStartEditVariant(idx)}
                              className="text-text-dim hover:text-primary p-0.5 rounded hover:bg-white/10 cursor-pointer border-0 bg-transparent transition-all flex items-center justify-center"
                              title="Edit variant"
                              aria-label="Edit variant"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                <path d="m15 5 4 4"/>
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleInitiateDeleteVariant(idx)}
                              className="text-text-dim hover:text-danger p-0.5 rounded hover:bg-white/10 cursor-pointer border-0 bg-transparent transition-all flex items-center justify-center"
                              title="Remove variant"
                              aria-label="Remove variant"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  ))}
                </div>

                {/* Inline Undo Notification Banner after removal */}
                {isAdmin && lastDeletedVariant && (
                  <div className="flex items-center justify-between px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[0.72rem] text-text-dim animate-fadeIn mt-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      Removed variant <strong className="text-text-main">"{lastDeletedVariant.variant.name}"</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleUndoDeleteVariant}
                      className="text-primary hover:text-primary-light font-bold cursor-pointer bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 rounded border border-primary/30 text-[0.68rem] transition-all flex items-center gap-1"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7v6h6" />
                        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                      </svg>
                      Undo
                    </button>
                  </div>
                )}
              </div>
            ) : !isAdmin ? (
              <p className="text-xs text-text-dim italic m-0 pt-1.5 border-t border-white/5">No specific color variants configured for this product.</p>
            ) : null}
          </div>

          {/* Upload Image */}
          {isAdmin ? (
            <div className="flex flex-col gap-1">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim block">
                Upload Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setImageFile(e.target.files[0]);
                  }
                }}
                className="bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-lg text-text-dim text-xs cursor-pointer w-full file:mr-3 file:py-0.5 file:px-2 file:rounded-md file:border-0 file:text-[0.7rem] file:font-semibold file:bg-primary file:text-white file:cursor-pointer"
              />
            </div>
          ) : editingDesign?.imageUrl ? (
            <div className="flex flex-col gap-1">
              <label className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim block">
                Product Image
              </label>
              <div 
                className="w-full h-36 rounded-lg bg-cover bg-center border border-border-glass" 
                style={{ backgroundImage: `url(${editingDesign.imageUrl})` }} 
              />
            </div>
          ) : null}

          {/* Submit / Action Button */}
          {isAdmin ? (
            <button
              type="submit"
              className="bg-primary text-white font-bold py-2.5 rounded-xl mt-1 hover:bg-primary-light transition-all cursor-pointer border-none shadow-xs hover:shadow-md text-center w-full text-xs font-sans"
            >
              {editingDesign ? 'Save Product Details' : 'Create Product'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="bg-white/10 border border-border-glass text-text-main font-bold py-2.5 rounded-xl mt-1 hover:bg-white/15 transition-all cursor-pointer shadow-xs text-center w-full text-xs font-sans"
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
