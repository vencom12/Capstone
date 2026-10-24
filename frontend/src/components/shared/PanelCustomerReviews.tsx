'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Pagination from '@/components/ui/Pagination';

export interface FeedbackItem {
  id: string;
  category: string;
  rating: number;
  message: string;
  customerName?: string;
  customerEmail?: string;
  orderId?: string;
  productId?: string;
  status: 'Pending' | 'Reviewed' | 'Resolved';
  staffNotes?: string;
  merchantReply?: string;
  merchantReplyAt?: string;
  isFeatured?: boolean;
  createdAt: string;
}

interface FeedbackMetrics {
  totalCount: number;
  pendingCount: number;
  reviewedCount: number;
  resolvedCount: number;
  fiveStarCount: number;
  averageRating: number;
  sentimentRate: number;
}

interface PanelCustomerReviewsProps {
  role: 'admin' | 'employee';
}

const QUICK_TEMPLATES: Record<number, string> = {
  5: 'Thank you so much for the 5-star review! We take immense pride in every stitch and look forward to creating your next custom embroidery!',
  4: 'Thank you for the 4-star feedback! We are glad you enjoyed your custom piece and appreciate your support.',
  3: 'Thank you for sharing your feedback. We review all customer comments with our team to keep improving stitch quality.',
  2: 'We sincerely apologize that your order did not meet expectations. Our team has flagged this to investigate and improve.',
  1: 'We are deeply sorry for your disappointing experience. Our team takes quality very seriously and has recorded this for review.',
};

// Module-level cache for instant tab navigation (Stale-While-Revalidate)
const reviewsCache: Record<string, {
  feedbacks: FeedbackItem[];
  metrics: FeedbackMetrics;
  totalItems: number;
}> = {};

