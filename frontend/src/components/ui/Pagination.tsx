'use client';

import React, { useRef } from 'react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
  pageSizeOptions?: number[];
  onPageSizeChange?: (newPageSize: number) => void;
  showInfo?: boolean;
  isLoading?: boolean;
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  className = '',
  isLoading = false,
}: PaginationProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= 0) return null;

  const handlePageSelect = (p: number) => {
    if (isLoading || p === currentPage || p < 1 || p > totalPages) return;
    onPageChange(p);

    if (typeof window !== 'undefined') {
      const smoothScrollToTop = () => {
        // 1. Identify active scroll container
        let activeContainer: HTMLElement | null = null;
        if (dockRef.current) {
          let el = dockRef.current.parentElement;
          while (el && el !== document.body && el !== document.documentElement) {
            const style = window.getComputedStyle(el);
            if (
              (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
              el.scrollHeight > el.clientHeight
            ) {
              activeContainer = el;
              break;
            }
            el = el.parentElement;
          }
        }

        const knownContainers = [
          document.getElementById('admin-main-viewport'),
          document.getElementById('employee-main-viewport'),
          document.getElementById('customer-main-viewport'),
        ].filter(Boolean) as HTMLElement[];

        if (!activeContainer) {
          activeContainer = knownContainers.find(
            (c) => c.scrollHeight > c.clientHeight && c.scrollTop > 0
          ) || null;
        }

        // 2. Identify target element (the table, grid, or card container directly above pagination)
        let targetElement: HTMLElement | null = null;
        if (dockRef.current) {
          let prev = dockRef.current.previousElementSibling as HTMLElement | null;
          while (prev && prev.offsetHeight === 0) {
            prev = prev.previousElementSibling as HTMLElement | null;
          }
          if (prev) targetElement = prev;
        }

        // Fallback for storefront products section
        if (!targetElement) {
          targetElement = document.getElementById('products-section');
        }

        // 3. Smoothly scroll without abrupt jumping
        if (activeContainer) {
          if (targetElement && activeContainer.contains(targetElement)) {
            const containerRect = activeContainer.getBoundingClientRect();
            const targetRect = targetElement.getBoundingClientRect();
            const offsetTop = targetRect.top - containerRect.top + activeContainer.scrollTop;
            activeContainer.scrollTo({
              top: Math.max(0, offsetTop - 20),
              behavior: 'smooth',
            });
          } else {
            activeContainer.scrollTo({
              top: 0,
              behavior: 'smooth',
            });
          }
        } else {
          if (targetElement) {
            const headerOffset = 90;
            const elementPosition = targetElement.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({
              top: Math.max(0, elementPosition - headerOffset),
              behavior: 'smooth',
            });
          } else {
            window.scrollTo({
              top: 0,
              behavior: 'smooth',
            });
          }
        }
      };

      // Slight frame delay so React state changes can trigger skeleton render before scrolling starts
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(smoothScrollToTop);
      } else {
        smoothScrollToTop();
      }
    }
  };

  // Generate page numbers with ellipsis if many pages
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div
      ref={dockRef}
      className={`flex items-center justify-center w-full mt-3 ${className}`}
    >
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-bg-card/95 backdrop-blur-[16px] border border-border-glass shadow-xs">
        <button
          type="button"
          disabled={currentPage <= 1 || isLoading}
          onClick={() => handlePageSelect(currentPage - 1)}
          className="w-7 h-7 rounded-lg text-text-main hover:bg-bg-surface hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-main transition-all cursor-pointer flex items-center justify-center text-xs active:scale-95"
          aria-label="Previous page"
          title="Previous page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`dots-${idx}`} className="w-5 text-center text-text-dim/60 select-none text-xs">
                  …
                </span>
              );
            }
            const pageNum = p as number;
            const isActive = pageNum === currentPage;
            return (
              <button
                key={pageNum}
                type="button"
                disabled={isLoading}
                onClick={() => handlePageSelect(pageNum)}
                className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                  isActive
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-main hover:bg-bg-surface hover:text-primary active:scale-95 disabled:opacity-50'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={currentPage >= totalPages || isLoading}
          onClick={() => handlePageSelect(currentPage + 1)}
          className="w-7 h-7 rounded-lg text-text-main hover:bg-bg-surface hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-main transition-all cursor-pointer flex items-center justify-center text-xs active:scale-95"
          aria-label="Next page"
          title="Next page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
    </div>
  );
}
