'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Pagination from '@/components/ui/Pagination';

interface PanelAnalyticsProps {
  orders: any[];
  inventory?: any[];
  machines?: any[];
  refreshData?: () => Promise<void>;
  isSyncing?: boolean;
}

export type TimeRange = 'today' | 'week' | 'month' | '6months' | '1year' | 'all';

interface BiMetricData {
  totalVisits: number;
  avgOrderValue: number;
  conversionRate: number;
}

interface BiSuggestion {
  id: string;
  title: string;
  category: 'Pricing' | 'Inventory' | 'Operations' | 'Demand' | string;
  severity: 'critical' | 'warning' | 'info' | 'success' | string;
  description: string;
  actionText: string;
  action: {
    type: string;
    payload: any;
  };
}

interface BiProjectionData {
  labels: string[];
  visits: number[];
  orders: number[];
  revenue: number[];
  forecast: {
    visits: number[];
    orders: number[];
    revenue: number[];
  };
}

export default function PanelAnalytics({
  orders = [],
  inventory = [],
  machines = [],
  refreshData,
  isSyncing = false,
}: PanelAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [showOverheadSettings, setShowOverheadSettings] = useState(false);

  // Continuous AI Operational Learning State
  const [biData, setBiData] = useState<{
    metrics: BiMetricData | null;
    projections: BiProjectionData | null;
    suggestions: BiSuggestion[];
  } | null>(null);
  const [isLoadingBi, setIsLoadingBi] = useState(false);
  const [executingSugs, setExecutingSugs] = useState<Record<string, boolean>>({});

  // Daily stall rent & electricity - loaded from backend SystemSettings & localStorage
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
    return 1500;
  });

  const [businessInfo, setBusinessInfo] = useState<{ name: string; address: string }>({
    name: 'EDS TOWELS & CAPS',
    address: 'Pacific Mall Lucena',
  });

  // Load server-persisted rent and store metadata from SystemSettings on mount
  useEffect(() => {
    api.get<any>('/api/admin/settings')
      .then((res) => {
        if (res) {
          if (res.dailyRent != null) {
            const serverRent = Number(res.dailyRent);
            setDailyStallOverhead(serverRent);
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('stitch_daily_stall_rent', String(serverRent));
              } catch {}
            }
          }
          if (res.businessName || res.businessAddress) {
            setBusinessInfo({
              name: res.businessName || 'EDS TOWELS & CAPS',
              address: res.businessAddress || 'Pacific Mall Lucena',
            });
          }
        }
      })
      .catch(() => {});
  }, []);

  // Fetch continuous operational learning insights & AI forecasts
  const fetchBiData = useCallback(async (force = false) => {
    setIsLoadingBi(true);
    try {
      const res = await api.get<any>(`/api/admin/intelligence/suggestions${force ? '?refresh=true' : ''}`);
      if (res) {
        setBiData({
          metrics: res.metrics || null,
          projections: res.projections || null,
          suggestions: Array.isArray(res.suggestions) ? res.suggestions : []
        });
      }
    } catch (err) {
      console.warn('Failed to load AI BI suggestions:', err);
    } finally {
      setIsLoadingBi(false);
    }
  }, []);

  useEffect(() => {
    fetchBiData();
  }, [fetchBiData]);

  const handleExecuteSuggestion = async (sug: BiSuggestion) => {
    if (!sug.action?.type) return;
    setExecutingSugs((prev) => ({ ...prev, [sug.id]: true }));
    try {
      const res = await api.post<any>('/api/admin/intelligence/execute', {
        actionType: sug.action.type,
        payload: sug.action.payload
      });
      showToast(res.message || `Strategy "${sug.title}" applied successfully!`, 'success');
      setBiData((prev) => prev ? {
        ...prev,
        suggestions: prev.suggestions.filter((s) => s.id !== sug.id)
      } : null);
      if (refreshData) await refreshData();
      fetchBiData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to apply strategy', 'error');
    } finally {
      setExecutingSugs((prev) => ({ ...prev, [sug.id]: false }));
    }
  };

  const handleDeclineSuggestion = async (sugId: string) => {
    try {
      await api.post('/api/admin/intelligence/decline', { sugId });
      showToast('Recommendation dismissed', 'info');
      setBiData((prev) => prev ? {
        ...prev,
        suggestions: prev.suggestions.filter((s) => s.id !== sugId)
      } : null);
    } catch (err: any) {
      console.warn('Failed to decline recommendation:', err);
    }
  };

  const handleSaveRent = async (val: number) => {
    const safeVal = Math.max(0, val);
    setDailyStallOverhead(safeVal);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('stitch_daily_stall_rent', String(safeVal));
      } catch {
        // fallback
      }
    }
    try {
      await api.patch('/api/admin/settings', { dailyRent: safeVal });
    } catch (err) {
      console.error('Failed to sync dailyRent to backend settings', err);
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
    // If the customer brought their own item (BYOG), the shop incurred no garment material cost
    if (isByog) return 0;

    const lowerName = (itemName || '').toLowerCase().trim();
    if (!lowerName) return 0;

    // Only match against actual inventory items that have an explicitly specified supplierUnitCost
    for (const [invName, cost] of Object.entries(inventoryCostMap)) {
      if (cost != null && Number(cost) > 0) {
        const cleanInv = invName.replace(/[\(\)]/g, '').split(' ')[0].toLowerCase().trim();
        if (cleanInv.length >= 3 && lowerName.includes(cleanInv)) {
          return Number(cost) * qty;
        }
      }
    }

    // If no supplier unit cost has been set in the Raw Materials inventory, cost is 0
    return 0;
  };

  // 2. Filter orders by selected timeframe (supporting Today, 7 Days, 30 Days, 6 Months, 1 Year, All Time)
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
      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return nonCanceled.filter((o) => {
        const orderDate = new Date(o.createdAt || o.date);
        return orderDate >= sevenDaysAgo;
      });
    }

    if (timeRange === 'month') {
      const thirtyDaysAgo = new Date(startOfToday);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return nonCanceled.filter((o) => {
        const orderDate = new Date(o.createdAt || o.date);
        return orderDate >= thirtyDaysAgo;
      });
    }

    if (timeRange === '6months') {
      const sixMonthsAgo = new Date(startOfToday);
      sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
      return nonCanceled.filter((o) => {
        const orderDate = new Date(o.createdAt || o.date);
        return orderDate >= sixMonthsAgo;
      });
    }

    if (timeRange === '1year') {
      const oneYearAgo = new Date(startOfToday);
      oneYearAgo.setDate(oneYearAgo.getDate() - 365);
      return nonCanceled.filter((o) => {
        const orderDate = new Date(o.createdAt || o.date);
        return orderDate >= oneYearAgo;
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
      return sum;
    }, 0);
  }, [filteredOrders, inventoryCostMap]);

  const operatingOverhead = useMemo(() => {
    if (timeRange === 'today') return dailyStallOverhead;
    if (timeRange === 'week') return dailyStallOverhead * 7;
    if (timeRange === 'month') return dailyStallOverhead * 30;
    if (timeRange === '6months') return dailyStallOverhead * 180;
    if (timeRange === '1year') return dailyStallOverhead * 365;
    // For 'all' time: compute the real span of operating days from earliest recorded order to today
    if (filteredOrders.length === 0) return 0;
    const timestamps = filteredOrders
      .map((o) => new Date(o.createdAt || o.date).getTime())
      .filter((t) => !isNaN(t));
    if (timestamps.length === 0) return dailyStallOverhead;
    const earliestTime = Math.min(...timestamps);
    const spanDays = Math.max(1, Math.ceil((Date.now() - earliestTime) / (1000 * 60 * 60 * 24)));
    return dailyStallOverhead * spanDays;
  }, [timeRange, dailyStallOverhead, filteredOrders]);

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

  // Sales & profit per item category (What sold best) - Dynamically grouped from real orders
  const categoryPerformance = useMemo(() => {
    const groups: Record<string, { category: string; units: number; revenue: number; cost: number; profit: number }> = {};

    filteredOrders.forEach((o) => {
      const items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [o];
      items.forEach((item: any) => {
        const rawName = (item.name || o.design || '').trim();
        const lowerName = rawName.toLowerCase();
        const qty = Number(item.quantity) || 1;
        const total = Number(item.price ? item.price * qty : o.totalAmount || o.amount) || 0;
        const isByog = Boolean(item.isByog || o.isByog);

        let key = 'Other Products';
        if (isByog) {
          key = 'Customer Brought Items (BYOG)';
        } else if (item.category && typeof item.category === 'string' && item.category.trim()) {
          key = item.category.trim();
        } else if (lowerName.includes('bath towel')) {
          key = 'Bath Towels';
        } else if (lowerName.includes('hand towel') || lowerName.includes('face towel') || lowerName.includes('towel')) {
          key = 'Hand Towels';
        } else if (lowerName.includes('fan')) {
          key = 'Chinese Fans';
        } else if (lowerName.includes('cap') || lowerName.includes('hat')) {
          key = 'Caps & Hats';
        } else if (lowerName.includes('shirt') || lowerName.includes('hoodie') || lowerName.includes('polo')) {
          key = 'Shirts & Clothing';
        } else if (rawName) {
          key = rawName;
        }

        if (!groups[key]) {
          groups[key] = { category: key, units: 0, revenue: 0, cost: 0, profit: 0 };
        }

        const cost = getRealOrEstimatedCost(item.name || '', total / qty, isByog, qty);
        groups[key].units += qty;
        groups[key].revenue += total;
        groups[key].cost += cost;
        groups[key].profit += total - cost;
      });
    });

    return Object.values(groups).filter((g) => g.units > 0).sort((a, b) => b.units - a.units);
  }, [filteredOrders, inventoryCostMap]);

  // Clean adaptive chart: daily for short intervals; weekly for 6mo; monthly for 1yr/All
  const chartData = useMemo(() => {
    const dailyMap: Record<string, { date: string; timestamp: number; revenue: number; profit: number }> = {};

    filteredOrders.forEach((o) => {
      const d = new Date(o.createdAt || o.date);
      if (isNaN(d.getTime())) return;

      let key = `${d.getMonth() + 1}/${d.getDate()}`;
      let timestamp = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

      if (timeRange === '1year' || (timeRange === 'all' && filteredOrders.length > 120)) {
        // Group by Month for year-long trends
        key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        timestamp = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      } else if (timeRange === '6months') {
        // Group by Week (Week starting date)
        const weekStart = new Date(d);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        weekStart.setDate(diff);
        key = `Wk ${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
        timestamp = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime();
      }

      const rev = Number(o.totalAmount || o.amount) || 0;
      const items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
      let cost = 0;
      if (items.length > 0) {
        items.forEach((item: any) => {
          cost += getRealOrEstimatedCost(item.name || '', item.price || rev, item.isByog || o.isByog, item.quantity || 1);
        });
      } else {
        cost = 0;
      }
      const prof = rev - cost;

      if (!dailyMap[key]) {
        dailyMap[key] = {
          date: key,
          timestamp,
          revenue: rev,
          profit: prof
        };
      } else {
        dailyMap[key].revenue += rev;
        dailyMap[key].profit += prof;
      }
    });

    const entries = Object.values(dailyMap).sort((a, b) => a.timestamp - b.timestamp);
    if (entries.length === 0) return [];
    return entries;
  }, [filteredOrders, inventoryCostMap, timeRange]);

  // 1-Click Thermal Print Slip for Cashier Turnover
  const handlePrintSlip = () => {
    const printWindow = window.open('', '_blank', 'width=380,height=600');
    if (!printWindow) {
      window.print();
      return;
    }
    const timeframeLabel =
      timeRange === 'today'
        ? 'Today'
        : timeRange === 'week'
        ? 'Past 7 Days'
        : timeRange === 'month'
        ? 'Past 30 Days'
        : timeRange === '6months'
        ? 'Past 6 Months'
        : timeRange === '1year'
        ? 'Past 1 Year'
        : 'All Time';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Closing Summary - ${businessInfo.name}</title>
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
        <div class="center big">${businessInfo.name}</div>
        <div class="center">${businessInfo.address}</div>
        <div class="center bold" style="margin-top: 4px;">BUSINESS FINANCIAL REPORT</div>
        <div class="center">${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        
        <div class="divider"></div>
        <div class="row"><span>Total Orders Handled:</span><span class="bold">${filteredOrders.length} orders</span></div>
        <div class="row"><span>Coverage Timeframe:</span><span class="bold">${timeframeLabel}</span></div>
        <div class="divider"></div>
        
        <div class="row"><span>Cash Collected (In Drawer):</span><span class="bold">₱${paymentBreakdown.cashTotal.toFixed(2)}</span></div>
        <div class="row"><span>GCash Received:</span><span class="bold">₱${paymentBreakdown.gcashTotal.toFixed(2)}</span></div>
        <div class="row bold big" style="margin-top: 6px;"><span>TOTAL SALES:</span><span>₱${totalRevenue.toFixed(2)}</span></div>
        
        <div class="divider"></div>
        <div class="row"><span>Material Costs:</span><span>-₱${estimatedMaterialCosts.toFixed(2)}</span></div>
        <div class="row"><span>Operating Rent Overhead:</span><span>-₱${operatingOverhead.toFixed(2)}</span></div>
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
          *** Verified by System Analytics ***<br/>
          Staple this slip to your sales ledger.
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

  const totalForecastRevenue = useMemo(() => {
    const revs = biData?.projections?.forecast?.revenue || [];
    return revs.reduce((a, b) => a + b, 0);
  }, [biData]);

  return (
    <section className="animate-fade flex flex-col min-h-full text-left w-full space-y-4 pb-12">
      {/* TOP CONTROL TOOLBAR (Timeframe Switcher, Cashier Print Slip, Rent Shield) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Left: Timeframe Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-bg-surface border border-border-glass rounded-xl p-1 text-xs shadow-xs flex-wrap gap-1">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: 'week', label: '7 Days' },
                { id: 'month', label: '30 Days' },
                { id: '6months', label: '6 Months' },
                { id: '1year', label: '1 Year' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTimeRange(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
            title="Print summary slip for cashier turnover"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print Slip</span>
          </button>
        </div>

        {/* Right: Rent Shield Badge */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowOverheadSettings(!showOverheadSettings)}
            className="px-3.5 py-2 rounded-xl bg-bg-surface hover:bg-white/5 border border-border-glass text-text-dim hover:text-text-main transition flex items-center gap-2 cursor-pointer font-medium shadow-xs"
            title="Configure daily stall rent & electricity budget"
          >
            <span>Rent Shield:</span>
            <strong className="text-text-main font-mono">₱{dailyStallOverhead.toLocaleString()}/day</strong>
            <span className="text-[11px] text-primary underline font-bold">Edit</span>
          </button>
        </div>
      </div>

      {/* Collapsible Rent Settings */}
      {showOverheadSettings && (
        <div className="p-3.5 bg-bg-surface border border-primary/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs animate-[fadeIn_0.15s_ease-out]">
          <span className="text-text-dim">
            Daily shop rent &amp; electricity operating budget:
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
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-bold text-xs transition cursor-pointer shadow-xs"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* EXECUTIVE FINANCIAL SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Total Revenue */}
        <div className="glass-card p-4 border border-border-glass rounded-xl flex flex-col justify-between">
          <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider block">
            Total Revenue
          </span>
          <div className="text-xl font-bold font-mono text-text-main my-1">
            ₱{totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-text-dim font-mono truncate">
            {filteredOrders.length} orders ({paymentBreakdown.cashCount} Cash, {paymentBreakdown.gcashCount} GCash)
          </span>
        </div>

        {/* 2. Material Costs */}
        <div className="glass-card p-4 border border-border-glass rounded-xl flex flex-col justify-between">
          <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider block">
            Materials Consumed
          </span>
          <div className="text-xl font-bold font-mono text-text-dim my-1">
            ₱{estimatedMaterialCosts.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-text-dim/70 truncate">
            Supplier raw inventory cost
          </span>
        </div>

        {/* 3. Operating Overhead */}
        <div className="glass-card p-4 border border-border-glass rounded-xl flex flex-col justify-between">
          <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider block">
            Operating Overhead
          </span>
          <div className="text-xl font-bold font-mono text-text-dim my-1">
            ₱{operatingOverhead.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-text-dim/70 truncate">
            ₱{dailyStallOverhead.toLocaleString()}/day rent allocation
          </span>
        </div>

        {/* 4. Net Operating Profit */}
        <div className="glass-card p-4 border border-border-glass rounded-xl flex flex-col justify-between">
          <span className="text-[11px] font-bold text-text-dim uppercase tracking-wider block">
            Net Operating Profit
          </span>
          <div className={`text-xl font-bold font-mono my-1 ${
            netProfit > 0 ? 'text-primary' : 'text-text-main'
          }`}>
            {netProfit >= 0
              ? `₱${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `-₱${Math.abs(netProfit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <span className="text-[11px] text-text-dim font-mono truncate">
            {totalRevenue > 0 ? `${netMargin}% net margin` : 'Awaiting daily sales'}
          </span>
        </div>
      </div>

      {/* CONTINUOUS AI OPERATIONAL LEARNING & STRATEGY ENGINE */}
      <div className="glass-card p-5 border border-border-glass rounded-xl text-left">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-border-glass flex items-center justify-center text-text-main shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z" />
                <path d="M18 10a6 6 0 0 1-12 0" />
                <path d="M12 18v4" />
                <path d="M8 22h8" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-text-main">
                  AI Operational Intelligence &amp; Continuous Learning
                </h3>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  365-Day Model Active
                </span>
              </div>
              <p className="text-xs text-text-dim mt-0.5">
                Continuously monitors supplier raw material costs, demand velocity, and inventory safety buffers to protect store margins.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isLoadingBi}
            onClick={() => fetchBiData(true)}
            className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-main border border-border-glass text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            title="Re-run operational learning analysis over database records"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={isLoadingBi ? 'animate-spin' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{isLoadingBi ? 'Evaluating...' : 'Re-analyze Model'}</span>
          </button>
        </div>

        {/* 3 Key Operational Learned Signals */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-white/5 border border-border-glass">
            <span className="text-[11px] text-text-dim block mb-0.5">Learned Customer AOV</span>
            <span className="text-sm font-bold font-mono text-text-main">
              ₱{(biData?.metrics?.avgOrderValue || 0).toFixed(2)}
            </span>
            <span className="text-[10px] text-text-dim block mt-0.5">Average ticket per customer</span>
          </div>

          <div className="p-3 rounded-lg bg-white/5 border border-border-glass">
            <span className="text-[11px] text-text-dim block mb-0.5">7-Day ML Revenue Forecast</span>
            <span className="text-sm font-bold font-mono text-primary">
              +₱{totalForecastRevenue.toFixed(2)}
            </span>
            <span className="text-[10px] text-text-dim block mt-0.5">Linear projection from velocity</span>
          </div>

          <div className="p-3 rounded-lg bg-white/5 border border-border-glass">
            <span className="text-[11px] text-text-dim block mb-0.5">Operational Training Set</span>
            <span className="text-sm font-bold font-mono text-text-main">
              {orders.length} orders
            </span>
            <span className="text-[10px] text-text-dim block mt-0.5">Continuous learning dataset</span>
          </div>
        </div>

        {/* Actionable Strategy Recommendations */}
        <div className="space-y-2">
          {isLoadingBi && !biData ? (
            <div className="p-4 text-center text-xs text-text-dim font-mono animate-pulse">
              Evaluating demand curves, material replenishment thresholds, and kiosk velocity...
            </div>
          ) : biData?.suggestions && biData.suggestions.length > 0 ? (
            biData.suggestions.map((sug) => {
              const isCritical = sug.severity === 'critical';
              const isWarning = sug.severity === 'warning';
              const isExecuting = executingSugs[sug.id];

              return (
                <div
                  key={sug.id}
                  className="p-3 rounded-lg bg-white/5 border border-border-glass flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/10 text-text-main border border-border-glass">
                        {sug.category}
                      </span>
                      {isCritical && (
                        <span className="text-[10px] font-bold text-danger uppercase tracking-wider">
                          • Action Recommended
                        </span>
                      )}
                      {isWarning && (
                        <span className="text-[10px] font-bold text-warning uppercase tracking-wider">
                          • Notice
                        </span>
                      )}
                      <h4 className="text-xs font-bold text-text-main truncate">{sug.title}</h4>
                    </div>
                    <p className="text-xs text-text-dim leading-relaxed">{sug.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-border-glass">
                    <button
                      type="button"
                      onClick={() => handleDeclineSuggestion(sug.id)}
                      className="px-2.5 py-1.5 rounded-lg text-text-dim hover:text-text-main hover:bg-white/5 text-xs font-medium transition cursor-pointer"
                      title="Dismiss this recommendation"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      disabled={isExecuting}
                      onClick={() => handleExecuteSuggestion(sug)}
                      className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      {isExecuting ? 'Applying...' : sug.actionText || 'Apply Strategy'}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-3.5 rounded-lg bg-white/5 border border-border-glass flex items-center gap-2.5 text-xs text-text-dim">
              <span className="text-primary font-bold">✓</span>
              <span>
                <strong>System Optimal:</strong> All raw material buffers, supplier cost margins, and machine queue throughput are operating at peak efficiency.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* TOP SOLD GARMENTS & BEST SELLERS TABLE */}
      <div className="glass-card p-5 border border-border-glass rounded-xl text-left">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-glass">
          <div>
            <h3 className="text-sm font-bold text-text-main">Top Sold Garments &amp; Best Sellers</h3>
            <p className="text-xs text-text-dim">
              Ranked by pieces crafted. Material costs reflect Raw Materials inventory supplier unit costs.
            </p>
          </div>
          <span className="text-xs text-text-dim font-mono">
            {filteredOrders.length} orders total
          </span>
        </div>

        {categoryPerformance.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-dim">
            No orders recorded for {timeRange === 'today' ? 'today' : timeRange === 'week' ? 'the past 7 days' : timeRange === 'month' ? 'the past 30 days' : timeRange === '6months' ? 'the past 6 months' : timeRange === '1year' ? 'the past 1 year' : 'this period'}. Expand the timeframe to 6 Months, 1 Year, or All Time to view sales.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border-glass text-text-dim text-[11px]">
                    <th className="pb-2.5 font-bold">Item Type</th>
                    <th className="pb-2.5 font-bold text-center">Pieces Crafted</th>
                    <th className="pb-2.5 font-bold text-right">Total Bounty</th>
                    <th className="pb-2.5 font-bold text-right">Material Cost</th>
                    <th className="pb-2.5 font-bold text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-glass">
                  {paginatedCategories.map((row) => (
                    <tr key={row.category} className="hover:bg-white/5 transition">
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
                        {row.cost > 0 ? (
                          `₱${row.cost.toFixed(2)}`
                        ) : (
                          <span className="text-[11px] text-text-dim/60" title="No supplier cost specified in Raw Materials inventory">
                            ₱0.00
                          </span>
                        )}
                      </td>
                      <td className={`py-3 text-right font-mono font-bold text-sm ${row.profit < 0 ? 'text-text-dim' : 'text-primary'}`}>
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

      {/* PERFORMANCE TRENDLINE */}
      <div className="glass-card p-5 border border-border-glass rounded-xl text-left">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-text-main">Performance Trendline</h3>
            <p className="text-xs text-text-dim">
              Earnings curve across selected period ({timeRange === '1year' || timeRange === 'all' ? 'Monthly' : timeRange === '6months' ? 'Weekly' : 'Daily'}).
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-primary">
            Revenue &amp; Profit (₱)
          </span>
        </div>

        {chartData.length === 0 ? (
          <div className="h-40 w-full flex flex-col items-center justify-center text-xs text-text-dim border border-dashed border-border-glass rounded-xl bg-white/[0.01]">
            <span>No order transactions recorded during this timeframe.</span>
            <span className="text-[11px] text-text-dim/60 mt-1">Select 6 Months, 1 Year, or All Time above to view historical trendlines.</span>
          </div>
        ) : (
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
                          <div className={`font-bold text-sm ${val < 0 ? 'text-text-main' : 'text-primary'}`}>
                            {val < 0 ? `Gross Profit: -₱${Math.abs(val).toFixed(2)}` : `Gross Profit: +₱${val.toFixed(2)}`}
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
                  fill="url(#questProfitGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
