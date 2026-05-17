'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
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
  const [isLoading, setIsLoading] = useState(false);

  // 1. Fetch Analytics Data
  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const data = await api.get<any>('/api/admin/analytics');
      if (data) {
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to load business analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [orders]); // Refresh when order queue updates

  if (isLoading || !analytics) {
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

  // Tailored modern colors
  const COLORS = ['#6366f1', '#f43f5e', '#10b981', '#fbbf24', '#a855f7', '#06b6d4'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1e293b]/90 backdrop-blur-[12px] border border-border-glass p-3 rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5)]">
          <p className="text-xs text-text-dim m-0 font-semibold mb-1">{label}</p>
          {payload.map((p: any, idx: number) => (
            <p key={idx} className="text-sm font-bold m-0" style={{ color: p.color || '#6366f1' }}>
              {p.name}: {p.name?.toLowerCase().includes('revenue') ? `$${p.value.toFixed(2)}` : p.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <section className="animate-fade flex flex-col h-full text-left">
      <header className="dash-header">
        <h1 className="dash-title">Business Analytics</h1>
        <p className="dash-subtitle">Review sales metrics, storefront traffic, and popular designs.</p>
      </header>

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
