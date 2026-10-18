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
    q: 'What is the production turnaround time?',
    a: 'Personalized name and text stitching orders are crafted on the same day at our Pacific Mall studio, typically within 15 to 45 minutes depending on the current machine queue. For bulk orders (schools, corporate giveaways, sports events), turnaround depends on item quantity. You can track your real-time queue progress live in your Order Tracking & Details modal.'
  },
  {
    q: 'Where can I pick up my orders in Lucena City?',
    a: 'Store pick-up is available at our Pacific Mall Lucena branch: Ground Floor, Pacific Mall Lucena, M.L. Tagarao St., Brgy. 3, Lucena City, Quezon 4301. We are open daily from 10:00 AM to 8:00 PM (following Pacific Mall hours). Simply show your Order ID or digital claim code from your dashboard upon claiming.'
  },
  {
    q: 'What do I need to present when picking up my order?',
    a: 'Simply present your digital claim slip, QR code, or Order ID (e.g. #ORD-XXXX) at our counter located on the Ground Floor of Pacific Mall Lucena City. Our counter team will verify your claim code and release your custom-embroidered items.'
  },
  {
    q: 'How do I submit GCash or Maya payments?',
    a: 'During checkout, select your preferred digital payment method (GCash or Maya) and scan the verified merchant QR code. Upload your payment screenshot or input the transaction reference number. Your receipt will be instantly generated in your dashboard.'
  },
  {
    q: 'How should I care for and wash embroidered towels and caps?',
    a: 'Our industrial embroidery threads are chlorine-resistant and high-tensile. For longest durability: machine wash on cold/gentle cycle with mild detergent, avoid high-heat tumble drying, and do not iron directly on the raised embroidery stitching.'
  },
  {
    q: 'Can I cancel my order? What is the cancellation procedure?',
    a: 'Because items are custom-embroidered, cancellations follow a two-stage procedure: (1) While In Queue (Step 1): If machine stitching has not yet started, submit a request via the "Contact Workshop" tab with your Order ID, or visit our Pacific Mall Lucena ground floor counter. Our studio staff will verify your GCash payment reference to process your manual refund. (2) In Production (Step 2+): Once garment hooping and machine stitching are underway (Preparing Order), the order can no longer be cancelled.'
  }
];

