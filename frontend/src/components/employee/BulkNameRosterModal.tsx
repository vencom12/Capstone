'use client';

import React, { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { showToast } from '@/components/ui/Toast';
import { printWorkshopRoster, WorkshopRosterData } from '@/lib/printWorkshopRoster';

interface BulkNameRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: WorkshopRosterData | null;
}

export default function BulkNameRosterModal({
  isOpen,
  onClose,
  data,
}: BulkNameRosterModalProps) {
  const [checkedMap, setCheckedMap] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Storage key to persist artisan checklist progress across page refreshes
  const storageKey = data ? `roster_progress_${data.orderId}_${data.itemName}` : null;

  useEffect(() => {
    if (!isOpen || !storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setCheckedMap(JSON.parse(saved));
      } else {
        setCheckedMap({});
      }
    } catch {
      setCheckedMap({});
    }
  }, [isOpen, storageKey]);

  if (!isOpen || !data) return null;

  const names = data.namesList || [];
  const totalCount = names.length;
  const completedCount = names.filter((_, idx) => checkedMap[idx]).length;
  const percentComplete = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const toggleIndex = (idx: number) => {
    const nextMap = { ...checkedMap, [idx]: !checkedMap[idx] };
    setCheckedMap(nextMap);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextMap));
      } catch {
        // ignore localStorage quota errors
      }
    }
  };

  const markAll = (completed: boolean) => {
    const nextMap: Record<number, boolean> = {};
    names.forEach((_, idx) => {
      nextMap[idx] = completed;
    });
    setCheckedMap(nextMap);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextMap));
      } catch {
        // ignore
      }
    }
  };

  const handleCopy = () => {
    if (!names.length) return;
    const textToCopy = names.join('\n');
    navigator.clipboard.writeText(textToCopy);
    showToast('Names list copied to clipboard!', 'success');
  };

  const handlePrint = () => {
    printWorkshopRoster(data);
  };

  const filteredIndices = names
    .map((name, idx) => ({ name, idx }))
    .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()));

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[650px]">
      <div className="flex flex-col gap-4 text-text-main">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border-glass pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-extrabold tracking-wider px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/25">
                Bulk Embroidery Roster
              </span>
              <span className="font-mono text-xs font-bold text-text-dim">
                #{data.orderId}
              </span>
            </div>
            <h3 className="text-lg font-bold text-text-main mt-1">
              {data.itemName}
            </h3>
            <p className="text-xs text-text-dim mt-0.5">
              Customer: <strong className="text-text-main">{data.client}</strong>
              {data.variantText && ` • ${data.variantText}`}
            </p>
          </div>

          <div className="text-right flex flex-col items-end">
            <span className="text-[11px] text-text-dim uppercase tracking-wider font-semibold">
              Thread Color
            </span>
            <span className="text-sm font-bold text-primary">
              {data.threadColor}
            </span>
          </div>
        </div>

        {/* Progress Bar & Summary */}
        <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-text-main flex items-center gap-1.5">
              <span>🪡 Stitching Progress:</span>
              <span className="font-mono text-primary font-bold">
                {completedCount} of {totalCount} completed
              </span>
            </span>
            <span className="font-mono font-extrabold text-xs text-text-main">
              {percentComplete}%
            </span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        {/* Toolbar & Filter */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name in roster..."
              className="w-full bg-bg-surface border border-border-glass rounded-lg px-2.5 py-1.5 text-xs text-text-main placeholder:text-text-dim/50 outline-none focus:border-primary transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => markAll(true)}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-border-glass text-text-main text-[11px] font-semibold transition-all cursor-pointer"
            >
              Check All
            </button>
            <button
              type="button"
              onClick={() => markAll(false)}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim hover:text-text-main text-[11px] font-semibold transition-all cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Interactive Check-off Roster List */}
        <div className="max-h-[320px] overflow-y-auto rounded-xl border border-border-glass bg-bg-surface/50 p-2 flex flex-col gap-1.5">
          {filteredIndices.length > 0 ? (
            filteredIndices.map(({ name, idx }) => {
              const isChecked = Boolean(checkedMap[idx]);
              return (
                <div
                  key={idx}
                  onClick={() => toggleIndex(idx)}
                  className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer select-none ${
                    isChecked
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-bg-surface border-border-glass hover:border-primary/40 text-text-main'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by row click
                      className="w-4 h-4 rounded border-border-glass text-primary focus:ring-0 cursor-pointer accent-primary shrink-0"
                    />
                    <span className="font-mono text-xs text-text-dim w-6 shrink-0 font-bold">
                      #{idx + 1}
                    </span>
                    <span
                      className={`font-bold font-mono text-sm tracking-wide truncate ${
                        isChecked ? 'line-through opacity-70' : 'text-text-main'
                      }`}
                    >
                      {name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-text-dim">
                      {name.length}/20 chars
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        isChecked
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-white/5 text-text-dim'
                      }`}
                    >
                      {isChecked ? '✓ Stitched' : 'Pending'}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center text-text-dim text-xs">
              No names match "{searchQuery}"
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-glass flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print Production Sheet</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-main font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              <span>Copy All Names</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-main font-bold text-xs transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </GlassModal>
  );
}

