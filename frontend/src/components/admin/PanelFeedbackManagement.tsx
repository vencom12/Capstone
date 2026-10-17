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
  const [isPinningFeatured, setIsPinningFeatured] = useState<boolean>(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false);

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

        <div className="flex items-center gap-2.5">
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
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-transparent hover:bg-white/5'
                  }`}
                >
                  <span className="font-mono font-bold w-6 text-right shrink-0">{star}★</span>
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        star >= 4 ? 'bg-amber-400' : star === 3 ? 'bg-amber-500/70' : 'bg-danger'
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
              <span className="text-[10px] text-primary font-mono font-bold">
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
                  className="px-3 py-1.5 rounded-xl bg-bg-surface border border-border-glass flex items-center gap-2 shadow-sm"
                >
                  <span className="text-primary font-bold text-xs">{sh.tag}</span>
                  <span className="px-2 py-0.2 rounded-full bg-primary/15 text-primary text-[10px] font-mono font-black">
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
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
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
                        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-primary/30">
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
                        <span className="text-[0.68rem] px-2 py-0.5 rounded bg-primary/10 text-primary font-mono font-bold border border-primary/20 flex items-center gap-1">
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
                            className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[0.65rem] font-medium"
                          >
                            ✨ {h}
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
                      <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-1.5 text-primary font-bold text-[0.72rem]">
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

                  {/* Action Footer */}
                  <div className="flex gap-2 pt-2 border-t border-border-glass mt-1 flex-wrap">
                    {/* Merchant Reply Button */}
                    <button
                      onClick={() => {
                        setReplyTarget(f);
                        setMerchantReplyText(f.merchantReply || '');
                        setIsPinningFeatured(!!f.isFeatured);
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-white border border-primary/30 text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>{f.merchantReply ? 'Edit Store Reply' : 'Reply as Store Owner'}</span>
                    </button>

                    {/* Feature on Showcase Toggle */}
                    <button
                      onClick={() => handleToggleFeature(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        f.isFeatured
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                          : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                      }`}
                      title={f.isFeatured ? 'Unpin from Storefront Showcase' : 'Pin to Storefront Showcase Top'}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill={f.isFeatured ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      <span>{f.isFeatured ? 'Featured' : 'Pin'}</span>
                    </button>

                    {/* Service Recovery for 1-2★ */}
                    {isCritical && (
                      <button
                        onClick={() => {
                          setRecoveryTarget(f);
                          setRecoveryRootCause(f.rootCause || 'Hoop Tension / Registration Defect');
                          setRecoveryAction(f.resolutionAction || 'Complimentary Re-stitch & Store Pickup');
                          setRecoveryNotes(f.staffNotes || '');
                          setRecoveryStatus(f.status === 'Resolved' ? 'Resolved' : 'Reviewed');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-danger/20 hover:bg-danger text-danger hover:text-white border border-danger/30 text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
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
                <span className="text-primary font-mono font-bold text-[0.7rem]">
                  Verified Order #{replyTarget.orderId}
                </span>
              )}
              <p className="text-text-dim italic m-0 mt-1">"{replyTarget.message}"</p>
            </div>

            {/* Quick Templates Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider">
                Quick Merchant Templates:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setMerchantReplyText(
                      `Thank you so much for your kind words! We take great pride in our high-density monogram stitching. We hope to see you again at our Pacific Mall Lucena studio!`
                    )
                  }
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-[11px] text-text-main text-left cursor-pointer transition-all"
                >
                  <strong>5★ Craftsmanship Appreciation</strong>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMerchantReplyText(
                      `We are thrilled your personalized embroidery arrived ahead of schedule and exceeded your expectations! Thank you for choosing Eds Towels & Caps.`
                    )
                  }
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-[11px] text-text-main text-left cursor-pointer transition-all"
                >
                  <strong>Speed &amp; Turnaround Gratitude</strong>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMerchantReplyText(
                      `We sincerely apologize for this experience. Craftsmanship is our highest priority, and our workshop manager would love to remake your items free of charge. We have sent you a direct message.`
                    )
                  }
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-[11px] text-text-main text-left cursor-pointer transition-all sm:col-span-2"
                >
                  <strong>Service Recovery Apology &amp; Remake Offer</strong>
                </button>
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
                className="w-full bg-bg-surface border border-border-glass p-3 rounded-xl text-xs text-text-main outline-none focus:border-primary resize-none placeholder:text-text-dim/60 leading-relaxed"
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
                className="w-4 h-4 accent-primary cursor-pointer"
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
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-bold cursor-pointer disabled:opacity-40 transition-all border-none shadow-sm"
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
                <option value="Courier Delivery Transit Delay">Courier Delivery Transit Delay</option>
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
    </div>
  );
}
