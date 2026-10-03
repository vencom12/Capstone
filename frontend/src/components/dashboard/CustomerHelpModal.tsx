'use client';

import React, { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';

interface CustomerHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FAQS = [
  {
    q: 'How does computerized embroidery ordering work?',
    a: 'Computerized embroidery involves 3 stages: (1) Vector Digitizing — converting your artwork or chosen design into machine stitch coordinates, (2) Fabric Hooping & Thread Spooling — calibrating multi-needle industrial embroidery machines with Madeira commercial threads, and (3) Precision Stitching & Quality Inspection.'
  },
  {
    q: 'What is the standard production turnaround time?',
    a: 'Standard catalog and custom embroidery orders are completed within 2 to 3 business days. For bulk orders (schools, corporate uniforms, sports events), production timelines vary depending on stitch count and quantity. You can monitor live milestone updates in your "Tracking" tab.'
  },
  {
    q: 'Where can I pick up my orders in Lucena City?',
    a: 'Store pick-up is available at our flagship studio: Ground Floor, Pacific Mall Lucena, M.L. Tagarao St., Brgy. 3, Lucena City, Quezon 4301. We are open daily from 10:00 AM to 8:00 PM. Present your digital claim slip or Order ID from your dashboard upon arrival.'
  },
  {
    q: 'How does doorstep courier delivery work?',
    a: 'We partner with J&T Express for door-to-door delivery across Quezon Province and nationwide. Once your embroidery passes quality check and is dispatched, you will receive an active J&T tracking number and printable thermal waybill directly in your "Tracking" tab.'
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

export default function CustomerHelpModal({ isOpen, onClose }: CustomerHelpModalProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex(prev => (prev === index ? null : index));
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Studio Help & Customer FAQs"
      maxWidth="max-w-[580px]"
    >
      <div className="flex flex-col gap-4 text-left">
        {/* Studio Info Quick Card */}
        <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-border-glass flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-sm text-text-main">Eds Towels & Caps Studio</span>
            <span className="text-[0.68rem] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold border border-primary/30">
              Pacific Mall Lucena
            </span>
          </div>
          <p className="text-xs text-text-dim m-0 leading-relaxed">
            Ground Floor, Pacific Mall Lucena, M.L. Tagarao St., Lucena City, Quezon 4301
          </p>
          <div className="flex items-center gap-4 text-xs font-semibold text-text-dim border-t border-white/5 pt-2">
            <span className="flex items-center gap-1.5">
              <span>⏰</span> Daily 10:00 AM – 8:00 PM
            </span>
            <a 
              href="tel:09288103928" 
              className="flex items-center gap-1.5 text-primary hover:underline no-underline"
            >
              <span>📞</span> 0928 810 3928
            </a>
          </div>
        </div>

        {/* FAQ Accordion List */}
        <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
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
          <a
            href="tel:09288103928"
            className="flex-1 py-2.5 px-3 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-bold text-xs text-center no-underline transition-all flex items-center justify-center gap-1.5"
          >
            <span>📞</span> Call Studio Support
          </a>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim text-xs font-semibold cursor-pointer transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
