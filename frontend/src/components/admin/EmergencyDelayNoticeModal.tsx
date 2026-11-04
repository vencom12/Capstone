'use client';

import React, { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface EmergencyDelayNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  activeOrdersCount?: number;
  initialNotice?: {
    active: boolean;
    isScheduled?: boolean;
    isCurrentlyClosed?: boolean;
    reason?: string | null;
    message?: string | null;
    delayHours?: number;
    startDate?: string | null;
    resumeDate?: string | null;
    createdAt?: string | null;
    updatedBy?: string | null;
    orderingPolicy?: 'ALLOW_WITH_DELAY' | 'PAUSE_ORDERS' | null;
  } | null;
}

const PRESET_REASONS = [
  'Scheduled Vacation / Studio Break (Annual Leave)',
  'Holiday / Holy Week / Christmas Break',
  'Artisan Health / Medical Leave (Solo Owner)',
  'Machine Breakdown / Mechanical Jam',
  'Shopping Mall / Power Outage',
  'Emergency Store Closure / Family Leave',
  'Material Supply / Thread Restock Delay',
  'Custom Reason'
];

function formatDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

export default function EmergencyDelayNoticeModal({
  isOpen,
  onClose,
  onSuccess,
  activeOrdersCount = 0,
  initialNotice
}: EmergencyDelayNoticeModalProps) {
  const [timingMode, setTimingMode] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE');
  const [selectedReason, setSelectedReason] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [delayHours, setDelayHours] = useState<number>(24);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customResumeDate, setCustomResumeDate] = useState<string>('');
  const [orderingPolicy, setOrderingPolicy] = useState<'ALLOW_WITH_DELAY' | 'PAUSE_ORDERS'>('ALLOW_WITH_DELAY');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [notifyCustomers, setNotifyCustomers] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLifting, setIsLifting] = useState<boolean>(false);

  useEffect(() => {
    if (initialNotice && initialNotice.active) {
      if (initialNotice.reason && PRESET_REASONS.includes(initialNotice.reason)) {
        setSelectedReason(initialNotice.reason);
        setCustomReason('');
      } else {
        setSelectedReason('Custom Reason');
        setCustomReason(initialNotice.reason || '');
      }
      setDelayHours(initialNotice.delayHours || 24);
      setCustomMessage(initialNotice.message || '');
      setOrderingPolicy(initialNotice.orderingPolicy === 'PAUSE_ORDERS' ? 'PAUSE_ORDERS' : 'ALLOW_WITH_DELAY');

      const isFuture = initialNotice.startDate && new Date(initialNotice.startDate).getTime() > Date.now();
      if (isFuture) {
        setTimingMode('SCHEDULED');
        try {
          setCustomStartDate(formatDateTimeLocal(new Date(initialNotice.startDate!)));
        } catch {
          setCustomStartDate('');
        }
      } else {
        setTimingMode('IMMEDIATE');
        setCustomStartDate('');
      }

      if (initialNotice.resumeDate) {
        try {
          setCustomResumeDate(formatDateTimeLocal(new Date(initialNotice.resumeDate)));
        } catch {
          setCustomResumeDate('');
        }
      }
    } else {
      setSelectedReason(PRESET_REASONS[0]);
      setCustomReason('');
      setTimingMode('IMMEDIATE');
      setDelayHours(24);
      setOrderingPolicy('ALLOW_WITH_DELAY');
      setCustomMessage('');
      setCustomStartDate('');
      setCustomResumeDate('');
    }
  }, [initialNotice, isOpen]);

  if (!isOpen) return null;

  const effectiveReason = selectedReason === 'Custom Reason' ? customReason.trim() : selectedReason;

  const setQuickVacation = (days: number) => {
    let baseDate: Date;
    if (customStartDate) {
      baseDate = new Date(customStartDate);
    } else {
      baseDate = new Date();
      baseDate.setDate(baseDate.getDate() + 1);
      baseDate.setHours(10, 0, 0, 0);
      setCustomStartDate(formatDateTimeLocal(baseDate));
    }
    const end = new Date(baseDate.getTime() + days * 24 * 3600 * 1000);
    end.setHours(10, 0, 0, 0);
    setCustomResumeDate(formatDateTimeLocal(end));
    setDelayHours(days * 24);
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveReason) {
      showToast('Please specify a reason for the workshop notice.', 'error');
      return;
    }

    if (timingMode === 'SCHEDULED' && (!customStartDate || !customResumeDate)) {
      showToast('Please select both vacation start and reopening dates.', 'error');
      return;
    }

    if (timingMode === 'SCHEDULED' && customStartDate && customResumeDate) {
      if (new Date(customResumeDate).getTime() <= new Date(customStartDate).getTime()) {
        showToast('Reopening date must be after the vacation start date.', 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        reason: effectiveReason,
        message: customMessage.trim(),
        delayHours: Number(delayHours) || 24,
        orderingPolicy,
        notifyCustomers
      };

      if (timingMode === 'SCHEDULED' && customStartDate) {
        payload.startDate = new Date(customStartDate).toISOString();
      } else {
        payload.startDate = new Date().toISOString();
      }

      if (customResumeDate) {
        payload.resumeDate = new Date(customResumeDate).toISOString();
      }

      const res = await api.post<{ success: boolean; message: string; affectedCount: number }>('/api/admin/delay-notice', payload);

      showToast(res.message || 'Workshop schedule notice saved successfully.', 'success');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: {} }));
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('stitch_app_events');
          bc.postMessage({ type: 'SETTINGS_UPDATED' });
          setTimeout(() => bc.close(), 100);
        }
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to broadcast delay notice:', err);
      showToast(err.message || 'Failed to save workshop notice', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLiftNotice = async () => {
    if (!window.confirm('Are you sure you want to lift this notice and mark normal operations resumed?')) {
      return;
    }

    setIsLifting(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>('/api/admin/delay-notice/lift', {});
      showToast(res.message || 'Notice lifted. Regular workshop pace resumed.', 'success');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { emergencyNotice: { active: false } } }));
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('stitch_app_events');
          bc.postMessage({ type: 'SETTINGS_UPDATED', emergencyNotice: { active: false } });
          setTimeout(() => bc.close(), 100);
        }
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to lift delay notice:', err);
      showToast(err.message || 'Failed to lift notice', 'error');
    } finally {
      setIsLifting(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        initialNotice?.active
          ? (initialNotice.isScheduled ? 'Manage Scheduled Vacation / Break' : 'Manage Active Delay Notice')
          : 'Schedule Workshop Break / Emergency Notice'
      }
    >
      <form onSubmit={handleBroadcast} className="flex flex-col gap-4 text-left">
        {/* Active / Scheduled Alert Banner */}
        {initialNotice?.active && (
          <div className="p-3.5 rounded-lg bg-white/5 border border-white/20 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-text-main flex items-center gap-1.5">
                {initialNotice.isScheduled ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    Upcoming Scheduled Vacation
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Currently Closed / Active Notice
                  </>
                )}
              </span>
              <span className="text-[10px] font-mono text-text-dim">
                +{initialNotice.delayHours || 24}h Shift
              </span>
            </div>

            <div className="text-xs text-text-main font-semibold">
              {initialNotice.reason}
            </div>

            {initialNotice.startDate && initialNotice.resumeDate && (
              <div className="text-[11px] text-text-dim font-mono">
                {new Date(initialNotice.startDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} &rarr; {new Date(initialNotice.resumeDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}

            {initialNotice.message && (
              <div className="text-[11px] text-text-dim italic">
                &ldquo;{initialNotice.message}&rdquo;
              </div>
            )}

            <div className="text-[10px] text-text-dim pt-1 border-t border-white/10 flex justify-between">
              <span>Updated by: {initialNotice.updatedBy || 'Admin'}</span>
              <span>
                {initialNotice.isScheduled ? 'Normal operations active until start date' : 'Active'}
              </span>
            </div>
          </div>
        )}

        {/* Notice Timing Mode Toggle */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Notice Timing Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setTimingMode('IMMEDIATE');
                setCustomStartDate('');
              }}
              className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition cursor-pointer ${
                timingMode === 'IMMEDIATE'
                  ? 'bg-white/10 border-white/60 font-bold text-text-main shadow-xs ring-1 ring-white/30'
                  : 'bg-bg-surface border-border-glass hover:bg-white/5 text-text-dim hover:text-text-main'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-main">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <div>
                <div className="text-xs font-bold">Immediate Notice</div>
                <div className="text-[10px] text-text-dim">Pauses / shifts right now</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setTimingMode('SCHEDULED');
                if (!customStartDate) {
                  const tmrw = new Date();
                  tmrw.setDate(tmrw.getDate() + 1);
                  tmrw.setHours(10, 0, 0, 0);
                  setCustomStartDate(formatDateTimeLocal(tmrw));
                  const reopen = new Date(tmrw);
                  reopen.setDate(reopen.getDate() + 3);
                  reopen.setHours(10, 0, 0, 0);
                  setCustomResumeDate(formatDateTimeLocal(reopen));
                }
              }}
              className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition cursor-pointer ${
                timingMode === 'SCHEDULED'
                  ? 'bg-white/10 border-white/60 font-bold text-text-main shadow-xs ring-1 ring-white/30'
                  : 'bg-bg-surface border-border-glass hover:bg-white/5 text-text-dim hover:text-text-main'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-main">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <div>
                <div className="text-xs font-bold">Schedule for Future</div>
                <div className="text-[10px] text-text-dim">Planned vacation / break</div>
              </div>
            </button>
          </div>
        </div>

        {/* Reason Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Reason for Notice / Break
          </label>
          <select
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
            className="w-full bg-bg-surface border border-border-glass px-3 py-2.5 rounded-lg text-xs font-medium text-text-main outline-none focus:border-white/40 transition"
          >
            {PRESET_REASONS.map((r) => (
              <option key={r} value={r} className="bg-bg-card text-text-main">
                {r}
              </option>
            ))}
          </select>

          {selectedReason === 'Custom Reason' && (
            <input
              type="text"
              maxLength={100}
              placeholder="e.g. Annual Family Vacation / Out of Town Trip"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="mt-1.5 w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-lg text-xs text-text-main outline-none focus:border-white/40 transition"
              required
            />
          )}
        </div>

        {/* Date & Time Settings */}
        {timingMode === 'SCHEDULED' ? (
          <div className="p-3 rounded-lg bg-bg-surface border border-border-glass flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-dim">
                Vacation / Closure Window
              </span>
              <p className="text-[11px] text-text-dim m-0">
                Orders completing before the vacation begins are unaffected. Intersecting orders resume on reopening.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-text-main flex items-center justify-between">
                  <span>Closure Begins:</span>
                  <span className="text-[10px] text-text-dim font-mono">Start Time</span>
                </label>
                <input
                  type="datetime-local"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full bg-bg-card border border-border-glass px-3 py-2 rounded-lg text-xs text-text-main font-mono outline-none focus:border-white/40 transition"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-text-main flex items-center justify-between">
                  <span>Workshop Reopens:</span>
                  <span className="text-[10px] text-text-dim font-mono">End Time</span>
                </label>
                <input
                  type="datetime-local"
                  value={customResumeDate}
                  onChange={(e) => setCustomResumeDate(e.target.value)}
                  className="w-full bg-bg-card border border-border-glass px-3 py-2 rounded-lg text-xs text-text-main font-mono outline-none focus:border-white/40 transition"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-1 border-t border-border-glass/40 flex-wrap">
              <span className="text-[10px] text-text-dim mr-1">Quick Presets:</span>
              <button
                type="button"
                onClick={() => setQuickVacation(3)}
                className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-border-glass text-[10px] font-mono text-text-main cursor-pointer"
              >
                Weekend (3 Days)
              </button>
              <button
                type="button"
                onClick={() => setQuickVacation(7)}
                className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-border-glass text-[10px] font-mono text-text-main cursor-pointer"
              >
                1 Week (7 Days)
              </button>
              <button
                type="button"
                onClick={() => setQuickVacation(14)}
                className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-border-glass text-[10px] font-mono text-text-main cursor-pointer"
              >
                2 Weeks (14 Days)
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-dim">
              Estimated Duration / Shift
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '+4 Hours', hours: 4 },
                { label: '+24h (1 Day)', hours: 24 },
                { label: '+48h (2 Days)', hours: 48 },
                { label: '+72h (3 Days)', hours: 72 }
              ].map((opt) => (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => {
                    setDelayHours(opt.hours);
                    setCustomResumeDate('');
                  }}
                  className={`py-2 px-1 text-center rounded-lg text-xs font-mono font-bold border transition cursor-pointer ${
                    delayHours === opt.hours && !customResumeDate
                      ? 'bg-white/20 border-white/50 text-text-main shadow-xs'
                      : 'bg-bg-surface border-border-glass text-text-dim hover:text-text-main'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="mt-1.5">
              <label className="text-[11px] text-text-dim block mb-1">
                Or pick specific target resumption timestamp:
              </label>
              <input
                type="datetime-local"
                value={customResumeDate}
                onChange={(e) => setCustomResumeDate(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-lg text-xs text-text-main font-mono outline-none focus:border-white/40 transition"
              />
            </div>
          </div>
        )}

        {/* Affected Orders Counter */}
        <div className="p-3 rounded-lg bg-bg-surface border border-border-glass flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-main">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span className="text-text-dim">Orders Currently in Queue:</span>
          </div>
          <span className="font-mono font-bold text-text-main text-sm">
            {activeOrdersCount} orders
          </span>
        </div>

        {/* Customer Ordering Policy During Leave */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Customer Ordering Policy During Closure
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOrderingPolicy('ALLOW_WITH_DELAY')}
              className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition cursor-pointer ${
                orderingPolicy === 'ALLOW_WITH_DELAY'
                  ? 'bg-white/10 border-white/60 shadow-xs ring-1 ring-white/30'
                  : 'bg-bg-surface border-border-glass hover:bg-white/5 text-text-dim hover:text-text-main'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-main flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-text-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Option A: Accept with Delay
                </span>
                {orderingPolicy === 'ALLOW_WITH_DELAY' && (
                  <span className="text-[11px] font-bold text-text-main">&check; Selected</span>
                )}
              </div>
              <span className="text-[11px] text-text-dim leading-snug">
                Customers can pre-book their queue slot. Ready dates auto-shift to after your return.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOrderingPolicy('PAUSE_ORDERS')}
              className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition cursor-pointer ${
                orderingPolicy === 'PAUSE_ORDERS'
                  ? 'bg-white/10 border-white/60 shadow-xs ring-1 ring-white/30'
                  : 'bg-bg-surface border-border-glass hover:bg-white/5 text-text-dim hover:text-text-main'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-main flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-text-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                  Option B: Pause New Orders
                </span>
                {orderingPolicy === 'PAUSE_ORDERS' && (
                  <span className="text-[11px] font-bold text-text-main">&check; Selected</span>
                )}
              </div>
              <span className="text-[11px] text-text-dim leading-snug">
                Checkout is paused during the closure with reopening date displayed. Zero new backlog.
              </span>
            </button>
          </div>
        </div>

        {/* Public Note */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Customer-Facing Note (Optional)
          </label>
          <textarea
            rows={2}
            maxLength={500}
            placeholder="e.g. Workshop is closed for our annual studio break. Online orders placed will be fulfilled starting Monday at 10:00 AM."
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            className="w-full bg-bg-surface border border-border-glass p-3 rounded-lg text-xs text-text-main outline-none focus:border-white/40 transition resize-none"
          />
        </div>

        {/* Brevo Email Checkbox */}
        <label className="flex items-start gap-2.5 text-xs text-text-dim cursor-pointer p-2 rounded-lg bg-bg-surface/50 border border-border-glass">
          <input
            type="checkbox"
            checked={notifyCustomers}
            onChange={(e) => setNotifyCustomers(e.target.checked)}
            className="mt-0.5 accent-white cursor-pointer"
          />
          <div className="flex flex-col">
            <span className="font-semibold text-text-main">
              Email Affected In-Queue Customers (Brevo)
            </span>
            <span className="text-[11px]">
              Sends polite schedule update with revised pickup date and refund options to customers whose orders overlap the break.
            </span>
          </div>
        </label>

        {/* Actions Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-border-glass mt-2">
          {initialNotice?.active ? (
            <button
              type="button"
              onClick={handleLiftNotice}
              disabled={isLifting || isSubmitting}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-text-main border border-border-glass text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {isLifting ? 'Lifting Notice...' : 'Lift Notice / Resume Normal Pace'}
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isLifting}
              className="px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 text-text-dim text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLifting}
              className="px-4 py-2 rounded-lg bg-white text-black hover:bg-white/90 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {isSubmitting
                ? 'Saving...'
                : initialNotice?.active
                ? 'Update Schedule Notice'
                : timingMode === 'SCHEDULED'
                ? 'Schedule Vacation Break'
                : 'Broadcast Delay Notice'}
            </button>
          </div>
        </div>
      </form>
    </GlassModal>
  );
}
