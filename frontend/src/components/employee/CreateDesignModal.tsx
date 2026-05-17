'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { showToast } from '@/components/ui/Toast';
import { useProductStore } from '@/stores/useProductStore';

interface CreateDesignModalProps {
  isOpen: boolean;
  onClose: () => void;
  editProduct?: any;
  onRefresh?: () => void;
}

export default function CreateDesignModal({ isOpen, onClose, editProduct, onRefresh }: CreateDesignModalProps) {
  const { fetchProducts } = useProductStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    tag: '',
    description: '',
  });

  useEffect(() => {
    if (editProduct) {
      setFormData({
        name: editProduct.name || '',
        price: editProduct.price?.toString() || '',
        tag: editProduct.tag || '',
        description: editProduct.description || '',
      });
    } else {
      setFormData({ name: '', price: '', tag: '', description: '' });
    }
    setImageFile(null);
  }, [editProduct, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formDataObj = new FormData();
      formDataObj.append('name', formData.name);
      formDataObj.append('price', formData.price);
      formDataObj.append('tag', formData.tag);
      formDataObj.append('description', formData.description);
      
      if (imageFile) {
        formDataObj.append('image', imageFile);
      } else if (editProduct?.imageUrl) {
        formDataObj.append('imageUrl', editProduct.imageUrl);
      }

      const url = editProduct 
        ? `/api/admin/products/${editProduct.id || editProduct._id}` 
        : '/api/admin/products';
        
      const method = editProduct ? 'PATCH' : 'POST';

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}${url}`, {
        method,
        body: formDataObj,
        credentials: 'include',
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to save product');
      }
      
      showToast(editProduct ? 'Design updated successfully' : 'Design created successfully', 'success');
      fetchProducts(); // Refresh general catalog
      if (onRefresh) onRefresh(); // Refresh parent view
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to save design', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[600px]">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold m-0 text-text-main">
            {editProduct ? 'Edit Design Specifications' : 'Create New Design'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 max-[650px]:grid-cols-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.9rem] text-text-dim font-medium">Design Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Vintage Rose"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.9rem] text-text-dim font-medium">Price ($)</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="29.99"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.9rem] text-text-dim font-medium">Category / Tag</label>
            <input
              type="text"
              required
              placeholder="e.g. Floral, Sport, Premium"
              value={formData.tag}
              onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
              className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.9rem] text-text-dim font-medium">Description</label>
            <textarea
              required
              rows={3}
              placeholder="Brief details about the design..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.95rem] outline-none focus:border-primary transition-colors resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[0.9rem] text-text-dim font-medium">Design Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setImageFile(e.target.files[0]);
                }
              }}
              className="w-full p-2 text-text-dim text-[0.9rem] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 cursor-pointer"
            />
            {editProduct?.imageUrl && !imageFile && (
              <p className="text-[0.85rem] text-text-dim m-0">Current Image: <a href={editProduct.imageUrl} target="_blank" rel="noreferrer" className="text-primary underline">View Current</a></p>
            )}
            <p className="text-[0.8rem] text-text-dim mt-1 m-0">Recommended: Square image, max 1MB.</p>
          </div>

          <GlassButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            className="mt-4"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving Specifications...' : (editProduct ? 'Save Updates' : 'Publish to Catalog')}
          </GlassButton>
        </form>
      </div>
    </GlassModal>
  );
}
