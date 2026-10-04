'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { AnalyticsSkeleton } from '@/components/ui/Skeletons';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar
} from 'recharts';

interface PanelAnalyticsProps {
  orders: any[];
}

export default function PanelAnalytics({ orders }: PanelAnalyticsProps) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [biData, setBiData] = useState<any>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [isLoadingBI, setIsLoadingBI] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  // 1. Fetch Business Analytics Data
  const fetchAnalytics = async (isBackground = false) => {
    if (!isBackground) setIsLoadingAnalytics(true);
    try {
      const data = await api.get<any>('/api/admin/analytics');
      if (data) {
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to load business analytics:', err);
    } finally {
      if (!isBackground) setIsLoadingAnalytics(false);
    }
  };

  // 2. Fetch Business Intelligence suggestions & projections
  const fetchBI = async (isBackground = false) => {
    if (!isBackground) setIsLoadingBI(true);
    try {
      const data = await api.get<any>('/api/admin/intelligence/suggestions');
      if (data) {
        setBiData(data);
      }
    } catch (err) {
      console.error('Failed to load BI suggestions:', err);
    } finally {
      if (!isBackground) setIsLoadingBI(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    fetchBI();
  }, [orders]);

  const handleExecuteAction = async (suggestion: any) => {
    setExecutingId(suggestion.id);
    const previousState = biData;
    
    setBiData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        suggestions: prev.suggestions.filter((s: any) => s.id !== suggestion.id)
      };
    });

    try {
      showToast(`Applying update: ${suggestion.title}...`, 'info');
      const res = await api.post<any>('/api/admin/intelligence/execute', {
        actionType: suggestion.action.type,
        payload: suggestion.action.payload
      });
      showToast(res.message || 'Action executed successfully!', 'success');
      fetchAnalytics(true);
      fetchBI(true);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to execute action', 'error');
      setBiData(previousState);
    } finally {
      setExecutingId(null);
    }
  };

  const handleDeclineAction = async (suggestionId: string) => {
    setExecutingId(suggestionId);
    const previousState = biData;
    
    setBiData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        suggestions: prev.suggestions.filter((s: any) => s.id !== suggestionId)
      };
    });

    try {
      await api.post<any>('/api/admin/intelligence/decline', { suggestionId });
      showToast('Alert dismissed.', 'info');
      fetchAnalytics(true);
      fetchBI(true);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to dismiss alert', 'error');
      setBiData(previousState);
    } finally {
      setExecutingId(null);
    }
  };

  if (isLoadingAnalytics || !analytics) {
    return (
      <section className="animate-fade flex flex-col min-h-full text-left font-sans pb-10">
        <header className="mb-6 flex flex-col">
          <h1 className="text-3xl font-extrabold mb-1 tracking-tight text-text-main">Business Analytics</h1>
          <p className="text-text-dim text-sm m-0">Real-time revenue performance, order volume, and catalog demand.</p>
        </header>
        <AnalyticsSkeleton />
      </section>
    );
  }

  // Active Queue Value Calculation from live orders prop
  const pendingOrders = (orders || []).filter(o =>
    ['In Queue', 'Preparing Order', 'In Transit', 'Ready For Pick Up'].includes(o.status)
  );
  const activeQueueValue = pendingOrders.reduce((sum, o) => sum + (o.totalAmount || o.amount || 0), 0);
  const activeOrdersCount = pendingOrders.length;

  const totalVisits = analytics.totalVisits || 0;
  const avgOrderValue = parseFloat(analytics.avgOrderValue || 0);

  // Clean Chart Data (Pure Real Revenue, No Synthetic Multipliers)
  const trendsData = (analytics.orderTrends || []).map((t: any) => ({
    name: `${t._id.month}/${t._id.year}`,
    revenue: t.revenue || 0
  }));

  const pieData = (analytics.statusDistribution || []).map((d: any) => ({
    name: d._id || 'Unknown',
    value: d.count || 0
  }));

  const topOrderedData = (analytics.topOrdered || []).map((d: any) => ({
    name: d._id || 'Custom Design',
    count: d.count || 0
  }));

  const topLikedData = (analytics.topLiked || []).map((d: any) => ({
    name: d._id || 'Storefront Item',
    count: d.count || 0
  }));

  // Clean, modern chart color palette
  const STATUS_PALETTE = ['#a855f7', '#6366f1', '#10b981', '#fbbf24', '#06b6d4', '#f43f5e'];

  const CustomCurrencyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1e293b]/95 border border-border-glass p-3 rounded-xl shadow-lg text-xs">
          <p className="text-text-dim m-0 font-semibold mb-1">{label}</p>
          {payload.map((p: any, idx: number) => (
            <p key={idx} className="font-bold m-0 text-white">
              {p.name}: <strong className="text-emerald-400">₱{parseFloat(p.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomCountTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1e293b]/95 border border-border-glass p-3 rounded-xl shadow-lg text-xs">
          <p className="text-text-dim m-0 font-semibold mb-1">{label}</p>
          {payload.map((p: any, idx: number) => (
            <p key={idx} className="font-bold m-0 text-white">
              {p.name}: <strong className="text-primary">{p.value}</strong>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const inventoryAlerts = (biData?.suggestions || []).filter(
    (s: any) => s.category === 'Inventory' || s.severity === 'critical' || s.severity === 'warning'
  );

  return (
    <section className="animate-fade flex flex-col min-h-full text-left font-sans pb-10">
      {/* Header */}
      <header className="mb-6 flex flex-col">
        <h1 className="text-3xl font-extrabold mb-1 tracking-tight text-text-main">Business Analytics</h1>
        <p className="text-text-dim text-sm m-0">
          Core sales revenue, order fulfillment distribution, and design popularity.
        </p>
      </header>

      {/* 4 Clean Minimal KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Card 1: Total Realized Sales */}
        <div className="glass-card p-5 border border-border-glass rounded-2xl flex flex-col text-left">
          <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider">Total Sales</span>
          <span className="text-2xl font-black text-emerald-400 mt-1.5 font-mono">
            ₱{parseFloat(analytics.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-text-dim mt-1">Across all completed orders</span>
        </div>

        {/* Card 2: Active Pipeline Value */}
        <div className="glass-card p-5 border border-border-glass rounded-2xl flex flex-col text-left">
          <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider">Active Queue Value</span>
          <span className="text-2xl font-black text-primary mt-1.5 font-mono">
            ₱{activeQueueValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-text-dim mt-1">{activeOrdersCount} order{activeOrdersCount === 1 ? '' : 's'} in progress</span>
        </div>

        {/* Card 3: Average Order Value */}
        <div className="glass-card p-5 border border-border-glass rounded-2xl flex flex-col text-left">
          <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider">Average Order Value</span>
          <span className="text-2xl font-black text-indigo-400 mt-1.5 font-mono">
            ₱{avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-text-dim mt-1">Per transaction average</span>
        </div>

        {/* Card 4: Total Orders */}
        <div className="glass-card p-5 border border-border-glass rounded-2xl flex flex-col text-left">
          <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider">Total Orders</span>
          <span className="text-2xl font-black text-purple-400 mt-1.5">
            {(analytics.totalOrders || 0).toLocaleString()}
          </span>
          <span className="text-xs text-text-dim mt-1">{totalVisits.toLocaleString()} 30-day visits</span>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* Chart 1: Monthly Revenue Trend */}
        <div className="glass-card p-5 border border-border-glass rounded-2xl flex flex-col h-[360px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-text-main m-0 uppercase tracking-wider">Monthly Revenue (PHP)</h3>
            <span className="text-xs text-text-dim">Last 6 Months</span>
          </div>
          <div className="flex-1 w-full text-xs text-text-dim font-medium">
            {trendsData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-dim italic">No sales recorded yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendsData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
                  <YAxis 
                    stroke="var(--text-dim)" 
                    tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} 
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip content={<CustomCurrencyTooltip />} />
                  <Area
                    name="Revenue"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#revenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Order Status Distribution */}
        <div className="glass-card p-5 border border-border-glass rounded-2xl flex flex-col h-[360px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-text-main m-0 uppercase tracking-wider">Order Status Distribution</h3>
            <span className="text-xs text-text-dim">Active &amp; Delivered</span>
          </div>
          <div className="flex-1 w-full text-xs text-text-dim font-medium flex items-center justify-center">
            {pieData.length === 0 ? (
              <div className="text-text-dim italic">No orders cataloged.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((_entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={STATUS_PALETTE[index % STATUS_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCountTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 3: Top Ordered Stitched Designs */}
        <div className="glass-card p-5 border border-border-glass rounded-2xl flex flex-col h-[360px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-text-main m-0 uppercase tracking-wider">Top Ordered Stitched Items</h3>
            <span className="text-xs text-text-dim">By Quantity Ordered</span>
          </div>
          <div className="flex-1 w-full text-xs text-text-dim font-medium">
            {topOrderedData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-dim italic">No custom designs ordered yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topOrderedData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--text-dim)" 
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomCountTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar name="Units Ordered" dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]}>
                    {topOrderedData.map((_entry: any, index: number) => (
                      <Cell key={`bar-${index}`} fill={STATUS_PALETTE[(index + 1) % STATUS_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 4: Most Favorited Designs */}
        <div className="glass-card p-5 border border-border-glass rounded-2xl flex flex-col h-[360px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-text-main m-0 uppercase tracking-wider">Most Favorited Designs</h3>
            <span className="text-xs text-text-dim">Customer Wishlists</span>
          </div>
          <div className="flex-1 w-full text-xs text-text-dim font-medium">
            {topLikedData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-dim italic">No customer favorites recorded yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topLikedData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--text-dim)" 
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis stroke="var(--text-dim)" tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomCountTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar name="Favorites Count" dataKey="count" fill="#f43f5e" radius={[6, 6, 0, 0]}>
                    {topLikedData.map((_entry: any, index: number) => (
                      <Cell key={`fav-bar-${index}`} fill={STATUS_PALETTE[(index + 3) % STATUS_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* Optional: Compact Inventory & Material Alerts (Only shown when actual alerts exist) */}
      {inventoryAlerts.length > 0 && (
        <div className="glass-card p-5 border border-amber-500/20 bg-amber-500/[0.03] rounded-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <h3 className="text-sm font-bold text-text-main m-0">Inventory &amp; Thread Stock Alerts</h3>
            <span className="text-[10px] bg-amber-500/15 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30 ml-auto">
              {inventoryAlerts.length} Action{inventoryAlerts.length === 1 ? '' : 's'} Required
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
            {inventoryAlerts.map((s: any) => {
              const isExecuting = executingId === s.id;
              return (
                <div key={s.id} className="bg-white/5 border border-border-glass p-3.5 rounded-xl flex flex-col justify-between gap-3 text-left">
                  <div>
                    <span className="font-bold text-xs text-text-main block">{s.title}</span>
                    <p className="text-[11px] text-text-dim m-0 mt-1 leading-relaxed">{s.description}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-auto">
                    {s.action && (
                      <button
                        type="button"
                        onClick={() => handleExecuteAction(s)}
                        disabled={isExecuting || !!executingId}
                        className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded-lg cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                      >
                        {isExecuting ? 'Applying...' : s.actionText || 'Resolve'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeclineAction(s.id)}
                      disabled={isExecuting || !!executingId}
                      className="text-xs font-semibold bg-white/5 hover:bg-white/10 text-text-dim px-2.5 py-1.5 rounded-lg cursor-pointer transition-all active:scale-95"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
