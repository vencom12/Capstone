'use client';

import React from 'react';

interface ProductImagePlaceholderProps {
  name?: string;
  tag?: string;
  size?: 'card' | 'modal' | 'thumb';
  className?: string;
}

export default function ProductImagePlaceholder({
  name = '',
  tag = '',
  size = 'card',
  className = '',
}: ProductImagePlaceholderProps) {
  const combinedText = `${name} ${tag}`.toLowerCase();

  // Category determination
  let category: 'cap' | 'towel' | 'fan' | 'embroidery' = 'embroidery';
  if (/hat|cap|snapback|beanie/i.test(combinedText)) {
    category = 'cap';
  } else if (/towel|bath|face|linen|handkerchief|hanky/i.test(combinedText)) {
    category = 'towel';
  } else if (/fan/i.test(combinedText)) {
    category = 'fan';
  }

  const tagLabel = tag ? tag.toUpperCase() : category.toUpperCase();

  // Thumb view (e.g. cart, order list, live search dropdown)
  if (size === 'thumb') {
    return (
      <div
        className={`w-full h-full relative overflow-hidden bg-gradient-to-br from-bg-surface via-bg-card to-bg-surface flex items-center justify-center select-none ${className}`}
        title={name || 'Embroidery Item'}
      >
        <svg
          className="w-5 h-5 text-primary/70 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {category === 'cap' ? (
            <>
              <path d="M4 14a8 8 0 0 1 16 0v2H4v-2z" />
              <path d="M2 16c2 0 5 1.5 7 1.5h8c3 0 5-1.5 5-1.5" />
            </>
          ) : category === 'towel' ? (
            <>
              <rect x="5" y="14" width="14" height="6" rx="2" />
              <path d="M5 12a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2H5v-2z" />
              <path d="M12 17h.01" />
            </>
          ) : category === 'fan' ? (
            <>
              <path d="M4 18C5 10 10 5 18 4" />
              <path d="M6 20C14 19 19 14 20 6" />
              <circle cx="5" cy="19" r="1.5" fill="currentColor" />
            </>
          ) : (
            <>
              <circle cx="12" cy="13" r="8" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="10" y1="3" x2="14" y2="3" />
              <line x1="7" y1="9" x2="17" y2="17" strokeDasharray="1.5 1.5" />
            </>
          )}
        </svg>
      </div>
    );
  }

  // Modal view (rich full height presentation)
  if (size === 'modal') {
    return (
      <div
        className={`w-full h-full relative overflow-hidden bg-gradient-to-b from-[#0f1422] via-[#0b0e17] to-[#070a10] flex flex-col items-center justify-center p-6 text-center select-none ${className}`}
      >
        {/* Subtle Linen Weave Grid Overlay */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06] text-white"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="modal-linen-weave" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 0 10 L 20 10 M 10 0 L 10 20" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#modal-linen-weave)" />
        </svg>

        {/* Ambient Subtle Radial Glow */}
        <div className="absolute w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none -translate-y-8" />

        {/* Crisp Center Emblem */}
        <div className="relative z-10 flex flex-col items-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-white/[0.04] border border-border-glass shadow-xl flex items-center justify-center text-primary backdrop-blur-md mb-4 transition-transform duration-300 hover:scale-105">
            {category === 'cap' ? (
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                <path d="M8 28c0-8.837 7.163-16 16-16s16 7.163 16 16v4H8v-4z" />
                <path d="M4 32c4 0 10 3 14 3h16c6 0 10-3 10-3" />
                <circle cx="24" cy="12" r="1.5" fill="currentColor" />
                <path d="M24 13.5v18.5" strokeDasharray="2 2" strokeWidth="1.5" />
                <path d="M16 16c4 4 6 10 6 16" strokeDasharray="2 2" strokeWidth="1.5" />
                <path d="M32 16c-4 4-6 10-6 16" strokeDasharray="2 2" strokeWidth="1.5" />
              </svg>
            ) : category === 'towel' ? (
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                <rect x="10" y="28" width="28" height="10" rx="3" />
                <path d="M10 24c0-2.2 1.8-4 4-4h20c2.2 0 4 1.8 4 4v4H10v-4z" />
                <path d="M14 16c0-2.2 1.8-4 4-4h12c2.2 0 4 1.8 4 4v4H14v-4z" />
                <path d="M22 33h4" strokeWidth="2" />
                <path d="M24 31v4" strokeWidth="2" />
                <circle cx="24" cy="33" r="2.5" strokeDasharray="1.5 1.5" strokeWidth="1.2" />
              </svg>
            ) : category === 'fan' ? (
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                <path d="M8 36C10 20 20 10 36 8" />
                <path d="M12 40C28 38 38 28 40 12" />
                <path d="M8 36L40 12" strokeDasharray="2 2" />
                <path d="M10 42l2-2" strokeWidth="3" />
                <circle cx="10" cy="42" r="2" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
                <circle cx="24" cy="25" r="16" strokeWidth="2" />
                <circle cx="24" cy="25" r="13.5" strokeWidth="1.2" strokeDasharray="3 2" className="opacity-60" />
                <rect x="21" y="5" width="6" height="4" rx="1" />
                <line x1="20" y1="7" x2="28" y2="7" />
                <line x1="14" y1="18" x2="33" y2="33" strokeWidth="2" />
                <circle cx="15.5" cy="19.5" r="1" fill="currentColor" />
              </svg>
            )}
          </div>

          <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold uppercase tracking-wider mb-2">
            {tagLabel} Atelier Blank
          </span>

          <h3 className="text-base font-semibold text-text-main m-0">
            Custom Embroidery Design
          </h3>

          <p className="mt-1.5 text-xs text-text-dim leading-relaxed">
            Direct atelier stitch preview. Personalize with your choice of thread colors, custom text, and placement in the configuration panel.
          </p>
        </div>
      </div>
    );
  }

  // Card view (default, used in storefront product cards)
  return (
    <div
      className={`w-full h-full relative overflow-hidden bg-gradient-to-b from-[#111624] via-[#0c101a] to-[#080b12] flex flex-col items-center justify-center p-4 text-center select-none ${className}`}
    >
      {/* Subtle Linen Weave Grid Overlay */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06] text-white"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`card-linen-weave-${name}`} width="18" height="18" patternUnits="userSpaceOnUse">
            <path d="M 0 9 L 18 9 M 9 0 L 9 18" fill="none" stroke="currentColor" strokeWidth="0.7" strokeDasharray="2 2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#card-linen-weave-${name})`} />
      </svg>

      {/* Subtle Center Glow */}
      <div className="absolute w-36 h-36 rounded-full bg-primary/10 blur-2xl pointer-events-none -translate-y-4" />

      {/* Crisp Center Vector Emblem */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-border-glass shadow-inner flex items-center justify-center text-primary/80 group-hover:scale-105 group-hover:border-primary/40 group-hover:text-primary transition-all duration-300">
          {category === 'cap' ? (
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <path d="M8 28c0-8.837 7.163-16 16-16s16 7.163 16 16v4H8v-4z" />
              <path d="M4 32c4 0 10 3 14 3h16c6 0 10-3 10-3" />
              <circle cx="24" cy="12" r="1.5" fill="currentColor" />
              <path d="M24 13.5v18.5" strokeDasharray="2 2" strokeWidth="1.5" />
              <path d="M16 16c4 4 6 10 6 16" strokeDasharray="2 2" strokeWidth="1.5" />
              <path d="M32 16c-4 4-6 10-6 16" strokeDasharray="2 2" strokeWidth="1.5" />
            </svg>
          ) : category === 'towel' ? (
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <rect x="10" y="28" width="28" height="10" rx="3" />
              <path d="M10 24c0-2.2 1.8-4 4-4h20c2.2 0 4 1.8 4 4v4H10v-4z" />
              <path d="M14 16c0-2.2 1.8-4 4-4h12c2.2 0 4 1.8 4 4v4H14v-4z" />
              <path d="M22 33h4" strokeWidth="2" />
              <path d="M24 31v4" strokeWidth="2" />
              <circle cx="24" cy="33" r="2.5" strokeDasharray="1.5 1.5" strokeWidth="1.2" />
            </svg>
          ) : category === 'fan' ? (
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <path d="M8 36C10 20 20 10 36 8" />
              <path d="M12 40C28 38 38 28 40 12" />
              <path d="M8 36L40 12" strokeDasharray="2 2" />
              <path d="M10 42l2-2" strokeWidth="3" />
              <circle cx="10" cy="42" r="2" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <circle cx="24" cy="25" r="16" strokeWidth="2" />
              <circle cx="24" cy="25" r="13.5" strokeWidth="1.2" strokeDasharray="3 2" className="opacity-60" />
              <rect x="21" y="5" width="6" height="4" rx="1" />
              <line x1="20" y1="7" x2="28" y2="7" />
              <line x1="14" y1="18" x2="33" y2="33" strokeWidth="2" />
              <circle cx="15.5" cy="19.5" r="1" fill="currentColor" />
            </svg>
          )}
        </div>

        <span className="mt-2.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-border-glass text-[9px] font-bold uppercase tracking-wider text-text-muted">
          {tagLabel}
        </span>

        <span className="mt-1 text-[11px] font-medium text-text-dim/80 tracking-wide">
          Custom Made to Order
        </span>
      </div>
    </div>
  );
}
