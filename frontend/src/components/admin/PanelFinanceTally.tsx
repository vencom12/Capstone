'use client';

import { useState, useMemo } from 'react';
import { showToast } from '@/components/ui/Toast';
import GlassModal from '@/components/ui/GlassModal';

interface PanelFinanceTallyProps {
  orders: any[];
  inventory?: any[];
  isSyncing?: boolean;
  refreshData?: () => Promise<void>;
}

export default function PanelFinanceTally({
  orders = [],
  inventory = [],
  isSyncing = false,
  refreshData
}: PanelFinanceTallyProps) {
  // Filter for Today's Paid Orders
  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  const todayPaidOrders = useMemo(() => {
    return (orders || []).filter((o) => {
      if (o.status === 'Order Canceled') return false;
      const paymentStatus = (o.paymentStatus || '').toLowerCase();
      // Only include paid transactions or completed walk-in tickets
      const isPaid = paymentStatus === 'paid' || o.paymentMethod?.toLowerCase() === 'cash' || o.isAlreadyCompleted;
      if (!isPaid) return false;

      const orderTime = new Date(o.createdAt || o.date || Date.now()).getTime();
      return orderTime >= todayStart;
    });
  }, [orders, todayStart]);

  // Financial aggregates for today
  const cashTotal = useMemo(() => {
    return todayPaidOrders
      .filter((o) => (o.paymentMethod || '').toLowerCase() === 'cash')
      .reduce((sum, o) => sum + (Number(o.totalAmount || o.amount) || 0), 0);
  }, [todayPaidOrders]);

  const gcashTotal = useMemo(() => {
    return todayPaidOrders
      .filter((o) => (o.paymentMethod || '').toLowerCase().includes('gcash'))
      .reduce((sum, o) => sum + (Number(o.totalAmount || o.amount) || 0), 0);
  }, [todayPaidOrders]);

  const grossSalesToday = cashTotal + gcashTotal;

  // Approximate material / supply cost
  const estimatedCostToday = useMemo(() => {
    return todayPaidOrders.reduce((totalCost, o) => {
      const items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
      let orderCost = 0;
      if (items.length > 0) {
        items.forEach((item: any) => {
          const qty = Number(item.quantity) || 1;
          const name = (item.name || '').toLowerCase();
          if (item.isByog || o.isByog) {
            orderCost += 12 * qty; // Thread/stabilizer only
          } else if (name.includes('bath')) {
            orderCost += 80 * qty;
          } else if (name.includes('fan')) {
            orderCost += 25 * qty;
          } else if (name.includes('cap')) {
            orderCost += 60 * qty;
          } else {
            orderCost += Math.round((Number(item.price) || 100) * 0.35) * qty;
          }
        });
      } else {
        const rev = Number(o.totalAmount || o.amount) || 0;
        orderCost = o.isByog ? 12 : Math.round(rev * 0.35);
      }
      return totalCost + orderCost;
    }, 0);
  }, [todayPaidOrders]);

  const netProfitToday = Math.max(0, grossSalesToday - estimatedCostToday);

  // 30-Second End-of-Day Cash Drawer Calculator State
  const [useBillBreakdown, setUseBillBreakdown] = useState(false);
  const [denom, setDenom] = useState({
    b1000: 0,
    b500: 0,
    b200: 0,
    b100: 0,
    b50: 0,
    b20: 0,
    coins: 0,
  });
  const [directCountedCash, setDirectCountedCash] = useState<string>('');
  const [drawerLockedTime, setDrawerLockedTime] = useState<string | null>(null);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'cash' | 'gcash'>('all');

  const countedCashTotal = useMemo(() => {
    if (useBillBreakdown) {
      return (
        denom.b1000 * 1000 +
        denom.b500 * 500 +
        denom.b200 * 200 +
        denom.b100 * 100 +
        denom.b50 * 50 +
        denom.b20 * 20 +
        (Number(denom.coins) || 0)
      );
    }
    const val = parseFloat(directCountedCash);
    return isNaN(val) ? 0 : val;
  }, [useBillBreakdown, denom, directCountedCash]);

  const variance = countedCashTotal - cashTotal;
  const isCountEntered = useBillBreakdown
    ? Object.values(denom).some((v) => v > 0)
    : directCountedCash.trim() !== '';

  const handleLockTally = () => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setDrawerLockedTime(timestamp);
    showToast(`✓ Cash drawer verified and recorded at ${timestamp}`, 'success');
  };

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
        <title>Daily Cash & Sales Summary - Eds Towels & Caps</title>
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
        <div class="center">Pacific Mall Lucena • Embroidery Studio</div>
        <div class="center">DAILY FINANCIAL SUMMARY SLIP</div>
        <div class="center">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
        <div class="divider"></div>
        <div class="row"><span>Total Orders Paid:</span><span class="bold">${todayPaidOrders.length}</span></div>
        <div class="row"><span>Cash in Drawer:</span><span class="bold">₱${cashTotal.toFixed(2)}</span></div>
        <div class="row"><span>GCash E-Wallet:</span><span class="bold">₱${gcashTotal.toFixed(2)}</span></div>
        <div class="divider"></div>
        <div class="row bold" style="font-size: 13px;"><span>TOTAL GROSS SALES:</span><span>₱${grossSalesToday.toFixed(2)}</span></div>
        <div class="row"><span>Est. Material Costs:</span><span>₱${estimatedCostToday.toFixed(2)}</span></div>
        <div class="row bold"><span>EST. NET TAKE-HOME:</span><span>₱${netProfitToday.toFixed(2)}</span></div>
        <div class="divider"></div>
        <div class="center bold">END-OF-DAY CASH DRAWER CHECK</div>
        <div class="row"><span>Counted in Cash Tin:</span><span class="bold">₱${countedCashTotal.toFixed(2)}</span></div>
        <div class="row"><span>Expected in Drawer:</span><span class="bold">₱${cashTotal.toFixed(2)}</span></div>
        <div class="row bold"><span>Variance:</span><span>${variance === 0 ? '₱0.00 (EXACT BALANCED)' : variance > 0 ? `+₱${variance.toFixed(2)} (OVER)` : `-₱${Math.abs(variance).toFixed(2)} (SHORT)`}</span></div>
        <div class="divider"></div>
        <div class="center" style="margin-top: 15px;">Verified by: _______________________</div>
        <div class="center" style="font-size: 10px; margin-top: 5px;">Printed via Eds Capstone POS</div>
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

  const filteredList = useMemo(() => {
    if (selectedFilter === 'cash') {
      return todayPaidOrders.filter((o) => (o.paymentMethod || '').toLowerCase() === 'cash');
    }
    if (selectedFilter === 'gcash') {
      return todayPaidOrders.filter((o) => (o.paymentMethod || '').toLowerCase().includes('gcash'));
    }
    return todayPaidOrders;
  }, [todayPaidOrders, selectedFilter]);

  return (
    <section className="animate-[fadeIn_0.3s_ease-out] flex flex-col h-full text-left font-sans max-w-6xl mx-auto pb-16">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-border-glass">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Phase 3 • Capstone Objective
            </span>
            <span className="text-xs text-text-dim">Real-Time Financial Monitoring</span>
          </div>
          <h1 className="text-2xl font-black text-text-main tracking-tight m-0 flex items-center gap-2">
            <span>Finance &amp; Daily Cash Tally</span>
            {isSyncing && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            )}
          </h1>
          <p className="text-xs text-text-dim m-0 mt-0.5">
            Real-time split of physical cash in Nanay's drawer vs. GCash QR payments with instant end-of-day reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {refreshData && (
            <button
              type="button"
              onClick={() => refreshData()}
              className="px-3 py-2 rounded-xl bg-white/5 border border-border-glass hover:bg-white/10 text-text-main text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={isSyncing ? 'animate-spin' : ''}>
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
              <span>Refresh</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrintSlip}
            className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-extrabold transition cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print Daily Slip</span>
          </button>
        </div>
      </header>

      {/* 4 Core Financial KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {/* Card 1: Physical Cash in Drawer */}
        <div className="bg-bg-surface border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <span>💵</span> Cash in Drawer
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-bold">
              Physical Tin
            </span>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
              ₱{cashTotal.toFixed(2)}
            </div>
            <div className="text-[11px] text-text-dim mt-1">
              {todayPaidOrders.filter((o) => (o.paymentMethod || '').toLowerCase() === 'cash').length} Cash orders punched today
            </div>
          </div>
        </div>

        {/* Card 2: GCash E-Wallet */}
        <div className="bg-bg-surface border border-[#007df2]/30 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#007df2]/5 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-[#007df2] uppercase tracking-wider flex items-center gap-1">
              <span>📱</span> GCash E-Wallet
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#007df2]/10 text-[#007df2] font-bold">
              QR Verified
            </span>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-[#007df2] tracking-tight">
              ₱{gcashTotal.toFixed(2)}
            </div>
            <div className="text-[11px] text-text-dim mt-1">
              {todayPaidOrders.filter((o) => (o.paymentMethod || '').toLowerCase().includes('gcash')).length} Digital payments received
            </div>
          </div>
        </div>

        {/* Card 3: Total Gross Revenue */}
        <div className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-text-dim uppercase tracking-wider flex items-center gap-1">
              <span>💰</span> Gross Sales (Today)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-text-main font-bold">
              {todayPaidOrders.length} Paid
            </span>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-text-main tracking-tight">
              ₱{grossSalesToday.toFixed(2)}
            </div>
            <div className="text-[11px] text-text-dim mt-1">
              Avg: ₱{todayPaidOrders.length > 0 ? (grossSalesToday / todayPaidOrders.length).toFixed(2) : '0.00'} / order
            </div>
          </div>
        </div>

        {/* Card 4: Net Profit (Estimated) */}
        <div className="bg-bg-surface border border-amber-500/30 rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <span>🏷️</span> Est. Take-Home Profit
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-bold">
              After COGS
            </span>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-amber-300 tracking-tight">
              ₱{netProfitToday.toFixed(2)}
            </div>
            <div className="text-[11px] text-text-dim mt-1">
              Est. Blank Costs: ₱{estimatedCostToday.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: End-of-Day 30-Second Reconciliation Box + Today's Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-8">
        {/* Left Column (5 cols): 30-Second End-of-Day Cash Drawer Check */}
        <div className="lg:col-span-5 bg-bg-surface border border-border-glass rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-border-glass">
            <div>
              <h2 className="text-sm font-extrabold text-text-main m-0 flex items-center gap-1.5">
                <span>🛡️</span>
                <span>End-of-Day Cash Drawer Check</span>
              </h2>
              <p className="text-[11px] text-text-dim m-0 mt-0.5">
                Count the cash in Nanay's tin box to verify against today's tickets.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUseBillBreakdown(!useBillBreakdown)}
              className="text-[11px] text-primary hover:underline font-bold cursor-pointer"
            >
              {useBillBreakdown ? 'Quick Input' : 'Denominations'}
            </button>
          </div>

          {/* Expected vs Counted Comparison */}
          <div className="bg-black/30 border border-white/5 rounded-xl p-3.5 mb-4 flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-text-dim">Expected Cash in Drawer:</span>
              <span className="font-mono font-black text-emerald-400 text-sm">
                ₱{cashTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-text-dim">Counted Cash in Hand:</span>
              <span className="font-mono font-black text-text-main text-sm">
                ₱{countedCashTotal.toFixed(2)}
              </span>
            </div>
            <div className="h-px bg-white/10 my-0.5"></div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-text-dim">Drawer Variance:</span>
              {isCountEntered ? (
                variance === 0 ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold font-mono text-xs flex items-center gap-1">
                    ✓ ₱0.00 EXACT BALANCED
                  </span>
                ) : variance > 0 ? (
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold font-mono text-xs">
                    +₱{variance.toFixed(2)} (OVER)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold font-mono text-xs">
                    -₱{Math.abs(variance).toFixed(2)} (SHORT)
                  </span>
                )
              ) : (
                <span className="text-text-dim italic text-[11px]">Enter count below</span>
              )}
            </div>
          </div>

          {/* Cash Input Form */}
          {useBillBreakdown ? (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { label: '₱1,000', key: 'b1000' },
                { label: '₱500', key: 'b500' },
                { label: '₱200', key: 'b200' },
                { label: '₱100', key: 'b100' },
                { label: '₱50', key: 'b50' },
                { label: '₱20', key: 'b20' },
              ].map(({ label, key }) => (
                <div key={key} className="flex items-center justify-between bg-white/[0.02] border border-border-glass rounded-lg px-2.5 py-1.5">
                  <span className="text-[11px] font-bold text-text-dim font-mono">{label}</span>
                  <input
                    type="number"
                    min="0"
                    value={(denom as any)[key] || ''}
                    placeholder="0"
                    onChange={(e) =>
                      setDenom({ ...denom, [key]: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                    className="w-14 bg-transparent text-right font-mono text-xs font-bold text-text-main outline-none"
                  />
                </div>
              ))}
              <div className="col-span-2 flex items-center justify-between bg-white/[0.02] border border-border-glass rounded-lg px-2.5 py-1.5">
                <span className="text-[11px] font-bold text-text-dim font-mono">Coins Total (₱)</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={denom.coins || ''}
                  placeholder="0.00"
                  onChange={(e) =>
                    setDenom({ ...denom, coins: Math.max(0, parseFloat(e.target.value) || 0) })
                  }
                  className="w-20 bg-transparent text-right font-mono text-xs font-bold text-text-main outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 mb-4">
              <label className="text-[11px] font-bold text-text-dim uppercase tracking-wider">
                Total Cash Counted in Drawer (₱)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-text-dim">₱</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 3450"
                  value={directCountedCash}
                  onChange={(e) => setDirectCountedCash(e.target.value)}
                  className="w-full bg-white/[0.03] border border-border-glass pl-8 pr-3 py-2.5 rounded-xl text-text-main font-mono text-base font-bold outline-none focus:border-primary transition"
                />
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="mt-auto pt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleLockTally}
              disabled={!isCountEntered}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-extrabold transition cursor-pointer shadow-md flex items-center justify-center gap-1.5"
            >
              <span>🔒 Record &amp; Verify Cash Drawer</span>
            </button>
            {drawerLockedTime && (
              <span className="text-[10px] text-emerald-400 text-center font-bold">
                ✓ Recorded at {drawerLockedTime} (Variance: {variance === 0 ? '₱0.00' : variance > 0 ? `+₱${variance.toFixed(2)}` : `-₱${Math.abs(variance).toFixed(2)}`})
              </span>
            )}
          </div>
        </div>

        {/* Right Column (7 cols): Today's Real-Time Transactions Ledger */}
        <div className="lg:col-span-7 bg-bg-surface border border-border-glass rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-border-glass">
            <div>
              <h2 className="text-sm font-extrabold text-text-main m-0">
                Today's Paid Transactions Ledger
              </h2>
              <span className="text-[11px] text-text-dim">
                Real-time stream of all cash &amp; GCash receipts for today
              </span>
            </div>

            {/* Filter buttons */}
            <div className="flex bg-white/5 border border-border-glass p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setSelectedFilter('all')}
                className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                  selectedFilter === 'all' ? 'bg-primary text-white shadow-sm' : 'text-text-dim hover:text-text-main'
                }`}
              >
                All ({todayPaidOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedFilter('cash')}
                className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                  selectedFilter === 'cash' ? 'bg-emerald-600 text-white shadow-sm' : 'text-text-dim hover:text-text-main'
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setSelectedFilter('gcash')}
                className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                  selectedFilter === 'gcash' ? 'bg-[#007df2] text-white shadow-sm' : 'text-text-dim hover:text-text-main'
                }`}
              >
                GCash
              </button>
            </div>
          </div>

          {/* Transaction Table */}
          {filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-text-dim">
              <span className="text-2xl mb-1">🧾</span>
              <span className="text-xs font-bold text-text-main">No paid orders recorded today yet</span>
              <span className="text-[11px] mt-0.5">Punch walk-in tickets in Counter Mode or accept GCash checkout orders.</span>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto pr-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-glass/60 text-[10px] uppercase tracking-wider text-text-dim">
                    <th className="py-2 px-2">Time</th>
                    <th className="py-2 px-2">Ticket / ID</th>
                    <th className="py-2 px-2">Client</th>
                    <th className="py-2 px-2">Item / Design</th>
                    <th className="py-2 px-2">Method</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {filteredList.map((ord: any) => {
                    const timeStr = new Date(ord.createdAt || ord.date || Date.now()).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const isCash = (ord.paymentMethod || '').toLowerCase() === 'cash';
                    const amount = Number(ord.totalAmount || ord.amount || 0);

                    return (
                      <tr key={ord.id || ord._id || ord.orderId} className="hover:bg-white/[0.02] transition">
                        <td className="py-2.5 px-2 font-mono text-[11px] text-text-dim whitespace-nowrap">
                          {timeStr}
                        </td>
                        <td className="py-2.5 px-2 font-mono font-bold text-[11px] text-primary whitespace-nowrap">
                          #{ord.orderId || 'WI-XXXX'}
                        </td>
                        <td className="py-2.5 px-2 font-semibold text-text-main truncate max-w-[110px]">
                          {ord.client || ord.clientName || 'Walk-In'}
                        </td>
                        <td className="py-2.5 px-2 text-text-dim truncate max-w-[140px] text-[11px]">
                          {ord.design || ord.items?.[0]?.name || 'Embroidery Item'}
                        </td>
                        <td className="py-2.5 px-2 whitespace-nowrap">
                          {isCash ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              💵 Cash
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#007df2]/15 text-[#007df2] border border-[#007df2]/30">
                              📱 GCash
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-extrabold text-text-main whitespace-nowrap">
                          ₱{amount.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
