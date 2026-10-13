'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { showToast } from '@/components/ui/Toast';

interface ReceiptModalProps {
  transactionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ReceiptModal({ transactionId, isOpen, onClose }: ReceiptModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [businessSettings, setBusinessSettings] = useState<{
    businessName?: string;
    businessAddress?: string;
    businessContact?: string;
    businessLogoUrl?: string;
    receiptTagline?: string;
  }>({});
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res) {
          setBusinessSettings({
            businessName: res.businessName || 'EDS TOWELS & CAPS',
            businessAddress: res.businessAddress || 'Pacific Mall Lucena, M.L. Tagarao St., Lucena City, Quezon 4301',
            businessContact: res.businessContact || '0928 810 3928 • 0912 345 6789',
            businessLogoUrl: res.businessLogoUrl || '',
            receiptTagline: res.receiptTagline || 'Custom Embroidery & Apparel Workshop'
          });
        }
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
      const res = await api.get<any>(`/api/payments/receipt/${transactionId}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch receipt details');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const rId = data?.receiptId || data?.receiptID || data?.transactionID || transactionId;
    if (!rId || isDownloading) return;

    setIsDownloading(true);
    try {
      const { api } = await import('@/lib/api');
      await api.download(`/api/customer/receipt/${rId}/download`, `receipt-${rId}.pdf`);
      showToast('Official Receipt PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error('Failed to download receipt PDF:', err);
      showToast('Failed to download receipt PDF. Please try again.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const totalAmount = parseFloat(data?.amount || 0);
  const vatableSales = totalAmount / 1.12;
  const vatAmount = totalAmount - vatableSales;

  const claimCode = data?.orderID ? (
    data.orderID.startsWith('WI-')
      ? `#${data.orderID.replace('WI-', 'A-')}`
      : `#A-${data.orderID.slice(-4).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`
  ) : null;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Electronic Payment Receipt"
      maxWidth="max-w-[560px]"
    >
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-dim text-xs font-medium m-0">Generating receipt preview...</p>
        </div>
      ) : error ? (
        <div className="py-8 text-center flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center font-bold">
            !
          </div>
          <p className="text-danger font-medium text-xs m-0">Unable to load receipt: {error}</p>
          <button
            onClick={fetchReceipt}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold border border-border-glass cursor-pointer text-text-main"
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <div className="flex flex-col gap-4 text-left print:text-black print:bg-white">
          {/* Printable Receipt Card */}
          <div
            id="stitch-receipt-printable"
            className="bg-bg-surface/90 border border-border-glass rounded-2xl p-5 md:p-6 flex flex-col gap-4 shadow-sm relative overflow-hidden print:border-none print:p-0"
          >
            {/* Header / Store Identification */}
            <div className="flex flex-col items-center text-center pb-4 border-b border-dashed border-border-glass/70 gap-1">
              <div className="flex items-center justify-center gap-2 mb-0.5">
                {businessSettings.businessLogoUrl ? (
                  <img
                    src={businessSettings.businessLogoUrl}
                    alt="Logo"
                    className="w-7 h-7 object-contain rounded"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-black text-xs">
                    ED
                  </div>
                )}
                <h3 className="text-base font-black tracking-wide text-text-main m-0 uppercase">
                  {businessSettings.businessName || 'EDS TOWELS & CAPS'}
                </h3>
              </div>
              <p className="text-[0.7rem] text-text-dim m-0 leading-tight">
                {businessSettings.receiptTagline || 'Custom Embroidery & Apparel Workshop'}
              </p>
              <p className="text-[0.68rem] text-text-muted m-0 leading-tight">
                {businessSettings.businessAddress || 'Pacific Mall Lucena, Quezon Province'}
              </p>
              <p className="text-[0.68rem] text-text-muted m-0 leading-tight">
                Contact: {businessSettings.businessContact || '0928 810 3928'}
              </p>

              <div className="mt-2.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[0.68rem] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Paid & Verified Transaction</span>
              </div>
            </div>

            {/* Transaction Key Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-b border-dashed border-border-glass/70 pb-3.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.68rem] uppercase font-bold text-text-dim">Receipt Ref</span>
                <span className="font-mono text-xs font-bold text-primary">
                  {data.receiptId || data.transactionID}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 text-right">
                <span className="text-[0.68rem] uppercase font-bold text-text-dim">Date & Time</span>
                <span className="text-xs font-semibold text-text-main">
                  {new Date(data.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[0.68rem] uppercase font-bold text-text-dim">Order Number</span>
                <span className="font-mono text-xs font-bold text-text-main">
                  #{data.orderID || 'N/A'}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 text-right">
                <span className="text-[0.68rem] uppercase font-bold text-text-dim">Payment Method</span>
                <span className="text-xs font-bold uppercase text-text-main">
                  {data.paymentMethod || 'GCASH'}
                </span>
              </div>

              {claimCode && (
                <div className="col-span-2 flex justify-between items-center bg-white/[0.03] p-2 rounded-xl border border-border-glass/40">
                  <span className="text-[0.7rem] text-text-dim font-medium">Store Pick-up Claim Code:</span>
                  <span className="font-mono font-black text-amber-400 text-xs tracking-wider">
                    {claimCode}
                  </span>
                </div>
              )}
            </div>

            {/* Line Items List */}
            <div className="flex flex-col gap-2 pt-1">
              <span className="text-[0.7rem] uppercase font-bold text-text-dim tracking-wider">
                Stitched Item Breakdown
              </span>
              <div className="flex flex-col gap-1.5">
                {data.items && Array.isArray(data.items) && data.items.length > 0 ? (
                  data.items.map((item: any, idx: number) => {
                    const variantText = [
                      item.selectedVariant,
                      item.selectedSize ? `Size: ${item.selectedSize}` : null
                    ].filter(Boolean).join(' • ');

                    return (
                      <div
                        key={idx}
                        className="flex justify-between items-start text-xs p-2.5 rounded-xl bg-white/[0.02] border border-border-glass/40"
                      >
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-text-main text-[0.82rem]">
                            {item.name} <span className="text-primary font-bold">x{item.quantity || 1}</span>
                          </span>
                          {(variantText || item.selectedColor) && (
                            <div className="flex items-center gap-1.5 text-[0.7rem] text-text-dim mt-0.5 font-medium">
                              {item.selectedColor && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-white/20 inline-block shrink-0 shadow-sm"
                                  style={{ backgroundColor: item.selectedColor }}
                                  title={item.selectedColor}
                                />
                              )}
                              {variantText && <span>{variantText}</span>}
                            </div>
                          )}
                        </div>
                        <span className="font-mono font-bold text-xs text-text-main">
                          ₱{((parseFloat(item.price || 0)) * (item.quantity || 1)).toFixed(2)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-white/[0.02]">
                    <span className="font-medium text-text-main">Custom Embroidery Order</span>
                    <span className="font-mono font-bold">₱{totalAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Summary Breakdown */}
            <div className="pt-3 border-t border-dashed border-border-glass/70 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between text-text-dim">
                <span>Vatable Sales:</span>
                <span className="font-mono">₱{vatableSales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-text-dim">
                <span>12% EVAT:</span>
                <span className="font-mono">₱{vatAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border-glass text-sm font-bold text-text-main">
                <span className="uppercase tracking-wide">Total Amount Paid:</span>
                <span className="font-mono text-base font-extrabold text-primary">
                  ₱{totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Receipt Verification Footer */}
            <div className="pt-2 text-center text-[0.65rem] text-text-dim flex flex-col gap-0.5">
              <span>Thank you for choosing Eds Towels & Caps!</span>
              <span className="font-mono text-text-muted">Digital Hash: STITCH-OPT-{data.transactionID}</span>
            </div>
          </div>

          {/* Action Footer */}
          <div className="modal-footer pt-1 border-t border-border-glass flex flex-wrap items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-w-[85px] h-10 px-4 rounded-xl font-bold text-xs bg-white/5 hover:bg-white/10 border border-border-glass transition-all cursor-pointer text-text-main flex items-center justify-center active:scale-[0.98]"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 min-w-[110px] h-10 px-4 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/15 border border-white/20 text-text-main transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-dim">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print Receipt</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="flex-[1.2] min-w-[130px] h-10 px-4 rounded-xl font-bold text-xs bg-primary hover:bg-primary/90 text-white shadow-[0_2px_12px_rgba(99,102,241,0.25)] transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </GlassModal>
  );
}
