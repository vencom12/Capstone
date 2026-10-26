'use client';

import React from 'react';

interface InlineErrorProps {
  error?: string | null;
  message?: string | null;
  variant?: 'banner' | 'field' | 'label';
  className?: string;
  id?: string;
}

/**
 * InlineError: Displays a sleek, contextual error badge.
 * Supports:
 * - 'label': Zero-layout-shift error placed directly on the right side of the label row.
 * - 'field': Micro input feedback beneath an input.
 * - 'banner': Prominent alert card for form-level notices.
 */
export default function InlineError({
  error,
  message,
  variant = 'banner',
  className = '',
  id,
}: InlineErrorProps) {
  const text = error || message;
  if (!text) return null;

  if (variant === 'label') {
    return (
      <span
        id={id}
        role="alert"
        title={text}
        className={`inline-flex items-center gap-1 text-[0.72rem] font-semibold text-rose-400 animate-fadeIn select-none leading-none whitespace-nowrap shrink min-w-0 text-right ${className}`}
      >
        <svg
          className="w-3 h-3 shrink-0 text-rose-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="truncate whitespace-nowrap max-w-[210px] sm:max-w-[280px]">{text}</span>
      </span>
    );
  }

  if (variant === 'field') {
    return (
      <div
        id={id}
        role="alert"
        className={`flex items-center gap-1.5 text-[0.72rem] font-medium text-rose-400 mt-1 animate-fadeIn ${className}`}
      >
        <svg
          className="w-3.5 h-3.5 shrink-0 text-rose-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="leading-tight">{text}</span>
      </div>
    );
  }

  return (
    <div
      id={id}
      role="alert"
      className={`flex items-center gap-2 text-xs font-medium text-rose-300 bg-rose-500/10 border border-rose-500/25 py-2 px-3 rounded-lg mt-1.5 animate-fadeIn ${className}`}
    >
      <svg
        className="w-3.5 h-3.5 shrink-0 text-rose-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="leading-snug flex-1 min-w-0">{text}</span>
    </div>
  );
}
