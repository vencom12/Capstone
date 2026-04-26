'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import type { AnalyticsReport } from '@/types';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';

export default function AnalyticsCharts() {
  const [data, setData] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getAnalytics().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-64 flex items-center justify-center"><Spinner /></div>;
  if (!data) return <div className="p-8 text-center text-slate-500 italic">No analytics data available.</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Order Trends */}
      <Card className="flex flex-col gap-6">
        <h3 className="font-bold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
          Monthly Revenue Trend
        </h3>
        <div className="flex items-end gap-2 h-40 pt-4">
          {data.orderTrends.map((t, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
              <div className="w-full bg-primary/20 border-t-2 border-primary rounded-t relative overflow-hidden group-hover:bg-primary/40 transition-all" 
                   style={{ height: `${Math.max(10, (t.revenue / Math.max(...data.orderTrends.map(x => x.revenue))) * 100)}%` }}>
                 <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent"></div>
              </div>
              <span className="text-[8px] text-slate-500 uppercase">{t._id.month}/{t._id.year.toString().slice(-2)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Status Distribution */}
      <Card className="flex flex-col gap-6">
        <h3 className="font-bold text-white">Status Distribution</h3>
        <div className="space-y-4">
          {data.statusDistribution.map((s, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-medium">{s._id}</span>
                <span className="text-white font-bold">{s.count}</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    s._id === 'Completed' ? 'bg-emerald-500' : 
                    s._id === 'Pending' ? 'bg-yellow-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${(s.count / data.statusDistribution.reduce((a, b) => a + b.count, 0)) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Top Ordered */}
      <Card>
        <h3 className="font-bold text-white mb-6">Top Ordered Designs</h3>
        <div className="space-y-4">
          {data.topOrdered.map((t, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
              <span className="text-sm font-medium text-slate-300">{t._id}</span>
              <span className="text-xs font-black text-primary bg-primary/10 px-2 py-1 rounded-lg border border-primary/20">
                {t.count} orders
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Site Traffic */}
      <Card>
        <h3 className="font-bold text-white mb-6">Daily Site Traffic (30d)</h3>
        <div className="flex items-end gap-1 h-32 pt-4">
          {data.trafficStats.map((t, idx) => (
            <div 
              key={idx} 
              className="flex-1 bg-indigo-500/40 rounded-t hover:bg-indigo-500 transition-all cursor-help"
              title={`${t._id}: ${t.visits} visits`}
              style={{ height: `${Math.max(5, (t.visits / Math.max(...data.trafficStats.map(x => x.visits))) * 100)}%` }}
            ></div>
          ))}
        </div>
        <div className="flex justify-between mt-4 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
           <span>{data.trafficStats[0]?._id}</span>
           <span>Today</span>
        </div>
      </Card>
    </div>
  );
}
