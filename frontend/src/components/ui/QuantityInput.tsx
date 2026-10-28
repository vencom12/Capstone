'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showPresets?: boolean;
  presets?: number[];
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  ariaLabel?: string;
  name?: string;
  id?: string;
  onMaxExceeded?: (max: number) => void;
}

export default function QuantityInput({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  size = 'md',
  showPresets = false,
  presets = [10, 25, 50, 100],
  className = '',
  inputClassName = '',
  buttonClassName = '',
  ariaLabel = 'Quantity',
  name,
  id,
  onMaxExceeded,
}: QuantityInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(String(value || min));
  const isFocusedRef = useRef(false);

  // Sync external value when not focused or when prop changes externally
  useEffect(() => {
    if (!isFocusedRef.current) {
      setDisplayValue(String(value ?? min));
    }
  }, [value, min]);

  const commitValue = (raw: string) => {
    let parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed < min) {
      parsed = min;
    } else if (max !== undefined && max > 0 && parsed > max) {
      parsed = max;
      onMaxExceeded?.(max);
    }
    setDisplayValue(String(parsed));
    onChange(parsed);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const cleanDigits = e.target.value.replace(/\D/g, '');

    // Allow user to clear input while typing multi-digit numbers
    if (cleanDigits === '') {
      setDisplayValue('');
      return;
    }

    const parsed = parseInt(cleanDigits, 10);
    if (max !== undefined && max > 0 && parsed > max) {
      setDisplayValue(String(max));
      onChange(max);
      onMaxExceeded?.(max);
      return;
    }

    setDisplayValue(cleanDigits);
    if (parsed >= min) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    commitValue(displayValue);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    e.target.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDecrement();
    }
  };

  const handleDecrement = () => {
    if (disabled) return;
    const current = parseInt(displayValue, 10) || value || min;
    const next = Math.max(min, current - 1);
    setDisplayValue(String(next));
    onChange(next);
  };

  const handleIncrement = () => {
    if (disabled) return;
    const current = parseInt(displayValue, 10) || value || min;
    if (max !== undefined && max > 0 && current >= max) {
      onMaxExceeded?.(max);
      return;
    }
    const next = max !== undefined && max > 0 ? Math.min(max, current + 1) : current + 1;
    setDisplayValue(String(next));
    onChange(next);
  };

  const handlePresetAdd = (amount: number) => {
    if (disabled) return;
    const current = parseInt(displayValue, 10) || value || min;
    const target = current + amount;
    const next = max !== undefined && max > 0 ? Math.min(max, target) : target;
    if (max !== undefined && max > 0 && target > max) {
      onMaxExceeded?.(max);
    }
    setDisplayValue(String(next));
    onChange(next);
  };

  const isMinReached = (parseInt(displayValue, 10) || value) <= min;
  const isMaxReached = max !== undefined && max > 0 && (parseInt(displayValue, 10) || value) >= max;

  // Size styling tokens
  const sizeStyles = {
    sm: {
      wrap: 'p-0.5 gap-1 rounded-lg',
      btn: 'w-6 h-6 text-xs rounded',
      input: 'w-12 text-xs py-0.5',
      preset: 'px-1.5 py-0.5 text-[10px]',
    },
    md: {
      wrap: 'p-1 gap-1.5 rounded-lg',
      btn: 'w-7 h-7 text-sm rounded-md',
      input: 'w-14 sm:w-16 text-sm py-1',
      preset: 'px-2 py-0.5 text-[10px]',
    },
    lg: {
      wrap: 'p-1.5 gap-2 rounded-xl',
      btn: 'w-8 h-8 text-base rounded-lg',
      input: 'w-16 sm:w-20 text-base py-1.5',
      preset: 'px-2.5 py-1 text-xs',
    },
  }[size];

  const visiblePresets = presets.filter((p) => max === undefined || max <= 0 || p <= max);

  return (
    <div className={`flex flex-col items-end gap-1.5 shrink-0 ${className}`}>
      <div
        className={`inline-flex items-center justify-between w-fit bg-bg-surface/80 border border-border-glass backdrop-blur-sm transition-all focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30 ${
          disabled ? 'opacity-40 pointer-events-none' : ''
        } ${sizeStyles.wrap}`}
      >
        {/* Decrease Button */}
        <button
          type="button"
          disabled={disabled || isMinReached}
          onClick={handleDecrement}
          aria-label={`Decrease ${ariaLabel}`}
          className={`shrink-0 flex items-center justify-center font-bold text-text-main hover:bg-white/10 active:scale-95 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed border-none ${sizeStyles.btn} ${buttonClassName}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
        </button>

        {/* Direct Typing Input */}
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={disabled ? '0' : displayValue}
          disabled={disabled}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel}
          title="Type order quantity or use stepper"
          className={`text-center font-mono font-bold text-text-main bg-transparent border-none outline-none select-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${sizeStyles.input} ${inputClassName}`}
        />

        {/* Increase Button */}
        <button
          type="button"
          disabled={disabled || isMaxReached}
          onClick={handleIncrement}
          aria-label={`Increase ${ariaLabel}`}
          className={`shrink-0 flex items-center justify-center font-bold text-text-main hover:bg-white/10 active:scale-95 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed border-none ${sizeStyles.btn} ${buttonClassName}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Quick Bulk Presets */}
      {showPresets && !disabled && visiblePresets.length > 0 && (
        <div className="flex items-center justify-end flex-nowrap gap-1 mt-0.5">
          <span className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mr-0.5 shrink-0">
            Bulk:
          </span>
          {visiblePresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handlePresetAdd(preset)}
              className={`font-mono font-bold rounded bg-white/5 hover:bg-white/15 border border-border-glass text-text-main transition active:scale-95 cursor-pointer shrink-0 ${sizeStyles.preset}`}
              title={`Add +${preset} to quantity`}
            >
              +{preset}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
