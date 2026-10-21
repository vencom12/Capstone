'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import GlassModal from '@/components/ui/GlassModal';
import Pagination from '@/components/ui/Pagination';

interface FeedbackItem {
  id: string;
  category: string;
  rating: number;
  message: string;
  status: 'Pending' | 'Reviewed' | 'Resolved';
  staffNotes?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  orderId?: string | null;
  productId?: string | null;
  createdAt: string;
  updatedAt: string;
  merchantReply?: string | null;
  merchantReplyAt?: string | null;
  isFeatured?: boolean;
  rootCause?: string | null;
  resolutionAction?: string | null;
  resolvedBy?: string | null;
}

interface SentimentHighlight {
  tag: string;
  count: number;
}

interface FeedbackMetrics {
  totalCount: number;
  pendingCount: number;
  criticalAlertsCount: number;
  reviewedCount: number;
  resolvedCount: number;
  fiveStarCount: number;
  fourStarCount: number;
  distribution: { [key: number]: number };
  verifiedCount: number;
  merchantRepliedCount: number;
  responseRate: number;
  featuredCount: number;
  averageRating: number;
  sentimentRate: number;
  sentimentHighlights: SentimentHighlight[];
}

// Smart Star-Calibrated Merchant Reply Templates
const SMART_TEMPLATES_BY_RATING: Record<number, { label: string; text: string }[]> = {
  5: [
    {
      label: '5★ Craftsmanship & Gratitude',
      text: "Thank you so much for the 5-star review! We are thrilled to hear that you love the embroidery craftsmanship on your custom piece. We take immense pride in every stitch and look forward to creating your next order!"
    },
    {
      label: '5★ Textile Detailing Appreciation',
      text: "Thank you for choosing Stitch-Opt! We're delighted that our embroidery quality and detailing met your expectations. Enjoy your custom textile!"
    },
    {
      label: '5★ High-Tensile Rayon Stitching',
      text: "We truly appreciate your glowing review! Knowing that our high-tensile stitching and fabric quality impressed you motivates our atelier team every day."
    }
  ],
  4: [
    {
      label: '4★ Warm Appreciation & Striving for 5★',
      text: "Thank you for the wonderful 4-star feedback! We're glad you enjoyed your custom order and are committed to continuous refinement to make your next experience a full 5 stars."
    },
    {
      label: '4★ Turnaround & Detailing',
      text: "Thank you for your valuable feedback and support! Our production team appreciates your review, and we're always working to deliver top-tier embroidery with rapid turnaround."
    }
  ],
  3: [
    {
      label: '3★ Constructive Quality Review',
      text: "Thank you for sharing your honest feedback. We take all customer impressions seriously and will review your comments with our quality and production team to ensure even higher stitch precision."
    },
    {
      label: '3★ Process Refinement',
      text: "Thank you for your feedback! We strive for excellence on every order and appreciate your input as we work on perfecting our turnaround times and custom detailing."
    }
  ],
  2: [
    {
      label: '2★ Quality Investigation Notice',
      text: "We sincerely apologize that your custom order did not meet your expectations. Quality and craftsmanship are our highest priorities. Our quality assurance team has been notified to investigate and ensure this standard is corrected."
    },
    {
      label: '2★ Service Recovery & Re-stitch',
      text: "We are truly sorry that you were not completely satisfied with your piece. Our support and management team has recorded your review for quality recovery."
    }
  ],
  1: [
    {
      label: '1★ Urgent Management Apology',
      text: "We are deeply sorry for your disappointing experience. This falls far short of our embroidery standards. A management alert has been triggered so our team can review this order and improve our process."
    },
    {
      label: '1★ Remake & Full Resolution',
      text: "Please accept our sincere apologies for your experience. We take quality defects and customer dissatisfaction very seriously. Our team has flagged this order for immediate review."
    }
  ]
};

const getPrimaryTemplateForRating = (rating: number): string => {
  const r = Math.max(1, Math.min(5, Math.round(rating || 5)));
  const list = SMART_TEMPLATES_BY_RATING[r] || SMART_TEMPLATES_BY_RATING[5];
  return list[0].text;
};

