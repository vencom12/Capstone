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
}

interface FeedbackMetrics {
  totalCount: number;
  pendingCount: number;
  criticalAlertsCount?: number;
  reviewedCount: number;
  resolvedCount: number;
  fiveStarCount: number;
  averageRating: number;
  sentimentRate: number;
}

interface ShopSettings {
  businessName: string;
  businessContact: string;
  businessEmail: string;
  businessAddress: string;
}

export default function PanelEmployeeSupport() {
  const [activeMainTab, setActiveMainTab] = useState<'feedback' | 'sop'>('feedback');

  // --- Feedback State ---
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [feedbackMetrics, setFeedbackMetrics] = useState<FeedbackMetrics>({
    totalCount: 0,
    pendingCount: 0,
    criticalAlertsCount: 0,
    reviewedCount: 0,
    resolvedCount: 0,
    fiveStarCount: 0,
    averageRating: 5.0,
    sentimentRate: 100
  });
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const pageSize = 8;

  // Feedback Resolution Modal
  const [selectedFeedbackForNote, setSelectedFeedbackForNote] = useState<FeedbackItem | null>(null);
  const [staffNoteInput, setStaffNoteInput] = useState<string>('');
  const [actionStatusInput, setActionStatusInput] = useState<'Pending' | 'Reviewed' | 'Resolved'>('Resolved');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Shop & Escalation Information
  const [shopSettings] = useState<ShopSettings>({
    businessName: 'Eds Towels & Caps Embroidery',
    businessContact: '0917 582 8192',
    businessEmail: 'edstowelscaps@gmail.com',
    businessAddress: 'Ground Floor, Pacific Mall Lucena, Quezon Province'
  });

  // 1. Fetch Real Customer Feedbacks
  const fetchFeedbacks = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoadingFeedback(true);
    setIsSyncing(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (ratingFilter !== 'all') params.append('rating', ratingFilter);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
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
        setFeedbackMetrics(res.metrics || {
          totalCount: 0,
          pendingCount: 0,
          criticalAlertsCount: 0,
          reviewedCount: 0,
          resolvedCount: 0,
          fiveStarCount: 0,
          averageRating: 5.0,
          sentimentRate: 100
        });
        setTotalPages(res.pagination?.totalPages || 1);
        setTotalItems(res.pagination?.total || 0);
      }
    } catch (err) {
      console.warn('Failed to load feedback feed:', err);
    } finally {
      setIsLoadingFeedback(false);
      setIsSyncing(false);
    }
  }, [statusFilter, ratingFilter, categoryFilter, searchQuery, currentPage]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // Reset page when feedback filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, ratingFilter, categoryFilter, searchQuery]);

  // Handle Quick Feedback Status Change
  const handleQuickStatusChange = async (feedback: FeedbackItem, nextStatus: 'Pending' | 'Reviewed' | 'Resolved') => {
    try {
      await api.patch(`/api/employee/feedback/${feedback.id}`, {
        status: nextStatus,
        staffNotes: feedback.staffNotes || ''
      });
      showToast(`Review status updated to ${nextStatus}`, 'success');
      fetchFeedbacks(true);
    } catch (err) {
      console.warn('Status update failed:', err);
      showToast('Failed to update review status', 'error');
    }
  };

  // Save Detailed Staff Note on Feedback
  const handleSaveStaffNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFeedbackForNote) return;

    setIsSavingNote(true);
    try {
      await api.patch(`/api/employee/feedback/${selectedFeedbackForNote.id}`, {
        status: actionStatusInput,
        staffNotes: staffNoteInput.trim()
      });
      showToast(`Review marked as ${actionStatusInput}`, 'success');
      setSelectedFeedbackForNote(null);
      fetchFeedbacks(true);
    } catch (err) {
      console.warn('Note save failed:', err);
      showToast('Failed to save resolution note', 'error');
    } finally {
      setIsSavingNote(false);
    }
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
    <div className="flex flex-col gap-6 animate-fade text-text-main">
      {/* Header Bar */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-text-main tracking-tight m-0">
            Workshop Quality Standards &amp; Inspection (QA)
          </h1>
          <p className="text-xs sm:text-sm text-text-dim mt-1 m-0">
            Studio production standards, embroidery SOP checklists, and machine defect recovery logs.
          </p>
        </div>

        <button
          onClick={() => fetchFeedbacks(true)}
          disabled={isSyncing}
          className="bg-white/5 border border-border-glass hover:bg-white/10 text-text-main px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-2"
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
          <span>{isSyncing ? 'Syncing...' : 'Sync QA Feed'}</span>
        </button>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex border-b border-border-glass gap-2 pb-1">
        <button
          onClick={() => setActiveMainTab('sop')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all cursor-pointer bg-transparent border-none flex items-center gap-1.5 ${
            activeMainTab === 'sop'
              ? '!border-b-2 !border-primary text-primary'
              : 'text-text-dim hover:text-text-main'
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
          <span>Embroidery Quality Standards (SOP)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('feedback')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all cursor-pointer bg-transparent border-none flex items-center gap-2 ${
            activeMainTab === 'feedback'
              ? '!border-b-2 !border-primary text-primary'
              : 'text-text-dim hover:text-text-main'
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>Customer Feedback &amp; Defect Alerts</span>
          {(feedbackMetrics.criticalAlertsCount ?? feedbackMetrics.pendingCount) > 0 && (
            <span
              className="px-1.5 py-0.2 rounded-full text-[0.62rem] bg-danger text-white font-extrabold animate-pulse"
              title="Quality alerts requiring service recovery"
            >
              {feedbackMetrics.criticalAlertsCount ?? feedbackMetrics.pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Customer Reviews & Ratings */}
      {activeMainTab === 'feedback' && (
        <div className="flex flex-col gap-6 animate-fade">
          {/* Top 4 Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-4 flex flex-col justify-between">
              <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Average Rating</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-mono font-black text-text-main">
                  {feedbackMetrics.averageRating.toFixed(1)}
                </span>
                <span className="text-xs text-text-dim font-bold">/ 5.0</span>
              </div>
              <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
                {feedbackMetrics.totalCount} total verified customer reviews
              </span>
            </div>

            <div className="glass-card p-4 flex flex-col justify-between">
              <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Published Social Proof</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-mono font-black text-success">
                  {feedbackMetrics.fiveStarCount}
                </span>
                <span className="text-xs text-text-dim font-bold">5★ reviews</span>
              </div>
              <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
                Displayed live on storefront product pages
              </span>
            </div>

            <div className="glass-card p-4 flex flex-col justify-between">
              <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Customer Satisfaction</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-mono font-black text-primary">
                  {feedbackMetrics.sentimentRate}%
                </span>
                <span className="text-xs text-text-dim font-bold">CSAT Positive</span>
              </div>
              <span className="text-[0.7rem] text-text-dim mt-2 border-t border-border-glass pt-2">
                4★ and 5★ satisfied customer ratio
              </span>
            </div>

            <div className="glass-card p-4 flex flex-col justify-between">
              <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Quality Assurance &amp; Alerts</span>
              <div className="mt-2 flex items-baseline gap-2">
                {(feedbackMetrics.criticalAlertsCount ?? 0) > 0 ? (
                  <>
                    <span className="text-3xl font-mono font-black text-danger animate-pulse">
                      {feedbackMetrics.criticalAlertsCount}
                    </span>
                    <span className="text-xs text-danger font-bold">Open Alert{(feedbackMetrics.criticalAlertsCount ?? 0) > 1 ? 's' : ''}</span>
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
                {(feedbackMetrics.criticalAlertsCount ?? 0) > 0
                  ? '1-2★ reviews requiring immediate service recovery'
                  : `${feedbackMetrics.resolvedCount} documented quality resolutions on record`}
              </span>
            </div>
          </div>

          {/* Feedback Feed Container */}
          <div className="glass-card p-5 flex flex-col gap-4">
            {/* Search & Filters Bar */}
            <div className="flex justify-between items-center flex-wrap gap-3 pb-3 border-b border-border-glass">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                <span className="text-text-dim font-bold text-xs mr-1 shrink-0">Filter:</span>
                {[
                  { id: 'all', label: 'All Reviews' },
                  { id: '5', label: '5 Stars' },
                  { id: '4', label: '4 Stars' },
                  { id: 'critical', label: 'Quality Alerts (1-2★)' },
                  { id: 'Resolved', label: 'Resolved QA' }
                ].map((tab) => {
                  const isActive = (tab.id === '5' || tab.id === '4' || tab.id === 'critical')
                    ? ratingFilter === tab.id
                    : (tab.id === 'Resolved')
                    ? statusFilter === 'Resolved'
                    : (statusFilter === 'all' && ratingFilter === 'all');

                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (tab.id === '5' || tab.id === '4' || tab.id === 'critical') {
                          setRatingFilter(tab.id);
                          setStatusFilter('all');
                        } else if (tab.id === 'Resolved') {
                          setStatusFilter('Resolved');
                          setRatingFilter('all');
                        } else {
                          setStatusFilter('all');
                          setRatingFilter('all');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border whitespace-nowrap ${
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

              <div className="relative min-w-[220px]">
                <input
                  type="text"
                  placeholder="Search reviews or order ID..."
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

            {/* Feed Cards */}
            {isLoadingFeedback ? (
              <div className="py-12 text-center text-text-dim text-xs">Loading verified customer reviews...</div>
            ) : feedbacks.length === 0 ? (
              <div className="py-16 text-center text-text-dim border border-dashed border-border-glass rounded-xl flex flex-col items-center justify-center gap-2">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-dim/40">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <p className="font-bold text-sm text-text-main m-0">No customer reviews found matching criteria.</p>
                <p className="text-xs text-text-dim m-0">
                  When customers submit order ratings through their dashboard, their verified reviews will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feedbacks.map((f) => {
                  const isCritical = f.rating <= 2;
                  const isPositive = f.rating >= 4;
                  const isResolved = f.status === 'Resolved';

                  return (
                    <div
                      key={f.id}
                      className={`bg-bg-surface border rounded-xl p-4 flex flex-col justify-between gap-3 text-left shadow-sm transition-all ${
                        isCritical && !isResolved
                          ? 'border-danger/40 bg-danger/[0.03]'
                          : isResolved && isCritical
                          ? 'border-emerald-500/30'
                          : 'border-border-glass'
                      }`}
                    >
                      <div>
                        {/* Header: Customer Info + Review Classification */}
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

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isPositive ? (
                              <span className="text-[0.62rem] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                Published Storefront Review
                              </span>
                            ) : isCritical ? (
                              isResolved ? (
                                <span className="text-[0.62rem] px-2 py-0.5 rounded-full font-bold bg-success/20 text-success border border-success/30 flex items-center gap-1">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                  QA Resolved
                                </span>
                              ) : (
                                <span className="text-[0.62rem] px-2 py-0.5 rounded-full font-bold bg-danger/20 text-danger border border-danger/30 uppercase animate-pulse flex items-center gap-1">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                  Quality Alert
                                </span>
                              )
                            ) : (
                              <span className="text-[0.62rem] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                Customer Feedback
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Rating Row: Stars, Category, Verified Order Link, Date */}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          {renderStars(f.rating)}
                          <span className="text-[0.68rem] px-2 py-0.5 rounded bg-white/5 border border-border-glass text-text-dim font-medium">
                            {f.category}
                          </span>
                          {f.orderId && (
                            <span className="text-[0.68rem] px-2 py-0.5 rounded bg-primary/10 text-primary font-mono font-bold border border-primary/20 flex items-center gap-1">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                              Order #{f.orderId}
                            </span>
                          )}
                          <span className="text-[0.65rem] text-text-dim ml-auto">
                            {new Date(f.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Customer Comment Quote Box */}
                        <div className="mt-2.5 p-3 rounded-xl bg-bg-card border border-border-glass text-xs text-text-main leading-relaxed">
                          <p className="m-0 italic whitespace-pre-wrap">"{f.message}"</p>
                        </div>

                        {/* Staff Resolution / Audit Note (if present) */}
                        {f.staffNotes && (
                          <div className={`mt-2 p-2.5 rounded-lg border text-[0.72rem] ${
                            isCritical
                              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                              : 'bg-primary/10 border-primary/20 text-primary'
                          }`}>
                            <span className="font-bold block mb-0.5">
                              {isCritical ? 'QA Service Recovery Note:' : 'Internal Staff Note:'}
                            </span>
                            <span className="italic text-text-main">{f.staffNotes}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Footer: Decoupled by review type */}
                      <div className="flex gap-2 pt-2 border-t border-border-glass mt-1">
                        {isCritical ? (
                          !isResolved ? (
                            <button
                              onClick={() => {
                                setSelectedFeedbackForNote(f);
                                setStaffNoteInput(f.staffNotes || '');
                                setActionStatusInput('Resolved');
                              }}
                              className="flex-1 py-2 rounded-xl bg-danger/20 hover:bg-danger text-danger hover:text-white border border-danger/40 text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm"
                            >
                              <span>Open QA Service Recovery</span>
                              <span>→</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedFeedbackForNote(f);
                                setStaffNoteInput(f.staffNotes || '');
                                setActionStatusInput('Resolved');
                              }}
                              className="flex-1 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim hover:text-text-main border border-border-glass text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                              <span>View QA Resolution Note</span>
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedFeedbackForNote(f);
                              setStaffNoteInput(f.staffNotes || '');
                              setActionStatusInput(f.status || 'Reviewed');
                            }}
                            className="flex-1 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim hover:text-text-main border border-border-glass text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                          >
                            <span>{f.staffNotes ? 'Edit Staff Note' : 'Add Internal Note'}</span>
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
        </div>
      )}

      {/* TAB 2: Technical Embroidery Quality Standards (SOP) */}
      {activeMainTab === 'sop' && (
        <div className="flex flex-col gap-6 animate-fade">
          {/* Official Workshop Escalation & Contact */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-bold text-text-main m-0 flex items-center gap-2">
                <span>Direct Studio Management Escalation</span>
                <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                  Physical Mall Location
                </span>
              </h2>
            </div>
            <p className="text-xs text-text-dim m-0">
              For client quality concerns, replacement embroidery authorizations, or order inquiries:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1">
                <span className="text-xs text-text-dim">Official Store Name</span>
                <span className="font-bold text-sm text-text-main">{shopSettings.businessName}</span>
                <span className="text-[0.7rem] text-text-dim mt-1">{shopSettings.businessAddress}</span>
              </div>

              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col justify-between gap-2">
                <div>
                  <span className="text-xs text-text-dim">Studio Hotline</span>
                  <span className="font-mono font-bold text-sm text-primary block mt-0.5">
                    {shopSettings.businessContact}
                  </span>
                </div>
                <a
                  href={`tel:${shopSettings.businessContact}`}
                  className="py-1.5 px-3 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary font-bold text-xs text-center no-underline transition-all border border-primary/30"
                >
                  Call Shop Hotline
                </a>
              </div>

              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col justify-between gap-2">
                <div>
                  <span className="text-xs text-text-dim">Official Gmail</span>
                  <span className="font-mono font-bold text-xs text-text-main block mt-0.5 truncate">
                    {shopSettings.businessEmail}
                  </span>
                </div>
                <a
                  href={`mailto:${shopSettings.businessEmail}`}
                  className="py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-text-main font-bold text-xs text-center no-underline border border-border-glass transition-all"
                >
                  Send Email Message
                </a>
              </div>
            </div>
          </div>

          {/* Industrial Embroidery Quality Standards (SOP) */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <h2 className="text-base font-bold text-text-main m-0">Workshop Production Standards (SOP)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-2">
                <span className="font-bold text-text-main text-sm text-primary">Needle &amp; Thread Standards</span>
                <ul className="m-0 pl-4 space-y-1.5 text-text-dim">
                  <li>Standard Thread: <b>Polyester #40 weight</b> (chlorine-resistant, high tensile sheen).</li>
                  <li>Needle System: <b>DBxK5 Shank size #11/75 SES</b> (light ball point for towels and knitted garments).</li>
                  <li>Replace needles every <b>8 to 10 hours</b> of continuous operation or immediately upon dulling.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-2">
                <span className="font-bold text-text-main text-sm text-emerald-400">Backing &amp; Stabilizer Rules</span>
                <ul className="m-0 pl-4 space-y-1.5 text-text-dim">
                  <li><b>Terry Towels:</b> Tear-Away 2.5oz on bottom + Water-Soluble Film (Solvy) topping to prevent sinking.</li>
                  <li><b>Structured Caps:</b> Heavy Cap Tear-Away, hooped tightly to prevent flagging.</li>
                  <li><b>Pillowcases &amp; Linen:</b> Medium Cut-Away 2.5oz for dimensional stability.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Quality Handover Inspection Checklist */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <h2 className="text-base font-bold text-text-main m-0">Pre-Handover Inspection Checklist</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex items-start gap-2.5">
                <span className="text-primary font-bold">1.</span>
                <span className="text-text-dim">Trim all jump stitches closer than 1mm on front monogram.</span>
              </div>
              <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex items-start gap-2.5">
                <span className="text-primary font-bold">2.</span>
                <span className="text-text-dim">Remove excess water-soluble film topping with damp sponge.</span>
              </div>
              <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex items-start gap-2.5">
                <span className="text-primary font-bold">3.</span>
                <span className="text-text-dim">Verify claim stub spelling against stitched lettering.</span>
              </div>
              <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex items-start gap-2.5">
                <span className="text-primary font-bold">4.</span>
                <span className="text-text-dim">Steam-press hoop ring marks out before packaging.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Glass Modal: Add Staff Resolution / Review Note */}
      {selectedFeedbackForNote && (() => {
        const isCriticalModal = selectedFeedbackForNote.rating <= 2;

        return (
          <GlassModal
            isOpen={!!selectedFeedbackForNote}
            onClose={() => setSelectedFeedbackForNote(null)}
            title={isCriticalModal ? 'Service Recovery & QA Resolution' : 'Staff Review Note'}
            maxWidth="max-w-[500px]"
          >
            <form onSubmit={handleSaveStaffNote} className="flex flex-col gap-4 text-left">
              <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-text-main">{selectedFeedbackForNote.customerName || 'Customer'}</span>
                  {renderStars(selectedFeedbackForNote.rating)}
                </div>
                {selectedFeedbackForNote.orderId && (
                  <span className="text-primary font-mono font-bold text-[0.7rem]">
                    Verified Order #{selectedFeedbackForNote.orderId}
                  </span>
                )}
                <p className="text-text-dim italic m-0 mt-1">"{selectedFeedbackForNote.message}"</p>
              </div>

              {isCriticalModal && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                    Service Recovery Status
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'Pending', label: 'Investigating' },
                      { key: 'Reviewed', label: 'Contacted' },
                      { key: 'Resolved', label: 'Resolved' }
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
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-dim uppercase tracking-wider">
                  {isCriticalModal ? 'Quality Investigation & Corrective Action' : 'Internal Staff Note'}
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={
                    isCriticalModal
                      ? 'e.g. Inspected hoop tension; re-stitched lettering with tear-away backing and customer confirmed satisfied.'
                      : 'e.g. Excellent client feedback on monogram density. Relayed to embroidery technician.'
                  }
                  value={staffNoteInput}
                  onChange={(e) => setStaffNoteInput(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-3 rounded-xl text-xs text-text-main outline-none focus:border-primary resize-none placeholder:text-text-dim/60"
                />
                <span className="text-[0.68rem] text-text-dim">
                  Saved securely to audit logs and PostgreSQL database.
                </span>
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-border-glass">
                <button
                  type="button"
                  onClick={() => setSelectedFeedbackForNote(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim text-xs font-bold border border-border-glass cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingNote || !staffNoteInput.trim()}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-bold cursor-pointer disabled:opacity-40 transition-all border-none shadow-sm"
                >
                  {isSavingNote ? 'Saving...' : isCriticalModal ? 'Save QA Resolution' : 'Save Note'}
                </button>
              </div>
            </form>
          </GlassModal>
        );
      })()}
    </div>
  );
}
