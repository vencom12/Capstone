'use client';
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className = '', hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`glass-card p-6 transition-all duration-300
        ${hover ? 'hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)] cursor-pointer' : ''}
        ${className}`}
    >
      {children}
    </div>
  );
}
