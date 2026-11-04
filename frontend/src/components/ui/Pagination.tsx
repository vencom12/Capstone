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
  showInfo?: boolean;
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= 0) return null;

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
      className={`flex items-center justify-center flex-wrap gap-3 pt-4 mt-4 border-t border-border-glass text-xs text-text-dim w-full ${className}`}
    >
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-bg-card/95 backdrop-blur-[16px] border border-border-glass shadow-xs">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
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
                onClick={() => onPageChange(pageNum)}
                className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                  isActive
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-main hover:bg-bg-surface hover:text-primary active:scale-95'
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
