'use client';

import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
  toastKey?: string;
}

let toastId = 0;
const listeners: Set<(toast: ToastMessage) => void> = new Set();
const targetedListeners: Map<string, Set<(message: string | null) => void>> = new Map();
const recentToasts = new Map<string, number>();

/**
 * Global toast function — can be called from anywhere.
 * If toastKey is provided, both the global notification and any matching inline components receive it.
 */
export function showToast(
  message: string,
  type: 'info' | 'success' | 'error' = 'info',
  toastKey?: string
) {
  const now = Date.now();

  // Cleanup old keys (older than 1.5s) to prevent memory leak
  recentToasts.forEach((timestamp, key) => {
    if (now - timestamp > 1500) {
      recentToasts.delete(key);
    }
  });

  const dedupeKey = toastKey || message;

  if (recentToasts.has(dedupeKey)) {
    return; // Suppress duplicate within 1.5s
  }

  recentToasts.set(dedupeKey, now);

  const toast: ToastMessage = { id: ++toastId, message, type, toastKey };
  listeners.forEach((listener) => listener(toast));

  // If a targetKey is specified, also notify any listening inline components
  if (toastKey && targetedListeners.has(toastKey)) {
    targetedListeners.get(toastKey)?.forEach((cb) => cb(message));
  }
}

/**
 * Hook to automatically receive errors targeted for a specific button or input
 */
export function useTargetedNotification(targetKey: string) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetKey) return;
    if (!targetedListeners.has(targetKey)) {
      targetedListeners.set(targetKey, new Set());
    }
    const set = targetedListeners.get(targetKey)!;
    const handler = (msg: string | null) => {
      setError(msg);
    };
    set.add(handler);

    return () => {
      set.delete(handler);
      if (set.size === 0) {
        targetedListeners.delete(targetKey);
      }
    };
  }, [targetKey]);

  const clearError = () => setError(null);

  return { error, setError, clearError };
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4500);
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
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[100000] flex flex-col items-center gap-2 pointer-events-none w-full max-w-md px-4"
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className={`
              pointer-events-auto flex items-center justify-between gap-3 w-full
              px-4 py-3 rounded-xl text-sm font-medium
              bg-bg-surface/95 backdrop-blur-xl border shadow-2xl
              transition-all duration-300 animate-slideDown
              ${
                isSuccess
                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20'
                  : isError
                  ? 'border-rose-500/30 text-rose-400 bg-rose-950/20'
                  : 'border-sky-500/30 text-sky-300 bg-sky-950/20'
              }
            `}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {isSuccess ? (
                <svg
                  className="w-4 h-4 shrink-0 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : isError ? (
                <svg
                  className="w-4 h-4 shrink-0 text-rose-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4 shrink-0 text-sky-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
              <span className="truncate text-xs font-semibold leading-relaxed text-text-main">
                {toast.message}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-text-dim hover:text-text-main p-1 rounded-md transition shrink-0"
              aria-label="Dismiss notification"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
