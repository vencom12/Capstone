'use client';

import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[] | string[];
  className?: string;
  cols?: 1 | 2;
  placeholder?: string;
}

export default function GlassSelect({ 
  value, 
  onChange, 
  options, 
  className = '', 
  cols = 1,
  placeholder = 'Select...'
}: GlassSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [placementY, setPlacementY] = useState<'top' | 'bottom'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize options array structure
  const normalizedOptions: Option[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value) || normalizedOptions[0];

  // Viewport boundary collision check
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;

      if (spaceBelow < 250 && rect.top > 250) {
        setPlacementY('top');
      } else {
        setPlacementY('bottom');
      }
    }
  }, [isOpen]);

  // Click outside handler to dismiss dropdown options
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full font-sans" ref={containerRef}>
      {/* Dropdown Button Trigger */}
      <button
        type="button"
        suppressHydrationWarning
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none cursor-pointer hover:border-primary/40 focus:border-primary hover:shadow-[0_0_12px_rgba(99,102,241,0.15)] transition-all ${className}`}
      >
        <span className="font-medium text-text-main truncate">{selectedOption?.label || placeholder}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`text-text-dim shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Popover Options Menu */}
      {isOpen && (
        <div 
          className={`absolute left-0 right-0 bg-bg-card/95 backdrop-blur-[25px] border border-border-glass rounded-2xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[999] max-h-[250px] overflow-y-auto animate-[fadeIn_0.12s_ease-out] ${
            placementY === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <div className={`grid gap-1 ${
            cols === 2 ? 'grid-cols-2' : 'grid-cols-1'
          }`}>
            {normalizedOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  suppressHydrationWarning
                  onClick={() => handleSelect(opt.value)}
                  className={`
                    w-full text-left px-3 py-2 text-[0.82rem] font-medium rounded-xl transition-all cursor-pointer border-none bg-transparent block truncate
                    ${isSelected ? 'bg-primary text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.35)]' : 'text-text-main hover:bg-white/10 hover:text-white'}
                  `}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
