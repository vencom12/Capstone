'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api, API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { ProductCardSkeleton } from '@/components/ui/Skeletons';

interface PanelManageDesignsProps {
  products: any[];
  inventory: any[];
  isSyncing: boolean;
  refreshData: () => Promise<void>;
}

export default function PanelManageDesigns({
  products,
  inventory,
  isSyncing,
  refreshData
}: PanelManageDesignsProps) {
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

  // 1. Filtering Designs
  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase();
    return (
      !searchQuery ||
      p.name?.toLowerCase().includes(query) ||
      p.tag?.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
    );
  });

  // 2. Open Modal
  const openModal = (design?: any) => {
    if (design) {
      setEditingDesign(design);
      setName(design.name || '');
      setPrice(design.price?.toString() || '');
      setTag(design.tag || 'towel');
      setDescription(design.description || '');
      setRecipe(design.recipe || []);
      setCount(design.count?.toString() || '0');
      setMinThreshold(design.minThreshold?.toString() || '5');
    } else {
      setEditingDesign(null);
      setName('');
      setPrice('');
      setTag('towel');
      setDescription('');
      setRecipe([]);
      setCount('0');
      setMinThreshold('5');
    }
    setImageFile(null);
    setSelectedMaterialId('');
    setMaterialQty('');
    setIsOpen(true);
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

    if (!name.trim()) return showToast('Design name is required', 'error');
    if (!price.trim() || isNaN(parseFloat(price))) return showToast('Valid price is required', 'error');

    const formData = new FormData();
    formData.append('name', name.trim());
    formData.append('price', price.trim());
    formData.append('tag', tag);
    formData.append('description', description.trim());
    formData.append('recipe', JSON.stringify(recipe));
    formData.append('count', count.trim());
    formData.append('minThreshold', minThreshold.trim());

    if (imageFile) {
      formData.append('image', imageFile);
    }

    try {
      const method = editingDesign ? 'PATCH' : 'POST';
      const path = editingDesign ? `/api/admin/products/${editingDesign.id || editingDesign._id}` : '/api/admin/products';

      const response = await fetch(`${API_BASE}${path}`, {
        method,
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Server returned an error');
      }

      showToast(
        editingDesign ? 'Catalog design details updated' : 'New storefront design published successfully',
        'success'
      );
      setIsOpen(false);
      refreshData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save storefront design', 'error');
    }
  };

  // Delete confirmation modal state
  const [deletingProduct, setDeletingProduct] = useState<any>(null);

  const confirmDelete = async () => {
    if (!deletingProduct) return;
    const id = deletingProduct.id || deletingProduct._id;
    try {
      await api.delete(`/api/admin/products/${id}`);
      showToast('Product deleted successfully', 'success');
      setDeletingProduct(null);
      refreshData();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete product', 'error');
    }
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left">
      <header className="dash-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="dash-title">Products</h1>
          <p className="dash-subtitle">Manage catalog products, categories, pricing, and inventory stock levels.</p>
        </div>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
          />
          <button
            onClick={() => openModal()}
            className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl text-[0.85rem] hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all cursor-pointer whitespace-nowrap border-none"
          >
            + New Product
          </button>
        </div>
      </header>

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
            No products found. Click "+ New Product" to create one.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map((p) => {
              const id = p.id || p._id;
              const availableStock = p.availableStock !== undefined ? p.availableStock : Math.max(0, (p.count || 0) - (p.reservedCount || 0));
              const dynamicReserved = p.dynamicReserved !== undefined ? p.dynamicReserved : (p.reservedCount || 0);
              const isLowStock = availableStock <= (p.minThreshold || 5);
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
                        ${parseFloat(p.price || 0).toFixed(2)}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-[0.8rem] text-text-dim m-0 line-clamp-2 leading-relaxed mt-1">
                        {p.description}
                      </p>
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
                      <span className="text-text-dim">
                        Available: <b className={isLowStock ? "text-danger font-bold" : "text-success font-bold"}>
                          {availableStock}
                        </b>
                      </span>
                    </div>
                  </div>
                  
                  {isLowStock && (
                    <span className="absolute top-2 right-2 bg-red-500/20 text-red-500 border border-red-500/30 text-[0.6rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-lg">
                      Low Stock
                    </span>
                  )}
                  
                  <div className="flex gap-2 w-full mt-auto pt-2">
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Create / Edit Product Form */}
      <GlassModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingDesign ? 'Edit Product Details' : 'Create New Product'}
      >
        <form onSubmit={handleSubmit} className="modal-stack text-left max-h-[80vh] overflow-y-auto pr-1">
          <div className="modal-section">
            <label className="modal-label">Product Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Premium Embroidered Towel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="modal-section">
              <label className="modal-label">Price ($)</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="e.g. 19.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
              />
            </div>
            <div className="modal-section">
              <label className="modal-label">Product Categories</label>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full leading-relaxed font-sans"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="modal-section">
              <label className="modal-label">Stocks</label>
              <input
                type="number"
                required
                placeholder="e.g. 50"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
              />
            </div>
            <div className="modal-section">
              <label className="modal-label">Low Stock Threshold</label>
              <input
                type="number"
                required
                placeholder="e.g. 5"
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
              />
            </div>
          </div>

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

          <button
            type="submit"
            className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-[0_10px_20px_rgba(99,102,241,0.3)] text-center w-full text-sm font-sans"
          >
            {editingDesign ? 'Save Product Details' : 'Create Product'}
          </button>
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
              className="px-4 py-2.5 rounded-xl bg-danger text-white text-xs font-bold hover:bg-danger-light cursor-pointer border-none shadow-[0_4px_12px_rgba(239,68,68,0.3)]"
            >
              Delete Product
            </button>
          </div>
        </div>
      </GlassModal>
    </section>
  );
}
