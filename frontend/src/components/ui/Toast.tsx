'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  let counter = 0;

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const iconMap: Record<ToastType, string> = {
    success: '✓',
    error:   '✕',
    info:    'ℹ',
  };
  const colorMap: Record<ToastType, string> = {
    success: 'border-emerald-500/40 bg-emerald-500/10',
    error:   'border-red-500/40 bg-red-500/10',
    info:    'border-indigo-500/40 bg-indigo-500/10',
  };
  const textMap: Record<ToastType, string> = {
    success: 'text-emerald-400',
    error:   'text-red-400',
    info:    'text-indigo-400',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`glass-card border px-4 py-3 flex items-center gap-3 min-w-[280px]
              animate-[slideInRight_0.3s_ease-out] ${colorMap[t.type]}`}
          >
            <span className={`text-lg font-bold ${textMap[t.type]}`}>{iconMap[t.type]}</span>
            <span className="text-sm text-white">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
