'use client';

import { useEffect, useState } from 'react';

interface ToastMessage {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
  toastKey?: string;
}

let toastId = 0;
const listeners: Set<(toast: ToastMessage) => void> = new Set();
const recentToasts = new Map<string, number>();

// Global toast function — can be called from anywhere
export function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', toastKey?: string) {
  const now = Date.now();
  
  // Cleanup old keys (older than 1.5s) to prevent memory leak
  recentToasts.forEach((timestamp, key) => {
    if (now - timestamp > 1500) {
      recentToasts.delete(key);
    }
  });

  // Use the provided key, or fallback to the exact message for deduplication
  const dedupeKey = toastKey || message;

  if (recentToasts.has(dedupeKey)) {
    return; // Suppress duplicate
  }

  recentToasts.set(dedupeKey, now);

  const toast: ToastMessage = { id: ++toastId, message, type, toastKey };
  listeners.forEach((listener) => listener(toast));
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    };

    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100000] flex flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            px-6 py-3 rounded-xl text-sm font-medium
            bg-bg-card backdrop-blur-[12px]
            border border-border-glass text-text-main
            shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1)]
            animate-[fadeIn_0.3s_ease-out]
            ${toast.type === 'success' ? 'border-l-4 border-l-success' : ''}
            ${toast.type === 'error' ? 'border-l-4 border-l-danger' : ''}
            ${toast.type === 'info' ? 'border-l-4 border-l-primary' : ''}
          `}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
