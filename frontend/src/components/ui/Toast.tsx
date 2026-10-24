'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastMessage {
  id: number;
  title?: string;
  message: string;
  type: ToastType;
  toastKey?: string;
}

export interface ToastOptions {
  title?: string;
  message: string;
  type?: ToastType;
  toastKey?: string;
}

let toastId = 0;
const listeners: Set<(toast: ToastMessage) => void> = new Set();
const recentToasts = new Map<string, number>();

/**
 * Global toast function — can be called from anywhere.
 * Supports:
 *   showToast('Simple message', 'success')
 *   showToast({ title: 'Validation Alert', message: 'Please check your input', type: 'warning' })
 */
export function showToast(
  messageOrOptions: string | ToastOptions,
  type: ToastType = 'info',
  toastKey?: string
) {
  const now = Date.now();

  // Cleanup old dedupe keys (older than 1.5s)
  recentToasts.forEach((timestamp, key) => {
    if (now - timestamp > 1500) {
      recentToasts.delete(key);
    }
  });

  let message = '';
  let title: string | undefined;
  let resolvedType: ToastType = type;
  let resolvedKey = toastKey;

  if (typeof messageOrOptions === 'object') {
    message = messageOrOptions.message;
    title = messageOrOptions.title;
    resolvedType = messageOrOptions.type || 'info';
    resolvedKey = messageOrOptions.toastKey || resolvedKey;
  } else {
    message = messageOrOptions;
  }

  const dedupeKey = resolvedKey || `${title || ''}-${message}`;

  if (recentToasts.has(dedupeKey)) {
    return; // Suppress duplicate within 1.5s
  }

  recentToasts.set(dedupeKey, now);

  const toast: ToastMessage = {
    id: ++toastId,
    title,
    message,
    type: resolvedType,
    toastKey: resolvedKey,
  };

  listeners.forEach((listener) => listener(toast));
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    };

    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[100020] flex flex-col items-center gap-2.5 pointer-events-none w-full max-w-md px-4"
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            role="status"
            className="
              pointer-events-auto flex items-center justify-between gap-3 w-full
              px-4 py-3 rounded-xl text-xs
              bg-[#12151b] border border-white/10 text-white shadow-xl shadow-black/60
              transition-all duration-200 animate-fadeIn
            "
          >
            {/* Status Vector Icon Badge */}
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                isSuccess
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : isError
                  ? 'bg-rose-500/15 text-rose-400'
                  : isWarning
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-sky-500/15 text-sky-400'
              }`}
            >
              {isSuccess && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {isError && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              {isWarning && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
              {!isSuccess && !isError && !isWarning && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              )}
            </div>

            {/* Notification Content */}
            <div className="flex-1 min-w-0 pr-1 text-left">
              {toast.title && (
                <h4 className="font-bold text-xs text-text-main m-0 mb-0.5 tracking-tight">
                  {toast.title}
                </h4>
              )}
              <p className="m-0 text-[0.75rem] font-medium leading-relaxed text-zinc-300 break-words">
                {toast.message}
              </p>
            </div>

            {/* Close / Dismiss Action */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
              }}
              className="text-text-dim hover:text-text-main p-1 rounded-lg hover:bg-white/10 active:scale-95 transition shrink-0 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
