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

const parseReviewMessage = (rawMessage: string) => {
  if (!rawMessage) return { tags: [] as string[], text: '' };
  const match = rawMessage.match(/^\[Highlights:\s*(.+?)\]\s*([\s\S]*)$/i);
  if (match) {
    const tags = match[1].split(',').map((s) => s.trim()).filter(Boolean);
    const text = match[2]?.trim() || '';
    return { tags, text };
  }
  return { tags: [] as string[], text: rawMessage.trim() };
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

  // Filters (Separated into Customer Star Rating vs Staff Moderation Status)
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
  const [isTriggeringAutoReply, setIsTriggeringAutoReply] = useState<boolean>(false);

  // Fetch reviews from API
  const fetchFeedbacks = useCallback(
    async (isSilent = false) => {
      const hasCached = Boolean(reviewsCache[role || 'admin']);
      if (!isSilent && !hasCached) setIsLoading(true);
      setIsSyncing(true);
      try {
        const params = new URLSearchParams();

        // 1. Staff Workflow / Moderation Status
        if (statusFilter !== 'all') {
          params.append('status', statusFilter);
        }

        // 2. Customer Review Star Rating
        if (ratingFilter === 'critical') {
          params.append('rating', 'critical');
        } else if (['5', '4', '3'].includes(ratingFilter)) {
          params.append('rating', ratingFilter);
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
    [apiPrefix, role, ratingFilter, statusFilter, searchQuery, currentPage, pageSize]
  );

  useEffect(() => {
    const hasCached = Boolean(reviewsCache[role || 'admin']);
    fetchFeedbacks(hasCached);
  }, [fetchFeedbacks]);

  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [ratingFilter, statusFilter, searchQuery]);

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

  // Manually trigger immediate auto-replies for 3, 4, 5 stars (Admin only)
  const handleTriggerAutoReply = async () => {
    setIsTriggeringAutoReply(true);
    try {
      const res = await api.post<{ success: boolean; count: number; message: string }>(
        '/api/admin/feedback/trigger-auto-reply',
        {}
      );
      if (res && res.success) {
        showToast(res.message, 'success');
        fetchFeedbacks(true);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to trigger automated replies', 'error');
    } finally {
      setIsTriggeringAutoReply(false);
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

  // Render clean stars (Plain monochrome text stars, no colorful icons)
  const renderStars = (rating: number) => {
    const full = Math.max(1, Math.min(5, Math.round(rating || 5)));
    return (
      <span className="font-mono text-text-main font-bold tracking-tight text-xs">
        {'★'.repeat(full)}
        <span className="text-white/20">{'★'.repeat(5 - full)}</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col min-h-full text-left font-sans max-w-5xl mx-auto pt-2 pb-32 sm:pb-40 w-full min-w-0">
      {/* Top Action Toolbar */}
      <div className="flex items-center justify-start gap-2.5 flex-wrap mb-4">
        {role === 'admin' && (
          <>
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl border border-border-glass bg-bg-surface hover:bg-white/5 text-text-main text-xs font-semibold transition cursor-pointer"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleTriggerAutoReply}
              disabled={isTriggeringAutoReply || isSyncing}
              className="px-3.5 py-2 rounded-xl border border-border-glass bg-bg-surface hover:bg-white/5 text-text-main text-xs font-semibold transition cursor-pointer"
              title="Immediately send automated replies to any eligible 3, 4, and 5-star reviews"
            >
              {isTriggeringAutoReply ? 'Sending replies...' : 'Auto-Reply Now (3-5★)'}
            </button>
          </>
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

      {/* Simple Clean Summary Bar (No colorful icon boxes) */}
      <div className="bg-bg-surface border border-border-glass rounded-xl px-5 py-3.5 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
        <div>
          <div className="text-[11px] font-medium text-text-dim">Overall Rating</div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-bold text-text-main font-mono">
              {metrics.averageRating.toFixed(1)}
            </span>
            <span className="text-xs text-text-dim">/ 5.0</span>
            <span className="text-xs text-text-dim ml-2 font-mono">
              ({metrics.totalCount} {metrics.totalCount === 1 ? 'review' : 'reviews'})
            </span>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-text-dim">5-Star Feedback</div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-bold text-text-main font-mono">
              {metrics.fiveStarCount}
            </span>
            <span className="text-xs text-text-dim">five-star reviews</span>
            <span className="text-xs text-text-dim ml-2 font-mono">
              ({metrics.totalCount > 0 ? Math.round((metrics.fiveStarCount / metrics.totalCount) * 100) : 100}%)
            </span>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-text-dim">Manual Action (1-2★)</div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-bold text-text-main font-mono">
              {feedbacks.filter(f => f.rating <= 2 && (!f.merchantReply || !f.merchantReply.trim())).length}
            </span>
            <span className="text-xs text-text-dim">needs admin reply</span>
          </div>
        </div>
      </div>

      {/* Simple Filter & Search Bar */}
      <div className="bg-bg-surface border border-border-glass rounded-xl p-3 mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Rating Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-0.5">
          {[
            { id: 'all', label: `All (${metrics.totalCount})` },
            { id: '5', label: '5 Stars' },
            { id: '4', label: '4 Stars' },
            { id: '3', label: '3 Stars' },
            { id: 'critical', label: '1-2 Stars (Action Needed)' },
          ].map((pill) => {
            const isActive = ratingFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setRatingFilter(pill.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer border shrink-0 text-xs ${isActive
                  ? 'bg-white/15 text-text-main border-white/30 shadow-xs'
                  : 'text-text-dim border-transparent hover:text-text-main hover:bg-white/5'
                  }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reviews..."
            className="w-full sm:w-60 bg-bg-card border border-border-glass px-3 py-1.5 rounded-lg text-xs text-text-main outline-none focus:border-white/30 transition placeholder:text-text-dim"
          />
          {(ratingFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setRatingFilter('all');
                setSearchQuery('');
              }}
              className="text-xs text-text-dim hover:text-text-main underline cursor-pointer shrink-0"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* REVIEWS LIST: Clean, friendly cards */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-text-dim bg-bg-surface border border-border-glass rounded-xl">
            Loading customer reviews...
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="py-12 text-center text-xs text-text-dim bg-bg-surface border border-border-glass rounded-xl flex flex-col items-center gap-2">
            <span>No customer reviews found.</span>
            {(ratingFilter !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setRatingFilter('all');
                  setSearchQuery('');
                }}
                className="text-xs text-text-main font-semibold underline cursor-pointer"
              >
                Show all reviews
              </button>
            )}
          </div>
        ) : (
          feedbacks.map((item) => {
            const isExpanded = expandedId === item.id;
            const { tags, text } = parseReviewMessage(item.message);
            return (
              <div
                key={item.id}
                className={`border rounded-xl transition bg-bg-surface w-full overflow-hidden ${isExpanded ? 'border-white/30 bg-white/[0.02]' : 'border-border-glass hover:border-white/20'
                  }`}
              >
                {/* Clean, readable review card */}
                <div className="p-4 flex flex-col gap-2.5">
                  {/* Top Bar: Stars + Customer Name + Date + Order */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div>{renderStars(item.rating)}</div>
                      <span className="text-xs font-bold text-text-main">
                        {item.customerName || 'Customer'}
                      </span>
                      {item.orderId && (
                        <span className="text-[10px] font-mono text-text-dim px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                          #{item.orderId}
                        </span>
                      )}
                      <span className="text-[11px] text-text-dim">
                        {new Date(item.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    {/* Quick Status & Action */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {item.merchantReply ? (
                        <span className="text-[10px] font-semibold text-text-main bg-white/10 border border-white/20 px-2 py-0.5 rounded-md">
                          {item.rating <= 2 ? 'Admin Replied' : 'Replied'}
                        </span>
                      ) : item.rating <= 2 ? (
                        <span className="text-[10px] font-bold text-text-main bg-white/15 border border-white/30 px-2 py-0.5 rounded-md">
                          Manual Action Required
                        </span>
                      ) : (
                        <span className="text-[10px] text-text-dim bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">
                          Auto-reply pending (~5m)
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleExpand(item)}
                        className="text-xs font-semibold text-text-main hover:underline transition cursor-pointer bg-transparent border-none p-1"
                      >
                        {isExpanded ? 'Close' : item.merchantReply ? 'Edit Reply' : item.rating <= 2 ? 'Manual Reply' : 'Reply Now'}
                      </button>
                    </div>
                  </div>

                  {/* Highlights Tags (Rendered as subtle monochrome chips) */}
                  {tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-text-dim"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Customer Review Message */}
                  {text ? (
                    <p className="text-xs text-text-main leading-relaxed m-0 font-normal">
                      "{text}"
                    </p>
                  ) : (
                    <p className="text-xs text-text-dim italic m-0">
                      Customer rated {item.rating} stars with the highlights selected above.
                    </p>
                  )}

                  {/* Existing Store Reply Preview (when not expanded) */}
                  {!isExpanded && item.merchantReply && (
                    <div className="mt-1 p-2.5 rounded-lg bg-white/[0.02] border border-border-glass text-xs text-text-dim flex items-start gap-1.5">
                      <span className="font-bold text-text-main shrink-0">Your Reply:</span>
                      <span className="italic truncate">"{item.merchantReply}"</span>
                    </div>
                  )}
                </div>

                {/* EXPANDED SECTION (Shown ONLY when replying or inspecting) */}
                {isExpanded && (
                  <div className="p-4 pt-2 border-t border-white/5 space-y-3 bg-white/[0.01]">
                    {/* Reply Box */}
                    <div className="p-3 rounded-lg bg-bg-card border border-border-glass space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-text-main">
                          {item.rating <= 2 ? 'Admin Manual Intervention' : 'Reply to Customer'}
                        </span>
                        {item.merchantReplyAt ? (
                          <span className="text-[10px] text-text-dim">
                            Last sent {new Date(item.merchantReplyAt).toLocaleDateString()}
                          </span>
                        ) : item.rating <= 2 ? (
                          <span className="text-[10px] text-text-dim">
                            1-2★ reviews require manual admin intervention
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-dim">
                            Auto-reply will send in ~5 mins if left blank
                          </span>
                        )}
                      </div>

                      <textarea
                        rows={2}
                        value={replyInput}
                        onChange={(e) => setReplyInput(e.target.value)}
                        placeholder="Type a friendly reply to this customer..."
                        className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-lg text-xs text-text-main outline-none focus:border-white/30 transition resize-none placeholder:text-text-dim"
                      />

                      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-text-dim">Template:</span>
                          <button
                            type="button"
                            onClick={() => setReplyInput(QUICK_TEMPLATES[item.rating] || QUICK_TEMPLATES[5])}
                            className="text-text-dim hover:text-text-main underline cursor-pointer bg-transparent border-none p-0"
                          >
                            Fill standard {item.rating}-star reply
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSaveReply(item)}
                          disabled={isSubmittingReply}
                          className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-text-main text-xs font-bold transition cursor-pointer border border-border-glass shadow-xs"
                        >
                          {isSubmittingReply ? 'Saving...' : 'Send Reply'}
                        </button>
                      </div>
                    </div>

                    {/* Simple Staff Note */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-bg-card border border-border-glass text-xs">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-text-dim shrink-0 font-medium">Private Note:</span>
                        <input
                          type="text"
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          placeholder="Optional internal note..."
                          className="w-full bg-bg-surface border border-border-glass px-2.5 py-1 rounded-md text-xs text-text-main outline-none focus:border-white/30 transition"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveNote(item)}
                        disabled={isSavingNote}
                        className="px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 text-text-dim hover:text-text-main text-xs font-medium transition cursor-pointer border-none shrink-0"
                      >
                        {isSavingNote ? 'Saving...' : 'Save Note'}
                      </button>
                    </div>

                    {/* Feature on Website Toggle (Admin) */}
                    {role === 'admin' && (
                      <div className="flex items-center justify-between pt-1 px-1">
                        <span className="text-xs text-text-dim">Show this review on your website:</span>
                        <button
                          type="button"
                          onClick={() => handleToggleFeature(item)}
                          className={`text-xs font-bold px-3 py-1 rounded-lg border transition cursor-pointer ${item.isFeatured
                            ? 'bg-white/15 text-text-main border-white/30'
                            : 'bg-white/5 text-text-dim border-white/10 hover:text-text-main'
                            }`}
                        >
                          {item.isFeatured ? 'Featured on Website ✓' : 'Feature on Website'}
                        </button>
                      </div>
                    )}
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
