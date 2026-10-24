'use client';

import GlassModal from '@/components/ui/GlassModal';

interface AddressBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAddress?: (address?: any) => void;
  selectedAddressId?: string;
}

export default function AddressBookModal({
  isOpen,
  onClose,
}: AddressBookModalProps) {
  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Store Pick-up Location"
      maxWidth="max-w-[500px]"
    >
      <div className="flex flex-col gap-4 text-text-main p-1 font-sans">
        {/* Studio Banner Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/25 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary border border-primary/30 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text-main m-0">Eds Towels &amp; Caps Studio</h3>
              <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                Counter Pick-Up
              </span>
            </div>
            <p className="text-xs text-text-dim m-0 leading-relaxed">
              Ground Floor, Pacific Mall Lucena, M.L. Tagarao St., Brgy. 3, Lucena City, Quezon 4301
            </p>
          </div>
        </div>

        {/* Pick-Up Policy Info */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-border-glass flex flex-col gap-3">
          <div className="flex items-center gap-2.5 text-xs text-text-main font-semibold">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary shrink-0">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Operating Hours: Daily, 10:00 AM – 8:00 PM (Pacific Mall Hours)</span>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-text-dim leading-relaxed">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400 shrink-0 mt-0.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>All personalized items and embroidery orders are crafted directly at our Pacific Mall workshop. Home delivery is not required.</span>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-text-dim leading-relaxed">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400 shrink-0 mt-0.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>To claim your order, simply present your digital claim slip or Order ID from your dashboard at our ground floor counter.</span>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 active:scale-[0.99] transition-all cursor-pointer border-none shadow-sm"
        >
          Got it
        </button>
      </div>
    </GlassModal>
  );
}
