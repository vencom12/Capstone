'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const variants = {
  primary: 'bg-primary text-white hover:bg-[#4338ca] shadow-sm hover:shadow-md transition-all',
  secondary: 'bg-bg-surface text-text-main border border-border-glass hover:bg-bg-surface/80',
  ghost: 'text-text-dim hover:text-text-main hover:bg-bg-surface',
  danger: 'bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export default function GlassButton({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}: GlassButtonProps) {
  return (
    <button
      suppressHydrationWarning
      className={`
        inline-flex items-center justify-center gap-2
        font-semibold backdrop-blur-[4px]
        transition-all duration-200 ease-in-out
        cursor-pointer border-none
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
