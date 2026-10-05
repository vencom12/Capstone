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
  createdAt: string;
  updatedAt: string;
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

interface MachineItem {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface MaintenanceTicket {
  id: string;
  machineId: string;
  machineName: string;
  issueType: string;
  severity: 'Critical' | 'Warning' | 'Routine';
  description: string;
  status: 'Open' | 'In_Progress' | 'Resolved';
  reportedBy: string;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

interface ShopSettings {
  businessName: string;
  businessContact: string;
  businessEmail: string;
  businessAddress: string;
}

export default function PanelEmployeeSupport() {
  const [activeMainTab, setActiveMainTab] = useState<'feedback' | 'maintenance' | 'sop'>('feedback');

  // --- Feedback State ---
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [feedbackMetrics, setFeedbackMetrics] = useState<FeedbackMetrics>({
    totalCount: 0,
    pendingCount: 0,
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

  // --- Maintenance & Equipment State ---
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [maintenanceTickets, setMaintenanceTickets] = useState<MaintenanceTicket[]>([]);
  const [shopSettings, setShopSettings] = useState<ShopSettings>({
    businessName: 'Stitch-Opt Designs',
    businessContact: '+63 (02) 888-THREAD',
    businessEmail: 'contact@stitch-opt.com',
    businessAddress: '123 Digital Thread Lane'
  });
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(true);
  const [maintenanceFilter, setMaintenanceFilter] = useState<'all' | 'Open' | 'In_Progress' | 'Resolved'>('all');

  // Create Maintenance Ticket Modal
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [ticketMachineId, setTicketMachineId] = useState('');
  const [ticketIssueType, setTicketIssueType] = useState('Mechanical Jam');
  const [ticketSeverity, setTicketSeverity] = useState<'Critical' | 'Warning' | 'Routine'>('Warning');
  const [ticketDescription, setTicketDescription] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

  // Resolve Ticket Modal
  const [selectedTicketForResolve, setSelectedTicketForResolve] = useState<MaintenanceTicket | null>(null);
  const [ticketResolutionNote, setTicketResolutionNote] = useState('');
  const [ticketResetMachine, setTicketResetMachine] = useState(true);
  const [isResolvingTicket, setIsResolvingTicket] = useState(false);

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

  // 2. Fetch Real Maintenance Tickets & Real Machines
  const fetchMaintenance = useCallback(async () => {
    setIsLoadingMaintenance(true);
    try {
      const res = await api.get<{
        success: boolean;
        tickets: MaintenanceTicket[];
        machines: MachineItem[];
        settings: ShopSettings;
      }>('/api/employee/maintenance');

      if (res && res.success) {
        setMaintenanceTickets(res.tickets || []);
        setMachines(res.machines || []);
        if (res.settings) setShopSettings(res.settings);
        if (res.machines && res.machines.length > 0 && !ticketMachineId) {
          setTicketMachineId(res.machines[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to load maintenance data:', err);
    } finally {
      setIsLoadingMaintenance(false);
    }
  }, [ticketMachineId]);

  useEffect(() => {
    fetchFeedbacks();
    fetchMaintenance();
  }, [fetchFeedbacks, fetchMaintenance]);

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
      showToast(`Feedback updated to ${nextStatus}`, 'success');
      fetchFeedbacks(true);
    } catch (err) {
      console.warn('Status update failed:', err);
      showToast('Failed to update feedback status', 'error');
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
      showToast(`Feedback marked as ${actionStatusInput}`, 'success');
      setSelectedFeedbackForNote(null);
      fetchFeedbacks(true);
    } catch (err) {
      console.warn('Note save failed:', err);
      showToast('Failed to save staff notes', 'error');
    } finally {
      setIsSavingNote(false);
    }
  };

  // Submit Real Machine Breakdown Ticket
  const handleSubmitMaintenanceTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketMachineId) {
      showToast('Please select a machine from the shop registry', 'error');
      return;
    }
    if (!ticketDescription.trim()) {
      showToast('Please describe the breakdown or problem', 'error');
      return;
    }

    setIsSubmittingTicket(true);
    try {
      await api.post('/api/employee/maintenance', {
        machineId: ticketMachineId,
        issueType: ticketIssueType,
        severity: ticketSeverity,
        description: ticketDescription.trim()
      });

      showToast(`Maintenance incident logged for machine`, 'success');
      setTicketDescription('');
      setIsReportModalOpen(false);
      fetchMaintenance();
    } catch (err: any) {
      console.warn('Submit maintenance failed:', err);
      showToast(err.message || 'Failed to file maintenance ticket', 'error');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  // Resolve Maintenance Ticket
  const handleResolveTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketForResolve) return;

    setIsResolvingTicket(true);
    try {
      await api.patch(`/api/employee/maintenance/${selectedTicketForResolve.id}`, {
        status: 'Resolved',
        resolutionNotes: ticketResolutionNote.trim(),
        resetMachineStatus: ticketResetMachine
      });

      showToast(`Incident ticket resolved. Machine updated.`, 'success');
      setSelectedTicketForResolve(null);
      setTicketResolutionNote('');
      fetchMaintenance();
    } catch (err: any) {
      console.warn('Resolve maintenance failed:', err);
      showToast(err.message || 'Failed to resolve ticket', 'error');
    } finally {
      setIsResolvingTicket(false);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={`text-sm ${star <= rating ? 'text-amber-400' : 'text-white/20'}`}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  const filteredTickets = maintenanceTickets.filter((t) => {
    if (maintenanceFilter === 'all') return true;
    return t.status === maintenanceFilter;
  });

  return (
    <section className="animate-fade flex flex-col min-h-full text-left gap-6 pb-8">
      {/* Header */}
      <header className="dash-header flex justify-between items-center flex-wrap gap-4 border-b border-border-glass pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="dash-title">Workshop Support & Helpdesk</h1>
            <span className="text-[0.7rem] px-2.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold border border-primary/30 uppercase tracking-wider">
              Real-Time Workshop
            </span>
          </div>
          <p className="dash-subtitle">
            Manage customer feedback reviews, report machine breakdowns to maintenance, and access dynamic shop escalations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeMainTab === 'maintenance' && (
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="bg-danger hover:bg-danger/90 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer transition-all flex items-center gap-1.5 shadow-sm border-none"
            >
              <span>+</span>
              <span>Report Machine Issue</span>
            </button>
          )}

          <button
            onClick={() => {
              fetchFeedbacks(true);
              fetchMaintenance();
            }}
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
            <span>{isSyncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
        </div>
      </header>

      {/* Main Tab Navigation Switcher */}
      <div className="flex border-b border-border-glass gap-2 pb-1">
        <button
          onClick={() => setActiveMainTab('feedback')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all cursor-pointer bg-transparent border-none flex items-center gap-2 ${
            activeMainTab === 'feedback'
              ? '!border-b-2 !border-primary text-primary'
              : 'text-text-dim hover:text-text-main'
          }`}
        >
          <span>💬 Customer Feedback & Reviews</span>
          {feedbackMetrics.pendingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[0.62rem] bg-danger text-white font-extrabold animate-pulse">
              {feedbackMetrics.pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMainTab('maintenance')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all cursor-pointer bg-transparent border-none flex items-center gap-2 ${
            activeMainTab === 'maintenance'
              ? '!border-b-2 !border-primary text-primary'
              : 'text-text-dim hover:text-text-main'
          }`}
        >
          <span>⚙️ Machine Incidents & Breakdowns</span>
          {maintenanceTickets.filter(t => t.status === 'Open').length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[0.62rem] bg-warning text-black font-extrabold">
              {maintenanceTickets.filter(t => t.status === 'Open').length} open
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMainTab('sop')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all cursor-pointer bg-transparent border-none flex items-center gap-1.5 ${
            activeMainTab === 'sop'
              ? '!border-b-2 !border-primary text-primary'
              : 'text-text-dim hover:text-text-main'
          }`}
        >
          <span>📋 Shop Standards & Management Contacts</span>
        </button>
      </div>

      {/* TAB 1: Real Customer Feedback Desk */}
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
              <span className="text-[0.7rem] text-text-dim mt-2 border-t border-white/5 pt-2">
                {feedbackMetrics.totalCount} total verified customer reviews
              </span>
            </div>

            <div className="glass-card p-4 flex flex-col justify-between">
              <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Pending Review</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-3xl font-mono font-black ${feedbackMetrics.pendingCount > 0 ? 'text-danger' : 'text-success'}`}>
                  {feedbackMetrics.pendingCount}
                </span>
                <span className="text-xs text-text-dim font-bold">inquiries</span>
              </div>
              <span className="text-[0.7rem] text-text-dim mt-2 border-t border-white/5 pt-2">
                Requires staff review or acknowledgment
              </span>
            </div>

            <div className="glass-card p-4 flex flex-col justify-between">
              <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Positive Sentiment</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-mono font-black text-primary">
                  {feedbackMetrics.sentimentRate}%
                </span>
                <span className="text-xs text-text-dim font-bold">4★ and 5★</span>
              </div>
              <span className="text-[0.7rem] text-text-dim mt-2 border-t border-white/5 pt-2">
                {feedbackMetrics.fiveStarCount} perfect five-star scores
              </span>
            </div>

            <div className="glass-card p-4 flex flex-col justify-between">
              <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Documented Cases</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-mono font-black text-emerald-400">
                  {feedbackMetrics.resolvedCount}
                </span>
                <span className="text-xs text-text-dim font-bold">resolved</span>
              </div>
              <span className="text-[0.7rem] text-text-dim mt-2 border-t border-white/5 pt-2">
                Logged in PostgreSQL database
              </span>
            </div>
          </div>

          {/* Feedback Feed */}
          <div className="glass-card p-5 flex flex-col gap-4">
            {/* Search & Filters */}
            <div className="flex justify-between items-center flex-wrap gap-3 pb-3 border-b border-border-glass">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                <span className="text-text-dim font-bold text-xs mr-1 shrink-0">Status:</span>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'Pending', label: '🟡 Pending' },
                  { id: 'Reviewed', label: '🔵 Reviewed' },
                  { id: 'Resolved', label: '🟢 Resolved' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border whitespace-nowrap ${
                      statusFilter === tab.id
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(e.target.value)}
                  className="bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-xl text-text-main text-xs outline-none cursor-pointer"
                >
                  <option value="all">All Ratings</option>
                  <option value="5">5 Stars</option>
                  <option value="4">4 Stars</option>
                  <option value="3">3 Stars</option>
                  <option value="critical">1-2 Stars (Low)</option>
                </select>

                <div className="relative min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search feedback..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-bg-surface border border-border-glass px-3 py-1.5 rounded-xl text-text-main text-xs outline-none w-full"
                  />
                </div>
              </div>
            </div>

            {/* Feed Cards */}
            {isLoadingFeedback ? (
              <div className="py-12 text-center text-text-dim text-xs">Loading feedbacks...</div>
            ) : feedbacks.length === 0 ? (
              <div className="py-16 text-center text-text-dim border border-dashed border-border-glass rounded-2xl flex flex-col items-center justify-center gap-2">
                <span className="text-3xl">💬</span>
                <p className="font-bold text-sm text-text-main m-0">No customer feedback submitted yet.</p>
                <p className="text-xs text-text-dim m-0">
                  When customers submit feedback through the storefront or order tracking, their live comments will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feedbacks.map((f) => (
                  <div
                    key={f.id}
                    className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-col justify-between gap-3 text-left shadow-sm"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary font-bold text-xs flex items-center justify-center">
                            {f.customerName ? f.customerName.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div>
                            <span className="font-bold text-sm text-text-main block leading-tight">
                              {f.customerName || 'Customer'}
                            </span>
                            {f.customerEmail && (
                              <span className="text-[0.68rem] text-text-dim">{f.customerEmail}</span>
                            )}
                          </div>
                        </div>

                        <span className={`text-[0.62rem] px-2 py-0.5 rounded-full font-bold uppercase ${
                          f.status === 'Resolved'
                            ? 'bg-success/20 text-success'
                            : f.status === 'Reviewed'
                            ? 'bg-primary/20 text-primary'
                            : 'bg-warning/20 text-warning'
                        }`}>
                          {f.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-2.5">
                        {renderStars(f.rating)}
                        <span className="text-[0.68rem] px-2 py-0.5 rounded bg-white/5 text-text-dim font-medium">
                          {f.category}
                        </span>
                        {f.orderId && (
                          <span className="text-[0.68rem] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-bold">
                            #{f.orderId}
                          </span>
                        )}
                        <span className="text-[0.65rem] text-text-dim ml-auto">
                          {new Date(f.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="mt-2.5 p-2.5 rounded-xl bg-black/20 border border-white/5 text-xs text-text-main italic leading-relaxed">
                        "{f.message}"
                      </div>

                      {f.staffNotes && (
                        <div className="mt-2 p-2 rounded-lg bg-primary/10 text-[0.7rem] text-primary">
                          <span className="font-bold block">Staff Resolution Note:</span>
                          <span className="italic text-text-main">{f.staffNotes}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-white/5 mt-1">
                      {f.status !== 'Reviewed' && (
                        <button
                          onClick={() => handleQuickStatusChange(f, 'Reviewed')}
                          className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-dim text-xs font-semibold cursor-pointer border border-border-glass"
                        >
                          Mark Reviewed
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelectedFeedbackForNote(f);
                          setStaffNoteInput(f.staffNotes || '');
                          setActionStatusInput('Resolved');
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold cursor-pointer border border-primary/30"
                      >
                        {f.status === 'Resolved' ? 'Edit Note' : 'Resolve Ticket →'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              itemLabel="feedbacks"
            />
          </div>
        </div>
      )}

      {/* TAB 2: Real Machine Incidents & Breakdowns */}
      {activeMainTab === 'maintenance' && (
        <div className="flex flex-col gap-6 animate-fade">
          {/* Active Registered Machines Quick Status Overview */}
          <div className="glass-card p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-dim mb-3">
              Shop Machine Fleet Status (From Database)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {machines.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl bg-bg-surface border border-border-glass flex flex-col justify-between gap-2"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-sm text-text-main">{m.name}</span>
                    <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase ${
                      m.status === 'Running'
                        ? 'bg-success/20 text-success border border-success/30'
                        : m.status === 'Maintenance'
                        ? 'bg-danger/20 text-danger border border-danger/30 animate-pulse'
                        : 'bg-white/10 text-text-dim'
                    }`}>
                      {m.status}
                    </span>
                  </div>
                  <span className="text-xs text-text-dim">{m.type} Embroidery</span>
                </div>
              ))}
            </div>
          </div>

          {/* Maintenance Incident Tickets Table */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <div className="flex justify-between items-center flex-wrap gap-3 pb-3 border-b border-border-glass">
              <div>
                <h2 className="text-base font-bold text-text-main m-0">Reported Equipment Breakdown Tickets</h2>
                <p className="text-xs text-text-dim m-0 mt-0.5">
                  Real breakdown reports logged by workshop operators. Critical issues halt machines automatically.
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {(['all', 'Open', 'In_Progress', 'Resolved'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setMaintenanceFilter(filter)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      maintenanceFilter === filter
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter}
                  </button>
                ))}
              </div>
            </div>

            {isLoadingMaintenance ? (
              <div className="py-12 text-center text-text-dim text-xs">Loading machine incidents...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="py-16 text-center text-text-dim border border-dashed border-border-glass rounded-2xl flex flex-col items-center justify-center gap-2">
                <span className="text-3xl">⚙️</span>
                <p className="font-bold text-sm text-text-main m-0">No active maintenance breakdown tickets.</p>
                <p className="text-xs text-text-dim m-0">All registered embroidery machines are clear. Click "+ Report Machine Issue" if a breakdown occurs.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-bg-surface border border-border-glass flex flex-col justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="font-bold text-sm text-text-main block">{t.machineName}</span>
                          <span className="text-[0.68rem] text-text-dim">
                            Reported by <b>{t.reportedBy}</b> • {new Date(t.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase ${
                          t.status === 'Resolved'
                            ? 'bg-success/20 text-success'
                            : t.severity === 'Critical'
                            ? 'bg-danger/20 text-danger animate-pulse'
                            : 'bg-warning/20 text-warning'
                        }`}>
                          {t.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[0.68rem] px-2 py-0.5 rounded bg-white/5 border border-border-glass text-text-dim font-bold">
                          {t.issueType}
                        </span>
                        <span className={`text-[0.65rem] font-bold ${
                          t.severity === 'Critical' ? 'text-danger' : t.severity === 'Warning' ? 'text-warning' : 'text-primary'
                        }`}>
                          Severity: {t.severity}
                        </span>
                      </div>

                      <div className="mt-2.5 p-2.5 rounded-xl bg-black/20 text-xs text-text-main leading-relaxed">
                        {t.description}
                      </div>

                      {t.resolutionNotes && (
                        <div className="mt-2 p-2 rounded-lg bg-emerald-500/10 text-xs text-emerald-400">
                          <span className="font-bold block">Resolution Notes:</span>
                          <span className="text-text-main italic">{t.resolutionNotes}</span>
                        </div>
                      )}
                    </div>

                    {t.status !== 'Resolved' && (
                      <div className="flex gap-2 pt-2 border-t border-white/5">
                        <button
                          onClick={() => {
                            setSelectedTicketForResolve(t);
                            setTicketResolutionNote('');
                            setTicketResetMachine(true);
                          }}
                          className="w-full py-2 rounded-xl bg-success/20 hover:bg-success/30 border border-success/40 text-success font-bold text-xs cursor-pointer transition-all"
                        >
                          Resolve & Clear Machine →
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Shop Standards & Management Escalation */}
      {activeMainTab === 'sop' && (
        <div className="flex flex-col gap-6 animate-fade">
          {/* Real Dynamic Store Escalation Card (From SystemSettings DB) */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <h2 className="text-base font-bold text-text-main m-0 flex items-center gap-2">
              <span>Direct Management Escalation</span>
              <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-mono">
                From System Settings
              </span>
            </h2>
            <p className="text-xs text-text-dim m-0">
              For issues requiring administrative approval, replacement parts ordering, or client dispute management:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1">
                <span className="text-xs text-text-dim">Official Store Name</span>
                <span className="font-bold text-sm text-text-main">{shopSettings.businessName}</span>
                <span className="text-[0.7rem] text-text-dim mt-1">{shopSettings.businessAddress}</span>
              </div>

              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col justify-between gap-2">
                <div>
                  <span className="text-xs text-text-dim">Shop Hotline</span>
                  <span className="font-mono font-bold text-sm text-primary block mt-0.5">
                    {shopSettings.businessContact || 'Not configured in settings'}
                  </span>
                </div>
                {shopSettings.businessContact && (
                  <a
                    href={`tel:${shopSettings.businessContact}`}
                    className="py-1.5 px-3 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary font-bold text-xs text-center no-underline transition-all"
                  >
                    Call Shop Hotline
                  </a>
                )}
              </div>

              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col justify-between gap-2">
                <div>
                  <span className="text-xs text-text-dim">Management Email</span>
                  <span className="font-mono font-bold text-xs text-text-main block mt-0.5 truncate">
                    {shopSettings.businessEmail || 'Not configured in settings'}
                  </span>
                </div>
                {shopSettings.businessEmail && (
                  <a
                    href={`mailto:${shopSettings.businessEmail}`}
                    className="py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-text-main font-bold text-xs text-center no-underline border border-border-glass transition-all"
                  >
                    Send Email Message
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Real Industrial Workshop Technical SOPs */}
          <div className="glass-card p-5 flex flex-col gap-4">
            <h2 className="text-base font-bold text-text-main m-0">Workshop Production Standards (SOP)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-2">
                <span className="font-bold text-text-main text-sm text-primary">Needle & Thread Standards</span>
                <ul className="m-0 pl-4 space-y-1.5 text-text-dim">
                  <li>Standard Thread: <b>Polyester #40 weight</b> (chlorine-resistant, high tensile).</li>
                  <li>Needle System: <b>DBxK5 Shank size #11/75 SES</b> (light ball point for towels and knitted garments).</li>
                  <li>Replace needles every <b>8 to 10 hours</b> of continuous stitching or immediately upon dulling.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-2">
                <span className="font-bold text-text-main text-sm text-emerald-400">Backing & Stabilizer Rules</span>
                <ul className="m-0 pl-4 space-y-1.5 text-text-dim">
                  <li><b>Terry Towels:</b> Tear-Away 2.5oz on bottom + Water-Soluble Film (Solvy) topping to prevent sinking.</li>
                  <li><b>Structured Caps:</b> Heavy Cap Tear-Away, hooped tightly to prevent flagging.</li>
                  <li><b>Pillowcases & Linen:</b> Medium Cut-Away 2.5oz for dimensional stability.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Report Machine Issue / Breakdown */}
      <GlassModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        title="Report Equipment Breakdown / Issue"
        maxWidth="max-w-[550px]"
      >
        <form onSubmit={handleSubmitMaintenanceTicket} className="flex flex-col gap-4 text-left">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-text-main">Select Machine from Shop Registry *</label>
            <select
              value={ticketMachineId}
              onChange={(e) => setTicketMachineId(e.target.value)}
              required
              className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none cursor-pointer"
            >
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.type} • Status: {m.status})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-main">Issue Type</label>
              <select
                value={ticketIssueType}
                onChange={(e) => setTicketIssueType(e.target.value)}
                className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none cursor-pointer"
              >
                <option value="Mechanical Jam">Mechanical Jam</option>
                <option value="Needle / Thread Fault">Needle / Thread Fault</option>
                <option value="Tension / Rotary Hook">Tension / Rotary Hook</option>
                <option value="Motor / Power Glitch">Motor / Power Glitch</option>
                <option value="Routine Oiling / Service">Routine Oiling / Service</option>
                <option value="Other">Other Operational Issue</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-main">Severity</label>
              <select
                value={ticketSeverity}
                onChange={(e) => setTicketSeverity(e.target.value as any)}
                className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none cursor-pointer"
              >
                <option value="Warning">Warning (Needs Inspection)</option>
                <option value="Critical">Critical (Halts Machine)</option>
                <option value="Routine">Routine Maintenance</option>
              </select>
            </div>
          </div>

          {ticketSeverity === 'Critical' && (
            <div className="p-3 rounded-xl bg-danger/15 border border-danger/30 text-xs text-danger leading-relaxed animate-fade">
              ⚠️ Selecting <b>Critical</b> will automatically switch this machine's live status to <b>Maintenance</b> in the database and halt new queue assignments.
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-text-main">Symptoms / Breakdown Description *</label>
            <textarea
              required
              rows={3}
              placeholder="e.g. Needle snapped during towel border stitching; thread caught in hook race."
              value={ticketDescription}
              onChange={(e) => setTicketDescription(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-xs outline-none focus:border-primary leading-relaxed"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => setIsReportModalOpen(false)}
              className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingTicket}
              className="py-2.5 px-5 rounded-xl bg-danger hover:bg-danger/90 text-white font-bold text-xs cursor-pointer border-none shadow-sm"
            >
              {isSubmittingTicket ? 'Recording Ticket...' : 'File Breakdown Ticket'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal: Resolve Maintenance Ticket */}
      <GlassModal
        isOpen={!!selectedTicketForResolve}
        onClose={() => setSelectedTicketForResolve(null)}
        title="Resolve Equipment Maintenance Ticket"
        maxWidth="max-w-[500px]"
      >
        {selectedTicketForResolve && (
          <form onSubmit={handleResolveTicketSubmit} className="flex flex-col gap-4 text-left">
            <div className="p-3 rounded-xl bg-bg-surface border border-border-glass text-xs">
              <span className="font-bold text-text-main block">{selectedTicketForResolve.machineName}</span>
              <span className="text-text-dim">{selectedTicketForResolve.issueType} • Severity: {selectedTicketForResolve.severity}</span>
              <p className="m-0 mt-1 italic text-text-dim">"{selectedTicketForResolve.description}"</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-main">Resolution Details / Actions Taken</label>
              <textarea
                rows={3}
                placeholder="e.g. Cleared broken needle shards, cleaned hook race, and tested 100 test stitches. Good to run."
                value={ticketResolutionNote}
                onChange={(e) => setTicketResolutionNote(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-xs outline-none focus:border-primary leading-relaxed"
              />
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 border border-border-glass">
              <input
                type="checkbox"
                id="resetMachineCheck"
                checked={ticketResetMachine}
                onChange={(e) => setTicketResetMachine(e.target.checked)}
                className="w-4 h-4 cursor-pointer"
              />
              <label htmlFor="resetMachineCheck" className="text-xs text-text-main font-semibold cursor-pointer">
                Reset machine status back to <b>Idle</b> (Ready for orders)
              </label>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setSelectedTicketForResolve(null)}
                className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isResolvingTicket}
                className="py-2.5 px-5 rounded-xl bg-success hover:bg-success/90 text-white font-bold text-xs cursor-pointer border-none shadow-sm"
              >
                {isResolvingTicket ? 'Resolving...' : 'Complete & Close Ticket'}
              </button>
            </div>
          </form>
        )}
      </GlassModal>

      {/* Modal: Feedback Staff Note */}
      <GlassModal
        isOpen={!!selectedFeedbackForNote}
        onClose={() => setSelectedFeedbackForNote(null)}
        title="Update Feedback Status & Staff Notes"
        maxWidth="max-w-[500px]"
      >
        {selectedFeedbackForNote && (
          <form onSubmit={handleSaveStaffNote} className="flex flex-col gap-4 text-left">
            <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-text-main">{selectedFeedbackForNote.customerName || 'Customer'}</span>
                {renderStars(selectedFeedbackForNote.rating)}
              </div>
              <p className="italic text-text-dim m-0 mt-1 line-clamp-3">
                "{selectedFeedbackForNote.message}"
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-main">Set Feedback Status</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Pending', 'Reviewed', 'Resolved'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setActionStatusInput(st)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      actionStatusInput === st
                        ? st === 'Resolved'
                          ? 'bg-success/20 text-success border-success'
                          : st === 'Reviewed'
                          ? 'bg-primary/20 text-primary border-primary'
                          : 'bg-warning/20 text-warning border-warning'
                        : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
                    }`}
                  >
                    {st === 'Pending' ? '🟡 Pending' : st === 'Reviewed' ? '🔵 Reviewed' : '🟢 Resolved'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-main">Internal Staff Resolution Note</label>
              <textarea
                rows={3}
                placeholder="e.g. Verified thread tension; customer replacement processed."
                value={staffNoteInput}
                onChange={(e) => setStaffNoteInput(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-xs outline-none focus:border-primary leading-relaxed"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setSelectedFeedbackForNote(null)}
                className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingNote}
                className="py-2.5 px-5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs cursor-pointer border-none shadow-sm"
              >
                {isSavingNote ? 'Saving...' : 'Save Feedback Update'}
              </button>
            </div>
          </form>
        )}
      </GlassModal>
    </section>
  );
}
