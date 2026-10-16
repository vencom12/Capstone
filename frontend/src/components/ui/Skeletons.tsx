'use client';

import React from 'react';

/**
 * central loading skeleton components for Stitch-Opt UI loading states.
 */

// 1. Storefront Product Card Skeleton
export function ProductCardSkeleton() {
  return (
    <div className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-xl overflow-hidden flex flex-col animate-pulse">
      <div className="h-[140px] md:h-[180px] bg-white/5" />
      <div className="p-4 md:p-6 flex flex-col gap-3 flex-1">
        <div className="h-3 w-16 bg-white/5 rounded-full" />
        <div className="flex justify-between items-start gap-2">
          <div className="h-5 w-24 bg-white/5 rounded" />
          <div className="h-5 w-12 bg-white/5 rounded font-mono" />
        </div>
        <div className="h-3 w-full bg-white/5 rounded mt-2" />
        <div className="h-3 w-4/5 bg-white/5 rounded" />
        <div className="h-9 w-full bg-white/10 rounded-lg mt-auto pt-2" />
      </div>
    </div>
  );
}

// 2. central Table Skeleton (supporting custom rows and columns)
interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

export function TableSkeleton({ rows = 5, cols = 5 }: TableSkeletonProps) {
  return (
    <div className="glass-table-container w-full animate-pulse">
      <table className="glass-table w-full border-collapse">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="glass-th p-4">
                <div className="h-3.5 bg-white/10 rounded w-16 md:w-24" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rIdx) => (
            <tr key={rIdx} className="glass-tr border-b border-border-glass/40">
              {Array.from({ length: cols }).map((_, cIdx) => (
                <td key={cIdx} className="glass-td p-4">
                  <div className={`h-3 bg-white/5 rounded ${cIdx === 0 ? 'w-24 md:w-32' : 'w-16 md:w-20'}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 3. central Dashboard Card Skeleton (e.g. for Fleet / Machinery blocks)
export function CardSkeleton() {
  return (
    <div className="bg-white/5 border border-border-glass p-5 rounded-xl flex flex-col justify-between h-[200px] animate-pulse">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="h-5 w-32 bg-white/10 rounded" />
          <div className="h-4 w-16 bg-white/10 rounded-full" />
        </div>
        <div className="h-3 w-12 bg-white/5 rounded mb-2" />
        <div className="h-4 w-24 bg-white/10 rounded mb-4" />
        <div className="h-3 w-28 bg-white/5 rounded" />
      </div>
      <div className="flex gap-2 mt-4">
        <div className="h-8 flex-1 bg-white/10 rounded-lg" />
        <div className="h-8 flex-1 bg-white/10 rounded-lg" />
      </div>
    </div>
  );
}

// 4. Storefront Sidebar Categories Skeleton
export function SidebarCategoriesSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 animate-pulse mt-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="w-full h-[41px] bg-white/5 border border-border-glass/40 rounded-xl"
        />
      ))}
    </div>
  );
}

