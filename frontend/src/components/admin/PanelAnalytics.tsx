'use client';

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { showToast } from '@/components/ui/Toast';

interface PanelAnalyticsProps {
  orders: any[];
  inventory?: any[];
  machines?: any[];
  refreshData?: () => Promise<void>;
  isSyncing?: boolean;
}

type TimeRange = 'today' | 'week' | 'month' | 'all';
type DetailCategory = 'money' | 'supplies' | 'machine' | 'all';

export default function PanelAnalytics({
  orders = [],
  inventory = [],
  machines = [],
  refreshData,
  isSyncing = false,
}: PanelAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [activeCategory, setActiveCategory] = useState<DetailCategory>('money');
  const [showOverheadSettings, setShowOverheadSettings] = useState(false);
  const [dailyStallOverhead, setDailyStallOverhead] = useState<number>(500); // Daily Pacific Mall stall rent & electricity

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

  const hasRealCosts = useMemo(() => Object.keys(inventoryCostMap).length > 0, [inventoryCostMap]);

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

  // 2. Filter orders
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

  const activeQueueOrders = useMemo(() => {
    return (orders || []).filter((o) =>
      ['In Queue', 'Preparing Order', 'In Production', 'Processing'].includes(o.status)
    );
  }, [orders]);

  // 3. Simple Financial Totals
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
    return Math.max(0, totalRevenue - estimatedMaterialCosts);
  }, [totalRevenue, estimatedMaterialCosts]);

  const netProfit = useMemo(() => {
    return Math.max(0, totalRevenue - totalExpenses);
  }, [totalRevenue, totalExpenses]);

  const netMargin = useMemo(() => {
    if (totalRevenue === 0) return 0;
    return Math.round((netProfit / totalRevenue) * 100);
  }, [netProfit, totalRevenue]);

  // Break-even
  const breakEvenProgress = useMemo(() => {
    if (operatingOverhead === 0) return 100;
    return Math.min(200, Math.round((grossProfit / operatingOverhead) * 100));
  }, [grossProfit, operatingOverhead]);

  const breakEvenSurplus = useMemo(() => {
    return grossProfit - operatingOverhead;
  }, [grossProfit, operatingOverhead]);

  // Payment Breakdown (Cash vs GCash)
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

  // Inventory value (money stored in goods)
  const inventoryAssetStats = useMemo(() => {
    let totalLockedValue = 0;
    let totalPieces = 0;

    (inventory || []).forEach((inv) => {
      const count = Number(inv.count) || 0;
      const unitCost = inv.supplierUnitCost != null ? Number(inv.supplierUnitCost) : 45;
      totalLockedValue += count * unitCost;
      totalPieces += count;
    });

    return { totalLockedValue, totalPieces };
  }, [inventory]);

  // Money needed to reorder low items
  const restockOutflowForecast = useMemo(() => {
    let budgetNeeded = 0;
    let lowCount = 0;

    (inventory || []).forEach((inv) => {
      const count = Number(inv.count) || 0;
      const threshold = Number(inv.minThreshold) || 10;
      const unitCost = inv.supplierUnitCost != null ? Number(inv.supplierUnitCost) : 50;

      if (count <= threshold) {
        const units = Math.max(1, threshold * 2 - count);
        budgetNeeded += units * unitCost;
        lowCount++;
      }
    });

    return { budgetNeeded, lowCount };
  }, [inventory]);

  // Sales & profit per item type
  const categoryPerformance = useMemo(() => {
    const groups: Record<string, { category: string; units: number; revenue: number; cost: number; profit: number }> = {
      'Hand Towels': { category: 'Hand Towels', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Bath Towels': { category: 'Bath Towels', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Chinese Fans': { category: 'Chinese Fans', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Caps & Hats': { category: 'Caps & Hats', units: 0, revenue: 0, cost: 0, profit: 0 },
      'Customer Brought Items': { category: 'Customer Brought Items', units: 0, revenue: 0, cost: 0, profit: 0 },
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
        if (isByog) key = 'Customer Brought Items';
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

    return Object.values(groups).filter((g) => g.units > 0).sort((a, b) => b.profit - a.profit);
  }, [filteredOrders, inventoryCostMap]);

  // Timeline chart
  const chartData = useMemo(() => {
    const dailyMap: Record<string, { date: string; revenue: number; profit: number }> = {};
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
      const prof = Math.max(0, rev - cost);

      if (!dailyMap[key]) dailyMap[key] = { date: key, revenue: rev, profit: prof };
      else {
        dailyMap[key].revenue += rev;
        dailyMap[key].profit += prof;
      }
    });

    const entries = Object.values(dailyMap);
    if (entries.length === 0) return [{ date: 'Today', revenue: totalRevenue, profit: grossProfit }];
    return entries;
  }, [filteredOrders, totalRevenue, grossProfit, inventoryCostMap]);

  // 7-day prediction
  const forwardForecast = useMemo(() => {
    const days14: number[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

      const dayTotal = (orders || []).reduce((sum, o) => {
        if (o.status === 'Order Canceled') return sum;
        const oTime = new Date(o.createdAt || o.date).getTime();
        if (oTime >= startOfDay && oTime < endOfDay) {
          return sum + (Number(o.totalAmount || o.amount) || 0);
        }
        return sum;
      }, 0);
      days14.push(dayTotal);
    }

    const n = days14.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += days14[i];
      sumXY += i * days14[i];
      sumXX += i * i;
    }
    const denom = n * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;

    const projectionList: { dayLabel: string; projectedRevenue: number }[] = [];
    let totalProjected7d = 0;
    for (let j = 0; j < 7; j++) {
      const x = n + j;
      const proj = Math.max(200, Math.round(slope * x + intercept));
      totalProjected7d += proj;
      const fut = new Date();
      fut.setDate(now.getDate() + j + 1);
      projectionList.push({
        dayLabel: `${fut.getMonth() + 1}/${fut.getDate()}`,
        projectedRevenue: proj,
      });
    }

    return {
      daily14Velocity: Math.round(sumY / 14),
      totalProjected7d,
      projectionList,
    };
  }, [orders]);

  // Thread colors in line
  const threadBatches = useMemo(() => {
    const map: Record<string, any[]> = {};
    activeQueueOrders.forEach((ord) => {
      const color =
        ord.personalization?.color ||
        ord.threadColor ||
        ord.items?.[0]?.personalization?.threadColor ||
        'Standard White';
      if (!map[color]) map[color] = [];
      map[color].push(ord);
    });

    return Object.entries(map)
      .map(([color, list]) => ({
        color,
        count: list.length,
        savedMins: Math.max(0, (list.length - 1) * 7),
      }))
      .sort((a, b) => b.count - a.count);
  }, [activeQueueOrders]);

  // Simple stitching time estimator
  const [simCategory, setSimCategory] = useState<'fan' | 'cap' | 'towel' | 'byog'>('towel');
  const [simLetters, setSimLetters] = useState<number>(6);
  const predictedSimMinutes = useMemo(() => {
    const basePrep = 2.5;
    const catOffset = { fan: 0.0, towel: 0.5, cap: 0.5, byog: 0.5 }[simCategory];
    const letterTime = simLetters * 0.5;
    return (basePrep + catOffset + letterTime).toFixed(1);
  }, [simCategory, simLetters]);

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
        <title>Daily Report - Eds Towels & Caps</title>
        <style>
          body { font-family: monospace; padding: 15px; font-size: 12px; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin: 4px 0; }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 14px;">EDS TOWELS & CAPS</div>
        <div class="center">Pacific Mall Lucena</div>
        <div class="center">Daily Sales & Profit Summary</div>
        <div class="center">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
        <div class="divider"></div>
        <div class="row"><span>Total Orders:</span><span class="bold">${filteredOrders.length}</span></div>
        <div class="row"><span>Cash Collected:</span><span class="bold">₱${paymentBreakdown.cashTotal.toFixed(2)}</span></div>
        <div class="row"><span>GCash Received:</span><span class="bold">₱${paymentBreakdown.gcashTotal.toFixed(2)}</span></div>
        <div class="divider"></div>
        <div class="row bold"><span>TOTAL SALES:</span><span>₱${totalRevenue.toFixed(2)}</span></div>
        <div class="row"><span>Item Costs:</span><span>₱${estimatedMaterialCosts.toFixed(2)}</span></div>
        <div class="row"><span>Stall Rent & Power:</span><span>₱${operatingOverhead.toFixed(2)}</span></div>
        <div class="row bold"><span>REAL PROFIT:</span><span>₱${netProfit.toFixed(2)}</span></div>
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

  return (
    <div className="flex flex-col h-full text-left font-sans max-w-6xl mx-auto pb-16">
      {/* Top Toolbar: Time Filter & Quick Utilities */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 pb-3 border-b border-border-glass">
        {/* Left: Time Period Filter */}
        <div className="flex items-center gap-2">
          <div className="flex bg-bg-surface border border-border-glass rounded-lg p-0.5 text-xs">
            {(['today', 'week', 'month', 'all'] as TimeRange[]).map((tr) => (
              <button
                key={tr}
                type="button"
                onClick={() => setTimeRange(tr)}
                className={`px-3 py-1 rounded-md font-semibold capitalize transition ${
                  timeRange === tr
                    ? 'bg-white/10 text-text-main shadow-xs'
                    : 'text-text-dim hover:text-text-main'
                }`}
              >
                {tr === 'today' ? 'Today' : tr === 'week' ? 'This Week' : tr === 'month' ? 'This Month' : 'All Time'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowOverheadSettings(!showOverheadSettings)}
            className="text-xs text-text-dim hover:text-text-main px-2.5 py-1 rounded-md border border-border-glass bg-bg-surface transition"
          >
            Stall Rent: ₱{dailyStallOverhead}/day
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintSlip}
            className="px-3 py-1.5 rounded-lg border border-border-glass bg-bg-surface hover:bg-white/5 text-text-dim hover:text-text-main text-xs font-semibold transition flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Stall Rent Setting Popdown */}
      {showOverheadSettings && (
        <div className="bg-bg-surface border border-border-glass rounded-xl p-3 mb-4 flex items-center justify-between text-xs">
          <div className="text-text-dim">
            Daily stall rent &amp; electricity cost (used to calculate your real take-home profit):
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-dim font-bold">₱</span>
            <input
              type="number"
              min="0"
              step="50"
              value={dailyStallOverhead}
              onChange={(e) => setDailyStallOverhead(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20 bg-black/40 border border-border-glass px-2 py-1 rounded text-white font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setShowOverheadSettings(false);
                showToast('Stall cost saved', 'success');
              }}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/15 text-white rounded font-medium text-xs"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* EXECUTIVE SUMMARY (The 3 Main Category Cards) */}
      <div className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Category 1: Money & Real Profit */}
          <div
            onClick={() => setActiveCategory('money')}
            className={`border rounded-xl p-4 flex flex-col justify-between transition cursor-pointer ${
              activeCategory === 'money'
                ? 'bg-white/[0.04] border-white/30 shadow-md ring-1 ring-white/20'
                : 'bg-bg-surface border-border-glass hover:bg-white/[0.02]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-main">1. Money &amp; Earnings</span>
                <span className="text-xs font-mono font-medium text-emerald-400">{netMargin}% margin</span>
              </div>
              <div className="text-2xl font-black font-mono text-emerald-400 my-2">
                ₱{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-text-dim">
                Real take-home profit (Sales ₱{totalRevenue.toFixed(0)} − Costs ₱{totalExpenses.toFixed(0)})
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-text-dim font-medium">{filteredOrders.length} orders handled</span>
              <span className={`font-bold transition ${activeCategory === 'money' ? 'text-white' : 'text-primary'}`}>
                {activeCategory === 'money' ? 'Viewing Details ▼' : 'View Details →'}
              </span>
            </div>
          </div>

          {/* Category 2: Supplies & Stocks */}
          <div
            onClick={() => setActiveCategory('supplies')}
            className={`border rounded-xl p-4 flex flex-col justify-between transition cursor-pointer ${
              activeCategory === 'supplies'
                ? 'bg-white/[0.04] border-white/30 shadow-md ring-1 ring-white/20'
                : 'bg-bg-surface border-border-glass hover:bg-white/[0.02]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-main">2. Shop Supplies &amp; Stocks</span>
                {restockOutflowForecast.lowCount > 0 ? (
                  <span className="text-xs font-mono text-amber-400">{restockOutflowForecast.lowCount} low items</span>
                ) : (
                  <span className="text-xs text-text-dim">Stock stable</span>
                )}
              </div>
              <div className="text-2xl font-black font-mono text-text-main my-2">
                ₱{inventoryAssetStats.totalLockedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-text-dim">
                Money stored in {inventoryAssetStats.totalPieces} unsold towels &amp; thread spools
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-text-dim font-medium">Reorder needed: ₱{restockOutflowForecast.budgetNeeded.toFixed(0)}</span>
              <span className={`font-bold transition ${activeCategory === 'supplies' ? 'text-white' : 'text-primary'}`}>
                {activeCategory === 'supplies' ? 'Viewing Details ▼' : 'View Details →'}
              </span>
            </div>
          </div>

          {/* Category 3: Machine & Next 7 Days */}
          <div
            onClick={() => setActiveCategory('machine')}
            className={`border rounded-xl p-4 flex flex-col justify-between transition cursor-pointer ${
              activeCategory === 'machine'
                ? 'bg-white/[0.04] border-white/30 shadow-md ring-1 ring-white/20'
                : 'bg-bg-surface border-border-glass hover:bg-white/[0.02]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-main">3. Machine &amp; Next 7 Days</span>
                <span className="text-xs font-mono text-text-dim">{threadBatches.length} colors in line</span>
              </div>
              <div className="text-2xl font-black font-mono text-text-main my-2">
                ₱{forwardForecast.totalProjected7d.toLocaleString()}
              </div>
              <div className="text-xs text-text-dim">
                Expected sales for the upcoming week based on daily orders
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-text-dim font-medium">Stitching time quoter &amp; batching</span>
              <span className={`font-bold transition ${activeCategory === 'machine' ? 'text-white' : 'text-primary'}`}>
                {activeCategory === 'machine' ? 'Viewing Details ▼' : 'View Details →'}
              </span>
            </div>
          </div>
        </div>

        {/* Category Navigation Pills / Show All Switch */}
        <div className="flex items-center justify-between mt-3 text-xs text-text-dim">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">Currently showing:</span>
            <span className="font-bold text-text-main capitalize">
              {activeCategory === 'money'
                ? 'Money & Earnings Details'
                : activeCategory === 'supplies'
                ? 'Supplies & Stocks Details'
                : activeCategory === 'machine'
                ? 'Machine & Next 7 Days Details'
                : 'All Details'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setActiveCategory(activeCategory === 'all' ? 'money' : 'all')}
            className="hover:text-text-main underline cursor-pointer"
          >
            {activeCategory === 'all' ? 'Focus on One Category' : 'Show All Details Below'}
          </button>
        </div>
      </div>

      {/* CATEGORY 1 DETAILS: MONEY & EARNINGS */}
      {(activeCategory === 'money' || activeCategory === 'all') && (
        <div className="space-y-4 mb-6 animate-[fadeIn_0.2s_ease-out]">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Sales */}
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
              <div className="text-xs text-text-dim font-medium">Total Sales</div>
              <div className="text-2xl font-bold font-mono text-text-main my-1">
                ₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-text-dim">{filteredOrders.length} orders paid</div>
            </div>

            {/* Total Costs */}
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
              <div className="text-xs text-text-dim font-medium">Total Costs</div>
              <div className="text-2xl font-bold font-mono text-text-main my-1">
                ₱{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-text-dim">
                Supplies ₱{estimatedMaterialCosts.toFixed(0)} • Rent ₱{operatingOverhead.toFixed(0)}
              </div>
            </div>

            {/* Cash on Hand */}
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
              <div className="text-xs text-text-dim font-medium">Cash on Hand</div>
              <div className="space-y-0.5 my-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-dim">Cash:</span>
                  <span className="font-mono font-bold text-text-main">₱{paymentBreakdown.cashTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-dim">GCash:</span>
                  <span className="font-mono font-bold text-text-main">₱{paymentBreakdown.gcashTotal.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-[11px] text-text-dim">
                Total cash: ₱{(paymentBreakdown.cashTotal + paymentBreakdown.gcashTotal).toFixed(2)}
              </div>
            </div>

            {/* Rent & Power Covered */}
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-dim font-medium">Rent &amp; Power Covered</span>
                <span className="font-mono text-text-dim">{breakEvenProgress}%</span>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1.5 my-2 overflow-hidden border border-white/5">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, breakEvenProgress)}%` }}
                />
              </div>
              <div className="text-xs text-text-dim flex justify-between">
                <span>Earned: ₱{grossProfit.toFixed(0)}</span>
                <span className={breakEvenSurplus >= 0 ? 'text-emerald-400' : 'text-text-dim'}>
                  {breakEvenSurplus >= 0 ? `Broke even! +₱${breakEvenSurplus.toFixed(0)} in profit` : `Need ₱${Math.abs(breakEvenSurplus).toFixed(0)} more`}
                </span>
              </div>
            </div>
          </div>

          {/* Profit History Chart */}
          <div className="bg-bg-surface border border-border-glass rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-text-main">Daily Profit History</span>
              <span className="text-[11px] text-emerald-400 font-mono">Real Profit (₱)</span>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="date" stroke="#666666" fontSize={10} tickLine={false} />
                  <YAxis stroke="#666666" fontSize={10} tickLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-bg-surface border border-border-glass p-2 rounded text-xs font-mono">
                            <div className="text-text-dim">{label}</div>
                            <div className="text-emerald-400 font-bold">
                              Profit: ₱{parseFloat((payload[0]?.value as any) || 0).toFixed(2)}
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
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#profitGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY 2 DETAILS: SUPPLIES & STOCKS */}
      {(activeCategory === 'supplies' || activeCategory === 'all') && (
        <div className="space-y-4 mb-6 animate-[fadeIn_0.2s_ease-out]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Money in Stored Items */}
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
              <div className="text-xs text-text-dim font-medium">Items in Stock (Value)</div>
              <div className="text-2xl font-bold font-mono text-text-main my-1">
                ₱{inventoryAssetStats.totalLockedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-text-dim">
                {inventoryAssetStats.totalPieces} unsold towels, fans, and thread spools on shelves
              </div>
            </div>

            {/* Money Needed to Reorder */}
            <div className="bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-dim font-medium">Money Needed to Reorder</span>
                {restockOutflowForecast.lowCount > 0 && (
                  <span className="text-[11px] text-amber-400 font-semibold">{restockOutflowForecast.lowCount} items running low</span>
                )}
              </div>
              <div className="text-2xl font-bold font-mono text-text-main my-1">
                ₱{restockOutflowForecast.budgetNeeded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-text-dim">
                Estimated cash to buy supplies below threshold
              </div>
            </div>
          </div>

          {/* Sales & Profit per Item Type Table */}
          <div className="bg-bg-surface border border-border-glass rounded-xl p-4">
            <div className="text-xs font-bold text-text-main mb-3">Sales &amp; Profit by Item</div>

            {categoryPerformance.length === 0 ? (
              <div className="py-6 text-center text-xs text-text-dim">No orders recorded in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-[11px] text-text-dim">
                      <th className="pb-2 font-medium">Item</th>
                      <th className="pb-2 font-medium text-center">Sold</th>
                      <th className="pb-2 font-medium text-right">Sales</th>
                      <th className="pb-2 font-medium text-right">Cost</th>
                      <th className="pb-2 font-medium text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {categoryPerformance.map((row) => (
                      <tr key={row.category} className="hover:bg-white/[0.02]">
                        <td className="py-2 text-text-main font-medium">{row.category}</td>
                        <td className="py-2 text-center text-text-dim font-mono">{row.units} pcs</td>
                        <td className="py-2 text-right font-mono text-text-main">₱{row.revenue.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono text-text-dim">₱{row.cost.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono font-medium text-emerald-400">₱{row.profit.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CATEGORY 3 DETAILS: MACHINE & NEXT 7 DAYS */}
      {(activeCategory === 'machine' || activeCategory === 'all') && (
        <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* How Long Will Stitching Take? */}
            <div className="lg:col-span-6 bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-text-main">How Long Will Stitching Take?</span>
                  <span className="text-[11px] font-mono text-text-dim">3 mins setup + 30s/letter</span>
                </div>
                <div className="text-xs text-text-dim mb-3">
                  Check how many minutes an item takes based on letters and garment thickness.
                </div>
              </div>

              <div className="bg-black/20 border border-border-glass rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-text-dim block mb-1">Item</label>
                    <select
                      value={simCategory}
                      onChange={(e) => setSimCategory(e.target.value as any)}
                      className="w-full bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-lg text-xs text-text-main outline-none"
                    >
                      <option value="fan">Chinese Fan</option>
                      <option value="cap">Cap / Hat</option>
                      <option value="towel">Bath Towel</option>
                      <option value="byog">Customer Garment</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] text-text-dim">Number of Letters</label>
                      <span className="text-[11px] font-mono text-text-main">{simLetters}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={simLetters}
                      onChange={(e) => setSimLetters(parseInt(e.target.value) || 1)}
                      className="w-full mt-1.5"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                  <span className="text-text-dim">Estimated Stitching Time:</span>
                  <span className="font-mono font-bold text-text-main">Takes about ~{predictedSimMinutes} minutes</span>
                </div>
              </div>
            </div>

            {/* Thread Colors Waiting in Line */}
            <div className="lg:col-span-6 bg-bg-surface border border-border-glass rounded-xl p-4 flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-text-main">Thread Colors Waiting in Line</span>
                <span className="text-[11px] text-text-dim font-mono">{threadBatches.length} colors in queue</span>
              </div>
              <div className="text-xs text-text-dim mb-3">
                Stitch matching thread colors together to save time changing needles.
              </div>

              {threadBatches.length === 0 ? (
                <div className="py-6 text-center text-xs text-text-dim my-auto">
                  No orders waiting in queue right now.
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-[170px] pr-1">
                  {threadBatches.map((b) => (
                    <div key={b.color} className="bg-black/20 border border-border-glass rounded-lg p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-text-main">{b.color}</span>
                        <span className="text-text-dim ml-2 font-mono">({b.count} orders)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {b.savedMins > 0 && (
                          <span className="text-[11px] text-emerald-400 font-mono">Saves ~{b.savedMins} mins</span>
                        )}
                        <button
                          type="button"
                          onClick={() => showToast(`Moved ${b.color} orders next`, 'info')}
                          className="text-text-dim hover:text-text-main underline text-[11px]"
                        >
                          Stitch Next
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Expected Sales for Next 7 Days */}
          <div className="bg-bg-surface border border-border-glass rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-xs font-bold text-text-main">Expected Sales for Next 7 Days</div>
                <div className="text-xs text-text-dim">Estimate of upcoming sales based on recent daily orders.</div>
              </div>
              <div className="text-xs text-text-dim font-mono">
                Estimated for next 7 days: <strong className="text-text-main">₱{forwardForecast.totalProjected7d.toLocaleString()}</strong>
              </div>
            </div>

            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forwardForecast.projectionList} margin={{ top: 10, right: 15, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="dayLabel" stroke="#666666" fontSize={10} tickLine={false} />
                  <YAxis stroke="#666666" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#121217',
                      borderColor: '#2e2e38',
                      borderRadius: '0.5rem',
                      fontSize: '11px',
                    }}
                    formatter={(val: any) => [`₱${Number(val).toLocaleString()}`, 'Expected Sales']}
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedRevenue"
                    stroke="#818cf8"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#818cf8' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
