'use client';

import React, { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { useAuthStore } from '@/stores/useAuthStore';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface CustomerHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultOrderId?: string;
}

const FAQS = [
  {
    q: 'How does custom embroidery personalization work?',
    a: 'We specialize in direct machine stitching for names, monograms, letters, and custom text onto towels, caps, and garments. You choose your item, type your personalized name or text, pick your thread color and font, and our embroidery machine stitches each letter directly into the fabric with durable, high-quality thread.'
  },
  {
    q: 'What is the standard production turnaround time?',
    a: 'Standard personalized name and text stitching orders are completed within 2 to 3 business days. For bulk orders (schools, sports events, giveaways), turnaround depends on quantity. You can monitor your order progress live in your "Tracking" tab.'
  },
  {
    q: 'Where can I pick up my orders in Lucena City?',
    a: 'Store pick-up is available at our Pacific Mall Lucena branch: Ground Floor, Pacific Mall Lucena, M.L. Tagarao St., Brgy. 3, Lucena City, Quezon 4301. We are open daily from 10:00 AM to 8:00 PM (following Pacific Mall hours). Simply show your Order ID or digital claim code from your dashboard upon claiming.'
  },
  {
    q: 'How does doorstep delivery work?',
    a: 'We partner with J&T Express for door-to-door delivery across Lucena, Quezon Province, and nationwide. Once your personalized stitching is inspected and packed, your live J&T tracking number will appear in your "Tracking" tab.'
  },
  {
    q: 'How do I submit GCash or Maya payments?',
    a: 'During checkout, select your preferred digital payment method (GCash or Maya) and scan the verified merchant QR code. Upload your payment screenshot or input the transaction reference number. Your receipt and official BIR tax invoice will be instantly generated in your dashboard.'
  },
  {
    q: 'How should I care for and wash embroidered towels and caps?',
    a: 'Our industrial embroidery threads are chlorine-resistant and high-tensile. For longest durability: machine wash on cold/gentle cycle with mild detergent, avoid high-heat tumble drying, and do not iron directly on the raised embroidery stitching.'
  }
];

