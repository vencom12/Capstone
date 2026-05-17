'use client';

import { ReactNode, useEffect, useCallback } from 'react';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
  maxWidth?: string;
  noPadding?: boolean;
}

export default function GlassModal({
  isOpen,
  onClose,
  children,
  title,
  className = '',
  maxWidth = 'max-w-[550px]',
  noPadding = false,
}: GlassModalProps) {
  // Close on Escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-[8px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`
          relative w-[95%] ${maxWidth} max-h-[90vh]
          bg-bg-card backdrop-blur-[12px]
          border border-border-glass
          rounded-xl overflow-hidden
          shadow-[0_25px_80px_-12px_rgba(0,0,0,0.6)]
          animate-[modalScaleUp_0.3s_cubic-bezier(0.34,1.56,0.64,1)]
          ${className}
        `}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full
            bg-black/30 border border-border-glass text-white
            flex items-center justify-center cursor-pointer
            transition-all duration-200
            hover:bg-danger/10 hover:text-danger hover:rotate-90"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {title && (
          <div className="px-6 pt-6 pb-3 border-b border-border-glass">
            <h2 className="text-lg font-bold text-text-main m-0">{title}</h2>
          </div>
        )}

        <div className={`overflow-y-auto ${noPadding ? '' : (title ? 'p-6 pt-3' : 'p-6')}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
