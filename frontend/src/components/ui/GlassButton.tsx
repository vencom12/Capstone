'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const variants = {
  primary: 'bg-primary text-white hover:bg-[#4f46e5] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)]',
  secondary: 'bg-white/5 text-text-main border border-border-glass hover:bg-white/10',
  ghost: 'text-text-dim hover:text-text-main hover:bg-white/5',
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