export default function PanelCustomerReviews({ role }: PanelCustomerReviewsProps) {
  const apiPrefix = role === 'admin' ? '/api/admin/feedback' : '/api/employee/feedback';

  const cached = reviewsCache[role || 'admin'];
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>(() => cached?.feedbacks || []);
  const [metrics, setMetrics] = useState<FeedbackMetrics>(() => cached?.metrics || {
    totalCount: 0,
    pendingCount: 0,
    reviewedCount: 0,
    resolvedCount: 0,
    fiveStarCount: 0,
    averageRating: 5.0,
    sentimentRate: 100,
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => !cached);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Filters
  const [filterTab, setFilterTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(() => cached?.totalItems || 0);
  const [pageSize, setPageSize] = useState<number>(10);

  // Expanded review state: Only display details when clicked
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // In-line reply & note states for the currently expanded item
  const [replyInput, setReplyInput] = useState<string>('');
  const [noteInput, setNoteInput] = useState<string>('');
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false);
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  // Fetch reviews from API
  const fetchFeedbacks = useCallback(
    async (isSilent = false) => {
      const hasCached = Boolean(reviewsCache[role || 'admin']);
      if (!isSilent && !hasCached) setIsLoading(true);
      setIsSyncing(true);
      try {
        const params = new URLSearchParams();
        if (filterTab === 'pending') {
          params.append('status', 'Pending');
        } else if (filterTab === 'critical') {
          params.append('rating', 'critical');
        } else if (['5', '4', '3'].includes(filterTab)) {
          params.append('rating', filterTab);
        }

        if (searchQuery.trim()) {
          params.append('search', searchQuery.trim());
        }
        params.append('page', currentPage.toString());
        params.append('limit', pageSize.toString());

        const res = await api.get<{
          success: boolean;
          feedbacks: FeedbackItem[];
          pagination: { total: number; page: number; totalPages: number };
          metrics: FeedbackMetrics;
        }>(`${apiPrefix}?${params.toString()}`);

        if (res && res.success) {
          const loadedFeedbacks = res.feedbacks || [];
          const loadedTotal = res.pagination?.total || 0;
          setFeedbacks(loadedFeedbacks);
          setTotalItems(loadedTotal);
          if (res.metrics) {
            setMetrics(res.metrics);
          }
          reviewsCache[role || 'admin'] = {
            feedbacks: loadedFeedbacks,
            metrics: res.metrics || metrics,
            totalItems: loadedTotal,
          };
        }
      } catch (err) {
        console.error('Failed to load reviews:', err);
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
      }
    },
    [apiPrefix, role, filterTab, searchQuery, currentPage, pageSize]
  );

  useEffect(() => {
    const hasCached = Boolean(reviewsCache[role || 'admin']);
    fetchFeedbacks(hasCached);
  }, [fetchFeedbacks]);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [filterTab, searchQuery]);

  // Handle accordion toggle
  const toggleExpand = (feedback: FeedbackItem) => {
    if (expandedId === feedback.id) {
      setExpandedId(null);
    } else {
      setExpandedId(feedback.id);
      setReplyInput(feedback.merchantReply || QUICK_TEMPLATES[feedback.rating] || QUICK_TEMPLATES[5]);
      setNoteInput(feedback.staffNotes || '');
    }
  };

  // Change review status
  const handleStatusChange = async (feedback: FeedbackItem, nextStatus: 'Pending' | 'Reviewed' | 'Resolved') => {
    try {
      await api.patch(`${apiPrefix}/${feedback.id}`, { status: nextStatus });
      showToast(`Status updated to ${nextStatus}`, 'success');
      fetchFeedbacks(true);
    } catch (err) {
      console.error(err);
      showToast('Failed to update status', 'error');
    }
  };

  // Save Store Reply
  const handleSaveReply = async (feedback: FeedbackItem) => {
    if (!replyInput.trim()) {
      showToast('Please type a reply message first', 'info');
      return;
    }
    setIsSubmittingReply(true);
    try {
      await api.post(`${apiPrefix}/${feedback.id}/reply`, { reply: replyInput.trim() });
      showToast('Store reply saved', 'success');
      fetchFeedbacks(true);
    } catch (err) {
      console.error(err);
      showToast('Failed to save store reply', 'error');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Save Staff Note
  const handleSaveNote = async (feedback: FeedbackItem) => {
    setIsSavingNote(true);
    try {
      await api.patch(`${apiPrefix}/${feedback.id}`, { staffNotes: noteInput.trim() });
      showToast('Internal note saved', 'success');
      fetchFeedbacks(true);
    } catch (err) {
      console.error(err);
      showToast('Failed to save internal note', 'error');
    } finally {
      setIsSavingNote(false);
    }
  };

  // Toggle Showcase Feature (Admin only)
  const handleToggleFeature = async (feedback: FeedbackItem) => {
    try {
      const res = await api.patch<{ success: boolean; message: string }>(
        `/api/admin/feedback/${feedback.id}/feature`,
        {}
      );
      if (res && res.success) {
        showToast(res.message, 'success');
        fetchFeedbacks(true);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to toggle featured status', 'error');
    }
  };

  // Export CSV (Admin only)
  const handleExportCsv = () => {
    if (feedbacks.length === 0) {
      showToast('No reviews to export', 'info');
      return;
    }
    const headers = ['ID', 'Customer', 'Rating', 'Message', 'Status', 'Store Reply', 'Date'];
    const rows = feedbacks.map((f) => [
      `"${f.id}"`,
      `"${f.customerName || 'Customer'}"`,
      f.rating,
      `"${(f.message || '').replace(/"/g, '""')}"`,
      `"${f.status}"`,
      `"${(f.merchantReply || '').replace(/"/g, '""')}"`,
      `"${new Date(f.createdAt).toLocaleDateString()}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `REVIEWS_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render clean stars (Plain gold text stars, no colorful emojis)
  const renderStars = (rating: number) => {
    const full = Math.max(1, Math.min(5, Math.round(rating || 5)));
    return (
      <span className="font-mono text-amber-400 font-bold tracking-tight text-xs">
        {'★'.repeat(full)}
        <span className="text-white/20">{'★'.repeat(5 - full)}</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full text-left font-sans max-w-5xl mx-auto pb-16 w-full min-w-0 overflow-x-hidden">
      {/* Top Action Toolbar */}
      <div className="flex items-center justify-start gap-2.5 flex-wrap mb-4">
        {role === 'admin' && (
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl border border-border-glass bg-bg-surface hover:bg-white/5 text-text-main text-xs font-semibold transition cursor-pointer"
          >
            Export CSV
          </button>
        )}

        <button
          type="button"
          onClick={() => fetchFeedbacks(true)}
          disabled={isSyncing}
          className="px-3.5 py-2 rounded-xl border border-border-glass bg-bg-surface hover:bg-white/5 text-text-main text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={isSyncing ? 'animate-spin' : ''}
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
          <span>{isSyncing ? 'Syncing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* 3 Simple Summary Cards (No colorful graphics) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
        <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Average Rating</span>
          <div className="my-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-text-main">
              {metrics.averageRating.toFixed(1)}
            </span>
            <span className="text-xs text-text-dim">/ 5.0</span>
          </div>
          <span className="text-[11px] text-text-dim">Based on customer submissions</span>
        </div>

        <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Total Reviews</span>
          <div className="my-1.5 text-2xl font-black font-mono text-text-main">
            {metrics.totalCount}
          </div>
          <span className="text-[11px] text-text-dim">
            {metrics.fiveStarCount} customers rated 5 stars
          </span>
        </div>

        <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Pending Attention</span>
          <div className="my-1.5 text-2xl font-black font-mono text-text-main">
            {metrics.pendingCount}
          </div>
          <span className="text-[11px] text-text-dim">
            {metrics.pendingCount > 0 ? 'Awaiting review or response' : 'All reviews reviewed'}
          </span>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending', count: metrics.pendingCount },
            { id: '5', label: '5 Stars' },
            { id: '4', label: '4 Stars' },
            { id: '3', label: '3 Stars' },
            { id: 'critical', label: '1-2 Stars' },
          ].map((pill) => {
            const isActive = filterTab === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setFilterTab(pill.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer border ${
                  isActive
                    ? 'bg-white/10 text-text-main border-white/20 shadow-xs'
                    : 'text-text-dim border-transparent hover:text-text-main hover:bg-white/5'
                }`}
              >
                <span>{pill.label}</span>
                {pill.count !== undefined && pill.count > 0 && (
                  <span className="ml-1.5 text-[10px] font-mono px-1 rounded bg-white/10 text-text-main">
                    {pill.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer or order..."
            className="w-full bg-bg-surface border border-border-glass px-3 py-1.5 rounded-xl text-xs text-text-main outline-none focus:border-white/30 transition placeholder:text-text-dim"
          />
        </div>
      </div>

      {/* Table Column Headers */}
      {!isLoading && feedbacks.length > 0 && (
        <div className="hidden sm:flex items-center justify-between px-3.5 py-2 text-[11px] font-bold text-text-dim uppercase tracking-wider bg-white/[0.02] border border-border-glass rounded-lg">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="w-24 shrink-0">Rating</span>
            <span className="w-48 shrink-0">Customer &amp; Date</span>
            <span className="flex-1 truncate">Feedback Preview</span>
          </div>
          <div className="flex items-center gap-6 shrink-0 pr-2">
            <span>Status</span>
            <span>Details</span>
          </div>
        </div>
      )}

      {/* REVIEWS LIST: Clean, compact rows that expand ONLY when clicked */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-text-dim bg-bg-surface border border-border-glass rounded-xl">
            Loading reviews...
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="py-12 text-center text-xs text-text-dim bg-bg-surface border border-border-glass rounded-xl">
            No customer reviews found matching your filters.
          </div>
        ) : (
          feedbacks.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className={`border rounded-xl transition bg-bg-surface w-full max-w-full overflow-hidden ${
                  isExpanded ? 'border-white/30 bg-white/[0.03]' : 'border-border-glass hover:bg-white/[0.015]'
                }`}
              >
                {/* COMPACT SUMMARY ROW (Click to Expand / Collapse) */}
                <div
                  onClick={() => toggleExpand(item)}
                  className="p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 cursor-pointer select-none w-full min-w-0 max-w-full overflow-hidden"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 w-full flex-1 overflow-hidden">
                    {/* Star Rating */}
                    <div className="shrink-0 mt-0.5 sm:mt-0">{renderStars(item.rating)}</div>

                    {/* Customer Name & Order */}
                    <div className="min-w-0 flex-1 overflow-hidden max-w-full">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-text-main truncate max-w-[140px] sm:max-w-none">
                          {item.customerName || 'Valued Customer'}
                        </span>
                        {item.orderId && (
                          <span className="text-[10px] font-mono text-text-dim px-1.5 py-0.5 rounded bg-white/5 border border-white/10 shrink-0">
                            #{item.orderId}
                          </span>
                        )}
                        <span className="text-[11px] text-text-dim shrink-0">
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      {/* 1-Line Truncated Preview on desktop, 2-line wrapped on mobile */}
                      {!isExpanded && (
                        <p className="text-xs text-text-dim line-clamp-2 sm:truncate mt-1 m-0 font-normal break-words max-w-full block overflow-hidden">
                          "{item.message}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status Badge & Expand Toggle Indicator */}
                  <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t border-white/[0.04] sm:border-0 mt-0.5 sm:mt-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                          item.status === 'Pending'
                            ? 'bg-white/5 text-text-dim border-border-glass'
                            : item.status === 'Resolved'
                            ? 'bg-white/10 text-text-main border-white/20'
                            : 'bg-white/5 text-text-main border-border-glass'
                        }`}
                      >
                        {item.status}
                      </span>

                      {item.merchantReply && (
                        <span className="text-[11px] font-medium text-text-dim">
                          Replied
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-text-dim font-bold shrink-0">
                      {isExpanded ? 'Close ▲' : 'View ▼'}
                    </span>
                  </div>
                </div>

                {/* EXPANDED SECTION (Shown ONLY when clicked) */}
                {isExpanded && (
                  <div className="p-4 pt-1 border-t border-white/5 space-y-3.5 animate-[fadeIn_0.15s_ease-out]">
                    {/* Full Customer Message */}
                    <div className="p-3 rounded-lg bg-bg-card border border-border-glass">
                      <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                        Customer Message
                      </div>
                      <p className="text-xs text-text-main leading-relaxed m-0 italic whitespace-pre-wrap break-words">
                        "{item.message}"
                      </p>
                    </div>

                    {/* Official Store Response Section */}
                    <div className="p-3 rounded-lg bg-bg-card border border-border-glass space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-text-dim uppercase tracking-wider">
                          Official Store Reply
                        </span>
                        {item.merchantReplyAt && (
                          <span className="text-[10px] text-text-dim">
                            Sent {new Date(item.merchantReplyAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <textarea
                        rows={2}
                        value={replyInput}
                        onChange={(e) => setReplyInput(e.target.value)}
                        placeholder="Type reply to this customer..."
                        className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-lg text-xs text-text-main outline-none focus:border-white/30 transition resize-none placeholder:text-text-dim"
                      />

                      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                        {/* Quick Template Selector */}
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-text-dim">Use template:</span>
                          <button
                            type="button"
                            onClick={() => setReplyInput(QUICK_TEMPLATES[item.rating] || QUICK_TEMPLATES[5])}
                            className="text-text-dim hover:text-text-main underline cursor-pointer"
                          >
                            Default for {item.rating}★
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSaveReply(item)}
                          disabled={isSubmittingReply}
                          className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-text-main text-xs font-bold transition cursor-pointer"
                        >
                          {isSubmittingReply ? 'Saving...' : 'Save Reply'}
                        </button>
                      </div>
                    </div>

                    {/* Internal Staff Note & Status Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Staff Note */}
                      <div className="p-3 rounded-lg bg-bg-card border border-border-glass flex flex-col justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                            Internal Staff Note (Private)
                          </div>
                          <input
                            type="text"
                            value={noteInput}
                            onChange={(e) => setNoteInput(e.target.value)}
                            placeholder="Add a private note for staff..."
                            className="w-full bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-lg text-xs text-text-main outline-none focus:border-white/30 transition placeholder:text-text-dim"
                          />
                        </div>
                        <div className="text-right">
                          <button
                            type="button"
                            onClick={() => handleSaveNote(item)}
                            disabled={isSavingNote}
                            className="px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 text-text-dim hover:text-text-main text-xs font-medium transition cursor-pointer"
                          >
                            {isSavingNote ? 'Saving...' : 'Save Note'}
                          </button>
                        </div>
                      </div>

                      {/* Status & Options */}
                      <div className="p-3 rounded-lg bg-bg-card border border-border-glass flex flex-col justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                            Review Status
                          </div>
                          <div className="flex items-center gap-1.5">
                            {(['Pending', 'Reviewed', 'Resolved'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleStatusChange(item, st)}
                                className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer border transition ${
                                  item.status === st
                                    ? 'bg-white/15 text-text-main border-white/20'
                                    : 'bg-white/5 text-text-dim border-border-glass hover:text-text-main'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>

                        {role === 'admin' && (
                          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                            <span className="text-xs text-text-dim">Show on Website:</span>
                            <button
                              type="button"
                              onClick={() => handleToggleFeature(item)}
                              className={`text-xs font-semibold underline cursor-pointer ${
                                item.isFeatured ? 'text-text-main' : 'text-text-dim hover:text-text-main'
                              }`}
                            >
                              {item.isFeatured ? 'Featured on Website ✓' : 'Feature this review'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        pageSizeOptions={[5, 10, 20, 50]}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
        itemLabel="customer reviews"
      />
    </div>
  );
}
