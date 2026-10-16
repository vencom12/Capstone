'use client';

import { ReactNode, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
  maxWidth?: string;
  noPadding?: boolean;
  zIndex?: string;
  isDirty?: boolean;
  onDiscard?: () => void;
}

export default function GlassModal({
  isOpen,
  onClose,
  children,
  title,
  className = '',
  maxWidth = 'max-w-[550px]',
  noPadding = false,
  zIndex = 'z-[99999]',
  isDirty,
  onDiscard,
}: GlassModalProps) {
  const [mounted, setMounted] = useState(false);
  const [hasUserTyped, setHasUserTyped] = useState(false);
  const [showDiscardNotice, setShowDiscardNotice] = useState(false);

  // Mark component as mounted on the client side
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset dirty / notice state when modal opens or closes from outside
  useEffect(() => {
    if (isOpen) {
      setHasUserTyped(false);
      setShowDiscardNotice(false);
    }
  }, [isOpen]);

  // Form is considered dirty if:
  // - explicitly flagged via `isDirty` prop (if isDirty === false, never prompt)
  // - OR if an onDiscard handler is supplied and the user has actively typed
  const isFormDirty = isDirty !== undefined 
    ? Boolean(isDirty) 
    : Boolean(onDiscard && hasUserTyped);

  const handleAttemptClose = useCallback(() => {
    if (isFormDirty) {
      setShowDiscardNotice(true);
    } else {
      onClose();
    }
  }, [isFormDirty, onClose]);

  // Close or dismiss notice on Escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardNotice) {
          setShowDiscardNotice(false);
        } else {
          handleAttemptClose();
        }
      }
    },
    [handleAttemptClose, showDiscardNotice]
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

  if (!isOpen || !mounted) return null;

  const handleConfirmDiscard = () => {
    setShowDiscardNotice(false);
    setHasUserTyped(false);
    onDiscard?.();
    onClose();
  };

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndex} overflow-y-auto p-2 sm:p-6 flex min-h-full items-center justify-center bg-black/60 backdrop-blur-md touch-scroll`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (showDiscardNotice) {
            setShowDiscardNotice(false);
          } else {
            handleAttemptClose();
          }
        }
      }}
    >
      <div
        onInput={() => {
          if (!hasUserTyped) setHasUserTyped(true);
        }}
        onChange={() => {
          if (!hasUserTyped) setHasUserTyped(true);
        }}
        className={`
          relative w-full ${maxWidth} my-auto
          flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100vh-3rem)]
          bg-bg-card backdrop-blur-[16px]
          border border-border-glass
          rounded-2xl sm:rounded-xl overflow-hidden
          shadow-2xl
          animate-[modalScaleUp_0.3s_cubic-bezier(0.34,1.56,0.64,1)]
          ${className}
        `}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleAttemptClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-lg
            bg-bg-surface border border-border-glass text-text-dim hover:text-text-main
            flex items-center justify-center cursor-pointer
            transition-all duration-200
            hover:bg-danger/10 hover:text-danger hover:border-danger/30 shrink-0"
          aria-label="Close modal"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {title && (
          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 border-b border-border-glass shrink-0">
            <h2 className="text-base sm:text-lg font-bold text-text-main m-0 pr-8">{title}</h2>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto touch-scroll overscroll-contain ${noPadding ? '' : (title ? 'p-4 sm:p-6 pt-3' : 'p-4 sm:p-6')}`}>
          {children}
        </div>

        {/* Unsaved Changes Confirmation Modal */}
        {showDiscardNotice && (
          <div
            className="absolute inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-[340px] bg-[#12141c]/95 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col items-center text-center animate-[modalScaleUp_0.2s_cubic-bezier(0.16,1,0.3,1)]">
              {/* Refined warning badge */}
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(245,158,11,0.15)] shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>

              <h3 className="text-base font-bold text-text-main m-0 tracking-tight">Discard unsaved changes?</h3>
              <p className="text-xs text-text-dim mt-1.5 mb-5 leading-relaxed">
                You have unsaved entries. Closing now will discard your changes.
              </p>

              <div className="flex items-center gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => setShowDiscardNotice(false)}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold text-text-main bg-white/10 hover:bg-white/15 border border-white/15 transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscard}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 border border-rose-500/30 shadow-[0_4px_14px_rgba(225,29,72,0.35)] transition-all active:scale-95 cursor-pointer"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
