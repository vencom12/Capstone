'use client';

import React, { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';

/**
 * =========================================================================
 * STUDIO BUSINESS SAFEGUARDS & COMMERCIAL TERMS CONFIGURATION
 * =========================================================================
 * You can edit any of the values below to customize your business details,
 * store locations, phone numbers, warranty windows, and storage limits.
 */
export const STUDIO_BUSINESS_SAFEGUARDS = {
  studioName: 'Eds Towels & Caps',
  legalEntity: 'Eds Towels & Caps Embroidery Studio',
  storeAddress: 'Ground Floor, Pacific Mall Lucena, M.L. Tagarao St., Brgy. 3, Lucena City, Quezon 4301',
  operatingHours: 'Open Daily: 10:00 AM – 8:00 PM (Following official Pacific Mall hours)',
  phone: '0928 810 3928',
  gcashAccountName: 'Eds Towels and Caps Embroidery',
  gcashAccountNumber: '0928 810 3928',
  freePickupStorageDays: 30,
  maxArchiveStorageDays: 60,
  errorGuaranteeDays: 7,
  threadStandards: 'Madeira Polyneon & Isacord 40wt Industrial Thread',
  courierPartner: 'J&T Express',
  governingLaws: {
    consumerAct: 'Republic Act No. 7394 (Consumer Act of the Philippines)',
    dataPrivacy: 'Republic Act No. 10173 (Data Privacy Act of 2012)',
    ipCode: 'Republic Act No. 8293 (Intellectual Property Code of the Philippines)',
  },
};

interface TermsAndPoliciesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'refunds' | 'pickup' | 'copyright' | 'colors' | 'privacy';
}

