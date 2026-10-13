'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { showToast } from '@/components/ui/Toast';
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
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res) {
          setBusinessSettings({
            businessName: res.businessName || 'EDS TOWELS & CAPS',
            businessAddress: res.businessAddress || 'Pacific Mall Lucena, Ground Floor, M.L. Tagarao St., Lucena City, Quezon 4301',
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
  const receiptNo = order?.receipt?.receiptId || fetchedData?.receiptId || transaction?.receiptId || `RCP-${cleanOrderCode}`;

  const rawDate = order?.date || order?.createdAt || fetchedData?.timestamp || transaction?.timestamp || Date.now();
  const dateObj = new Date(rawDate);
  const receiptDate = isNaN(dateObj.getTime())
    ? new Date().toLocaleDateString('en-PH')
    : dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const receiptTime = isNaN(dateObj.getTime())
    ? new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
    : dateObj.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  const totalAmount = parseFloat(String(order?.totalAmount ?? fetchedData?.amount ?? transaction?.amount ?? 0));
  const vatRate = 0.12;
  const vatableSales = totalAmount / (1 + vatRate);
  const vatAmount = totalAmount - vatableSales;

  const rawItems = order?.items || fetchedData?.items || transaction?.items || [];
  const clientName = user?.username || order?.client || fetchedData?.client || 'Customer';
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
    const slipElement = document.getElementById('store-thermal-receipt-slip');
    if (!slipElement) {
      window.print();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Store Receipt - ${receiptNo}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 3mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: "Courier New", Courier, monospace;
              background: #fff;
              color: #000;
              width: 100%;
              display: flex;
              justify-content: center;
              align-items: flex-start;
              font-size: 11px;
              line-height: 1.35;
            }
            .receipt-slip {
              width: 74mm;
              max-width: 100%;
              background: #fff;
              color: #000;
              padding: 3mm 2mm;
            }
          </style>
        </head>
        <body>
          <div class="receipt-slip">
            ${slipElement.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 250);
  };

  const handleDownloadPdf = async () => {
    const rId = receiptNo || targetTxId || 'RECEIPT';
    setIsDownloading(true);
    try {
      const { api } = await import('@/lib/api');
      await api.download(`/api/customer/receipt/${targetTxId || rId}/download`, `receipt-${cleanOrderCode}.pdf`);
      showToast('Official Receipt PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error('Download error:', err);
      // Fallback: trigger print dialog directly
      handlePrint();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Store Receipt Preview"
      maxWidth="max-w-[460px]"
    >
      <div className="flex flex-col gap-4 text-center items-center">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-text-dim text-xs font-medium m-0">Loading receipt paper...</p>
          </div>
        ) : (
          <>
            {/* The Actual White Long Store Thermal Receipt Slip */}
            <div
              id="store-thermal-receipt-slip"
              className="w-full max-w-[340px] sm:max-w-[360px] bg-white text-zinc-950 font-mono text-xs rounded shadow-2xl p-6 sm:p-7 border border-zinc-300 select-all relative overflow-hidden text-left"
            >
              {/* Serrated paper edge indicator top */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-[repeating-linear-gradient(45deg,#e4e4e7,#e4e4e7_4px,#ffffff_4px,#ffffff_8px)] opacity-80" />

              {/* Store Header */}
              <div className="text-center flex flex-col items-center pt-1 pb-2">
                <div className="w-8 h-8 rounded-md bg-black text-white flex items-center justify-center font-bold text-xs mb-1.5 shadow-sm">
                  ED
                </div>
                <div className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-black leading-tight">
                  {businessSettings.businessName || 'EDS TOWELS & CAPS'}
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5 leading-tight">
                  {businessSettings.receiptTagline || 'Custom Embroidery & Apparel Workshop'}
                </div>
                <div className="text-[10px] text-zinc-600 leading-tight">
                  Pacific Mall Lucena • Ground Floor
                </div>
                <div className="text-[9px] text-zinc-500 leading-tight">
                  M.L. Tagarao St., Lucena City, Quezon 4301
                </div>
                <div className="text-[9px] text-zinc-500 leading-tight mt-0.5">
                  Tel: {businessSettings.businessContact || '0928 810 3928'} • TIN: 429-810-332-00000
                </div>
              </div>

              {/* Dividing Line */}
              <div className="border-b border-dashed border-zinc-400 my-2.5" />

              {/* Transaction & Customer Details */}
              <div className="text-[11px] leading-tight flex flex-col gap-1 text-zinc-800">
                <div className="flex justify-between">
                  <span className="text-zinc-500">RECEIPT #:</span>
                  <span className="font-bold text-black">{receiptNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">ORDER #:</span>
                  <span className="font-bold text-black">#{effectiveOrderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">DATE:</span>
                  <span>{receiptDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">TIME:</span>
                  <span>{receiptTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">TERMINAL:</span>
                  <span>POS #01 • Counter</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">CUSTOMER:</span>
                  <span className="font-bold truncate max-w-[170px] text-black">{clientName}</span>
                </div>
                {clientPhone && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">PHONE:</span>
                    <span>{clientPhone}</span>
                  </div>
                )}
              </div>

              {/* Dividing Line */}
              <div className="border-b border-dashed border-zinc-400 my-2.5" />

              {/* Items Table Header */}
              <div className="flex justify-between text-[10px] font-bold text-zinc-700 tracking-wider pb-1 border-b border-zinc-300">
                <span className="w-1/2 text-left">ITEM</span>
                <span className="w-1/6 text-center">QTY</span>
                <span className="w-1/3 text-right">PRICE</span>
              </div>

              {/* Item Rows */}
              <div className="flex flex-col gap-2 py-2 text-[11px]">
                {rawItems && rawItems.length > 0 ? (
                  rawItems.map((item: any, idx: number) => {
                    const variantDetails = [item.selectedVariant, item.selectedColor, item.selectedSize ? `Size: ${item.selectedSize}` : null]
                      .filter(Boolean)
                      .join(' • ');

                    const linePrice = (parseFloat(item.price || 0)) * (item.quantity || 1);

                    return (
                      <div key={idx} className="flex justify-between items-start leading-tight">
                        <div className="w-1/2 text-left pr-1">
                          <span className="font-bold text-black block leading-tight">
                            {item.name || order?.design || 'Stitched Item'}
                          </span>
                          {variantDetails && (
                            <span className="text-[9px] text-zinc-500 block mt-0.5">
                              {variantDetails}
                            </span>
                          )}
                        </div>
                        <span className="w-1/6 text-center text-zinc-700 font-semibold">{item.quantity || 1}</span>
                        <span className="w-1/3 text-right font-bold text-black">₱{linePrice.toFixed(2)}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex justify-between items-start leading-tight">
                    <div className="w-1/2 text-left pr-1">
                      <span className="font-bold text-black block">Custom Embroidery Order</span>
                    </div>
                    <span className="w-1/6 text-center text-zinc-700 font-semibold">1</span>
                    <span className="w-1/3 text-right font-bold text-black">₱{totalAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Dividing Line */}
              <div className="border-b border-dashed border-zinc-400 my-2" />

              {/* Financial Totals */}
              <div className="flex flex-col gap-1 text-[11px] text-zinc-700">
                <div className="flex justify-between">
                  <span>SUBTOTAL / VATABLE:</span>
                  <span>₱{vatableSales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT (12%):</span>
                  <span>₱{vatAmount.toFixed(2)}</span>
                </div>
                <div className="border-b-2 border-dashed border-zinc-900 my-1" />
                <div className="flex justify-between text-sm font-black text-black">
                  <span>TOTAL PAID:</span>
                  <span>₱{totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] mt-1 text-zinc-600">
                  <span>PAYMENT METHOD:</span>
                  <span className="font-bold text-black">{paymentMethod}</span>
                </div>
                {(transaction?.transactionID || targetTxId) && (
                  <div className="flex justify-between text-[10px] text-zinc-600">
                    <span>PAYMENT REF:</span>
                    <span className="font-bold text-black">{transaction?.transactionID || targetTxId}</span>
                  </div>
                )}
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>PAYMENT STATUS:</span>
                  <span className="font-bold text-emerald-700">PAID & VERIFIED</span>
                </div>
              </div>

              {/* Store Pick-up Claim Code Box */}
              {isPickup && claimCode && (
                <div className="my-3 py-2 px-3 border-2 border-dashed border-zinc-900 bg-zinc-50 text-center flex flex-col items-center">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-zinc-600">STORE PICK-UP CLAIM CODE</span>
                  <span className="text-xl font-black text-black tracking-widest my-0.5">{claimCode}</span>
                  <span className="text-[8px] text-zinc-500">Present this claim code at the counter for pickup</span>
                </div>
              )}

              {/* Barcode & Security Verification Footer */}
              <div className="mt-4 pt-3 border-t border-dashed border-zinc-400 text-center flex flex-col items-center gap-1">
                {/* Visual Barcode Graphic */}
                <div className="flex items-center justify-center gap-[2px] h-8 my-1 text-black overflow-hidden">
                  {[2, 1, 3, 1, 4, 2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 1, 4, 2, 1, 3, 2, 4, 1, 2, 3, 1, 2, 4, 1].map((w, i) => (
                    <span
                      key={i}
                      className="bg-black h-full inline-block"
                      style={{ width: `${w}px` }}
                    />
                  ))}
                </div>
                <div className="text-[9px] font-mono tracking-wider text-zinc-600">
                  STITCH-OPT-SECURE-{cleanOrderCode}
                </div>
                <div className="text-[10px] font-bold text-black mt-1">
                  THANK YOU FOR YOUR PURCHASE!
                </div>
                <div className="text-[8.5px] text-zinc-500 max-w-[240px] leading-tight">
                  Official Store Receipt • Valid for Warranty &amp; Counter Pickup
                  <br />
                  Eds Towels &amp; Caps • Pacific Mall Lucena
                </div>
              </div>

              {/* Serrated paper edge indicator bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[repeating-linear-gradient(45deg,#e4e4e7,#e4e4e7_4px,#ffffff_4px,#ffffff_8px)] opacity-80" />
            </div>

            {/* Modal Actions */}
            <div className="w-full flex items-center justify-between gap-2.5 pt-2 border-t border-border-glass print:hidden">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-text-dim hover:text-text-main border border-border-glass transition-all cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-text-main border border-white/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]"
                title="Print 80mm thermal receipt slip"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-dim">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Print Slip</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="flex-1 py-2.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] disabled:opacity-50"
                title="Download official receipt PDF"
              >
                {isDownloading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Save PDF</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </GlassModal>
  );
}
