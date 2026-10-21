'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { matchesProductSearch } from '@/lib/searchUtils';

interface OrderItem {
  id?: string;
  name?: string;
  title?: string;
  quantity?: number;
  price?: number;
}

interface OrderRecord {
  id?: string | number;
  orderId?: string | number;
  transactionID?: string;
  customerName?: string;
  customer?: { name?: string; email?: string; phone?: string };
  user?: { username?: string; email?: string; name?: string };
  status?: string;
  total?: number;
  totalAmount?: number;
  items?: OrderItem[];
  orderItems?: OrderItem[];
  createdAt?: string;
  date?: string;
  notes?: string;
}

interface MaterialRecord {
  id?: string | number;
  name?: string;
  category?: string;
  type?: string;
  quantity?: number;
  stock?: number;
  count?: number;
  unit?: string;
  color?: string;
  threshold?: number;
}

interface DashboardOmniSearchProps {
  orders?: OrderRecord[];
  inventory?: MaterialRecord[];
  products?: any[];
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  onSelectOrder?: (order: OrderRecord) => void;
  role?: 'admin' | 'employee';
}

export default function DashboardOmniSearch({
  orders = [],
  inventory = [],
  products = [],
  activeTab,
  setActiveTab,
  onSelectOrder,
  role = 'admin'
}: DashboardOmniSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Global Keyboard shortcuts: Ctrl+K / Cmd+K to focus, Ctrl+/ to toggle copilot
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('toggleAIAssistant'));
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Navigation pages list based on role
  const navPages = useMemo(() => {
    if (role === 'admin') {
      return [
        { id: 'overview', title: 'Dashboard Overview', desc: 'KPIs, stats, and real-time operations', category: 'Navigation' },
        { id: 'products', title: 'Product Catalog', desc: 'Manage base fans, bags, aprons, and pricing', category: 'Navigation' },
        { id: 'materials', title: 'Raw Materials & Spools', desc: 'Stock levels, spools, fabrics, and reorder alerts', category: 'Navigation' },
        { id: 'staffing', title: 'Personnel & Operators', desc: 'Staff shifts, roles, and machine assignments', category: 'Navigation' },
        { id: 'analytics', title: 'Business Analytics', desc: 'Revenue breakdowns, product volume, and trends', category: 'Navigation' },
        { id: 'history', title: 'Archived Order History', desc: 'Search past completed and archived orders', category: 'Navigation' },
        { id: 'audit', title: 'System Audit Trail', desc: 'Operator logs, inventory changes, and system history', category: 'Navigation' },
        { id: 'settings', title: 'Store Settings', desc: 'Branding, logos, receipts, and system configs', category: 'Navigation' }
      ];
    } else {
      return [
        { id: 'workbench', title: 'My Workbench', desc: 'Active tickets assigned to this machine', category: 'Navigation' },
        { id: 'orders', title: 'Order Queue', desc: 'Workshop live embroidery and sewing queue', category: 'Navigation' },
        { id: 'counter', title: 'Walk-In Counter Mode', desc: 'POS tickets, claim slips, and on-site payments', category: 'Navigation' },
        { id: 'history', title: 'Order History', desc: 'Review completed tickets and claim stubs', category: 'Navigation' },
        { id: 'support', title: 'Customer Reviews', desc: 'Customer ratings, order reviews, and feedback', category: 'Navigation' },
        { id: 'settings', title: 'Operator Settings', desc: 'Shift clock-in, password, and preferences', category: 'Navigation' }
      ];
    }
  }, [role]);

  // Filter items in 0 tokens
  const searchResults = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return { orders: [], inventory: [], pages: [], total: 0 };

    // 1. Navigation matches
    const matchedPages = navPages.filter(p => 
      p.title.toLowerCase().includes(cleanQuery) || 
      p.desc.toLowerCase().includes(cleanQuery) ||
      p.id.toLowerCase().includes(cleanQuery)
    ).slice(0, 3);

    // 2. Orders matches (ID, Customer name, Items)
    const matchedOrders = orders.filter(o => {
      const orderIdStr = String(o.orderId || o.id || o.transactionID || '').toLowerCase();
      const customerName = (o.customerName || o.customer?.name || o.user?.name || o.user?.username || '').toLowerCase();
      const status = (o.status || '').toLowerCase();
      const items = (o.items || o.orderItems || []).map(i => (i.name || i.title || '').toLowerCase()).join(' ');

      // Strip symbols for ID search: "#104" matches "104"
      const strippedQuery = cleanQuery.replace(/^[#\-]/, '');

      return orderIdStr.includes(cleanQuery) ||
             orderIdStr.includes(strippedQuery) ||
             customerName.includes(cleanQuery) ||
             status.includes(cleanQuery) ||
             items.includes(cleanQuery);
    }).slice(0, 4);

    // 3. Materials matches
    const matchedMaterials = inventory.filter(m => {
      const name = (m.name || '').toLowerCase();
      const category = (m.category || m.type || '').toLowerCase();
      const color = (m.color || '').toLowerCase();
      return name.includes(cleanQuery) || category.includes(cleanQuery) || color.includes(cleanQuery);
    }).slice(0, 4);

    return {
      orders: matchedOrders,
      inventory: matchedMaterials,
      pages: matchedPages,
      total: matchedOrders.length + matchedMaterials.length + matchedPages.length
    };
  }, [query, orders, inventory, navPages]);

  // Trigger AI Copilot with current search text or general toggle
  const handleTriggerAI = (customText?: string) => {
    const promptToSend = (customText || query).trim();
    if (promptToSend) {
      window.dispatchEvent(new CustomEvent('openAIAssistantWithQuery', { detail: { query: promptToSend } }));
    } else {
      window.dispatchEvent(new CustomEvent('toggleAIAssistant'));
    }
    setIsOpen(false);
  };

  const handleSelectPage = (tabId: string) => {
    if (setActiveTab) setActiveTab(tabId);
    setIsOpen(false);
    setQuery('');
  };

  const handleSelectOrder = (order: OrderRecord) => {
    if (onSelectOrder) {
      onSelectOrder(order);
    } else if (setActiveTab) {
      // Default to orders or workbench tab
      if (role === 'admin') {
        setActiveTab('overview');
      } else {
        setActiveTab('orders');
      }
    }
    setIsOpen(false);
    setQuery('');
  };

  const handleSelectMaterial = (material: MaterialRecord) => {
    if (setActiveTab) {
      setActiveTab('materials');
    }
    setIsOpen(false);
    setQuery('');
  };

  // Status badge styling helper
  const getStatusBadge = (status?: string) => {
    const s = (status || 'In Queue').toLowerCase();
    if (s.includes('delivered') || s.includes('complete') || s.includes('ready')) {
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    }
    if (s.includes('process') || s.includes('sewing') || s.includes('embroidery')) {
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    }
    if (s.includes('rush') || s.includes('urgent') || s.includes('cancel')) {
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    }
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-[460px]">
      {/* Omni-Search Input Capsule */}
      <div className="relative flex items-center bg-white/[0.04] hover:bg-white/[0.07] border border-border-glass rounded-xl shadow-xs transition-all focus-within:border-border-glass/80 focus-within:ring-2 focus-within:ring-white/5">
        {/* Left Search Icon */}
        <span className="pl-3 pr-2 text-text-dim flex items-center pointer-events-none">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
              inputRef.current?.blur();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (query.trim()) {
                // If user pressed Enter and there are results, pick the first, otherwise ask AI
                if (searchResults.orders.length > 0) {
                  handleSelectOrder(searchResults.orders[0]);
                } else if (searchResults.pages.length > 0) {
                  handleSelectPage(searchResults.pages[0].id);
                } else {
                  handleTriggerAI(query);
                }
              }
            }
          }}
          placeholder={`Search orders, inventory, or ask AI...`}
          className="w-full bg-transparent border-none text-text-main text-[0.84rem] py-2 outline-none placeholder:text-text-dim/60 font-medium"
        />

        {/* Clear Button */}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="p-1 mr-1 text-text-dim hover:text-text-main rounded-md hover:bg-white/10 cursor-pointer border-none bg-transparent transition-colors"
            title="Clear search"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Keyboard shortcut hint badge */}
        {!query && (
          <span className="hidden sm:flex items-center gap-0.5 text-[0.62rem] font-mono text-text-dim bg-white/5 border border-border-glass px-1.5 py-0.5 rounded mr-1.5 pointer-events-none">
            <span>Ctrl</span><span>K</span>
          </span>
        )}

        {/* Divider */}
        <div className="h-4 w-[1px] bg-border-glass/60 shrink-0 mx-1" />

        {/* Permanent AI Copilot Trigger Button (Sleek monochrome vector Sparkles) */}
        <button
          type="button"
          onClick={() => handleTriggerAI()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 mr-1 rounded-lg text-text-dim hover:text-text-main hover:bg-white/10 border border-transparent hover:border-border-glass cursor-pointer transition-all active:scale-95 group shrink-0"
          title="StitchMaster AI Copilot (Ctrl+/)"
          aria-label="Open AI Copilot"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-main group-hover:scale-110 transition-transform">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
            <path d="M19 4v4m2-2h-4" />
          </svg>
          <span className="text-[0.72rem] font-bold text-text-main hidden lg:inline tracking-tight">
            Copilot
          </span>
        </button>
      </div>

      {/* Instant 0-Token Search Results Dropdown */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute top-[calc(100%+8px)] inset-x-0 bg-bg-card/95 backdrop-blur-2xl border border-border-glass rounded-2xl p-2 shadow-2xl z-[3000] max-h-[70vh] overflow-y-auto flex flex-col gap-2 animate-[fadeIn_0.15s_ease-out]">
          {/* Top Card: Ask StitchMaster AI */}
          <button
            type="button"
            onClick={() => handleTriggerAI(query)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/25 text-left cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="p-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary flex items-center justify-center shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                  <path d="M19 4v4m2-2h-4" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-text-main truncate">
                    Ask StitchMaster AI: <span className="text-primary font-mono italic font-semibold">"{query}"</span>
                  </span>
                </div>
                <p className="text-[0.68rem] text-text-dim m-0 truncate">Query workshop database, analyze rush queue, or audit materials</p>
              </div>
            </div>
            <span className="text-xs text-primary font-bold shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform">
              Ask ↗
            </span>
          </button>

          {/* Section 1: Matching Orders (0 tokens) */}
          {searchResults.orders.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="px-2 pt-1 flex items-center justify-between text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">
                <span>Orders ({searchResults.orders.length})</span>
                <span className="text-[0.6rem] font-normal normal-case">0 tokens • instant</span>
              </div>
              {searchResults.orders.map((order, i) => {
                const orderId = order.orderId || order.id || order.transactionID || 'N/A';
                const customer = order.customerName || order.customer?.name || order.user?.name || order.user?.username || 'Walk-In Customer';
                const total = order.total || order.totalAmount;
                const status = order.status || 'In Queue';
                return (
                  <button
                    key={`order-${orderId}-${i}`}
                    type="button"
                    onClick={() => handleSelectOrder(order)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-border-glass text-left cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono font-bold text-xs text-text-main px-1.5 py-0.5 rounded bg-white/10 border border-white/5 shrink-0">
                        #{orderId}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text-main m-0 truncate">{customer}</p>
                        <p className="text-[0.65rem] text-text-dim m-0 truncate">
                          {order.items?.length ? `${order.items.length} item(s)` : 'Embroidery Order'}
                          {total ? ` • ₱${Number(total).toFixed(2)}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full border shrink-0 ${getStatusBadge(status)}`}>
                      {status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Section 2: Raw Materials & Inventory (0 tokens) */}
          {searchResults.inventory.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="px-2 pt-1 flex items-center justify-between text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">
                <span>Materials & Spools ({searchResults.inventory.length})</span>
                <span className="text-[0.6rem] font-normal normal-case">0 tokens • instant</span>
              </div>
              {searchResults.inventory.map((mat, i) => {
                const count = mat.quantity ?? mat.stock ?? mat.count ?? 0;
                const isLow = count <= (mat.threshold ?? 5);
                return (
                  <button
                    key={`mat-${mat.id || i}`}
                    type="button"
                    onClick={() => handleSelectMaterial(mat)}
                    className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-border-glass text-left cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim shrink-0">
                        <path d="m12 2 10 6-10 6-10-6Z"/><path d="m2 12 10 6 10-6"/><path d="m2 17 10 6 10-6"/>
                      </svg>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text-main m-0 truncate">{mat.name}</p>
                        <p className="text-[0.65rem] text-text-dim m-0 capitalize truncate">
                          {mat.category || mat.type || 'Material'} {mat.color ? `• ${mat.color}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      isLow 
                        ? 'bg-white/15 text-text-main border-white/20' 
                        : 'bg-white/5 text-text-dim border-border-glass'
                    }`}>
                      {isLow ? `Low: ${count} ${mat.unit || ''}` : `${count} ${mat.unit || ''}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Section 3: Navigation Quick Links */}
          {searchResults.pages.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="px-2 pt-1 text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">
                Navigation
              </div>
              {searchResults.pages.map((p) => (
                <button
                  key={`page-${p.id}`}
                  type="button"
                  onClick={() => handleSelectPage(p.id)}
                  className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-border-glass text-left cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-main m-0 truncate">{p.title}</p>
                    <p className="text-[0.65rem] text-text-dim m-0 truncate">{p.desc}</p>
                  </div>
                  <span className="text-[0.65rem] text-text-dim font-mono">Jump ↵</span>
                </button>
              ))}
            </div>
          )}

          {/* Empty fallback */}
          {searchResults.total === 0 && (
            <div className="p-4 text-center text-text-dim flex flex-col items-center gap-1.5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-dim/50">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p className="text-xs m-0">No direct matches for "{query}".</p>
              <button
                type="button"
                onClick={() => handleTriggerAI(query)}
                className="mt-1 text-xs text-primary font-bold hover:underline cursor-pointer bg-transparent border-none"
              >
                Ask StitchMaster AI to search and analyze ↗
              </button>
            </div>
          )}

          {/* Dropdown Footer */}
          <div className="px-2 py-1.5 border-t border-border-glass/40 flex items-center justify-between text-[0.65rem] text-text-dim">
            <span>Press <kbd className="font-mono bg-white/10 px-1 py-0.5 rounded border border-border-glass">Esc</kbd> to exit</span>
            <span><kbd className="font-mono bg-white/10 px-1 py-0.5 rounded border border-border-glass">Ctrl + /</kbd> Copilot</span>
          </div>
        </div>
      )}
    </div>
  );
}