export default function TermsAndPoliciesModal({
  isOpen,
  onClose,
  initialTab = 'refunds',
}: TermsAndPoliciesModalProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const cfg = STUDIO_BUSINESS_SAFEGUARDS;

  const sections = [
    {
      id: 'refunds',
      title: 'Custom Goods & Cancellation Policy',
      badge: 'RA 7394 Compliance',
      content: (
        <div className="flex flex-col gap-3 text-xs sm:text-sm text-text-dim leading-relaxed">
          <p className="text-text-main font-semibold">
            Under the Consumer Act of the Philippines (Republic Act No. 7394), custom-manufactured and personalized items are subject to specific production guidelines:
          </p>
          <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl flex flex-col gap-2">
            <span className="font-bold text-text-main text-xs uppercase tracking-wide">
              1. Non-Cancellable Once Production Begins
            </span>
            <p className="m-0">
              Because embroidery items are permanently stitched with your personalized names, monograms, or custom dimensions, orders cannot be cancelled, modified, or refunded once machine stitching begins (Order Progress ≥ 20%). Cancellations are only permitted while the order is in <strong>&quot;Awaiting Payment&quot;</strong> or <strong>&quot;In Queue&quot;</strong> status.
            </p>
          </div>

          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col gap-1.5 text-emerald-200">
            <span className="font-bold text-emerald-400 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <span>✓</span> 100% Workshop Error Guarantee
            </span>
            <p className="m-0 text-xs">
              If our embroidery workshop makes an error (e.g. misspelled name differing from your confirmed order details, incorrect thread color, or garment defect upon arrival), Eds Towels & Caps guarantees a <strong>100% free re-stitch or complete refund</strong> within 7 calendar days of receipt.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'pickup',
      title: 'Store Pick-up & Counter Claiming',
      badge: 'Pacific Mall Lucena',
      content: (
        <div className="flex flex-col gap-3 text-xs sm:text-sm text-text-dim leading-relaxed">
          <p className="text-text-main font-semibold">
            For customers selecting in-store pick-up at our official store in Pacific Mall Lucena, Quezon:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl">
              <span className="font-bold text-text-main flex items-center gap-1.5 text-xs mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Physical Counter
              </span>
              <p className="m-0 text-xs">
                Ground Floor, Pacific Mall Lucena, M.L. Tagarao St., Brgy. 3, Lucena City, Quezon 4301.
              </p>
            </div>
            <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl">
              <span className="font-bold text-text-main flex items-center gap-1.5 text-xs mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Operating Schedule
              </span>
              <p className="m-0 text-xs">
                Open Daily: 10:00 AM – 8:00 PM (Following official Pacific Mall holiday & operational hours).
              </p>
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col gap-1.5 text-amber-200">
            <span className="font-bold text-amber-400 text-xs uppercase tracking-wide">
              30-Day Free Storage Policy
            </span>
            <p className="m-0 text-xs">
              Finished orders are stored free of charge for <strong>30 calendar days</strong> following ready notification. After 60 days of uncollected storage with unreturned contact attempts, items may be securely archived.
            </p>
          </div>

          <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl">
            <span className="font-bold text-text-main block text-xs mb-1">Authorized Representatives</span>
            <p className="m-0 text-xs">
              If an authorized family member or representative will claim on your behalf, please ensure they bring the digital order ID, claim code (e.g. PU-LUC-...), and a valid government or student ID.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'copyright',
      title: 'Intellectual Property & Artwork Guidelines',
      badge: 'IP & Trademark Rights',
      content: (
        <div className="flex flex-col gap-3 text-xs sm:text-sm text-text-dim leading-relaxed">
          <p className="text-text-main font-semibold">
            Guidelines regarding logos, emblems, school seals, and commercial trademarks:
          </p>
          <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl flex flex-col gap-1.5">
            <span className="font-bold text-text-main text-xs uppercase tracking-wide">
              Customer Representation & Warranty
            </span>
            <p className="m-0 text-xs">
              By uploading artwork, brand marks, or text to Stitch-Opt, you confirm that you own the rights to the design or are authorized by the trademark holder (company, sports club, or educational institution) to commission embroidery reproductions.
            </p>
          </div>

          <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl flex flex-col gap-1.5">
            <span className="font-bold text-text-main text-xs uppercase tracking-wide">
              Right to Decline Prohibited Content
            </span>
            <p className="m-0 text-xs">
              Eds Towels & Caps reserves the right to decline embroidery requests containing defamatory, hate-speech, or unauthorized commercial trademark infringements that violate Philippine intellectual property laws.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'colors',
      title: 'Color & Thread Swatch Calibration',
      badge: 'Material Standards',
      content: (
        <div className="flex flex-col gap-3 text-xs sm:text-sm text-text-dim leading-relaxed">
          <p className="text-text-main font-semibold">
            Understanding digital previews versus physical textile materials:
          </p>
          <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl flex flex-col gap-1.5">
            <span className="font-bold text-text-main text-xs uppercase tracking-wide">
              Display RGB vs. Physical Thread Pigments
            </span>
            <p className="m-0 text-xs">
              Our 3D previews and digital swatches are calibrated to match standard industrial thread palettes (Madeira Polyneon &amp; Isacord 40wt). However, because smartphone OLED displays and computer monitors have varying brightness, true-tone, and saturation settings, physical embroidery thread may show slight natural shade variations under ambient indoor or sunlight conditions.
            </p>
          </div>
          <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl flex flex-col gap-1.5">
            <span className="font-bold text-text-main text-xs uppercase tracking-wide">
              Fabric Texture &amp; Density
            </span>
            <p className="m-0 text-xs">
              Embroidery results naturally vary based on garment pile (e.g. 550 GSM terry cotton towels utilize water-soluble topping stabilizers, while structured chino twill caps utilize high-density buckram).
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'privacy',
      title: 'Data Privacy & Information Security',
      badge: 'RA 10173 Compliance',
      content: (
        <div className="flex flex-col gap-3 text-xs sm:text-sm text-text-dim leading-relaxed">
          <p className="text-text-main font-semibold">
            Commitment to customer privacy under the Philippine Data Privacy Act of 2012:
          </p>
          <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl flex flex-col gap-1.5">
            <span className="font-bold text-text-main text-xs uppercase tracking-wide">
              Purpose-Bound Data Collection
            </span>
            <p className="m-0 text-xs">
              We collect customer mobile numbers, delivery addresses, and payment receipt screenshots solely for order manufacturing, courier fulfillment via J&amp;T Express, and GCash transaction verification.
            </p>
          </div>
          <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl flex flex-col gap-1.5">
            <span className="font-bold text-text-main text-xs uppercase tracking-wide">
              No Third-Party Advertising
            </span>
            <p className="m-0 text-xs">
              Your contact numbers and personal records are never rented, sold, or shared with third-party advertisers. All payment images are stored on secure encrypted servers and accessible only by authorized workshop administrators.
            </p>
          </div>
        </div>
      ),
    },
  ];

  const currentSection = sections.find((s) => s.id === activeTab) || sections[0];

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[720px]" title="Terms & Customer Policies">
      <div className="flex flex-col gap-4 font-sans text-left">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border-glass no-scrollbar">
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveTab(sec.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                activeTab === sec.id
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white/[0.03] text-text-dim border-transparent hover:text-text-main hover:bg-white/5'
              }`}
            >
              {sec.title.split(' ')[0]} {sec.title.split(' ')[1] || ''}
            </button>
          ))}
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <h3 className="text-base sm:text-lg font-black text-text-main m-0">
            {currentSection.title}
          </h3>
          <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-white/10 text-primary font-bold uppercase tracking-wider border border-border-glass shrink-0">
            {currentSection.badge}
          </span>
        </div>

        {/* Content Body */}
        <div className="min-h-[220px] max-h-[380px] overflow-y-auto pr-1">
          {currentSection.content}
        </div>

        {/* Footer Verification Notice */}
        <div className="pt-3 border-t border-border-glass flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-text-dim">
          <span>Eds Towels &amp; Caps Embroidery Studio • Pacific Mall Lucena, Quezon</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-text-main text-xs font-bold cursor-pointer border border-border-glass transition-all"
          >
            I Understand
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