export default function CustomerHelpModal({ isOpen, onClose, defaultOrderId, defaultCategory }: CustomerHelpModalProps & { defaultCategory?: string }) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'faqs' | 'feedback'>('faqs');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  // Feedback Form State
  const [rating, setRating] = useState<number>(5);
  const [category, setCategory] = useState<string>(defaultCategory || 'Order Quality');
  const [message, setMessage] = useState<string>('');
  const [orderId, setOrderId] = useState<string>(defaultOrderId || '');
  const [customerName, setCustomerName] = useState<string>(user?.username || '');
  const [customerEmail, setCustomerEmail] = useState<string>(user?.email || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (defaultOrderId) {
      setOrderId(defaultOrderId);
      setActiveTab('feedback');
      if (defaultCategory) setCategory(defaultCategory);
    }
  }, [defaultOrderId, defaultCategory]);

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
      showToast('Please enter your inquiry details', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/api/customer/feedback', {
        category,
        rating: 5,
        message: message.trim(),
        orderId: orderId.trim() || undefined,
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined
      });

      showToast('Inquiry sent! Our Pacific Mall workshop staff will review your message.', 'success');
      setMessage('');
      if (!defaultOrderId) setOrderId('');
      setActiveTab('faqs');
      onClose();
    } catch (err: any) {
      console.warn('Inquiry submit error:', err);
      showToast(err.message || 'Failed to submit inquiry', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={activeTab === 'faqs' ? 'Help & Customer FAQs' : 'Workshop Support & Inquiries'}
      maxWidth="max-w-[620px]"
    >
      <div className="flex flex-col gap-4 text-left">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border-glass gap-2 pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('faqs')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all cursor-pointer bg-transparent border-none ${
              activeTab === 'faqs'
                ? '!border-b-2 !border-primary text-primary'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            FAQs & Store Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('feedback')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all cursor-pointer bg-transparent border-none flex items-center gap-1.5 ${
              activeTab === 'feedback'
                ? '!border-b-2 !border-primary text-primary'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            <span>Contact Workshop & Inquire</span>
          </button>
        </div>

        {activeTab === 'faqs' ? (
          <>
            {/* Store Info Quick Card */}
            <div className="p-4 rounded-xl bg-white/[0.04] border border-border-glass flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-text-main">Eds Towels & Caps</span>
                <span className="text-[0.68rem] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold border border-primary/30">
                  Pacific Mall Lucena
                </span>
              </div>
              <p className="text-xs text-text-dim m-0 leading-relaxed">
                Ground Floor, Pacific Mall Lucena, M.L. Tagarao St., Lucena City, Quezon 4301
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-text-dim border-t border-white/5 pt-2">
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  Daily 10:00 AM – 8:00 PM (Mall Hours)
                </span>
                <span className="text-[11px] text-text-dim/80">
                  For inquiries, use the message form tab above
                </span>
              </div>
            </div>

            {/* FAQ Accordion List - Single natural scroll container via GlassModal */}
            <div className="flex flex-col gap-2.5 pb-4">
              <span className="text-[0.7rem] font-bold uppercase tracking-wider text-text-dim/80 px-1">
                Frequently Asked Questions
              </span>
              {FAQS.map((faq, idx) => {
                const isOpen = openIndex === idx;
                return (
                  <div 
                    key={idx}
                    className="border border-border-glass rounded-xl overflow-hidden bg-bg-surface/50 transition-colors shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      className="w-full p-4 flex justify-between items-center text-left bg-transparent border-none cursor-pointer text-text-main hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="font-bold text-xs sm:text-sm pr-3 leading-snug">{faq.q}</span>
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`text-primary transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div 
                        className="px-4 pt-3 text-xs sm:text-[0.84rem] text-text-dim/95 border-t border-white/5 select-text"
                        style={{ paddingBottom: '1.75rem', lineHeight: '1.65' }}
                      >
                        <p className="m-0 p-0 block leading-relaxed">{faq.a}</p>
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
                className="flex-1 py-2.5 px-3 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-bold text-xs text-center cursor-pointer transition-all flex items-center justify-center gap-1.5"
              >
                <span>Have a Question? Contact Staff</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim text-xs font-semibold cursor-pointer transition-all"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          /* Workshop Inquiry & Support Form */
          <form onSubmit={handleSubmitFeedback} className="flex flex-col gap-3.5 animate-fade">
            <p className="text-xs text-text-dim m-0 leading-relaxed">
              Send a direct inquiry to our Pacific Mall workshop operators regarding custom text embroidery, rush turnaround, store pick-up, or active orders.
            </p>

            {/* Category & Order ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-dim">Inquiry Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-2.5 rounded-lg text-text-main text-xs outline-none cursor-pointer"
                >
                  <option value="Custom Embroidery Inquiry">Custom Embroidery & Personalization</option>
                  <option value="Rush Production">Rush Production & Turnaround</option>
                  <option value="Store Pick-up">Store Pick-up & Claiming (Pacific Mall)</option>
                  <option value="Order Cancellation & Refund">Order Cancellation & Refund Request</option>
                  <option value="Order Issue">Order Modification or Issue</option>
                  <option value="General Inquiry">General Workshop Inquiry</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-dim">Order ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. ORD-2026-1001"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-2.5 rounded-lg text-text-main text-xs font-mono outline-none"
                />
              </div>
            </div>

            {/* Guest Only: Name & Email inputs (logged-in users are automatically authenticated via session) */}
            {!user && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-dim">Your Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Maria Santos"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="bg-bg-surface border border-border-glass p-2.5 rounded-lg text-text-main text-xs outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-text-dim">Contact Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. maria@gmail.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="bg-bg-surface border border-border-glass p-2.5 rounded-lg text-text-main text-xs outline-none"
                  />
                </div>
              </div>
            )}

            {/* Message Comment */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-dim">Message Details *</label>
              <textarea
                required
                rows={4}
                placeholder="Describe your custom embroidery requirements, questions, or order instructions in detail..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-lg text-text-main text-xs outline-none focus:border-primary leading-relaxed"
              />
            </div>

            {/* Form Footer */}
            <div className="flex gap-2 pt-2 border-t border-border-glass/60">
              <button
                type="button"
                onClick={() => setActiveTab('faqs')}
                className="py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim text-xs font-semibold cursor-pointer"
              >
                Back to FAQs
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-light text-white font-bold text-xs cursor-pointer border-none shadow-sm transition-all"
              >
                {isSubmitting ? 'Sending Message...' : 'Send Inquiry to Workshop'}
              </button>
            </div>
          </form>
        )}
      </div>
    </GlassModal>
  );
}
