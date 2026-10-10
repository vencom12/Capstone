'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Pagination from '@/components/ui/Pagination';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId?: string;
  userRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  ipAddress?: string;
  diff?: any;
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  } | null;
}

export default function PanelAuditTrail() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState('All');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogEntry | null>(null);

  // Server-side Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 15;

  const fetchLogs = async (page = 1, entity = selectedEntity, search = searchQuery) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(pageSize));
      if (entity && entity !== 'All') params.append('entity', entity);
      if (search && search.trim()) params.append('search', search.trim());

      const res = await api.get<{
        logs: AuditLogEntry[];
        pagination?: { totalCount: number; currentPage: number; totalPages: number };
      }>(`/api/admin/audit-logs?${params.toString()}`);

      if (res && res.logs) {
        setLogs(res.logs);
        if (res.pagination) {
          setTotalCount(res.pagination.totalCount);
          setCurrentPage(res.pagination.currentPage);
        } else {
          setTotalCount(res.logs.length);
          setCurrentPage(page);
        }
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      showToast('Failed to load audit trail logs', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch on filter or search change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs(1, selectedEntity, searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [selectedEntity, searchQuery]);

  const entityTabs = ['All', 'Order', 'Inventory', 'Product', 'User', 'Settings'];

  const handleExportCSV = async () => {
    try {
      showToast('Preparing audit trail export...', 'info');
      const params = new URLSearchParams();
      params.append('limit', '1000');
      params.append('page', '1');
      if (selectedEntity && selectedEntity !== 'All') params.append('entity', selectedEntity);
      if (searchQuery && searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await api.get<{ logs: AuditLogEntry[] }>(`/api/admin/audit-logs?${params.toString()}`);
      const exportLogs = res?.logs || logs;

      if (exportLogs.length === 0) {
        showToast('No logs available to export', 'info');
        return;
      }

      const headers = ['Timestamp', 'Actor Username', 'Actor Role', 'Action', 'Entity', 'Entity ID', 'IP Address', 'Diff'];
      const rows = exportLogs.map((log) => [
        new Date(log.timestamp).toISOString(),
        `"${log.user?.username || log.userId || 'System'}"`,
        `"${log.userRole || 'System'}"`,
        `"${log.action}"`,
        `"${log.entity}"`,
        `"${log.entityId || 'N/A'}"`,
        `"${log.ipAddress || 'N/A'}"`,
        `"${log.diff ? JSON.stringify(log.diff).replace(/"/g, '""') : ''}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `audit_trail_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(`Exported ${exportLogs.length} audit log entries to CSV`, 'success');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const getActionBadgeColor = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('CREATE') || act.includes('ADD')) {
      return 'bg-success/20 text-success border-success/30';
    }
    if (act.includes('DELETE') || act.includes('REMOVE')) {
      return 'bg-danger/20 text-danger border-danger/30';
    }
    if (act.includes('STATUS') || act.includes('UPDATE')) {
      return 'bg-primary/20 text-primary border-primary/30';
    }
    if (act.includes('SETTINGS') || act.includes('LOGO') || act.includes('QR')) {
      return 'bg-secondary/20 text-secondary border-secondary/30';
    }
    return 'bg-white/10 text-text-dim border-border-glass';
  };

  return (
    <div className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Compact Top Action Toolbar */}
      <div className="flex items-center justify-start gap-3 flex-wrap">
        <button
          onClick={() => fetchLogs(currentPage, selectedEntity, searchQuery)}
          disabled={isLoading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/5 text-text-main border border-border-glass hover:bg-white/10 transition-all cursor-pointer disabled:opacity-50"
          title="Refresh logs"
        >
          <svg
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-sm cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>

        <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/20 text-primary border border-primary/30">
          {totalCount.toLocaleString()} Logged Security Events
        </span>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Entity Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
          {entityTabs.map((tab) => {
            const isSelected = selectedEntity === tab;
            return (
              <button
                key={tab}
                onClick={() => {
                  setSelectedEntity(tab);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10 hover:text-text-main'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <svg
            className="w-4 h-4 text-text-dim absolute left-3 top-1/2 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search action, actor, entity ID, IP..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-white/5 border border-border-glass rounded-xl py-2 pl-9 pr-3 text-text-main text-xs outline-none focus:border-primary transition-all placeholder:text-text-dim/60"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="glass-table-container">
        <table className="glass-table">
          <thead>
            <tr>
              <th className="glass-th text-left">Timestamp</th>
              <th className="glass-th text-left">Actor</th>
              <th className="glass-th text-left">Action & Entity</th>
              <th className="glass-th text-left">Target ID</th>
              <th className="glass-th text-left">Network / IP</th>
              <th className="glass-th text-right">Payload</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="glass-td text-center py-12 text-text-dim">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs">Loading audit ledger...</span>
                  </div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="glass-td text-center py-12 text-text-dim text-sm">
                  No audit log entries match your active filters.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const dateObj = new Date(log.timestamp);
                const hasDiff = log.diff && Object.keys(log.diff).length > 0;
                return (
                  <tr key={log.id} className="glass-tr hover:bg-white/[0.04] transition-all">
                    {/* Timestamp */}
                    <td className="glass-td text-left">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-semibold text-text-main">
                          {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className="text-[0.7rem] text-text-dim">
                          {dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </td>

                    {/* Actor */}
                    <td className="glass-td text-left">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold shrink-0 uppercase">
                          {(log.user?.username || log.userRole || 'S')[0]}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-text-main">
                            {log.user?.username || log.userId || 'System Automation'}
                          </span>
                          <span className="text-[0.65rem] text-text-dim capitalize font-mono">
                            {log.userRole || 'System'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Action & Entity */}
                    <td className="glass-td text-left">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[0.65rem] font-bold border ${getActionBadgeColor(log.action)}`}>
                          {log.action}
                        </span>
                        <span className="text-xs text-text-dim font-medium">
                          on <b className="text-text-main font-semibold">{log.entity}</b>
                        </span>
                      </div>
                    </td>

                    {/* Target ID */}
                    <td className="glass-td text-left">
                      {log.entityId ? (
                        <span className="font-mono text-[0.7rem] bg-white/5 border border-border-glass px-2 py-0.5 rounded text-text-dim select-all">
                          {log.entityId}
                        </span>
                      ) : (
                        <span className="text-text-dim text-xs">—</span>
                      )}
                    </td>

                    {/* Network / IP */}
                    <td className="glass-td text-left">
                      <span className="font-mono text-[0.7rem] text-text-dim">
                        {log.ipAddress || '127.0.0.1'}
                      </span>
                    </td>

                    {/* Details Payload Button */}
                    <td className="glass-td text-right">
                      {hasDiff ? (
                        <button
                          onClick={() => setSelectedLogForDetails(log)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-text-main border border-border-glass transition-all cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Inspect Diff
                        </button>
                      ) : (
                        <span className="text-text-dim/60 text-xs italic">No payload</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <Pagination
        currentPage={currentPage}
        totalItems={totalCount}
        pageSize={pageSize}
        onPageChange={(p) => fetchLogs(p, selectedEntity, searchQuery)}
        itemLabel="audit log entries"
      />

      {/* Inspect Diff Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-bg-surface border border-border-glass rounded-2xl w-full max-w-xl p-6 shadow-2xl flex flex-col gap-4 text-left">
            <div className="flex justify-between items-center border-b border-border-glass pb-3">
              <div>
                <h3 className="text-lg font-bold text-text-main m-0">Mutation Payload & State Diff</h3>
                <p className="text-xs text-text-dim mt-0.5">
                  Action: <b className="text-primary">{selectedLogForDetails.action}</b> on <b className="text-text-main">{selectedLogForDetails.entity}</b>
                </p>
              </div>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-text-dim hover:text-text-main flex items-center justify-center cursor-pointer transition-all border border-border-glass"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-white/5 p-3 rounded-xl border border-border-glass/40">
              <div>
                <span className="text-text-dim block">Logged Actor:</span>
                <span className="font-bold text-text-main">{selectedLogForDetails.user?.username || selectedLogForDetails.userId || 'System'}</span>
              </div>
              <div>
                <span className="text-text-dim block">Timestamp:</span>
                <span className="font-mono text-text-main">{new Date(selectedLogForDetails.timestamp).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-text-dim block">Target ID:</span>
                <span className="font-mono text-text-main select-all">{selectedLogForDetails.entityId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-text-dim block">Client IP:</span>
                <span className="font-mono text-text-main">{selectedLogForDetails.ipAddress || 'Internal'}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Recorded Changes Payload (JSON)</span>
              <pre className="bg-black/60 border border-border-glass rounded-xl p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-64 scrollbar-thin">
                {JSON.stringify(selectedLogForDetails.diff, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-text-main border border-border-glass transition-all cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
