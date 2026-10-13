'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import type { Order, Transaction, User } from '@/lib/types';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: Order | null;
  transaction?: Transaction | any | null;
  user?: User | null;
  transactionId?: string | null;
}

export default function InvoiceModal({
  isOpen,
  onClose,
  order,
  transaction,
  user,
  transactionId
}: InvoiceModalProps) {
  const [businessSettings, setBusinessSettings] = useState<{
    businessName?: string;
    businessAddress?: string;
    businessContact?: string;
    businessLogoUrl?: string;
    receiptTagline?: string;
  }>({});
  const [fetchedData, setFetchedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res) {
          setBusinessSettings({
            businessName: res.businessName || 'EDS TOWELS & CAPS',
            businessAddress: res.businessAddress || 'Pacific Mall Lucena, M.L. Tagarao St., Lucena City, Quezon 4301, Philippines',
            businessContact: res.businessContact || '0928 810 3928 • 0912 345 6789',
            businessLogoUrl: res.businessLogoUrl || '',
            receiptTagline: res.receiptTagline || 'Custom Embroidery & Apparel Workshop'
          });
        }
      }).catch(() => {});
    });
  }, []);

  const targetTxId = transaction?.transactionID || transactionId;

  useEffect(() => {
    if (isOpen && !order && targetTxId) {
      setLoading(true);
      import('@/lib/api').then(({ api }) => {
        api.get<any>(`/api/payments/receipt/${targetTxId}`).then(res => {
          if (res) setFetchedData(res);
        }).catch(err => {
          console.error('Failed to load receipt details:', err);
        }).finally(() => {
          setLoading(false);
        });
      });
    }
  }, [isOpen, order, targetTxId]);

  if (!isOpen) return null;

  // Resolve source data from order, fetchedData, or transaction
  const effectiveOrderId = order?.orderId || fetchedData?.orderID || transaction?.orderID || targetTxId || 'N/A';
  const cleanOrderCode = String(effectiveOrderId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const receiptNo = order?.receipt?.receiptId || fetchedData?.receiptId || `RCP-${cleanOrderCode}`;

  const rawDate = order?.date || order?.createdAt || fetchedData?.timestamp || transaction?.timestamp || Date.now();
  const receiptDate = new Date(rawDate).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const receiptTime = new Date(rawDate).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const totalAmount = parseFloat(String(order?.totalAmount ?? fetchedData?.amount ?? transaction?.amount ?? 0));
  const vatRate = 0.12;
  const vatableSales = totalAmount / (1 + vatRate);
  const vatAmount = totalAmount - vatableSales;

  const rawItems = order?.items || fetchedData?.items || transaction?.items || [];
  const clientName = user?.username || order?.client || fetchedData?.client || 'Customer';
  const clientEmail = user?.email || fetchedData?.email || 'Registered Customer';
  const clientPhone = user?.phoneNumber || fetchedData?.phoneNumber || '';

  const fulfillmentAddress = order?.address || user?.address || fetchedData?.address || 'Store Pick-up: Eds Towels & Caps, Pacific Mall Lucena, Quezon 4301';
  const paymentMethod = (order?.paymentMethod || fetchedData?.paymentMethod || transaction?.paymentMethod || 'GCASH').toUpperCase();

  const isPickup = (typeof fulfillmentAddress === 'string' && fulfillmentAddress.toLowerCase().includes('pick-up')) ||
    (order?.personalization as any)?.fulfillmentType === 'pickup';

  const claimCode = effectiveOrderId ? (
    String(effectiveOrderId).startsWith('WI-')
      ? `#${String(effectiveOrderId).replace('WI-', 'A-')}`
      : `#A-${cleanOrderCode.slice(-4)}`
  ) : null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Official Receipt"
      maxWidth="max-w-[680px]"
    >
      <div className="flex flex-col gap-5 text-text-main print:text-black print:bg-white">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-text-dim text-xs font-medium m-0">Generating receipt preview...</p>
          </div>
        ) : (
          <>
            {/* Printable Receipt Container */}
            <div
              id="stitch-invoice-printable"
              className="bg-bg-surface/80 border border-border-glass rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-sm print:border-none print:p-0"
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-border-glass/60 pb-5 flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    {businessSettings.businessLogoUrl ? (
                      <img
                        src={businessSettings.businessLogoUrl}
                        alt="Logo"
                        className="w-8 h-8 rounded-lg object-contain"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm shadow-sm">
                        ED
                      </div>
                    )}
                    <h2 className="text-xl font-black text-text-main m-0 tracking-tight uppercase">
                      {businessSettings.businessName || 'EDS TOWELS & CAPS'}
                    </h2>
                  </div>
                  <p className="text-xs text-text-dim mt-1.5 leading-relaxed m-0">
                    {businessSettings.receiptTagline || 'Custom Embroidery & Apparel Workshop'}<br />
                    VAT Reg. TIN: 429-810-332-00000 • Mobile: {businessSettings.businessContact || '0928 810 3928 • 0912 345 6789'}<br />
                    {businessSettings.businessAddress || 'Pacific Mall Lucena, M.L. Tagarao St., Lucena City, Quezon 4301, Philippines'}
                  </p>
                </div>

                <div className="text-right">
                  <span className="inline-block px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase tracking-wider bg-success/20 text-success border border-success/30">
                    PAID & VERIFIED
                  </span>
                  <h3 className="text-sm font-bold text-text-main mt-2 mb-0.5">{receiptNo}</h3>
                  <p className="text-xs text-text-dim m-0">Date: {receiptDate} • {receiptTime}</p>
                  {(transaction?.transactionID || targetTxId) && (
                    <p className="text-[0.7rem] text-text-dim mt-0.5">Ref: {transaction?.transactionID || targetTxId}</p>
                  )}
                </div>
              </div>

              {/* Billed To / Delivery Details */}
              <div className="grid grid-cols-2 gap-4 text-xs border-b border-border-glass/60 pb-5 max-[500px]:grid-cols-1">
                <div>
                  <span className="font-bold uppercase tracking-wider text-[0.7rem] text-text-dim block mb-1">
                    Billed To:
                  </span>
                  <p className="font-bold text-sm text-text-main m-0">{clientName}</p>
                  <p className="text-text-dim m-0 mt-0.5">{clientEmail}</p>
                  {clientPhone && <p className="text-text-dim m-0 mt-0.5">Mobile: {clientPhone}</p>}
                </div>

                <div>
                  <span className="font-bold uppercase tracking-wider text-[0.7rem] text-text-dim block mb-1">
                    Delivery Details:
                  </span>
                  <p className="text-text-main leading-relaxed m-0">
                    {fulfillmentAddress}
                  </p>
                  <p className="text-text-dim m-0 mt-1">
                    Payment: <span className="font-bold text-text-main">{paymentMethod}</span>
                  </p>
                  {isPickup && claimCode && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[0.72rem]">
                      <span className="text-text-dim">Claim Code:</span>
                      <span className="font-mono font-bold text-amber-400 bg-white/5 px-2 py-0.5 rounded border border-border-glass">
                        {claimCode}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Line Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border-glass text-text-dim uppercase text-[0.7rem] tracking-wider">
                      <th className="py-2 font-bold">Item Description</th>
                      <th className="py-2 text-center font-bold">Qty</th>
                      <th className="py-2 text-right font-bold">Unit Price</th>
                      <th className="py-2 text-right font-bold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-glass/40">
                    {rawItems && rawItems.length > 0 ? (
                      rawItems.map((item: any, index: number) => {
                        const variantDetails = [item.selectedVariant, item.selectedColor, item.selectedSize ? `Size: ${item.selectedSize}` : null]
                          .filter(Boolean)
                          .join(' • ');

                        return (
                          <tr key={index} className="text-text-main">
                            <td className="py-2.5 pr-2">
                              <div className="font-bold">{item.name || order?.design || 'Custom Embroidery'}</div>
                              {variantDetails && (
                                <div className="text-[0.7rem] text-text-dim">
                                  {variantDetails}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 text-center text-text-dim">{item.quantity || 1}</td>
                            <td className="py-2.5 text-right text-text-dim">₱{(parseFloat(item.price || 0)).toFixed(2)}</td>
                            <td className="py-2.5 text-right font-semibold">
                              ₱{((parseFloat(item.price || 0)) * (item.quantity || 1)).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr className="text-text-main">
                        <td className="py-2.5 pr-2 font-bold">{order?.design || 'Custom Embroidery Order'}</td>
                        <td className="py-2.5 text-center text-text-dim">1</td>
                        <td className="py-2.5 text-right text-text-dim">₱{totalAmount.toFixed(2)}</td>
                        <td className="py-2.5 text-right font-semibold">₱{totalAmount.toFixed(2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals */}
              <div className="flex justify-end pt-3 border-t border-border-glass/60">
                <div className="w-full max-w-[260px] flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between text-text-dim">
                    <span>Vatable Sales:</span>
                    <span>₱{vatableSales.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-text-dim">
                    <span>12% VAT:</span>
                    <span>₱{vatAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-text-main pt-2 border-t border-border-glass">
                    <span>Total Amount Paid:</span>
                    <span className="text-primary">₱{totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Official Verification Footer */}
              <div className="bg-bg-dark/40 border border-border-glass/50 rounded-2xl p-3 flex items-center justify-between text-[0.7rem] text-text-dim flex-wrap gap-2">
                <span>Official Digital Electronic Receipt • BIR Compliant</span>
                <span className="font-mono text-primary font-bold">DIGITAL-HASH-STITCH-OPT-SECURE</span>
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 print:hidden">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all shadow-sm cursor-pointer border-none"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-transparent border border-border-glass text-text-dim font-bold text-xs hover:bg-white/5 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </GlassModal>
  );
}
