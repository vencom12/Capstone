'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { showToast } from '@/components/ui/Toast';
import Pagination from '@/components/ui/Pagination';

interface PanelAnalyticsProps {
  orders: any[];
  inventory?: any[];
  machines?: any[];
  refreshData?: () => Promise<void>;
  isSyncing?: boolean;
}

type TimeRange = 'today' | 'week' | 'month' | 'all';

export default function PanelAnalytics({
  orders = [],
  inventory = [],
  machines = [],
  refreshData,
  isSyncing = false,
}: PanelAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [showOverheadSettings, setShowOverheadSettings] = useState(false);
  
  // Daily Pacific Mall stall rent & electricity - persisted in localStorage
  const [dailyStallOverhead, setDailyStallOverhead] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('stitch_daily_stall_rent');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed >= 0) return parsed;
        }
      } catch {
        // fallback
      }
    }
    return 500;
  });

  const handleSaveRent = (val: number) => {
    const safeVal = Math.max(0, val);
    setDailyStallOverhead(safeVal);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('stitch_daily_stall_rent', String(safeVal));
      } catch {
        // fallback
      }
    }
  };

  // Pagination for category performance
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryPageSize, setCategoryPageSize] = useState(5);

  // 1. Inventory cost map
  const inventoryCostMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    (inventory || []).forEach((inv) => {
      if (inv.item && inv.supplierUnitCost != null) {
        map[inv.item.toLowerCase()] = inv.supplierUnitCost;
      }
    });
    return map;
  }, [inventory]);

  const getRealOrEstimatedCost = (itemName: string, itemPrice: number, isByog: boolean, qty: number): number => {
    if (isByog) return 12 * qty;

    const lowerName = itemName.toLowerCase();
    for (const [invName, cost] of Object.entries(inventoryCostMap)) {
      if (cost != null && lowerName.includes(invName.replace('(', '').replace(')', '').split(' ')[0].toLowerCase())) {
        return cost * qty;
      }
    }

    if (lowerName.includes('bath towel')) return 80 * qty;
    if (lowerName.includes('hand towel') || lowerName.includes('towel')) return 45 * qty;
    if (lowerName.includes('cap') || lowerName.includes('hat')) return 75 * qty;
    if (lowerName.includes('fan')) return 25 * qty;
    if (lowerName.includes('shirt') || lowerName.includes('polo')) return 90 * qty;
    return Math.round(itemPrice * 0.35) * qty;
  };

  // 2. Filter orders by selected timeframe
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

  // 3. Financial calculations in plain language
  const totalRevenue = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount || o.amount) || 0), 0);
  }, [filteredOrders]);

  const estimatedMaterialCosts = useMemo(() => {
    return filteredOrders.reduce((sum, o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      if (items.length > 0) {
        let orderCost = 0;
        items.forEach((item: any) => {
          const qty = Number(item.quantity) || 1;
          const name = item.name || '';
          const isByogItem = item.isByog || o.isByog;
          const itemPrice = Number(item.price) || (o.totalAmount / items.length) || 0;
          orderCost += getRealOrEstimatedCost(name, itemPrice, isByogItem, qty);
        });
        return sum + orderCost;
      }
      if (o.isByog) return sum + 12;
      const amt = Number(o.totalAmount || o.amount) || 0;
      return sum + Math.round(amt * 0.35);
    }, 0);
  }, [filteredOrders, inventoryCostMap]);

  const operatingOverhead = useMemo(() => {
    if (timeRange === 'today') return dailyStallOverhead;
    if (timeRange === 'week') return dailyStallOverhead * 7;
    if (timeRange === 'month') return dailyStallOverhead * 30;
    return dailyStallOverhead * 30;
  }, [timeRange, dailyStallOverhead]);

  const totalExpenses = useMemo(() => {
    return estimatedMaterialCosts + operatingOverhead;
  }, [estimatedMaterialCosts, operatingOverhead]);

  const grossProfit = useMemo(() => {
    return totalRevenue - estimatedMaterialCosts;
  }, [totalRevenue, estimatedMaterialCosts]);

  const netProfit = useMemo(() => {
    return totalRevenue - totalExpenses;
  }, [totalRevenue, totalExpenses]);

  const netMargin = useMemo(() => {
    if (totalRevenue === 0) return 0;
    return Math.round((netProfit / totalRevenue) * 100);
  }, [netProfit, totalRevenue]);

  // Pacific Mall stall rent break-even progress
  const breakEvenProgress = useMemo(() => {
    if (operatingOverhead === 0) return 100;
    return Math.min(200, Math.round((grossProfit / operatingOverhead) * 100));
  }, [grossProfit, operatingOverhead]);

  const breakEvenSurplus = useMemo(() => {
    return grossProfit - operatingOverhead;
  }, [grossProfit, operatingOverhead]);

  // Cash vs GCash breakdown for cash drawer closing
  const paymentBreakdown = useMemo(() => {
    let cashTotal = 0;
    let cashCount = 0;
    let gcashTotal = 0;
    let gcashCount = 0;

    filteredOrders.forEach((o) => {
      const method = (o.paymentMethod || '').toLowerCase();
      const amt = Number(o.totalAmount || o.amount) || 0;
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

  // Sales & profit per item category (What sold best)
  const categoryPerformance = useMemo(() => {
    const groups: Record<string, { category: string; units: number; revenue: number; cost: number; profit: number }> = {
      'Bath Towels': { category: 'Bath Towels', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Hand Towels': { category: 'Hand Towels', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Caps & Hats': { category: 'Caps & Hats', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Chinese Fans': { category: 'Chinese Fans', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Customer Brought Items (BYOG)': { category: 'Customer Brought Items (BYOG)', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Shirts & Clothing': { category: 'Shirts & Clothing', units: 0, revenue: 0, cost: 0, profit: 0 },
    };

    filteredOrders.forEach((o) => {
      const items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [o];
      items.forEach((item: any) => {
        const name = (item.name || o.design || '').toLowerCase();
        const qty = Number(item.quantity) || 1;
        const total = Number(item.price ? item.price * qty : o.totalAmount || o.amount) || 0;
        const isByog = Boolean(item.isByog || o.isByog);

        let key = 'Hand Towels';
        if (isByog) key = 'Customer Brought Items (BYOG)';
        else if (name.includes('bath towel')) key = 'Bath Towels';
        else if (name.includes('fan')) key = 'Chinese Fans';
        else if (name.includes('cap') || name.includes('hat')) key = 'Caps & Hats';
        else if (name.includes('shirt') || name.includes('hoodie')) key = 'Shirts & Clothing';

        const cost = getRealOrEstimatedCost(item.name || '', total / qty, isByog, qty);
        groups[key].units += qty;
        groups[key].revenue += total;
        groups[key].cost += cost;
        groups[key].profit += total - cost;
      });
    });

    return Object.values(groups).filter((g) => g.units > 0).sort((a, b) => b.units - a.units);
  }, [filteredOrders, inventoryCostMap]);

  // Clean daily chart
  const chartData = useMemo(() => {
    const dailyMap: Record<string, { date: string; timestamp: number; revenue: number; profit: number }> = {};
    filteredOrders.forEach((o) => {
      const d = new Date(o.createdAt || o.date);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      const rev = Number(o.totalAmount || o.amount) || 0;
      const items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
      let cost = 0;
      if (items.length > 0) {
        items.forEach((item: any) => {
          cost += getRealOrEstimatedCost(item.name || '', item.price || rev, item.isByog || o.isByog, item.quantity || 1);
        });
      } else {
        cost = o.isByog ? 12 : Math.round(rev * 0.35);
      }
      const prof = rev - cost;

      if (!dailyMap[key]) {
        dailyMap[key] = {
          date: key,
          timestamp: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
          revenue: rev,
          profit: prof
        };
      } else {
        dailyMap[key].revenue += rev;
        dailyMap[key].profit += prof;
      }
    });

    const entries = Object.values(dailyMap).sort((a, b) => a.timestamp - b.timestamp);
    if (entries.length === 0) return [{ date: 'Today', revenue: totalRevenue, profit: netProfit }];
    return entries;
  }, [filteredOrders, totalRevenue, netProfit, inventoryCostMap]);

  // 1-Click Thermal Print Slip for Cashier Turnover
  const handlePrintSlip = () => {
    const printWindow = window.open('', '_blank', 'width=380,height=600');
    if (!printWindow) {
      window.print();
      return;
    }
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Daily Closing Summary - Eds Towels & Caps</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; padding: 16px; font-size: 13px; color: #000; line-height: 1.4; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          .row { display: flex; justify-content: space-between; margin: 5px 0; }
          .big { font-size: 16px; font-weight: bold; }
          .footer { text-align: center; margin-top: 16px; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="center big">EDS TOWELS & CAPS</div>
        <div class="center">Pacific Mall Lucena</div>
        <div class="center bold" style="margin-top: 4px;">DAILY CLOSING REPORT</div>
        <div class="center">${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        
        <div class="divider"></div>
        <div class="row"><span>Total Orders Handled:</span><span class="bold">${filteredOrders.length} orders</span></div>
        <div class="row"><span>Timeframe:</span><span class="bold">${timeRange === 'today' ? 'Today' : timeRange === 'week' ? 'This Week' : timeRange === 'month' ? 'This Month' : 'All Time'}</span></div>
        <div class="divider"></div>
        
        <div class="row"><span>Cash Collected (In Drawer):</span><span class="bold">₱${paymentBreakdown.cashTotal.toFixed(2)}</span></div>
        <div class="row"><span>GCash Received:</span><span class="bold">₱${paymentBreakdown.gcashTotal.toFixed(2)}</span></div>
        <div class="row bold big" style="margin-top: 6px;"><span>TOTAL SALES:</span><span>₱${totalRevenue.toFixed(2)}</span></div>
        
        <div class="divider"></div>
        <div class="row"><span>Estimated Material Costs:</span><span>-₱${estimatedMaterialCosts.toFixed(2)}</span></div>
        <div class="row"><span>Pacific Mall Daily Rent:</span><span>-₱${operatingOverhead.toFixed(2)}</span></div>
        <div class="divider"></div>
        
        <div class="row bold big">
          <span>${netProfit < 0 ? 'NET BALANCE:' : 'CLEAN PROFIT (KITA):'}</span>
          <span style="color: ${netProfit < 0 ? '#b91c1c' : '#047857'};">
            ${netProfit < 0 ? `-₱${Math.abs(netProfit).toFixed(2)}` : `₱${netProfit.toFixed(2)}`}
          </span>
        </div>
        <div class="row" style="font-size: 11px; color: ${netProfit < 0 ? '#b91c1c' : '#444'}; font-weight: bold;">
          <span>Status:</span>
          <span>${netProfit < 0 ? `Needs ₱${Math.abs(netProfit).toFixed(2)} more for break-even` : `${netMargin}% net margin`}</span>
        </div>

        <div class="divider"></div>
        <div class="footer">
          *** Thank you! Verified by Admin ***<br/>
          Staple this slip to your daily sales ledger.
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const paginatedCategories = useMemo(() => {
    const start = (categoryPage - 1) * categoryPageSize;
    return categoryPerformance.slice(start, start + categoryPageSize);
  }, [categoryPerformance, categoryPage, categoryPageSize]);


  return (
    <div className="flex flex-col h-full text-left font-sans max-w-5xl mx-auto pb-16">
      {/* TOP ACTION TOOLBAR (Buttons on Left, No Redundant Header Text) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        {/* Left-Aligned Time Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-bg-surface border border-border-glass rounded-xl p-1 text-xs shadow-xs">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTimeRange(item.id)}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  timeRange === item.id
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-dim hover:text-text-main hover:bg-white/5'
                }`}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Quick Print Summary Slip */}
          <button
            type="button"
            onClick={handlePrintSlip}
            className="px-3.5 py-2 rounded-xl bg-bg-surface hover:bg-white/5 text-text-main border border-border-glass text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Print daily summary receipt for cashier closing"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print Slip</span>
          </button>
        </div>

        {/* Right Side: Stall Overhead Badge */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowOverheadSettings(!showOverheadSettings)}
            className="px-3 py-1.5 rounded-xl bg-bg-surface hover:bg-white/5 border border-border-glass text-text-dim hover:text-text-main transition flex items-center gap-2 cursor-pointer font-medium shadow-xs"
            title="Configure Pacific Mall daily stall rent & electricity budget"
          >
            <span>Rent Shield:</span>
            <strong className="text-text-main font-mono">₱{dailyStallOverhead.toLocaleString()}/day</strong>
            <span className="text-[10px] text-primary underline">Edit</span>
          </button>
        </div>
      </div>

      {/* Collapsible Stall Overhead Input */}
      {showOverheadSettings && (
        <div className="mb-4 p-3.5 bg-bg-surface border border-primary/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs animate-[fadeIn_0.15s_ease-out]">
          <span className="text-text-dim">
            Pacific Mall stall daily rent &amp; electricity budget:
          </span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-text-dim font-mono text-sm">₱</span>
            <input
              type="number"
              min="0"
              step="50"
              value={dailyStallOverhead}
              onChange={(e) => handleSaveRent(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 bg-bg-card border border-border-glass px-2.5 py-1.5 rounded-lg text-text-main font-mono text-sm font-bold outline-none focus:border-primary transition"
            />
            <button
              type="button"
              onClick={() => {
                setShowOverheadSettings(false);
                showToast(`Daily rent saved: ₱${dailyStallOverhead.toLocaleString()}`, 'success');
              }}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-light text-white rounded-lg font-bold text-xs transition cursor-pointer shadow-xs"
            >
              Save
            </button>
          </div>
        </div>
      )}



      {/* =========================================================================
          TOP CRAFTED ARTIFACTS (BEST SELLERS) & PERFORMANCE TRENDLINE
          ========================================================================= */}
      <div className="space-y-4">
        <div className="bg-bg-surface border border-border-glass rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-text-main">Top Sold Garments &amp; Best Sellers</h3>
              <p className="text-xs text-text-dim">Ranked by units ordered by your customers.</p>
            </div>
            <span className="text-xs text-text-dim font-mono font-medium">
              {filteredOrders.length} orders total
            </span>
          </div>

          {categoryPerformance.length === 0 ? (
            <div className="py-10 text-center text-xs text-text-dim">
              No orders recorded during this timeframe.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border-glass text-text-dim text-[11px] pb-2">
                      <th className="pb-2.5 font-bold">Item Type</th>
                      <th className="pb-2.5 font-bold text-center">Pieces Crafted</th>
                      <th className="pb-2.5 font-bold text-right">Total Bounty</th>
                      <th className="pb-2.5 font-bold text-right">Material Cost</th>
                      <th className="pb-2.5 font-bold text-right">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-glass">
                    {paginatedCategories.map((row) => (
                      <tr key={row.category} className="hover:bg-primary/5 transition">
                        <td className="py-3 text-text-main font-semibold text-sm">
                          {row.category}
                        </td>
                        <td className="py-3 text-center font-mono font-bold text-text-main text-sm">
                          {row.units} pcs
                        </td>
                        <td className="py-3 text-right font-mono font-semibold text-text-main text-sm">
                          ₱{row.revenue.toFixed(2)}
                        </td>
                        <td className="py-3 text-right font-mono text-text-dim">
                          ₱{row.cost.toFixed(2)}
                        </td>
                        <td className={`py-3 text-right font-mono font-bold text-sm ${row.profit < 0 ? 'text-amber-500' : 'text-emerald-500 dark:text-emerald-400'}`}>
                          {row.profit < 0 ? `-₱${Math.abs(row.profit).toFixed(2)}` : `+₱${row.profit.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                currentPage={categoryPage}
                totalItems={categoryPerformance.length}
                pageSize={categoryPageSize}
                onPageChange={setCategoryPage}
                pageSizeOptions={[5, 10, 20]}
                onPageSizeChange={(newSize) => {
                  setCategoryPageSize(newSize);
                  setCategoryPage(1);
                }}
                itemLabel="categories"
              />
            </>
          )}
        </div>

        {/* Daily Profit Curve */}
        <div className="bg-bg-surface border border-border-glass rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-text-main">Performance Trendline</h3>
              <p className="text-xs text-text-dim">Clean earnings curve across the chosen period.</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-500 dark:text-emerald-400">
              Revenue &amp; Profit (₱)
            </span>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="questProfitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#88888820" />
                <XAxis dataKey="date" stroke="#888888" fontSize={11} tickLine={false} />
                <YAxis stroke="#888888" fontSize={11} tickLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const val = parseFloat((payload[0]?.value as any) || 0);
                      return (
                        <div className="bg-bg-surface border border-border-glass p-2.5 rounded-lg text-xs font-mono shadow-md">
                          <div className="text-text-dim font-sans mb-1">{label}</div>
                          <div className={`font-bold text-sm ${val < 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {val < 0 ? `Balance: -₱${Math.abs(val).toFixed(2)}` : `Profit: +₱${val.toFixed(2)}`}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#questProfitGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
