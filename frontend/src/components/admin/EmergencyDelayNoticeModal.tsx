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
    reason?: string | null;
    message?: string | null;
    delayHours?: number;
    resumeDate?: string | null;
    createdAt?: string | null;
    updatedBy?: string | null;
    orderingPolicy?: 'ALLOW_WITH_DELAY' | 'PAUSE_ORDERS' | null;
  } | null;
}

const PRESET_REASONS = [
  'Artisan Health / Medical Leave (Solo Owner)',
  'Machine Breakdown / Mechanical Jam',
  'Shopping Mall / Power Outage',
  'Emergency Store Closure / Family Leave',
  'Material Supply / Thread Restock Delay',
  'Custom Reason'
];

export default function EmergencyDelayNoticeModal({
  isOpen,
  onClose,
  onSuccess,
  activeOrdersCount = 0,
  initialNotice
}: EmergencyDelayNoticeModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [delayHours, setDelayHours] = useState<number>(24);
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
      if (initialNotice.resumeDate) {
        try {
          const d = new Date(initialNotice.resumeDate);
          setCustomResumeDate(d.toISOString().slice(0, 16));
        } catch {
          setCustomResumeDate('');
        }
      }
    } else {
      setSelectedReason(PRESET_REASONS[0]);
      setCustomReason('');
      setDelayHours(24);
      setOrderingPolicy('ALLOW_WITH_DELAY');
      setCustomMessage('');
      setCustomResumeDate('');
    }
  }, [initialNotice, isOpen]);

  if (!isOpen) return null;

  const effectiveReason = selectedReason === 'Custom Reason' ? customReason.trim() : selectedReason;

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveReason) {
      showToast('Please specify a reason for the workshop delay notice.', 'error');
      return;
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

      if (customResumeDate) {
        payload.resumeDate = new Date(customResumeDate).toISOString();
      }

      const res = await api.post<{ success: boolean; message: string; affectedCount: number }>('/api/admin/delay-notice', payload);

      showToast(res.message || 'Emergency delay notice activated successfully.', 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to broadcast delay notice:', err);
      showToast(err.message || 'Failed to broadcast delay notice', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLiftNotice = async () => {
    if (!window.confirm('Are you sure you want to lift this delay notice and mark normal operations resumed?')) {
      return;
    }

    setIsLifting(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>('/api/admin/delay-notice/lift', {});
      showToast(res.message || 'Notice lifted. Regular workshop pace resumed.', 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to lift delay notice:', err);
      showToast(err.message || 'Failed to lift delay notice', 'error');
    } finally {
      setIsLifting(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialNotice?.active ? 'Manage Workshop Delay Notice' : 'Broadcast Workshop Delay Notice'}
    >
      <form onSubmit={handleBroadcast} className="flex flex-col gap-4 text-left">
        {/* Active Notice Alert Banner (Monochrome styling) */}
        {initialNotice?.active ? (
          <div className="p-3.5 rounded-lg bg-white/5 border border-white/20 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-text-main flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Current Active Notice
              </span>
              <span className="text-[10px] font-mono text-text-dim">
                +{initialNotice.delayHours || 24}h Shift
              </span>
            </div>
            <div className="text-xs text-text-main font-semibold">
              {initialNotice.reason}
            </div>
            {initialNotice.message && (
              <div className="text-[11px] text-text-dim italic">
                "{initialNotice.message}"
              </div>
            )}
            <div className="text-[10px] text-text-dim pt-1 border-t border-white/10 flex justify-between">
              <span>Updated by: {initialNotice.updatedBy || 'Admin'}</span>
              <span>
                {initialNotice.createdAt ? new Date(initialNotice.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-dim leading-relaxed">
            Use this protocol when production must pause (e.g. solo artisan illness, mechanical jam, power outage).
            This automatically shifts all in-queue orders, recalculates pickup targets, and updates customer tracking slips.
          </p>
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

        {/* Delay Reason Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Reason for Delay
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
              placeholder="e.g. Artisan Medical Consultation / Flu"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="mt-1.5 w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-lg text-xs text-text-main outline-none focus:border-white/40 transition"
              required
            />
          )}
        </div>

        {/* Delay Duration Options */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Estimated Duration / Schedule Shift
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
              Or pick specific target resumption timestamp (optional):
            </label>
            <input
              type="datetime-local"
              value={customResumeDate}
              onChange={(e) => setCustomResumeDate(e.target.value)}
              className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-lg text-xs text-text-main font-mono outline-none focus:border-white/40 transition"
            />
          </div>
        </div>

        {/* Ordering Policy Selector during Leave (Option A vs Option B) */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Customer Ordering Policy During Leave
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
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </div>
              <span className="text-[11px] text-text-dim leading-snug">
                Customers can order. Delivery dates auto-adjust to after your return with clear disclosure.
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
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
              </div>
              <span className="text-[11px] text-text-dim leading-snug">
                Checkout is paused with your return date displayed. Zero new backlog accumulates.
              </span>
            </button>
          </div>
        </div>

        {/* Optional Public Customer Note */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Customer-Facing Note (Optional)
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Nanay Ed is feeling unwell and resting. Embroidery operations will resume tomorrow morning at 10:00 AM."
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            className="w-full bg-bg-surface border border-border-glass p-3 rounded-lg text-xs text-text-main outline-none focus:border-white/40 transition resize-none"
          />
        </div>

        {/* Brevo Email Notification Checkbox */}
        <label className="flex items-start gap-2.5 text-xs text-text-dim cursor-pointer p-2 rounded-lg bg-bg-surface/50 border border-border-glass">
          <input
            type="checkbox"
            checked={notifyCustomers}
            onChange={(e) => setNotifyCustomers(e.target.checked)}
            className="mt-0.5 accent-white cursor-pointer"
          />
          <div className="flex flex-col">
            <span className="font-semibold text-text-main">
              Email Affected Customers (Brevo)
            </span>
            <span className="text-[11px]">
              Sends polite schedule update with new estimated ready date and instant full refund / claim options.
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
              {isLifting ? 'Lifting Notice...' : 'Lift Notice & Resume Operations'}
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
                <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>
              </svg>
              {isSubmitting
                ? 'Broadcasting...'
                : initialNotice?.active
                ? 'Update Delay Notice'
                : 'Broadcast Delay Notice'}
            </button>
          </div>
        </div>
      </form>
    </GlassModal>
  );
}
