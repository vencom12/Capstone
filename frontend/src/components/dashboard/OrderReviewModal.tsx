'use client';

import React, { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { useAuthStore } from '@/stores/useAuthStore';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface OrderReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    orderId: string;
    design?: string;
    items?: any;
    status: string;
    totalAmount?: number;
  };
  onReviewSubmitted?: () => void;
}

const QUALITY_TAGS = [
  'Clean & Dense Stitching',
  'Vibrant Thread Color',
  'Accurate Name / Monogram',
  'Durable Fabric Quality',
  'Fast Turnaround Speed',
  'Carefully Packaged',
];

export default function OrderReviewModal({
  isOpen,
  onClose,
  order,
  onReviewSubmitted,
}: OrderReviewModalProps) {
  const { user } = useAuthStore();
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([
    'Clean & Dense Stitching',
    'Vibrant Thread Color',
  ]);
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const getRatingLabel = (val: number) => {
    switch (val) {
      case 5:
        return '5.0 — Outstanding Embroidery';
      case 4:
        return '4.0 — Good Quality & Stitching';
      case 3:
        return '3.0 — Met Basic Expectations';
      case 2:
        return '2.0 — Needs Quality Improvement';
      case 1:
        return '1.0 — Unsatisfactory';
      default:
        return `${val}.0`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() && selectedTags.length === 0) {
      showToast('Please select quality tags or share brief comments', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const compiledMessage = [
        selectedTags.length > 0 ? `[Highlights: ${selectedTags.join(', ')}]` : '',
        comment.trim(),
      ]
        .filter(Boolean)
        .join('\n\n');

      let orderProductId: string | undefined = (order as any).productId;
      if (!orderProductId && Array.isArray(order.items) && order.items.length > 0) {
        orderProductId = order.items[0].productId || order.items[0].id;
      } else if (!orderProductId && typeof order.items === 'string') {
        try {
          const parsed = JSON.parse(order.items);
          if (Array.isArray(parsed) && parsed.length > 0) {
            orderProductId = parsed[0].productId || parsed[0].id;
          }
        } catch (_) {}
      }

      await api.post('/api/customer/feedback', {
        category: 'Verified Order Review',
        rating,
        message: compiledMessage || 'Rated 5 stars for verified order.',
        orderId: order.orderId,
        productId: orderProductId || undefined,
        customerName: user?.username || 'Verified Customer',
        customerEmail: user?.email || undefined,
      });

      showToast('Thank you! Your verified review has been recorded.', 'success');
      if (onReviewSubmitted) onReviewSubmitted();
      onClose();
    } catch (err: any) {
      console.error('[OrderReviewModal] Submit failed:', err);
      showToast(err.message || 'Failed to submit review', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStars = hoverRating || rating;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Rate Order & Embroidery Quality"
      maxWidth="max-w-[540px]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        {/* Verified Order Banner */}
        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-border-glass flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono font-bold text-text-main">
              Order #{order.orderId}
            </span>
            <span className="text-[0.72rem] text-text-dim">
              {order.design || 'Custom Embroidery Order'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[0.68rem] font-bold">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Verified Purchase</span>
          </div>
        </div>

        {/* 5-Star Rating Picker */}
        <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col items-center gap-2">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">
            Overall Embroidery & Turnaround Score
          </span>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="text-3xl p-1 bg-transparent border-0 cursor-pointer hover:scale-115 transition-transform"
                title={`${star} star(s)`}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className={
                    star <= activeStars
                      ? 'text-amber-400 drop-shadow-[0_2px_10px_rgba(251,191,36,0.45)]'
                      : 'text-white/20 hover:text-white/40'
                  }
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            ))}
          </div>
          <span className="text-xs font-bold text-primary">
            {getRatingLabel(activeStars)}
          </span>
        </div>

        {/* Stitching & Finishing Quality Highlights */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-text-dim">
            What impressed you most about this order?
          </label>
          <div className="flex flex-wrap gap-1.5">
            {QUALITY_TAGS.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                    active
                      ? 'bg-primary/20 text-primary border-primary/50 shadow-sm'
                      : 'bg-white/[0.03] text-text-dim border-border-glass hover:bg-white/[0.07]'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detailed Comments */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-text-dim">
            Review Comments (Optional)
          </label>
          <textarea
            rows={3}
            placeholder="Share details about the letter sharpness, fabric feel, or Pacific Mall store pickup..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-xs outline-none focus:border-primary leading-relaxed"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border-glass/60">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-light text-white font-bold text-xs cursor-pointer border-none shadow-sm transition-all"
          >
            {isSubmitting ? 'Publishing Review...' : 'Submit Verified Review'}
          </button>
        </div>
      </form>
    </GlassModal>
  );
}
