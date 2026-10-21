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
}

// Smart Star-Calibrated Store Reply Templates
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

interface FeedbackMetrics {
  totalCount: number;
  pendingCount: number;
  reviewedCount: number;
  resolvedCount: number;
  fiveStarCount: number;
  averageRating: number;
  sentimentRate: number;
}

export default function PanelEmployeeSupport() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [metrics, setMetrics] = useState<FeedbackMetrics>({
    totalCount: 0,
    pendingCount: 0,
    reviewedCount: 0,
    resolvedCount: 0,
    fiveStarCount: 0,
    averageRating: 5.0,
    sentimentRate: 100,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const pageSize = 8;

  // Staff Note Modal State
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [staffNoteInput, setStaffNoteInput] = useState<string>('');
  const [actionStatusInput, setActionStatusInput] = useState<'Pending' | 'Reviewed' | 'Resolved'>('Reviewed');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Official Store Reply Modal State
  const [replyTarget, setReplyTarget] = useState<FeedbackItem | null>(null);
  const [replyTextInput, setReplyTextInput] = useState<string>('');
  const [selectedTemplateRating, setSelectedTemplateRating] = useState<number>(5);
  const [isSavingReply, setIsSavingReply] = useState(false);

  // Fetch Feedbacks from API
  const fetchFeedbacks = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setIsLoading(true);
      setIsSyncing(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.append('status', statusFilter);
        if (ratingFilter !== 'all') params.append('rating', ratingFilter);
        if (searchQuery.trim()) params.append('search', searchQuery.trim());
        params.append('page', currentPage.toString());
        params.append('limit', pageSize.toString());

        const res = await api.get<{
          success: boolean;
          feedbacks: FeedbackItem[];
          pagination: { total: number; page: number; totalPages: number };
          metrics: FeedbackMetrics;
        }>(`/api/employee/feedback?${params.toString()}`);

        if (res && res.success) {
          setFeedbacks(res.feedbacks || []);
          setMetrics(
            res.metrics || {
              totalCount: 0,
              pendingCount: 0,
              reviewedCount: 0,
              resolvedCount: 0,
              fiveStarCount: 0,
              averageRating: 5.0,
              sentimentRate: 100,
            }
          );
          setTotalPages(res.pagination?.totalPages || 1);
          setTotalItems(res.pagination?.total || 0);
        }
      } catch (err) {
        console.warn('Failed to load feedback:', err);
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
      }
    },
    [statusFilter, ratingFilter, searchQuery, currentPage]
  );

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, ratingFilter, searchQuery]);

  // Quick Status Change directly from card
  const handleQuickStatusChange = async (feedback: FeedbackItem, nextStatus: 'Pending' | 'Reviewed' | 'Resolved') => {
    try {
      await api.patch(`/api/employee/feedback/${feedback.id}`, {
        status: nextStatus,
        staffNotes: feedback.staffNotes || '',
      });
      showToast(`Review marked as ${nextStatus}`, 'success');
      fetchFeedbacks(true);
    } catch (err) {
      console.warn('Status update failed:', err);
      showToast('Failed to update review status', 'error');
    }
  };

  // Quick Mark Reviewed (1-Click)
  const handleQuickMarkReviewed = async (feedback: FeedbackItem) => {
    try {
      await api.patch(`/api/employee/feedback/${feedback.id}`, {
        status: 'Reviewed',
        staffNotes: feedback.staffNotes || '',
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
      await api.post(`/api/employee/feedback/${feedback.id}/reply`, {
        reply: template
      });
      if (feedback.status === 'Pending') {
        await api.patch(`/api/employee/feedback/${feedback.id}`, {
          status: 'Reviewed',
          staffNotes: feedback.staffNotes || '',
        });
      }
      showToast('Official store reply published & marked Reviewed', 'success');
      fetchFeedbacks(true);
    } catch (err) {
      showToast('Failed to publish store reply', 'error');
    }
  };

  // Submit Official Store Reply from Modal
  const handleSaveEmployeeReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyTarget) return;

    setIsSavingReply(true);
    try {
      await api.post(`/api/employee/feedback/${replyTarget.id}/reply`, {
        reply: replyTextInput.trim()
      });
      showToast('Official store response published', 'success');
      setReplyTarget(null);
      fetchFeedbacks(true);
    } catch (err) {
      showToast('Failed to save store reply', 'error');
    } finally {
      setIsSavingReply(false);
    }
  };

  // Save Staff Note
  const handleSaveStaffNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFeedback) return;

    setIsSavingNote(true);
    try {
      await api.patch(`/api/employee/feedback/${selectedFeedback.id}`, {
        status: actionStatusInput,
        staffNotes: staffNoteInput.trim(),
      });
      showToast('Staff note saved successfully', 'success');
      setSelectedFeedback(null);
      fetchFeedbacks(true);
    } catch (err) {
      console.warn('Note save failed:', err);
      showToast('Failed to save staff note', 'error');
    } finally {
      setIsSavingNote(false);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center text-amber-400 text-xs">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={i < rating ? 'text-amber-400' : 'text-text-dim/25'}>
            ★
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-fade text-text-main text-left">
      {/* Header Bar */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-text-main tracking-tight m-0">
            Customer Reviews &amp; Feedback
          </h1>
          <p className="text-xs sm:text-sm text-text-dim mt-1 m-0">
            Browse verified customer ratings, reviews, and manage internal staff notes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchFeedbacks(true)}
          disabled={isSyncing}
          className="bg-white/5 hover:bg-white/10 text-text-main border border-border-glass px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
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
          <span>{isSyncing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Average Rating</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-black text-text-main">
              {metrics.averageRating.toFixed(1)}
            </span>
            <span className="text-xs text-text-dim font-bold">/ 5.0</span>
          </div>
          <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
            {metrics.totalCount} total customer reviews
          </span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">5-Star Praises</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-black text-emerald-400">
              {metrics.fiveStarCount}
            </span>
            <span className="text-xs text-text-dim font-bold">reviews</span>
          </div>
          <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
            Top customer satisfaction ratings
          </span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Satisfaction Rate</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-black text-primary">
              {metrics.sentimentRate}%
            </span>
            <span className="text-xs text-text-dim font-bold">Positive</span>
          </div>
          <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
            4★ &amp; 5★ satisfied customer ratio
          </span>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Pending Attention</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-black text-amber-400">
              {metrics.pendingCount}
            </span>
            <span className="text-xs text-text-dim font-bold">reviews</span>
          </div>
          <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
            {metrics.pendingCount > 0 ? 'Awaiting staff review or response' : 'All reviews reviewed'}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Quick Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-wrap">
            <span className="text-xs text-text-dim font-medium whitespace-nowrap mr-1">Filter:</span>
            {[
              { id: 'all', label: 'All Reviews', count: metrics.totalCount },
              { id: '5', label: '5 Stars', count: metrics.fiveStarCount },
              { id: '4', label: '4 Stars' },
              { id: '3', label: '3 Stars' },
              { id: 'critical', label: '1-2 Stars' },
              { id: 'pending', label: 'Pending', count: metrics.pendingCount },
            ].map((pill) => {
              const isActive =
                (pill.id === 'all' && ratingFilter === 'all' && statusFilter === 'all') ||
                (pill.id === 'pending' && statusFilter === 'Pending') ||
                (pill.id === ratingFilter);

              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    if (pill.id === 'pending') {
                      setRatingFilter('all');
                      setStatusFilter('Pending');
                    } else if (pill.id === 'all') {
                      setRatingFilter('all');
                      setStatusFilter('all');
                    } else {
                      setRatingFilter(pill.id);
                      setStatusFilter('all');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                  }`}
                >
                  <span>{pill.label}</span>
                  {pill.count !== undefined && pill.count > 0 && (
                    <span
                      className={`text-[0.62rem] px-1.5 py-0.2 rounded-md font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-text-dim'
                      }`}
                    >
                      {pill.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Status Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-text-dim font-medium whitespace-nowrap">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-xl text-xs font-bold text-text-main outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Live Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search reviews by customer name, order #, or feedback message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-surface border border-border-glass rounded-xl px-3.5 py-2.5 text-xs text-text-main outline-none focus:border-primary/60 transition-all font-sans placeholder:text-text-dim/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main text-xs border-none bg-transparent cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Reviews Feed List */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-14 text-center text-text-dim text-xs">Loading customer reviews...</div>
        ) : feedbacks.length === 0 ? (
          <div className="p-14 text-center text-text-dim text-xs flex flex-col items-center justify-center gap-2">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim/50">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="m-0 font-medium">No customer reviews found matching your filters.</p>
            {(ratingFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setRatingFilter('all');
                  setStatusFilter('all');
                  setSearchQuery('');
                }}
                className="mt-2 text-primary hover:underline text-xs bg-transparent border-none cursor-pointer font-bold"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border-glass/40">
            {feedbacks.map((item) => (
              <div
                key={item.id}
                className="p-4 transition-colors flex flex-col gap-3 hover:bg-white/[0.02]"
              >
                {/* Review Header: Avatar, Name, Rating, Order, Date */}
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Avatar initial */}
                    <div className="w-7 h-7 rounded-lg bg-white/10 text-text-main font-bold text-xs flex items-center justify-center shrink-0">
                      {(item.customerName || 'Customer').charAt(0).toUpperCase()}
                    </div>

                    <span className="font-bold text-text-main text-xs">
                      {item.customerName || 'Verified Customer'}
                    </span>

                    {/* Stars */}
                    {renderStars(item.rating)}

                    {/* Order Reference */}
                    {item.orderId && (
                      <span className="font-mono text-[0.68rem] text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/25 font-bold">
                        Order #{item.orderId}
                      </span>
                    )}
                  </div>

                  <span className="text-[0.68rem] text-text-dim font-mono">
                    {new Date(item.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                {/* Review Message */}
                <p className="text-xs text-text-main m-0 leading-relaxed font-sans pl-9">
                  "{item.message}"
                </p>

                {/* Staff Note Display (if exists) */}
                {item.staffNotes && (
                  <div className="ml-9 p-3 rounded-xl bg-bg-surface border border-border-glass text-[0.75rem] text-text-dim flex items-start gap-2">
                    <span className="text-primary font-bold shrink-0">Staff Note:</span>
                    <span className="text-text-main leading-relaxed">{item.staffNotes}</span>
                  </div>
                )}

                {/* Official Store Response Display (if exists) */}
                {item.merchantReply && (
                  <div className="ml-9 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-[0.75rem] flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        Official Store Response
                      </span>
                      {item.merchantReplyAt && (
                        <span className="text-[10px] text-text-dim">
                          {new Date(item.merchantReplyAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <p className="text-text-main m-0 leading-relaxed italic">"{item.merchantReply}"</p>
                  </div>
                )}

                {/* Review Actions: Quick Mark Reviewed + Quick Reply + Reply Modal + Staff Note */}
                <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-border-glass/40 pl-9">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[0.68rem] text-text-dim">Status:</span>
                    <select
                      value={item.status}
                      onChange={(e) => handleQuickStatusChange(item, e.target.value as any)}
                      className="bg-bg-surface border border-border-glass px-2.5 py-1 rounded-lg text-[0.7rem] font-bold text-text-main outline-none cursor-pointer"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Reviewed">Reviewed</option>
                      <option value="Resolved">Resolved</option>
                    </select>

                    {/* 1. Quick Mark Reviewed Button */}
                    {item.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => handleQuickMarkReviewed(item)}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-text-main border border-border-glass text-xs font-semibold cursor-pointer transition-all flex items-center gap-1"
                        title="1-Click Mark Reviewed"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Mark Reviewed</span>
                      </button>
                    )}

                    {/* 2. 1-Click Smart Auto-Reply (If not yet replied) */}
                    {!item.merchantReply && (
                      <button
                        type="button"
                        onClick={() => handleOneClickAutoReply(item)}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-text-main border border-border-glass text-xs font-semibold cursor-pointer transition-all flex items-center gap-1"
                        title={`1-Click publish star-calibrated reply for ${item.rating}★ review`}
                      >
                        <span>Quick Reply</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 3. Reply / Edit Reply Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTarget(item);
                        const r = Math.max(1, Math.min(5, Math.round(item.rating || 5)));
                        setSelectedTemplateRating(r);
                        setReplyTextInput(item.merchantReply || getPrimaryTemplateForRating(item.rating));
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-bold cursor-pointer transition-all flex items-center gap-1"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>{item.merchantReply ? 'Edit Store Reply' : 'Reply as Store'}</span>
                    </button>

                    {/* 4. Staff Note Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFeedback(item);
                        setStaffNoteInput(item.staffNotes || '');
                        setActionStatusInput(item.status);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer bg-white/5 hover:bg-white/10 text-text-main border-border-glass"
                    >
                      {item.staffNotes ? 'Edit Staff Note' : '+ Staff Note'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border-glass flex justify-center">
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

      {/* Staff Note Modal */}
      {selectedFeedback && (
        <GlassModal
          isOpen={!!selectedFeedback}
          onClose={() => setSelectedFeedback(null)}
          title="Staff Review Note"
          maxWidth="max-w-[480px]"
        >
          <form onSubmit={handleSaveStaffNote} className="flex flex-col gap-4 text-left">
            {/* Review summary preview */}
            <div className="p-3.5 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-text-main">{selectedFeedback.customerName || 'Customer'}</span>
                {renderStars(selectedFeedback.rating)}
              </div>
              {selectedFeedback.orderId && (
                <span className="text-primary font-mono font-bold text-[0.7rem]">
                  Order #{selectedFeedback.orderId}
                </span>
              )}
              <p className="text-text-dim italic m-0 mt-0.5">"{selectedFeedback.message}"</p>
            </div>

            {/* Status Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Review Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'Pending', label: 'Pending' },
                  { key: 'Reviewed', label: 'Reviewed' },
                  { key: 'Resolved', label: 'Resolved' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActionStatusInput(item.key as any)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      actionStatusInput === item.key
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white/5 border-border-glass text-text-dim hover:text-text-main'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Note Content */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Internal Note
              </label>
              <textarea
                rows={3}
                required
                placeholder="Write internal staff notes or response notes..."
                value={staffNoteInput}
                onChange={(e) => setStaffNoteInput(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-3 rounded-xl text-xs text-text-main outline-none focus:border-primary resize-none placeholder:text-text-dim/60 font-sans"
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-border-glass">
              <button
                type="button"
                onClick={() => setSelectedFeedback(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim text-xs font-bold border border-border-glass cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingNote || !staffNoteInput.trim()}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-bold cursor-pointer disabled:opacity-40 transition-all border-none shadow-sm"
              >
                {isSavingNote ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </form>
        </GlassModal>
      )}

      {/* Official Store Reply Modal with Star-Calibrated Smart Templates */}
      {replyTarget && (
        <GlassModal
          isOpen={!!replyTarget}
          onClose={() => setReplyTarget(null)}
          title="Official Store Reply"
          maxWidth="max-w-[560px]"
        >
          <form onSubmit={handleSaveEmployeeReply} className="flex flex-col gap-4 text-left">
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
                    onClick={() => setReplyTextInput(tpl.text)}
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

            {/* Official Store Reply Textarea */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                Official Store Reply (Public on Catalog)
              </label>
              <textarea
                rows={4}
                required
                placeholder="Write an official merchant reply..."
                value={replyTextInput}
                onChange={(e) => setReplyTextInput(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-3 rounded-xl text-xs text-text-main outline-none focus:border-indigo-500 resize-none placeholder:text-text-dim/60 leading-relaxed font-sans"
              />
              <span className="text-[0.68rem] text-text-dim">
                This official reply will be publicly displayed on the product catalog beneath the customer's comment. Customers cannot reply back.
              </span>
            </div>

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
                disabled={isSavingReply || !replyTextInput.trim()}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer disabled:opacity-40 transition-all border-none shadow-sm"
              >
                {isSavingReply ? 'Publishing...' : 'Publish Official Reply'}
              </button>
            </div>
          </form>
        </GlassModal>
      )}
    </div>
  );
}
