'use client';

import React from 'react';

/**
 * Central loading skeleton components with smooth shimmering wave for Stitch-Opt UI loading states.
 */

// 1. Storefront Product Card Skeleton
export function ProductCardSkeleton() {
  return (
    <div className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-xl overflow-hidden flex flex-col">
      <div className="h-[140px] md:h-[180px] skeleton-shimmer" />
      <div className="p-4 md:p-6 flex flex-col gap-3 flex-1">
        <div className="h-3 w-16 skeleton-shimmer rounded-full" />
        <div className="flex justify-between items-start gap-2">
          <div className="h-5 w-24 skeleton-shimmer rounded" />
          <div className="h-5 w-12 skeleton-shimmer rounded font-mono" />
        </div>
        <div className="h-3 w-full skeleton-shimmer rounded mt-2" />
        <div className="h-3 w-4/5 skeleton-shimmer rounded" />
        <div className="h-9 w-full skeleton-shimmer rounded-lg mt-auto pt-2" />
      </div>
    </div>
  );
}

// 2. Central Table Skeleton (supporting custom rows and columns with shimmering wave)
interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function TableSkeleton({ rows = 6, cols = 5, className = '' }: TableSkeletonProps) {
  return (
    <div className={`glass-table-container w-full overflow-hidden ${className}`}>
      <table className="glass-table w-full border-collapse">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="glass-th">
                <div
                  className="h-3.5 skeleton-shimmer rounded"
                  style={{
                    width: `${Math.max(45, 80 - (i % 3) * 15)}%`,
                    maxWidth: i === 0 ? '140px' : i === cols - 1 ? '90px' : '110px',
                    marginLeft: i === cols - 1 ? 'auto' : undefined,
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rIdx) => (
            <tr key={rIdx} className="glass-tr">
              {Array.from({ length: cols }).map((_, cIdx) => (
                <td key={cIdx} className="glass-td">
                  <div
                    className="h-3.5 skeleton-shimmer rounded"
                    style={{
                      width:
                        cIdx === 0
                          ? `${Math.max(50, 85 - (rIdx % 4) * 10)}%`
                          : cIdx === cols - 1
                          ? '50%'
                          : `${Math.max(40, 70 - ((rIdx + cIdx) % 3) * 12)}%`,
                      maxWidth: cIdx === 0 ? '160px' : cIdx === cols - 1 ? '70px' : '120px',
                      marginLeft: cIdx === cols - 1 ? 'auto' : undefined,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 3. Central Dashboard Card Skeleton (e.g. for Fleet / Machinery blocks / Order Cards)
export function CardSkeleton() {
  return (
    <div className="bg-bg-card border border-border-glass p-5 rounded-xl flex flex-col justify-between h-[200px]">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="h-5 w-32 skeleton-shimmer rounded" />
          <div className="h-4 w-16 skeleton-shimmer rounded-full" />
        </div>
        <div className="h-3 w-16 skeleton-shimmer rounded mb-2" />
        <div className="h-4 w-28 skeleton-shimmer rounded mb-4" />
        <div className="h-3 w-36 skeleton-shimmer rounded" />
      </div>
      <div className="flex gap-2 mt-4">
        <div className="h-8 flex-1 skeleton-shimmer rounded-lg" />
        <div className="h-8 flex-1 skeleton-shimmer rounded-lg" />
      </div>
    </div>
  );
}

// 4. Storefront Sidebar Categories Skeleton
export function SidebarCategoriesSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 mt-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="w-full h-[41px] skeleton-shimmer border border-border-glass/40 rounded-xl"
        />
      ))}
    </div>
  );
}
