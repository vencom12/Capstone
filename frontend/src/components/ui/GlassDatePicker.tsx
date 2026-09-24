'use client';

import { useState, useRef, useEffect } from 'react';

interface GlassDatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  placeholder?: string;
  align?: 'left' | 'right';
  className?: string;
}

export default function GlassDatePicker({ 
  value, 
  onChange, 
  placeholder = 'Select date...',
  align = 'right',
  className = ''
}: GlassDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [placementY, setPlacementY] = useState<'top' | 'bottom'>('bottom');
  const [placementX, setPlacementX] = useState<'left' | 'right'>(align);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value or default to current date
  const parsedDate = value ? new Date(value) : new Date();
  const [currentYear, setCurrentYear] = useState(parsedDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(parsedDate.getMonth());

  // Check screen width for mobile vs desktop layout
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Compute viewport collision detection whenever opening on desktop/tablet
  useEffect(() => {
    if (isOpen && containerRef.current && !isMobile) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceRight = window.innerWidth - rect.left;

      if (spaceBelow < 370 && rect.top > 370) {
        setPlacementY('top');
      } else {
        setPlacementY('bottom');
      }

      if (spaceRight < 300) {
        setPlacementX('right');
      } else {
        setPlacementX(align);
      }
    }
  }, [isOpen, isMobile, align]);

  // Click outside handler to dismiss popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync state when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setCurrentYear(d.getFullYear());
        setCurrentMonth(d.getMonth());
      }
    }
  }, [value]);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Helper date calculations
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayIndex = getFirstDayOfMonth(currentYear, currentMonth);

  // Previous month padding days
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  const daysGrid: { day: number; isCurrentMonth: boolean; dateString: string }[] = [];

  // 1. Fill previous month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const m = (prevMonth + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    daysGrid.push({
      day,
      isCurrentMonth: false,
      dateString: `${prevYear}-${m}-${d}`
    });
  }

  // 2. Fill current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const m = (currentMonth + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    daysGrid.push({
      day,
      isCurrentMonth: true,
      dateString: `${currentYear}-${m}-${d}`
    });
  }

  // 3. Fill next month padding to reach exactly 42 cells (perfect 6-row calendar)
  const remaining = 42 - daysGrid.length;
  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
  for (let day = 1; day <= remaining; day++) {
    const m = (nextMonth + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    daysGrid.push({
      day,
      isCurrentMonth: false,
      dateString: `${nextYear}-${m}-${d}`
    });
  }

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  const handleDateSelect = (dateString: string) => {
    onChange(dateString);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const handleToday = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, '0');
    const d = today.getDate().toString().padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setIsOpen(false);
  };

  // Format date display (MM/DD/YYYY)
  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return placeholder;
    const parts = dateString.split('-');
    if (parts.length !== 3) return placeholder;
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  };

  const renderCalendarContent = () => (
    <div className="w-[285px] max-w-full bg-bg-card/95 backdrop-blur-[25px] border border-border-glass rounded-2xl p-4 shadow-[0_25px_60px_rgba(0,0,0,0.6)] animate-[fadeIn_0.15s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="font-bold text-[0.95rem] text-text-main">
          {months[currentMonth]} {currentYear}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            suppressHydrationWarning
            onClick={handlePrevMonth}
            className="w-7.5 h-7.5 flex items-center justify-center rounded-lg bg-white/5 border border-border-glass hover:bg-white/10 text-text-main transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button
            type="button"
            suppressHydrationWarning
            onClick={handleNextMonth}
            className="w-7.5 h-7.5 flex items-center justify-center rounded-lg bg-white/5 border border-border-glass hover:bg-white/10 text-text-main transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {daysOfWeek.map((day) => (
          <span key={day} className="text-[0.75rem] font-bold text-text-dim">
            {day}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {daysGrid.map((item, index) => {
          const isSelected = value === item.dateString;
          const isToday = (() => {
            const today = new Date();
            const y = today.getFullYear();
            const m = (today.getMonth() + 1).toString().padStart(2, '0');
            const d = today.getDate().toString().padStart(2, '0');
            return item.dateString === `${y}-${m}-${d}`;
          })();

          return (
            <button
              key={index}
              type="button"
              suppressHydrationWarning
              onClick={() => handleDateSelect(item.dateString)}
              className={`
                w-8.5 h-8.5 flex items-center justify-center text-[0.8rem] rounded-lg transition-all cursor-pointer font-medium
                ${!item.isCurrentMonth ? 'text-text-dim/30 hover:bg-white/5' : ''}
                ${item.isCurrentMonth && !isSelected && !isToday ? 'text-text-main hover:bg-white/5 hover:text-white' : ''}
                ${isToday && !isSelected ? 'border border-primary text-primary font-bold bg-primary/5 shadow-[0_0_8px_rgba(99,102,241,0.2)]' : ''}
                ${isSelected ? 'bg-primary text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.5)]' : ''}
              `}
            >
              {item.day}
            </button>
          );
        })}
      </div>

      {/* Action Footer */}
      <div className="flex justify-between border-t border-border-glass mt-4 pt-3.5">
        <button
          type="button"
          suppressHydrationWarning
          onClick={handleClear}
          className="text-[0.75rem] font-bold text-danger hover:text-danger-light transition-colors cursor-pointer bg-transparent border-none p-1.5"
        >
          Clear
        </button>
        <button
          type="button"
          suppressHydrationWarning
          onClick={handleToday}
          className="text-[0.75rem] font-bold text-primary hover:text-primary-light transition-colors cursor-pointer bg-transparent border-none p-1.5"
        >
          Today
        </button>
      </div>
    </div>
  );

  return (
    <div className={`relative inline-block text-left font-sans ${className}`} ref={containerRef}>
      {/* Date Toggle Button */}
      <button
        type="button"
        suppressHydrationWarning
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[155px] cursor-pointer hover:border-primary/40 focus:border-primary hover:shadow-[0_0_12px_rgba(99,102,241,0.15)] transition-all"
      >
        <span className="font-sans text-text-main font-medium">{formatDateDisplay(value)}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-text-dim shrink-0">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {/* Popover / Modal Calendar */}
      {isOpen && (
        isMobile ? (
          /* Mobile Viewport Modal Overlay */
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease-out]"
            onClick={() => setIsOpen(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              {renderCalendarContent()}
            </div>
          </div>
        ) : (
          /* Desktop / Tablet Viewport-Clamped Popover */
          <div className={`absolute z-[999] max-h-[calc(100vh-32px)] overflow-y-auto ${
            placementY === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } ${
            placementX === 'right' ? 'right-0' : 'left-0'
          }`}>
            {renderCalendarContent()}
          </div>
        )
      )}
    </div>
  );
}
