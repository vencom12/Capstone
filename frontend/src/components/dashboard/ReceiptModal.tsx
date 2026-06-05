'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';

interface ReceiptModalProps {
  transactionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ReceiptModal({ transactionId, isOpen, onClose }: ReceiptModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');

  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res && res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
      }).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (isOpen && transactionId) {
      fetchReceipt();
    }
  }, [isOpen, transactionId]);

  const fetchReceipt = async () => {
    setLoading(true);
    setError(null);
    try {
      const { api } = await import('@/lib/api');
      const data = await api.get<any>(`/api/payments/receipt/${transactionId}`);
      setData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch receipt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Payment Receipt">
      {loading ? (
        <div className="py-8 flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-dim text-sm">Fetching receipt...</p>
        </div>
      ) : error ? (
        <div className="py-8 text-center text-danger font-medium text-sm">
          Error: {error}
        </div>
      ) : data ? (
        <div className="modal-stack">
          <div className="modal-box !p-4">
             <div className="flex justify-between items-center border-b border-border-glass pb-3 mb-3">
                <div className="flex items-center gap-2">
                  {businessLogoUrl && <img src={businessLogoUrl} alt="Logo" className="w-5 h-5 object-contain rounded" />}
                  <span className="modal-label">Transaction ID</span>
                </div>
                <span className="font-mono text-primary font-bold text-sm">{data.transactionID}</span>
             </div>
             <div className="flex justify-between mb-2 text-xs">
                <span className="text-text-dim">Order ID</span>
                <span className="font-bold">{data.orderID || 'N/A'}</span>
             </div>
             <div className="flex justify-between mb-2 text-xs">
                <span className="text-text-dim">Date & Time</span>
                <span className="font-bold">{new Date(data.timestamp).toLocaleString()}</span>
             </div>
             <div className="flex justify-between mb-3 text-xs">
                <span className="text-text-dim">Payment Method</span>
                <span className="font-bold uppercase">{data.paymentMethod || 'Wallet'}</span>
             </div>

             <div className="mt-4">
                <h4 className="modal-label mb-2">Items</h4>
                <div className="flex flex-col gap-1.5">
                   {data.items && data.items.length > 0 ? data.items.map((item: any, idx: number) => (
                     <div key={idx} className="flex justify-between text-[0.8rem]">
                        <span>{item.name} x{item.quantity}</span>
                        <span className="font-mono">${(item.price * item.quantity).toFixed(2)}</span>
                     </div>
                   )) : (
                     <p className="text-[0.7rem] text-text-dim italic">Top-up or Legacy Order</p>
                   )}
                </div>
             </div>

             <div className="mt-4 pt-3 border-t border-border-glass flex justify-between items-center">
                <span className="text-base font-bold">Total Amount</span>
                <span className="text-xl font-extrabold text-primary">${parseFloat(data.amount || 0).toFixed(2)}</span>
             </div>
          </div>

          <div className="flex items-center justify-center gap-2 bg-success/10 text-success py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-success/20">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
             Transaction {data.status}
          </div>

          <div className="modal-footer">
             <button onClick={onClose} className="flex-1 py-2 bg-white/5 rounded-xl font-bold text-sm border border-border-glass transition-all cursor-pointer hover:bg-white/10">Close</button>
             <button 
                onClick={async () => {
                   const rId = data?.receiptId || data?.receiptID;
                   if (!rId) return;
                   try {
                      const { api } = await import('@/lib/api');
                      await api.download(`/api/customer/receipt/${rId}/download`, `receipt-${rId}.pdf`);
                   } catch (err) {
                      // Error handled by api.download
                   }
                }}
                className="flex-1 py-2 bg-primary text-white rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all cursor-pointer hover:opacity-90"
             >
                Download PDF
             </button>
          </div>
        </div>
      ) : null}
    </GlassModal>
  );
}
