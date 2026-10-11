'use client';

import React from 'react';

interface InlineErrorProps {
  error?: string | null;
  className?: string;
  id?: string;
}

/**
 * InlineError: Displays a sleek, contextual error badge directly beneath
 * an action button or an input field.
 */
export default function InlineError({ error, className = '', id }: InlineErrorProps) {
  if (!error) return null;

  return (
    <div
      id={id}
      role="alert"
      className={`flex items-center gap-1.5 text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg mt-1.5 animate-fadeIn ${className}`}
    >
      <svg
        className="w-3.5 h-3.5 shrink-0 text-rose-500"
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
      <span className="leading-tight">{error}</span>
    </div>
  );
}
