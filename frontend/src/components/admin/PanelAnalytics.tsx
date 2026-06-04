'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
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
  Bar,
  LineChart,
  Line
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
  const fetchAnalytics = async () => {
    setIsLoadingAnalytics(true);
    try {
      const data = await api.get<any>('/api/admin/analytics');
      if (data) {
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to load business analytics:', err);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  // 2. Fetch Business Intelligence suggestions & projections
  const fetchBI = async () => {
    setIsLoadingBI(true);
    try {
      const data = await api.get<any>('/api/admin/intelligence/suggestions');
      if (data) {
        setBiData(data);
      }
    } catch (err) {
      console.error('Failed to load BI suggestions:', err);
    } finally {
      setIsLoadingBI(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    fetchBI();
  }, [orders]); // Refresh when order queue updates

  const handleExecuteAction = async (suggestion: any) => {
    setExecutingId(suggestion.id);
    try {
      showToast(`Executing BI strategy: ${suggestion.title}...`, 'info');
      const res = await api.post<any>('/api/admin/intelligence/execute', {
        actionType: suggestion.action.type,
        payload: suggestion.action.payload
      });
      showToast(res.message || 'Strategy action implemented successfully!', 'success');
      
      // Reload both analytics and BI suggestions
      fetchAnalytics();
      fetchBI();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to execute strategic action', 'error');
    } finally {
      setExecutingId(null);
    }
  };

  if (isLoadingAnalytics || !analytics) {
    return (
      <div className="py-20 text-center text-text-dim">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
        <span>Compiling business analytics and trends data...</span>
      </div>
    );
  }

  // Calculate high-fidelity cards
  const totalVisits = analytics.totalVisits || 0;
  const avgOrderValue = parseFloat(analytics.avgOrderValue || 0);

  // Peak Season Month Logic
  let peakSeasonText = 'N/A';
  if (analytics.orderTrends && analytics.orderTrends.length > 0) {
    const sortedTrends = [...analytics.orderTrends].sort((a, b) => b.revenue - a.revenue);
    const topPeriod = sortedTrends[0];
    if (topPeriod && topPeriod._id) {
      peakSeasonText = `${topPeriod._id.month}/${topPeriod._id.year}`;
    }
  }

  // Format Recharts data structures
  const trendsData = (analytics.orderTrends || []).map((t: any) => ({
    name: `${t._id.month}/${t._id.year}`,
    revenue: t.revenue,
    visits: Math.floor(t.revenue / 20) + 10 // Mock visits fallback based on legacy admin.js
  }));

  const pieData = (analytics.statusDistribution || []).map((d: any) => ({
    name: d._id,
    value: d.count
  }));

  const topOrderedData = (analytics.topOrdered || []).map((d: any) => ({
    name: d._id,
    count: d.count
  }));

  const topLikedData = (analytics.topLiked || []).map((d: any) => {
    if (d._id === null || d._id === undefined) {
      return { name: 'Storefront', count: d.count };
    }
    return { name: d._id, count: d.count };
  });

  // Compile 7-day projection chart data
  const forecastChartData: any[] = [];
  if (biData && biData.projections) {
    const proj = biData.projections;
    
    // 1. Add historical actuals
    for (let i = 0; i < proj.labels.length; i++) {
      const d = new Date(proj.labels[i]);
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      forecastChartData.push({
        date: label,
        actualRevenue: proj.revenue[i],
        actualVisits: proj.visits[i],
        projectedRevenue: null,
        projectedVisits: null,
      });
    }

    // Connect lines continuously
    const lastActualRevenue = proj.revenue[proj.revenue.length - 1] || 0;
    const lastActualVisits = proj.visits[proj.visits.length - 1] || 0;

    // 2. Add forecast projections
    for (let i = 0; i < proj.forecast.revenue.length; i++) {
      const fDate = new Date();
      fDate.setDate(fDate.getDate() + i + 1);
      const label = fDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      forecastChartData.push({
        date: label,
        actualRevenue: i === 0 ? lastActualRevenue : null,
        actualVisits: i === 0 ? lastActualVisits : null,
        projectedRevenue: proj.forecast.revenue[i],
        projectedVisits: proj.forecast.visits[i],
      });
    }
  }

  // Tailored modern colors
  const COLORS = ['#6366f1', '#f43f5e', '#10b981', '#fbbf24', '#a855f7', '#06b6d4'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1e293b]/90 backdrop-blur-[12px] border border-border-glass p-3 rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5)]">
          <p className="text-xs text-text-dim m-0 font-semibold mb-1">{label}</p>
          {payload.map((p: any, idx: number) => {
            const isRev = p.name?.toLowerCase().includes('revenue');
            const val = isRev ? `$${parseFloat(p.value).toFixed(2)}` : p.value;
            return (
              <p key={idx} className="text-sm font-bold m-0" style={{ color: p.color || '#6366f1' }}>
                {p.name}: {val}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left font-sans pb-10">
      <header className="dash-header mb-6">
        <h1 className="dash-title text-3xl font-extrabold mb-1">Business Analytics & Intelligence</h1>
        <p className="dash-subtitle text-text-dim text-[0.95rem] m-0">Review sales metrics, storefront traffic, and AI-driven strategic forecasting.</p>
      </header>

      {/* BI intelligence hub cards section */}
      <div className="glass-card mb-6 p-6 border border-border-glass rounded-[24px] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
        
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-gradient-to-br from-primary to-secondary w-9 h-9 rounded-xl flex items-center justify-center text-white text-lg font-bold">
            🧠
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white m-0">Stitch-Opt Strategic Intelligence Hub</h2>
            <p className="text-xs text-text-dim m-0 mt-0.5">Automated recommendations and foresight modeling parsed by StitchMaster AI.</p>
          </div>
        </div>

        {/* BI Key Performance KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-border-glass/40 p-4 rounded-2xl flex flex-col text-left">
            <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider">Site Traffic Conversion</span>
            <span className="text-xl font-extrabold text-white mt-1.5">
              {biData?.metrics?.conversionRate ? `${(biData.metrics.conversionRate * 100).toFixed(1)}%` : 'Calculating...'}
            </span>
            <span className="text-[0.65rem] text-text-dim mt-0.5">Ratio of orders placed per unique visit</span>
          </div>
          
          <div className="bg-white/5 border border-border-glass/40 p-4 rounded-2xl flex flex-col text-left">
            <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider">Projected 7-Day Revenue</span>
            <span className="text-xl font-extrabold text-success mt-1.5">
              {biData?.projections?.forecast?.revenue 
                ? `$${biData.projections.forecast.revenue.reduce((a: number, b: number) => a + b, 0).toFixed(2)}` 
                : 'Projecting...'}
            </span>
            <span className="text-[0.65rem] text-text-dim mt-0.5">Estimated revenue for upcoming week</span>
          </div>

          <div className="bg-white/5 border border-border-glass/40 p-4 rounded-2xl flex flex-col text-left">
            <span className="text-[0.7rem] font-bold text-text-dim uppercase tracking-wider">Safety Restock Alarms</span>
            <span className={`text-xl font-extrabold mt-1.5 ${
              biData?.suggestions?.filter((s: any) => s.category === 'Inventory' && s.severity === 'critical').length > 0 
                ? 'text-danger' 
                : 'text-primary'
            }`}>
              {biData?.suggestions?.filter((s: any) => s.category === 'Inventory').length || 0} Alert(s)
            </span>
            <span className="text-[0.65rem] text-text-dim mt-0.5">Stock spools below min safety thresholds</span>
          </div>
        </div>

        {/* AI Recommendations List */}
        <div className="mt-4">
          <h3 className="text-sm font-bold text-text-main uppercase tracking-wider mb-3">AI Recommendations Feed</h3>
          
          {isLoadingBI && !biData ? (
            <div className="py-8 text-center text-text-dim text-xs">
              Analyzing historical spools consumption and order queues...
            </div>
          ) : !biData?.suggestions || biData.suggestions.length === 0 ? (
            <div className="bg-white/5 border border-border-glass/20 p-6 rounded-2xl text-center text-text-dim text-xs italic">
              ✨ All systems operational. Spool stock levels are healthy, design pricing is optimized, and order queues are flowing.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {biData.suggestions.map((s: any) => {
                const isCritical = s.severity === 'critical';
                const isWarning = s.severity === 'warning';
                const isExecuting = executingId === s.id;

                let borderClass = 'border-border-glass';
                let iconColor = 'bg-primary/20 text-primary';
                
                if (isCritical) {
                  borderClass = 'border-danger/40 bg-danger/5 shadow-[0_0_15px_rgba(244,63,94,0.05)]';
                  iconColor = 'bg-danger/25 text-danger';
                } else if (isWarning) {
                  borderClass = 'border-warning/40 bg-warning/5';
                  iconColor = 'bg-warning/25 text-warning';
                } else {
                  borderClass = 'border-primary/20 bg-primary/5';
                }

                let badge = 'bg-white/10 text-white';
                if (s.category === 'Inventory') badge = 'bg-danger/15 text-danger border border-danger/20';
                else if (s.category === 'Pricing') badge = 'bg-success/15 text-success border border-success/20';
                else if (s.category === 'Operations') badge = 'bg-primary/15 text-primary border border-primary/20';

                return (
                  <div 
                    key={s.id}
                    className={`border p-4.5 rounded-2xl flex flex-col justify-between hover:scale-[1.01] hover:border-primary/40 transition-all duration-300 ${borderClass}`}
                  >
                    <div className="text-left">
                      <div className="flex justify-between items-center gap-2 mb-2">
                        <span className="font-extrabold text-[0.85rem] text-white leading-tight">
                          {s.title}
                        </span>
                        <span className={`text-[0.6rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${badge}`}>
                          {s.category}
                        </span>
                      </div>
                      <p className="text-[0.75rem] text-text-dim leading-relaxed mb-4">
                        {s.description}
                      </p>
                    </div>

                    <button
                      onClick={() => handleExecuteAction(s)}
                      disabled={isExecuting || !!executingId}
                      className={`w-full py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer border-none flex items-center justify-center gap-2
                        ${isCritical 
                          ? 'bg-danger text-white hover:bg-danger/90' 
                          : isWarning
                            ? 'bg-warning text-black hover:bg-warning/90'
                            : 'bg-primary text-white hover:bg-primary/95'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isExecuting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                          <span>Implementing...</span>
                        </>
                      ) : (
                        <span>{s.actionText || 'Implement Action'}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Analytics Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6 pr-2">
        <div className="glass-card flex flex-col text-left">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Total Storefront Visits (30d)</span>
          <span className="text-2xl font-bold text-white mt-1.5">
            {totalVisits.toLocaleString()}
          </span>
          <span className="text-xs text-success font-semibold mt-1">✓ Active site-analytics tracking</span>
        </div>

        <div className="glass-card flex flex-col text-left">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Average Order Value</span>
          <span className="text-2xl font-bold text-primary mt-1.5">
            ${avgOrderValue.toFixed(2)}
          </span>
          <span className="text-xs text-primary font-semibold mt-1">Calculated from total realized sales</span>
        </div>

        <div className="glass-card flex flex-col text-left">
          <span className="text-xs font-bold text-text-dim uppercase tracking-wider">Peak Operational Month</span>
          <span className="text-2xl font-bold text-secondary mt-1.5">
            {peakSeasonText}
          </span>
          <span className="text-xs text-secondary font-semibold mt-1">High-revenue volume timestamp</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pr-2 mb-6">
        
        {/* Graph: 7-Day Performance Forecast */}
        {forecastChartData.length > 0 && (
          <div className="glass-card flex flex-col h-[380px] xl:col-span-2">
            <h3 className="text-md font-bold text-text-main m-0 mb-3 uppercase tracking-wider">
              Stitch-Opt 7-Day Performance Forecast (Actual vs. AI Projected)
            </h3>
            <div className="flex-1 w-full text-xs text-text-dim font-medium">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastChartData}>
                  <defs>
                    <linearGradient id="colorActualRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorForecastRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="var(--text-dim)" />
                  <YAxis stroke="var(--text-dim)" tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  
                  {/* Historical Solid Line */}
                  <Area
                    name="Actual Revenue"
                    type="monotone"
                    dataKey="actualRevenue"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorActualRevenue)"
                    connectNulls
                  />
                  
                  {/* Dotted Projection Line */}
                  <Area
                    name="Projected Revenue"
                    type="monotone"
                    dataKey="projectedRevenue"
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorForecastRevenue)"
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Graph 1: Revenue Trends */}
        <div className="glass-card flex flex-col h-[380px]">
          <h3 className="text-md font-bold text-text-main m-0 mb-3 uppercase tracking-wider">Monthly Revenue Trends</h3>
          <div className="flex-1 w-full text-xs text-text-dim font-medium">
            {trendsData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-dim italic">No sales recorded.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendsData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="var(--text-dim)" />
                  <YAxis stroke="var(--text-dim)" tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    name="Revenue"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 2: Site Traffic */}
        <div className="glass-card flex flex-col h-[380px]">
          <h3 className="text-md font-bold text-text-main m-0 mb-3 uppercase tracking-wider">Monthly Page Visits</h3>
          <div className="flex-1 w-full text-xs text-text-dim font-medium">
            {trendsData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-dim italic">No page traffic recorded.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="var(--text-dim)" />
                  <YAxis stroke="var(--text-dim)" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    name="Visits"
                    type="monotone"
                    dataKey="visits"
                    stroke="#06b6d4"
                    strokeWidth={2.5}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 3: Status Distribution */}
        <div className="glass-card flex flex-col h-[380px]">
          <h3 className="text-md font-bold text-text-main m-0 mb-3 uppercase tracking-wider">Orders Status distribution</h3>
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
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 4: Top Ordered Designs */}
        <div className="glass-card flex flex-col h-[380px]">
          <h3 className="text-md font-bold text-text-main m-0 mb-3 uppercase tracking-wider">Top Ordered Stitched Designs</h3>
          <div className="flex-1 w-full text-xs text-text-dim font-medium">
            {topOrderedData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-dim italic">No custom designs ordered.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topOrderedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="var(--text-dim)" />
                  <YAxis stroke="var(--text-dim)" />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Bar name="Orders" dataKey="count" fill="#10b981" radius={[8, 8, 0, 0]}>
                    {topOrderedData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 5: Most Liked Designs */}
        <div className="glass-card flex flex-col h-[380px] xl:col-span-2">
          <h3 className="text-md font-bold text-text-main m-0 mb-3 uppercase tracking-wider">Most Favorited Storefront Designs</h3>
          <div className="flex-1 w-full text-xs text-text-dim font-medium">
            {topLikedData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-text-dim italic">No favorites recorded.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topLikedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="var(--text-dim)" />
                  <YAxis stroke="var(--text-dim)" />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Bar name="Favorites" dataKey="count" fill="#f43f5e" radius={[8, 8, 0, 0]}>
                    {topLikedData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 1) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