export default function PanelFeedbackManagement() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [metrics, setMetrics] = useState<FeedbackMetrics>({
    totalCount: 0,
    pendingCount: 0,
    criticalAlertsCount: 0,
    reviewedCount: 0,
    resolvedCount: 0,
    fiveStarCount: 0,
    fourStarCount: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    verifiedCount: 0,
    merchantRepliedCount: 0,
    responseRate: 0,
    featuredCount: 0,
    averageRating: 5.0,
    sentimentRate: 100,
    sentimentHighlights: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Auto-Reply Global System Setting State
  const [autoReplyEnabled, setAutoReplyEnabled] = useState<boolean>(true);
  const [isTogglingAutoReply, setIsTogglingAutoReply] = useState<boolean>(false);

  // Filters
  const [filterTab, setFilterTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const pageSize = 8;

  // Merchant Reply Modal State
  const [replyTarget, setReplyTarget] = useState<FeedbackItem | null>(null);
  const [merchantReplyText, setMerchantReplyText] = useState<string>('');
  const [selectedTemplateRating, setSelectedTemplateRating] = useState<number>(5);
  const [isPinningFeatured, setIsPinningFeatured] = useState<boolean>(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false);

  // Quick Staff Note Modal State
  const [noteTarget, setNoteTarget] = useState<FeedbackItem | null>(null);
  const [staffNoteText, setStaffNoteText] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  // Quality Issue & Service Recovery Modal State (1-2★ cases)
  const [recoveryTarget, setRecoveryTarget] = useState<FeedbackItem | null>(null);
  const [recoveryRootCause, setRecoveryRootCause] = useState<string>('Hoop Tension / Registration Defect');
  const [recoveryAction, setRecoveryAction] = useState<string>('Complimentary Re-stitch & Store Pickup');
  const [recoveryNotes, setRecoveryNotes] = useState<string>('');
  const [recoveryStatus, setRecoveryStatus] = useState<'Pending' | 'Reviewed' | 'Resolved'>('Resolved');
  const [isSubmittingRecovery, setIsSubmittingRecovery] = useState<boolean>(false);

  // Fetch feedbacks and metrics
  const fetchFeedbacks = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setIsSyncing(true);
    try {
      const params = new URLSearchParams();
      if (filterTab === '5') params.append('rating', '5');
      else if (filterTab === '4') params.append('rating', '4');
      else if (filterTab === 'critical') params.append('rating', 'critical');
      else if (filterTab === 'featured') params.append('isFeatured', 'true');
      else if (filterTab === 'replied') params.append('hasReply', 'true');
      else if (filterTab === 'unreplied') params.append('hasReply', 'false');

      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());

      const res = await api.get<{
        success: boolean;
        feedbacks: FeedbackItem[];
        pagination: { total: number; page: number; totalPages: number };
        metrics: FeedbackMetrics;
      }>(`/api/admin/feedback?${params.toString()}`);

      if (res && res.success) {
        let list = res.feedbacks || [];
        if (sortBy === 'oldest') {
          list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        } else if (sortBy === 'highest') {
          list = [...list].sort((a, b) => b.rating - a.rating);
        } else if (sortBy === 'lowest') {
          list = [...list].sort((a, b) => a.rating - b.rating);
        }

        setFeedbacks(list);
        if (res.metrics) {
          setMetrics(res.metrics);
        }
        setTotalPages(res.pagination?.totalPages || 1);
        setTotalItems(res.pagination?.total || 0);
      }
    } catch (err) {
      console.warn('Failed to load admin feedbacks:', err);
      showToast('Failed to load feedback records', 'error');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [filterTab, searchQuery, sortBy, currentPage]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // Load Auto-Reply setting from SystemSettings
  useEffect(() => {
    api.get<any>('/api/admin/settings').then((res) => {
      if (res && res.autoReplyReviews !== undefined) {
        setAutoReplyEnabled(!!res.autoReplyReviews);
      }
    }).catch(() => {});
  }, []);

  const handleToggleAutoReply = async () => {
    const nextVal = !autoReplyEnabled;
    setIsTogglingAutoReply(true);
    setAutoReplyEnabled(nextVal);
    try {
      await api.put('/api/admin/settings', { autoReplyReviews: nextVal });
      showToast(nextVal ? 'Auto-Reply Enabled for New Reviews' : 'Auto-Reply Disabled', 'success');
    } catch (err) {
      setAutoReplyEnabled(!nextVal);
      showToast('Failed to update Auto-Reply setting', 'error');
    } finally {
      setIsTogglingAutoReply(false);
    }
  };

  // 1-Click Quick Mark Reviewed
  const handleQuickMarkReviewed = async (feedback: FeedbackItem) => {
    try {
      await api.patch(`/api/admin/feedback/${feedback.id}`, {
        status: 'Reviewed'
      });
      showToast('Review marked as Reviewed', 'success');
      fetchFeedbacks(true);
    } catch (err) {
      showToast('Failed to update review status', 'error');
    }
  };

  // 1-Click Auto-Reply using star-matched smart template
  const handleOneClickAutoReply = async (feedback: FeedbackItem) => {
    const template = getPrimaryTemplateForRating(feedback.rating);
    try {
      await api.post(`/api/admin/feedback/${feedback.id}/reply`, {
        reply: template
      });
      if (feedback.status === 'Pending') {
        await api.patch(`/api/admin/feedback/${feedback.id}`, {
          status: 'Reviewed'
        });
      }
      showToast('Official store reply published & marked Reviewed', 'success');
      fetchFeedbacks(true);
    } catch (err) {
      showToast('Failed to publish store reply', 'error');
    }
  };

  // Quick Staff Note Submit
  const handleSaveStaffNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTarget) return;

    setIsSavingNote(true);
    try {
      await api.patch(`/api/admin/feedback/${noteTarget.id}`, {
        staffNotes: staffNoteText.trim(),
        status: noteTarget.status === 'Pending' ? 'Reviewed' : noteTarget.status
      });
      showToast('Internal staff note saved', 'success');
      setNoteTarget(null);
      fetchFeedbacks(true);
    } catch (err) {
      showToast('Failed to save staff note', 'error');
    } finally {
      setIsSavingNote(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [filterTab, searchQuery, sortBy]);

  // Toggle Featured Review on Storefront Showcase
  const handleToggleFeature = async (feedback: FeedbackItem) => {
    try {
      const res = await api.patch<{ success: boolean; message: string; feedback: FeedbackItem }>(
        `/api/admin/feedback/${feedback.id}/feature`,
        {}
      );
      if (res && res.success) {
        showToast(res.message, 'success');
        fetchFeedbacks(true);
      }
    } catch (err) {
      console.error('Failed to toggle featured status:', err);
      showToast('Failed to toggle featured status', 'error');
    }
  };

  // Submit Official Merchant Response
  const handleSaveMerchantReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyTarget) return;

    setIsSubmittingReply(true);
    try {
      await api.post(`/api/admin/feedback/${replyTarget.id}/reply`, {
        reply: merchantReplyText.trim()
      });

      if (isPinningFeatured !== replyTarget.isFeatured) {
        await api.patch(`/api/admin/feedback/${replyTarget.id}/feature`, {});
      }

      showToast('Official store response published to catalog', 'success');
      setReplyTarget(null);
      fetchFeedbacks(true);
    } catch (err) {
      console.error('Failed to save merchant reply:', err);
      showToast('Failed to save store reply', 'error');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Submit Service Recovery & QA Case
  const handleSaveQualityRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryTarget) return;

    setIsSubmittingRecovery(true);
    try {
      await api.patch(`/api/admin/feedback/${recoveryTarget.id}`, {
        status: recoveryStatus,
        staffNotes: recoveryNotes.trim(),
        rootCause: recoveryRootCause,
        resolutionAction: recoveryAction
      });

      showToast(`Quality case marked as ${recoveryStatus}`, 'success');
      setRecoveryTarget(null);
      fetchFeedbacks(true);
    } catch (err) {
      console.error('Failed to save quality case:', err);
      showToast('Failed to save quality case', 'error');
    } finally {
      setIsSubmittingRecovery(false);
    }
  };

  // Export Feedback Feed to CSV
  const handleExportCsv = () => {
    if (feedbacks.length === 0) {
      showToast('No feedback records to export', 'info');
      return;
    }

    const headers = ['Feedback ID', 'Customer', 'Email', 'Order ID', 'Rating', 'Message', 'Status', 'Merchant Reply', 'Date'];
    const rows = feedbacks.map((f) => [
      `"${f.id}"`,
      `"${f.customerName || 'Verified Customer'}"`,
      `"${f.customerEmail || ''}"`,
      `"${f.orderId || ''}"`,
      f.rating,
      `"${(f.message || '').replace(/"/g, '""')}"`,
      `"${f.status}"`,
      `"${(f.merchantReply || '').replace(/"/g, '""')}"`,
      `"${new Date(f.createdAt).toISOString()}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `EDS_FEEDBACK_REPORT_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Feedback audit report downloaded (CSV)', 'success');
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center text-amber-400 text-xs">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={i < rating ? 'text-amber-400' : 'text-text-dim/30'}>
            ★
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-fade text-text-main text-left">
      {/* Header Toolbar */}
      <div className="flex justify-between items-start flex-wrap gap-4 pb-2 border-b border-border-glass">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-text-main tracking-tight m-0">
              Customer Reviews &amp; Reputation Suite
            </h1>
            <span className="text-[10px] uppercase font-mono font-extrabold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
              Gold Standard
            </span>
          </div>
          <p className="text-xs sm:text-sm text-text-dim mt-1 m-0">
            Executive CSAT analytics, verified purchase testimonials, official merchant replies, and service recovery management.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Automatic Reply Toggle */}
          <button
            type="button"
            onClick={handleToggleAutoReply}
            disabled={isTogglingAutoReply}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all flex items-center gap-2 ${
              autoReplyEnabled
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
            }`}
            title="When active, newly submitted customer reviews immediately receive an official star-calibrated store reply"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoReplyEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span>Auto-Reply: {autoReplyEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="bg-white/5 border border-border-glass hover:bg-white/10 text-text-main px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
            title="Download CSV report for management records"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => fetchFeedbacks(true)}
            disabled={isSyncing}
            className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-2"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className={isSyncing ? 'animate-spin' : ''}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span>{isSyncing ? 'Syncing...' : 'Sync Reviews'}</span>
          </button>
        </div>
      </div>

      {/* Top 4 Executive Reputation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 rounded-2xl flex flex-col justify-between border border-border-glass">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider flex items-center justify-between">
            <span>Overall Store Rating</span>
            <span className="text-amber-400 font-bold">★★★★★</span>
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-black text-text-main">
              {metrics.averageRating.toFixed(1)}
            </span>
            <span className="text-xs text-text-dim font-bold">/ 5.0</span>
          </div>
          <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
            {metrics.totalCount} total verified customer reviews
          </span>
        </div>

        <div className="glass-card p-4 rounded-2xl flex flex-col justify-between border border-border-glass">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Customer Satisfaction</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-black text-primary">
              {metrics.sentimentRate}%
            </span>
            <span className="text-xs text-text-dim font-bold">CSAT Positive</span>
          </div>
          <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
            {metrics.fiveStarCount + metrics.fourStarCount} of {metrics.totalCount} ratings are 4★ or 5★
          </span>
        </div>

        <div className="glass-card p-4 rounded-2xl flex flex-col justify-between border border-border-glass">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Merchant Response Rate</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-black text-emerald-400">
              {metrics.responseRate}%
            </span>
            <span className="text-xs text-text-dim font-bold">Public Replies</span>
          </div>
          <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
            {metrics.merchantRepliedCount} official store responses published
          </span>
        </div>

        <div className="glass-card p-4 rounded-2xl flex flex-col justify-between border border-border-glass">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Quality &amp; Service Recovery</span>
          <div className="mt-2 flex items-baseline gap-2">
            {metrics.criticalAlertsCount > 0 ? (
              <>
                <span className="text-3xl font-mono font-black text-danger animate-pulse">
                  {metrics.criticalAlertsCount}
                </span>
                <span className="text-xs text-danger font-bold">
                  Open Alert{metrics.criticalAlertsCount > 1 ? 's' : ''}
                </span>
              </>
            ) : (
              <>
                <span className="text-3xl font-mono font-black text-emerald-400">
                  0
                </span>
                <span className="text-xs text-emerald-400 font-bold">Active Alerts</span>
              </>
            )}
          </div>
          <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
            {metrics.criticalAlertsCount > 0
              ? '1-2★ reviews requiring immediate service recovery'
              : `${metrics.resolvedCount} documented quality resolutions on record`}
          </span>
        </div>
      </div>

      {/* Analytics Row: 5-Star Distribution + Voice of Customer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Rating Breakdown Bar Chart (Clickable) */}
        <div className="glass-card p-5 rounded-2xl border border-border-glass flex flex-col justify-between gap-3 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-text-dim uppercase tracking-wider m-0">Rating Breakdown</h3>
            <span className="text-[10px] text-text-dim">Tap bar to filter</span>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = metrics.distribution[star] || 0;
              const percent = metrics.totalCount > 0 ? Math.round((count / metrics.totalCount) * 100) : 0;
              const isSelected = filterTab === star.toString();

              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setFilterTab(isSelected ? 'all' : star.toString())}
                  className={`w-full flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-pointer transition-all bg-transparent ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500/15 shadow-sm'
                      : 'border-transparent hover:bg-white/5'
                  }`}
                >
                  <span className="font-mono font-bold w-6 text-right shrink-0">{star}★</span>
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        star >= 4 ? 'bg-amber-400' : star === 3 ? 'bg-amber-500/70' : 'bg-rose-500/80'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-text-dim w-10 text-right shrink-0">
                    {count} ({percent}%)
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-border-glass flex items-center justify-between text-[11px] text-text-dim">
            <span>Verified Purchase Rate:</span>
            <span className="font-mono font-bold text-emerald-400">
              {metrics.totalCount > 0 ? Math.round((metrics.verifiedCount / metrics.totalCount) * 100) : 100}%
            </span>
          </div>
        </div>

        {/* Voice of Customer / Top Sentiment Drivers */}
        <div className="glass-card p-5 rounded-2xl border border-border-glass flex flex-col justify-between gap-3 lg:col-span-2">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-text-dim uppercase tracking-wider m-0">
                Voice of Customer (Top Praised Highlights)
              </h3>
              <span className="text-[10px] text-indigo-400 font-mono font-semibold">
                Natural Language Intelligence
              </span>
            </div>
            <p className="text-xs text-text-dim mt-1 m-0">
              Key product and craftsmanship attributes cited most frequently in positive reviews:
            </p>
          </div>

          <div className="flex flex-wrap gap-2 my-2">
            {(metrics.sentimentHighlights && metrics.sentimentHighlights.length > 0) ? (
              metrics.sentimentHighlights.map((sh, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-border-glass hover:border-white/20 flex items-center gap-2 shadow-xs transition-colors"
                >
                  <span className="text-text-main font-semibold text-xs">{sh.tag}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-text-dim text-[10px] font-mono font-bold">
                    {sh.count}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-xs text-text-dim py-4">
                No sentiment highlight tags extracted yet. Customer highlights from verified reviews will appear here.
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-white/[0.02] border border-border-glass text-[11px] text-text-dim flex items-center justify-between flex-wrap gap-2">
            <span>
              <strong>Merchant Tip:</strong> Responding publicly to verified customer reviews increases customer repeat orders by up to 23%.
            </span>
            {metrics.featuredCount > 0 && (
              <span className="font-mono font-bold text-amber-400 flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                {metrics.featuredCount} Featured on Storefront
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Reviews Operations Container */}
      <div className="glass-card p-5 rounded-2xl border border-border-glass flex flex-col gap-4">
        {/* Filters Toolbar */}
        <div className="flex justify-between items-center flex-wrap gap-3 pb-3 border-b border-border-glass">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <span className="text-text-dim font-bold text-xs mr-1 shrink-0">Filter:</span>
            {[
              { id: 'all', label: `All (${metrics.totalCount})` },
              { id: '5', label: `5 Stars (${metrics.fiveStarCount})` },
              { id: '4', label: `4 Stars (${metrics.fourStarCount})` },
              { id: 'critical', label: `1-2★ Alerts (${metrics.criticalAlertsCount})` },
              { id: 'replied', label: `Responded (${metrics.merchantRepliedCount})` },
              { id: 'featured', label: `Featured (${metrics.featuredCount})` }
            ].map((tab) => {
              const isActive = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-xl text-text-main text-xs outline-none cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Rating</option>
              <option value="lowest">Lowest Rating</option>
            </select>

            <div className="relative min-w-[220px]">
              <input
                type="text"
                placeholder="Search reviewer, order, keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-bg-surface border border-border-glass px-3 py-1.5 rounded-xl text-text-main text-xs outline-none w-full placeholder:text-text-dim/60"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main text-xs bg-transparent border-none cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reviews Feed Grid */}
        {isLoading ? (
          <div className="py-16 text-center text-text-dim text-xs">
            Loading customer reviews and reputation intelligence...
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="py-16 text-center text-text-dim border border-dashed border-border-glass rounded-xl flex flex-col items-center justify-center gap-2">
            <span className="text-3xl">⭐</span>
            <p className="font-bold text-sm text-text-main m-0">No reviews found matching filter criteria.</p>
            <p className="text-xs text-text-dim m-0">
              Try adjusting your filter tabs or search query to view customer ratings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feedbacks.map((f) => {
              const isCritical = f.rating <= 2;
              const isPositive = f.rating >= 4;
              const isResolved = f.status === 'Resolved';
              const highlightMatch = f.message?.match(/^\[Highlights:\s*(.+?)\]\s*/i);
              const highlights = highlightMatch
                ? highlightMatch[1].split(',').map((s) => s.trim())
                : [];
              const cleanMessage = highlightMatch
                ? f.message.replace(/^\[Highlights:\s*(.+?)\]\s*/i, '').trim()
                : f.message;

              return (
                <div
                  key={f.id}
                  className={`bg-bg-surface border rounded-2xl p-4 flex flex-col justify-between gap-3 text-left shadow-sm transition-all ${
                    isCritical && !isResolved
                      ? 'border-danger/40 bg-danger/[0.03]'
                      : f.isFeatured
                      ? 'border-amber-500/40 bg-amber-500/[0.02]'
                      : 'border-border-glass'
                  }`}
                >
                  <div className="flex flex-col gap-2.5">
                    {/* Header: Customer Info + Badges */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-500/30">
                          {f.customerName ? f.customerName.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-sm text-text-main block leading-tight truncate">
                            {f.customerName || 'Verified Customer'}
                          </span>
                          {f.customerEmail && (
                            <span className="text-[0.68rem] text-text-dim truncate block">{f.customerEmail}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {f.isFeatured && (
                          <span className="text-[0.6rem] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            Featured
                          </span>
                        )}
                        {isPositive ? (
                          <span className="text-[0.6rem] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Published
                          </span>
                        ) : isCritical ? (
                          isResolved ? (
                            <span className="text-[0.6rem] px-2 py-0.5 rounded-full font-bold bg-success/20 text-success border border-success/30 flex items-center gap-1">
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                              QA Resolved
                            </span>
                          ) : (
                            <span className="text-[0.6rem] px-2 py-0.5 rounded-full font-bold bg-danger/20 text-danger border border-danger/30 uppercase animate-pulse flex items-center gap-1">
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                              Quality Alert
                            </span>
                          )
                        ) : (
                          <span className="text-[0.6rem] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Feedback
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Rating row: Stars + Order Link + Date */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {renderStars(f.rating)}
                      <span className="text-[0.68rem] px-2 py-0.5 rounded bg-white/5 border border-border-glass text-text-dim font-medium">
                        {f.category}
                      </span>
                      {f.orderId && (
                        <span className="text-[0.68rem] px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 font-mono font-bold border border-sky-500/20 flex items-center gap-1">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          Order #{f.orderId}
                        </span>
                      )}
                      <span className="text-[0.65rem] text-text-dim ml-auto">
                        {new Date(f.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>

                    {/* Highlight Chips */}
                    {highlights.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {highlights.map((h, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-white/10 border border-border-glass text-text-main text-[0.65rem] font-medium"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Customer Review Quote */}
                    <div className="p-3 rounded-xl bg-bg-card border border-border-glass text-xs text-text-main leading-relaxed">
                      <p className="m-0 italic whitespace-pre-wrap">"{cleanMessage}"</p>
                    </div>

                    {/* Official Merchant Reply Box */}
                    {f.merchantReply && (
                      <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[0.72rem]">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          <span>Official Store Response — Eds Towels &amp; Caps</span>
                          <span className="text-[0.65rem] text-text-dim ml-auto font-normal">
                            {f.merchantReplyAt
                              ? new Date(f.merchantReplyAt).toLocaleDateString()
                              : 'Store Owner'}
                          </span>
                        </div>
                        <p className="m-0 text-text-main text-[0.78rem] leading-relaxed italic">
                          "{f.merchantReply}"
                        </p>
                      </div>
                    )}

                    {/* Service Recovery / Audit Record */}
                    {(f.rootCause || f.resolutionAction || f.staffNotes) && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[0.72rem] text-emerald-300 flex flex-col gap-0.5">
                        <span className="font-bold flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Service Recovery Log:
                        </span>
                        {f.rootCause && (
                          <span className="text-text-dim">
                            Root Cause: <strong className="text-text-main">{f.rootCause}</strong>
                          </span>
                        )}
                        {f.resolutionAction && (
                          <span className="text-text-dim">
                            Action Taken: <strong className="text-text-main">{f.resolutionAction}</strong>
                          </span>
                        )}
                        {f.staffNotes && (
                          <span className="italic text-text-main mt-0.5">"{f.staffNotes}"</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Footer: Quick Actions (Reply, Reviewed, Staff Note) */}
                  <div className="flex gap-2 pt-2 border-t border-border-glass mt-1 flex-wrap items-center">
                    {/* 1. Quick Mark Reviewed (Visible if still Pending) */}
                    {f.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => handleQuickMarkReviewed(f)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-bold cursor-pointer transition-all flex items-center gap-1 shrink-0"
                        title="Mark this customer review as Reviewed & Audited"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Mark Reviewed</span>
                      </button>
                    )}

                    {/* 2. 1-Click Smart Auto-Reply (If not yet replied) */}
                    {!f.merchantReply && (
                      <button
                        type="button"
                        onClick={() => handleOneClickAutoReply(f)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-text-main border border-border-glass text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 shrink-0"
                        title={`1-Click publish star-calibrated reply for ${f.rating}★ review`}
                      >
                        <span>Quick Reply</span>
                      </button>
                    )}

                    {/* 3. Merchant Reply / Edit Reply Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTarget(f);
                        const r = Math.max(1, Math.min(5, Math.round(f.rating || 5)));
                        setSelectedTemplateRating(r);
                        setMerchantReplyText(f.merchantReply || getPrimaryTemplateForRating(f.rating));
                        setIsPinningFeatured(!!f.isFeatured);
                      }}
                      className="flex-1 min-w-[120px] py-1.5 px-3 rounded-lg bg-indigo-500/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>{f.merchantReply ? 'Edit Store Reply' : 'Reply as Store Owner'}</span>
                    </button>

                    {/* 4. Staff Note Button (Private internal note) */}
                    <button
                      type="button"
                      onClick={() => {
                        setNoteTarget(f);
                        setStaffNoteText(f.staffNotes || '');
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                        f.staffNotes
                          ? 'bg-sky-500/15 text-sky-300 border-sky-500/30 hover:bg-sky-500/25'
                          : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                      }`}
                      title={f.staffNotes ? `Staff Note: "${f.staffNotes}"` : 'Add private internal staff note'}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      <span>{f.staffNotes ? 'Note Added' : '+ Staff Note'}</span>
                    </button>

                    {/* 5. Feature on Showcase Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleFeature(f)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                        f.isFeatured
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                          : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                      }`}
                      title={f.isFeatured ? 'Unpin from Storefront Showcase' : 'Pin to Storefront Showcase Top'}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill={f.isFeatured ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      <span>{f.isFeatured ? 'Featured' : 'Pin'}</span>
                    </button>

                    {/* 6. Service Recovery for 1-2★ */}
                    {isCritical && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecoveryTarget(f);
                          setRecoveryRootCause(f.rootCause || 'Hoop Tension / Registration Defect');
                          setRecoveryAction(f.resolutionAction || 'Complimentary Re-stitch & Store Pickup');
                          setRecoveryNotes(f.staffNotes || '');
                          setRecoveryStatus(f.status === 'Resolved' ? 'Resolved' : 'Reviewed');
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-danger/20 hover:bg-danger text-danger hover:text-white border border-danger/30 text-xs font-bold cursor-pointer transition-all flex items-center gap-1 shrink-0"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span>QA Recovery</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pt-4 border-t border-border-glass flex justify-center">
            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              itemLabel="reviews"
            />
          </div>
        )}
      </div>

      {/* Modal 1: Public Merchant Reply Modal (Gold Standard) */}
      {replyTarget && (
        <GlassModal
          isOpen={!!replyTarget}
          onClose={() => setReplyTarget(null)}
          title="Official Merchant Store Response"
          maxWidth="max-w-[560px]"
        >
          <form onSubmit={handleSaveMerchantReply} className="flex flex-col gap-4 text-left">
            <div className="p-3.5 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-text-main">{replyTarget.customerName || 'Customer'}</span>
                {renderStars(replyTarget.rating)}
              </div>
              {replyTarget.orderId && (
                <span className="text-sky-300 font-mono font-bold text-[0.7rem]">
                  Verified Order #{replyTarget.orderId}
                </span>
              )}
              <p className="text-text-dim italic m-0 mt-1">"{replyTarget.message}"</p>
            </div>

            {/* Star-Calibrated Smart Templates Selector */}
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-border-glass">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider flex items-center gap-1.5">
                  Star-Calibrated Smart Templates:
                </span>
                <span className="text-[10px] text-text-dim">
                  Review Rating: <strong className="text-text-main">{replyTarget.rating}★</strong>
                </span>
              </div>

              {/* Star Tier Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[5, 4, 3, 2, 1].map((s) => {
                  const isMatch = s === replyTarget.rating;
                  const isSelected = s === selectedTemplateRating;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedTemplateRating(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border shrink-0 ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                          : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
                      }`}
                    >
                      <span>{s}★</span>
                      {isMatch && (
                        <span className="text-[9px] px-1 py-0.2 bg-amber-500/30 text-amber-200 rounded font-normal">
                          Match
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Template Choices for Selected Star Tier */}
              <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                {(SMART_TEMPLATES_BY_RATING[selectedTemplateRating] || []).map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMerchantReplyText(tpl.text)}
                    className="p-2.5 rounded-lg bg-bg-surface hover:bg-white/10 border border-border-glass text-left cursor-pointer transition-all flex flex-col gap-1 group"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <strong className="text-text-main group-hover:text-amber-300 transition-colors">
                        {tpl.label}
                      </strong>
                      <span className="text-[10px] text-text-dim group-hover:text-text-main">
                        Click to Use ↵
                      </span>
                    </div>
                    <p className="text-[11px] text-text-dim m-0 line-clamp-2 leading-relaxed">
                      "{tpl.text}"
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Response Textarea */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Official Store Reply (Public on Catalog)
              </label>
              <textarea
                rows={4}
                required
                placeholder="Write an official merchant reply from Eds Towels & Caps..."
                value={merchantReplyText}
                onChange={(e) => setMerchantReplyText(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-3 rounded-xl text-xs text-text-main outline-none focus:border-indigo-500 resize-none placeholder:text-text-dim/60 leading-relaxed"
              />
              <span className="text-[0.68rem] text-text-dim">
                This official reply will be publicly displayed on the product catalog beneath the reviewer's comment.
              </span>
            </div>

            {/* Pin to Showcase Checkbox */}
            <label className="flex items-center gap-2 p-3 rounded-xl bg-bg-surface border border-border-glass cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={isPinningFeatured}
                onChange={(e) => setIsPinningFeatured(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="font-bold text-text-main">Feature as Top Showcase Review</span>
                <span className="text-[0.68rem] text-text-dim">
                  Pin this testimonial to the top of the storefront reviews section
                </span>
              </div>
            </label>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-border-glass">
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim text-xs font-bold border border-border-glass cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingReply || !merchantReplyText.trim()}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer disabled:opacity-40 transition-all border-none shadow-sm"
              >
                {isSubmittingReply ? 'Publishing...' : 'Publish Official Reply'}
              </button>
            </div>
          </form>
        </GlassModal>
      )}

      {/* Modal 2: Service Recovery & Quality Resolution Modal (1-2★) */}
      {recoveryTarget && (
        <GlassModal
          isOpen={!!recoveryTarget}
          onClose={() => setRecoveryTarget(null)}
          title="Quality Issue & Service Recovery Action"
          maxWidth="max-w-[560px]"
        >
          <form onSubmit={handleSaveQualityRecovery} className="flex flex-col gap-4 text-left">
            <div className="p-3.5 rounded-xl bg-danger/[0.05] border border-danger/30 flex flex-col gap-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-danger flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Customer Complaint #{recoveryTarget.id.slice(0, 8)}
                </span>
                {renderStars(recoveryTarget.rating)}
              </div>
              <p className="text-text-main italic m-0 mt-1">"{recoveryTarget.message}"</p>
            </div>

            {/* Root Cause Dropdown */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Defect Root Cause (Engineering / Production Audit)
              </label>
              <select
                value={recoveryRootCause}
                onChange={(e) => setRecoveryRootCause(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-xs text-text-main outline-none focus:border-primary cursor-pointer"
              >
                <option value="Hoop Tension / Registration Defect">Hoop Tension / Registration Defect</option>
                <option value="Bobbin Thread Snagging / Fraying">Bobbin Thread Snagging / Fraying</option>
                <option value="Water-Soluble Solvy Residue">Water-Soluble Solvy Residue / Hoop Mark</option>
                <option value="Misspelling / Claim Stub Monogram Error">Misspelling / Claim Stub Monogram Error</option>
                <option value="Store Pick-up Counter Queue Delay">Store Pick-up Counter Queue Delay</option>
                <option value="Fabric Color / Sizing Mismatch">Fabric Color / Sizing Mismatch</option>
              </select>
            </div>

            {/* Resolution Action Taken */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Corrective Recovery Action Taken
              </label>
              <select
                value={recoveryAction}
                onChange={(e) => setRecoveryAction(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-xs text-text-main outline-none focus:border-primary cursor-pointer"
              >
                <option value="Complimentary Re-stitch & Store Pickup">Complimentary Re-stitch &amp; Store Pickup</option>
                <option value="Free Express Replacement Shipped">Free Express Replacement Shipped</option>
                <option value="Store Credit / 20% Discount Voucher Issued">Store Credit / 20% Discount Voucher Issued</option>
                <option value="Full Payment Refund Processed">Full Payment Refund Processed</option>
                <option value="Direct Management Phone Call & Apology">Direct Management Phone Call &amp; Apology</option>
              </select>
            </div>

            {/* Resolution Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Case Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Pending', 'Reviewed', 'Resolved'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setRecoveryStatus(st)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      recoveryStatus === st
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white/5 border-border-glass text-text-dim hover:text-text-main'
                    }`}
                  >
                    {st === 'Pending' ? 'Investigating' : st === 'Reviewed' ? 'Contacted' : 'Resolved & Closed'}
                  </button>
                ))}
              </div>
            </div>

            {/* Internal QA Audit Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Internal Case Notes &amp; Management Audit
              </label>
              <textarea
                rows={3}
                required
                placeholder="Document client agreement, technician who inspected machine tension, or tracking number of re-stitched towel..."
                value={recoveryNotes}
                onChange={(e) => setRecoveryNotes(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-3 rounded-xl text-xs text-text-main outline-none focus:border-primary resize-none placeholder:text-text-dim/60 leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-border-glass">
              <button
                type="button"
                onClick={() => setRecoveryTarget(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim text-xs font-bold border border-border-glass cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingRecovery || !recoveryNotes.trim()}
                className="px-5 py-2 rounded-xl bg-success hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer disabled:opacity-40 transition-all border-none shadow-sm"
              >
                {isSubmittingRecovery ? 'Saving...' : 'Save Resolution & Close Case'}
              </button>
            </div>
          </form>
        </GlassModal>
      )}

      {/* Modal 3: Quick Staff Note Modal */}
      {noteTarget && (
        <GlassModal
          isOpen={!!noteTarget}
          onClose={() => setNoteTarget(null)}
          title={`Internal Staff Note • #${noteTarget.id.slice(0, 8)}`}
          maxWidth="max-w-[480px]"
        >
          <form onSubmit={handleSaveStaffNote} className="flex flex-col gap-4 text-left">
            <div className="p-3.5 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-text-main">{noteTarget.customerName || 'Anonymous Customer'}</span>
                {renderStars(noteTarget.rating)}
              </div>
              {noteTarget.orderId && (
                <span className="text-sky-300 font-mono font-bold text-[0.7rem]">
                  Order #{noteTarget.orderId}
                </span>
              )}
              <p className="text-text-dim italic m-0 mt-1 line-clamp-2">"{noteTarget.message}"</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Internal Private Note (Staff Only)
              </label>
              <textarea
                rows={4}
                required
                placeholder="Document follow-ups, client outreach, machine adjustments, or special order details..."
                value={staffNoteText}
                onChange={(e) => setStaffNoteText(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-3 rounded-xl text-xs text-text-main outline-none focus:border-primary resize-none placeholder:text-text-dim/60 leading-relaxed font-sans"
              />
              <span className="text-[0.68rem] text-text-dim">
                Private internal notes are never displayed on the public storefront.
              </span>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-border-glass">
              <button
                type="button"
                onClick={() => setNoteTarget(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim text-xs font-bold border border-border-glass cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingNote || !staffNoteText.trim()}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold cursor-pointer disabled:opacity-40 transition-all border-none shadow-sm"
              >
                {isSavingNote ? 'Saving...' : 'Save Staff Note'}
              </button>
            </div>
          </form>
        </GlassModal>
      )}
    </div>
  );
}
