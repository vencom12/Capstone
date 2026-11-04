'use client';

import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
  pageSizeOptions?: number[];
  onPageSizeChange?: (newPageSize: number) => void;
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  className = '',
  itemLabel = 'items',
  pageSizeOptions,
  onPageSizeChange
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= 0) return null;

  const from = Math.min(totalItems, (currentPage - 1) * pageSize + 1);
  const to = Math.min(totalItems, currentPage * pageSize);

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
      className={`flex items-center justify-between flex-wrap gap-3 pt-4 mt-4 border-t border-border-glass text-xs text-text-dim w-full ${className}`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 font-medium">
          <span>Showing</span>
          <span className="font-semibold text-text-main font-mono">{from}</span>
          <span>–</span>
          <span className="font-semibold text-text-main font-mono">{to}</span>
          <span>of</span>
          <span className="font-semibold text-text-main font-mono">{totalItems}</span>
          <span>{itemLabel}</span>
        </div>

        {pageSizeOptions && pageSizeOptions.length > 0 && onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-dim pl-2.5 border-l border-border-glass">
            <span>Per page:</span>
            <div className="flex items-center gap-1">
              {pageSizeOptions.map((opt) => {
                const isCurrentSize = pageSize === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onPageSizeChange(opt);
                      onPageChange(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border ${
                      isCurrentSize
                        ? 'bg-primary text-white border-primary shadow-sm shadow-primary/25'
                        : 'bg-bg-surface hover:bg-bg-card border-border-glass text-text-dim hover:text-text-main hover:border-primary/40 active:scale-95'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="px-3 py-1.5 rounded-lg border border-border-glass bg-bg-surface hover:bg-bg-card text-text-main disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-bg-surface disabled:hover:text-text-dim disabled:hover:border-border-glass transition-all cursor-pointer font-medium flex items-center gap-1 active:scale-95 hover:border-primary/40"
            aria-label="Previous page"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            <span className="hidden sm:inline">Prev</span>
          </button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-2 py-1 text-text-dim/60 select-none">
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
                  onClick={() => onPageChange(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border flex items-center justify-center ${
                    isActive
                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/25'
                      : 'bg-bg-surface text-text-dim border-border-glass hover:bg-bg-card hover:text-text-main hover:border-primary/40 active:scale-95'
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
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="px-3 py-1.5 rounded-lg border border-border-glass bg-bg-surface hover:bg-bg-card text-text-main disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-bg-surface disabled:hover:text-text-dim disabled:hover:border-border-glass transition-all cursor-pointer font-medium flex items-center gap-1 active:scale-95 hover:border-primary/40"
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
