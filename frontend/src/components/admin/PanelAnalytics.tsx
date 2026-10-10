'use client';

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface PanelAnalyticsProps {
  orders: any[];
  inventory?: any[];
}

type TimeRange = 'today' | 'week' | 'month' | 'all';

export default function PanelAnalytics({ orders = [], inventory = [] }: PanelAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('today');

  // Build a name->supplierUnitCost map from real inventory data
  const inventoryCostMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    inventory.forEach((inv) => {
      if (inv.item && inv.supplierUnitCost != null) {
        map[inv.item.toLowerCase()] = inv.supplierUnitCost;
      }
    });
    return map;
  }, [inventory]);

  // Check if owner has configured any real costs (to show a data quality badge)
  const hasRealCosts = useMemo(() => Object.keys(inventoryCostMap).length > 0, [inventoryCostMap]);

  // Helper: look up real cost from inventory first, then fall back to category estimate
  const getRealOrEstimatedCost = (itemName: string, itemPrice: number, isByog: boolean, qty: number): number => {
    if (isByog) return 12 * qty; // BYOG: only thread/stabilizer cost

    const lowerName = itemName.toLowerCase();

    // Try to match against real inventory items
    for (const [invName, cost] of Object.entries(inventoryCostMap)) {
      if (cost != null && lowerName.includes(invName.replace('(', '').replace(')', '').split(' ')[0].toLowerCase())) {
        return cost * qty;
      }
    }

    // Fallback category estimates
    if (lowerName.includes('bath towel')) return 80 * qty;
    if (lowerName.includes('hand towel') || lowerName.includes('towel')) return 45 * qty;
    if (lowerName.includes('cap') || lowerName.includes('hat')) return 75 * qty;
    if (lowerName.includes('shirt') || lowerName.includes('polo')) return 90 * qty;
    if (lowerName.includes('hoodie') || lowerName.includes('jacket')) return 180 * qty;
    return Math.round(itemPrice * 0.35) * qty;
  };


  // Filter orders by selected time window
  const filteredOrders = useMemo(() => {
    const nonCanceled = (orders || []).filter((o) => o.status !== 'Order Canceled');
    if (timeRange === 'all') return nonCanceled;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (timeRange === 'today') {
      return nonCanceled.filter((o) => {
        const orderDate = new Date(o.createdAt || o.date);
        return orderDate >= startOfToday;
      });
    }

    if (timeRange === 'week') {
      const startOfWeek = new Date(startOfToday);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      return nonCanceled.filter((o) => {
        const orderDate = new Date(o.createdAt || o.date);
        return orderDate >= startOfWeek;
      });
    }

    if (timeRange === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return nonCanceled.filter((o) => {
        const orderDate = new Date(o.createdAt || o.date);
        return orderDate >= startOfMonth;
      });
    }

    return nonCanceled;
  }, [orders, timeRange]);

  // Order status subsets
  const completedOrders = useMemo(() => {
    return filteredOrders.filter((o) =>
      ['Order Delivered', 'Completed', 'Ready For Pick Up', 'Ready for Pickup'].includes(o.status)
    );
  }, [filteredOrders]);

  const activeOrders = useMemo(() => {
    return filteredOrders.filter((o) =>
      ['In Queue', 'Preparing Order', 'In Transit'].includes(o.status)
    );
  }, [filteredOrders]);

  // Financial calculations
  const totalRevenue = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.totalAmount || o.amount || 0), 0);
  }, [filteredOrders]);

  // Real-or-estimated material cost calculation
  const estimatedMaterialCosts = useMemo(() => {
    return filteredOrders.reduce((sum, o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      if (items.length > 0) {
        let orderCost = 0;
        items.forEach((item: any) => {
          const qty = item.quantity || 1;
          const name = item.name || '';
          const isByogItem = item.isByog || o.isByog;
          const itemPrice = item.price || (o.totalAmount / items.length) || 0;
          orderCost += getRealOrEstimatedCost(name, itemPrice, isByogItem, qty);
        });
        return sum + orderCost;
      }
      // Fallback if items array is empty
      if (o.isByog) return sum + 12;
      const amt = o.totalAmount || o.amount || 0;
      return sum + Math.round(amt * 0.35);
    }, 0);
  }, [filteredOrders, inventoryCostMap]);


  const netProfit = useMemo(() => {
    return Math.max(0, totalRevenue - estimatedMaterialCosts);
  }, [totalRevenue, estimatedMaterialCosts]);

  const profitMargin = useMemo(() => {
    if (totalRevenue === 0) return 0;
    return Math.round((netProfit / totalRevenue) * 100);
  }, [netProfit, totalRevenue]);

  // Payment Breakdown: Physical Cash in Drawer vs Digital GCash
  const paymentBreakdown = useMemo(() => {
    let cashTotal = 0;
    let cashCount = 0;
    let gcashTotal = 0;
    let gcashCount = 0;

    filteredOrders.forEach((o) => {
      const method = (o.paymentMethod || '').toLowerCase();
      const amt = o.totalAmount || o.amount || 0;
      if (method.includes('cash')) {
        cashTotal += amt;
        cashCount++;
      } else if (method.includes('gcash') || method.includes('qr') || method.includes('online')) {
        gcashTotal += amt;
        gcashCount++;
      } else {
        cashTotal += amt;
        cashCount++;
      }
    });

    return { cashTotal, cashCount, gcashTotal, gcashCount };
  }, [filteredOrders]);

  // Product / Service Category Performance
  const categoryPerformance = useMemo(() => {
    const groups: Record<string, { category: string; units: number; revenue: number; cost: number; profit: number }> = {
      'Hand Towels': { category: 'Hand Towels', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Bath Towels': { category: 'Bath Towels', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Caps & Headwear': { category: 'Caps & Headwear', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Client Garments (BYOG)': { category: 'Client Garments (BYOG)', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Apparel & Shirts': { category: 'Apparel & Shirts', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Custom & Other': { category: 'Custom & Other', units: 0, revenue: 0, cost: 0, profit: 0 },
    };

    filteredOrders.forEach((o) => {
      const items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [{ name: o.design || 'Custom Item', quantity: 1, price: o.totalAmount }];
      items.forEach((item: any) => {
        const qty = item.quantity || 1;
        const name = (item.name || '').toLowerCase();
        const price = item.price || (o.totalAmount / items.length) || 0;
        const total = price * qty;
        const isByog = item.isByog || o.isByog;

        let key = 'Custom & Other';
        if (isByog) key = 'Client Garments (BYOG)';
        else if (name.includes('bath towel')) key = 'Bath Towels';
        else if (name.includes('hand towel') || name.includes('towel')) key = 'Hand Towels';
        else if (name.includes('cap') || name.includes('hat')) key = 'Caps & Headwear';
        else if (name.includes('shirt') || name.includes('polo') || name.includes('hoodie')) key = 'Apparel & Shirts';

        const cost = getRealOrEstimatedCost(item.name || '', price, isByog, qty);
        groups[key].units += qty;
        groups[key].revenue += total;
        groups[key].cost += cost;
        groups[key].profit += (total - cost);
      });
    });

    return Object.values(groups).filter((g) => g.units > 0).sort((a, b) => b.profit - a.profit);
  }, [filteredOrders, inventoryCostMap]);

  // Chart data: daily breakdown for the current view
  const chartData = useMemo(() => {
    const dailyMap: Record<string, { date: string; revenue: number; profit: number }> = {};

    filteredOrders.forEach((o) => {
      const d = new Date(o.createdAt || o.date);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      const rev = o.totalAmount || o.amount || 0;
      const items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
      let cost = 0;
      if (items.length > 0) {
        items.forEach((item: any) => {
          cost += getRealOrEstimatedCost(item.name || '', item.price || rev, item.isByog || o.isByog, item.quantity || 1);
        });
      } else {
        cost = o.isByog ? 12 : Math.round(rev * 0.35);
      }
      const prof = Math.max(0, rev - cost);

      if (!dailyMap[key]) dailyMap[key] = { date: key, revenue: 0, profit: 0 };
      dailyMap[key].revenue += rev;
      dailyMap[key].profit += prof;
    });

    const entries = Object.values(dailyMap);
    if (entries.length === 0) return [{ date: 'Today', revenue: totalRevenue, profit: netProfit }];
    return entries;
  }, [filteredOrders, totalRevenue, netProfit, inventoryCostMap]);

  return (
    <section className="flex flex-col min-h-full text-left font-sans pb-16 max-w-6xl mx-auto">
      {/* Compact Top Filter Toolbar */}
      <div className="mb-4 flex items-center justify-start gap-3 flex-wrap">
        {/* Tactile Time Frame Selector */}
        <div className="flex bg-bg-surface border border-border-glass rounded-lg p-1">
          <button
            type="button"
            onClick={() => setTimeRange('today')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              timeRange === 'today'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('week')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              timeRange === 'week'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('month')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              timeRange === 'month'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => setTimeRange('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              timeRange === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            All Time
          </button>
        </div>

        <div className="flex items-center gap-2">
          {hasRealCosts ? (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Real Costs Active</span>
            </span>
          ) : (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/10 text-text-dim border border-border-glass whitespace-nowrap" title="Set supplier costs in Raw Materials to get accurate profit">
              Estimated Costs
            </span>
          )}
        </div>
      </div>

      {/* Primary Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Card 1: Net Take-Home Profit (The Main Number) */}
        <div className="bg-bg-surface border border-emerald-500/30 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Net Take-Home Profit
              </span>
              <span className="text-[11px] font-semibold text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded">
                {profitMargin}% Margin
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono tracking-tight mt-1">
              ₱{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[11px] text-text-dim mt-3 pt-2.5 border-t border-border-glass">
            Revenue (₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}) − Supplies (₱{estimatedMaterialCosts.toLocaleString(undefined, { minimumFractionDigits: 2 })})
          </div>
        </div>

        {/* Card 2: Gross Sales Collected */}
        <div className="bg-bg-surface border border-border-glass rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-text-dim uppercase tracking-wider mb-1">
              Gross Sales Collected
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-text-main font-mono tracking-tight mt-1">
              ₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[11px] text-text-dim mt-3 pt-2.5 border-t border-border-glass flex justify-between">
            <span>Orders Handled:</span>
            <strong className="text-text-main font-mono">{filteredOrders.length} orders</strong>
          </div>
        </div>

        {/* Card 3: Material & Garment Blank Costs */}
        <div className="bg-bg-surface border border-border-glass rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-text-dim uppercase tracking-wider mb-1">
              Garment &amp; Supplies Cost
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-text-main font-mono tracking-tight mt-1">
              ₱{estimatedMaterialCosts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-[11px] text-text-dim mt-3 pt-2.5 border-t border-border-glass flex justify-between">
            <span>Purchased blanks &amp; thread spools</span>
          </div>
        </div>
      </div>

      {/* Register Drawer Reconciliation & Machine Output */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Cash in Register */}
        <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs text-text-dim font-medium">Physical Cash in Drawer</div>
          <div className="text-xl font-bold text-text-main font-mono mt-1">
            ₱{paymentBreakdown.cashTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-text-dim mt-1">
            Count in cash box at closing ({paymentBreakdown.cashCount} transactions)
          </div>
        </div>

        {/* GCash Digital Wallet */}
        <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs text-text-dim font-medium">GCash Received (Digital)</div>
          <div className="text-xl font-bold text-blue-400 font-mono mt-1">
            ₱{paymentBreakdown.gcashTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-text-dim mt-1">
            Verified in merchant account ({paymentBreakdown.gcashCount} transactions)
          </div>
        </div>

        {/* Machine Output */}
        <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs text-text-dim font-medium">Single Machine Workload</div>
          <div className="text-xl font-bold text-text-main font-mono mt-1">
            {completedOrders.length} Finished
          </div>
          <div className="text-[11px] text-text-dim mt-1">
            {activeOrders.length} currently active on the floor
          </div>
        </div>
      </div>

      {/* Clean Category Breakdown Table */}
      <div className="bg-bg-surface border border-border-glass rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-border-glass">
          <div>
            <h2 className="text-sm font-bold text-text-main m-0">Profit Breakdown by Product &amp; Service</h2>
            <p className="text-xs text-text-dim m-0 mt-0.5">Where your profit was made during this period</p>
          </div>
          <span className="text-xs text-text-dim font-mono">{categoryPerformance.length} Active Categories</span>
        </div>

        {categoryPerformance.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-dim">
            No orders recorded in this time window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border-glass text-text-dim font-semibold">
                  <th className="py-2.5 px-3">Service / Garment</th>
                  <th className="py-2.5 px-3 text-right">Units</th>
                  <th className="py-2.5 px-3 text-right">Total Sales</th>
                  <th className="py-2.5 px-3 text-right">Supply Cost</th>
                  <th className="py-2.5 px-3 text-right font-bold text-text-main">Net Profit</th>
                  <th className="py-2.5 px-3 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-glass">
                {categoryPerformance.map((item, idx) => {
                  const marginPct = item.revenue > 0 ? Math.round((item.profit / item.revenue) * 100) : 0;
                  return (
                    <tr key={idx} className="hover:bg-white/5 transition">
                      <td className="py-2.5 px-3 font-semibold text-text-main">
                        {item.category}
                        {item.category.includes('BYOG') && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-normal">
                            Zero blank cost
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-text-dim">{item.units} pcs</td>
                      <td className="py-2.5 px-3 text-right font-mono text-text-main">
                        ₱{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-400/90">
                        ₱{item.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                        ₱{item.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-text-main">
                        {marginPct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revenue & Profit Timeline Curve */}
      <div className="bg-bg-surface border border-border-glass rounded-xl p-5 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-sm font-bold text-text-main m-0">Earnings Trend</h2>
            <p className="text-xs text-text-dim m-0 mt-0.5">Daily sales and estimated profit for the period</p>
          </div>
        </div>

        <div className="h-56 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="#888888" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#888888"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `₱${v}`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-bg-surface border border-border-glass p-2.5 rounded-lg shadow-lg text-xs font-mono">
                        <div className="text-text-dim mb-1 font-sans">{label}</div>
                        <div className="text-emerald-400 font-bold">
                          Profit: ₱{parseFloat(payload[0]?.value as any || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                        {payload[1] && (
                          <div className="text-text-main">
                            Revenue: ₱{parseFloat(payload[1]?.value as any || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                name="Profit"
                type="monotone"
                dataKey="profit"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#profitGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