export default function CustomerHelpModal({ isOpen, onClose, defaultOrderId }: CustomerHelpModalProps) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'faqs' | 'feedback'>('faqs');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  // Feedback Form State
  const [rating, setRating] = useState<number>(5);
  const [category, setCategory] = useState<string>('Order Quality');
  const [message, setMessage] = useState<string>('');
  const [orderId, setOrderId] = useState<string>(defaultOrderId || '');
  const [customerName, setCustomerName] = useState<string>(user?.username || '');
  const [customerEmail, setCustomerEmail] = useState<string>(user?.email || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (defaultOrderId) {
      setOrderId(defaultOrderId);
      setActiveTab('feedback');
    }
  }, [defaultOrderId]);

  useEffect(() => {
    if (user) {
      if (!customerName) setCustomerName(user.username || '');
      if (!customerEmail) setCustomerEmail(user.email || '');
    }
  }, [user]);

  const toggleFaq = (index: number) => {
    setOpenIndex(prev => (prev === index ? null : index));
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      showToast('Please enter your feedback comments', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/api/customer/feedback', {
        category,
        rating,
        message: message.trim(),
        orderId: orderId.trim() || undefined,
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined
      });

      showToast('Thank you! Your feedback has been sent directly to our staff.', 'success');
      setMessage('');
      if (!defaultOrderId) setOrderId('');
      setActiveTab('faqs');
      onClose();
    } catch (err: any) {
      console.warn('Feedback submit error:', err);
      showToast(err.message || 'Failed to submit feedback', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={activeTab === 'faqs' ? 'Help & Customer FAQs' : 'Customer Feedback & Reviews'}
      maxWidth="max-w-[580px]"
    >
      <div className="flex flex-col gap-4 text-left">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border-glass gap-2 pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('faqs')}
            className={`pb-2 px-3 text-xs font-bold transition-all cursor-pointer bg-transparent border-none ${
              activeTab === 'faqs'
                ? '!border-b-2 !border-primary text-primary'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            ❓ FAQs & Store Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('feedback')}
            className={`pb-2 px-3 text-xs font-bold transition-all cursor-pointer bg-transparent border-none flex items-center gap-1.5 ${
              activeTab === 'feedback'
                ? '!border-b-2 !border-primary text-primary'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            <span>💬 Send Feedback & Review</span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          </button>
        </div>

        {activeTab === 'faqs' ? (
          <>
            {/* Store Info Quick Card */}
            <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-border-glass flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-text-main">Eds Towels & Caps</span>
                <span className="text-[0.68rem] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold border border-primary/30">
                  Pacific Mall Lucena
                </span>
              </div>
              <p className="text-xs text-text-dim m-0 leading-relaxed">
                Ground Floor, Pacific Mall Lucena, M.L. Tagarao St., Lucena City, Quezon 4301
              </p>
              <div className="flex items-center gap-4 text-xs font-semibold text-text-dim border-t border-white/5 pt-2">
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  Daily 10:00 AM – 8:00 PM (Mall Hours)
                </span>
                <a 
                  href="tel:09288103928" 
                  className="flex items-center gap-1.5 text-primary hover:underline no-underline"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  0928 810 3928
                </a>
              </div>
            </div>

            {/* FAQ Accordion List */}
            <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
              <span className="text-[0.7rem] font-bold uppercase tracking-wider text-text-dim/80 px-1">
                Frequently Asked Questions
              </span>
              {FAQS.map((faq, idx) => {
                const isOpen = openIndex === idx;
                return (
                  <div 
                    key={idx}
                    className="border border-border-glass rounded-xl overflow-hidden bg-bg-surface/50 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      className="w-full p-3 flex justify-between items-center text-left bg-transparent border-none cursor-pointer text-text-main hover:bg-white/[0.02] transition-colors"
                    >
                      <span className="font-bold text-xs sm:text-sm pr-2">{faq.q}</span>
                      <span className={`text-xs text-primary transition-transform duration-200 shrink-0 font-bold ${isOpen ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                    {isOpen && (
                      <div className="p-3 pt-0 text-xs text-text-dim leading-relaxed border-t border-white/5 animate-fade">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Action Footer */}
            <div className="flex gap-2 pt-2 border-t border-border-glass/60">
              <button
                type="button"
                onClick={() => setActiveTab('feedback')}
                className="flex-1 py-2.5 px-3 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-bold text-xs text-center cursor-pointer transition-all flex items-center justify-center gap-1.5"
              >
                <span>💬</span>
                Leave Feedback / Inquire
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim text-xs font-semibold cursor-pointer transition-all"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          /* Feedback Submission Form */
          <form onSubmit={handleSubmitFeedback} className="flex flex-col gap-3.5 animate-fade">
            <p className="text-xs text-text-dim m-0 leading-relaxed">
              Your feedback is shared directly with our embroidery operators and workshop staff to help us continually improve your orders.
            </p>

            {/* Rating Stars Picker */}
            <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1.5">
              <span className="text-xs font-bold text-text-main">Overall Experience & Quality Rating</span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="text-2xl p-1 bg-transparent border-0 cursor-pointer hover:scale-110 transition-transform"
                    title={`${star} star(s)`}
                  >
                    <span className={star <= rating ? 'text-amber-400 drop-shadow-sm' : 'text-white/20'}>
                      ★
                    </span>
                  </button>
                ))}
                <span className="text-xs font-mono font-bold text-primary ml-2">
                  {rating === 5 ? '5.0 — Excellent' : rating === 4 ? '4.0 — Good' : rating === 3 ? '3.0 — Average' : `${rating}.0 — Needs Attention`}
                </span>
              </div>
            </div>

            {/* Category & Order ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-dim">Feedback Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none cursor-pointer"
                >
                  <option value="Order Quality">Order Quality & Finishing</option>
                  <option value="Embroidery Stitching">Embroidery Stitching & Thread</option>
                  <option value="Turnaround & Delivery">Turnaround & Delivery Speed</option>
                  <option value="Customer Support">Staff & Storefront Support</option>
                  <option value="General">General Feedback / Inquiries</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-dim">Order ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. ORD-2026-1001"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs font-mono outline-none"
                />
              </div>
            </div>

            {/* Name & Email (optional for guests, prefilled for logged in) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-dim">Your Name</label>
                <input
                  type="text"
                  placeholder="e.g. Maria Santos"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-dim">Email or Phone (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. maria@gmail.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none"
                />
              </div>
            </div>

            {/* Message Comment */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-dim">Comments & Suggestions *</label>
              <textarea
                required
                rows={3}
                placeholder="Share your experience with the personalized stitching, fabric quality, packaging, or customer service..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-xs outline-none focus:border-primary leading-relaxed"
              />
            </div>

            {/* Form Footer */}
            <div className="flex gap-2 pt-2 border-t border-border-glass/60">
              <button
                type="button"
                onClick={() => setActiveTab('faqs')}
                className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim text-xs font-semibold cursor-pointer"
              >
                ← Back to FAQs
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-light text-white font-bold text-xs cursor-pointer border-none shadow-sm transition-all"
              >
                {isSubmitting ? 'Sending to Staff...' : 'Submit Feedback to Workshop →'}
              </button>
            </div>
          </form>
        )}
      </div>
    </GlassModal>
  );
}
