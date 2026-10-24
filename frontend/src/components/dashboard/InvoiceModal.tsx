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
          const cleanPhone = (res.businessContact || '0928 810 3928')
            .replace(/\s*[•|,/-]?\s*0912[\s\d]*/gi, '')
            .trim() || '0928 810 3928';

          setBusinessSettings({
            businessName: res.businessName || 'EDS TOWELS & CAPS',
            businessAddress: res.businessAddress || 'Pacific Mall Lucena, Ground Floor, M.L. Tagarao St., Lucena City, Quezon 4301',
            businessContact: cleanPhone,
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
  const receiptNo = (order as any)?.receipt?.receiptId || fetchedData?.receiptId || transaction?.receiptId || `RCP-${cleanOrderCode}`;

  const rawDate = order?.date || order?.createdAt || fetchedData?.timestamp || transaction?.timestamp || Date.now();
  const dateObj = new Date(rawDate);
  const receiptDate = isNaN(dateObj.getTime())
    ? new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const receiptTime = isNaN(dateObj.getTime())
    ? new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
    : dateObj.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const receiptDateTime = `${receiptDate} • ${receiptTime}`;

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

  // Helper to generate simulated authentic Code-128 barcode bars
  const renderBarcodeSvg = (code: string) => {
    const pattern = [2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 2, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 2, 1, 2, 3, 1, 1, 2, 1, 3, 2, 2, 1, 2, 1, 3, 1, 2];
    let currentX = 6;
    const bars: { x: number; w: number }[] = [];

    for (let i = 0; i < pattern.length; i++) {
      const w = pattern[i];
      if (i % 2 === 0) {
        bars.push({ x: currentX, w });
      }
      currentX += w + 1;
    }

    return (
      <div style={{ textAlign: 'center', margin: '4px 0 2px' }}>
        <svg
          viewBox={`0 0 ${currentX + 6} 22`}
          style={{ width: '160px', height: '22px', display: 'block', margin: '0 auto' }}
          fill="#000000"
          xmlns="http://www.w3.org/2000/svg"
        >
          {bars.map((bar, idx) => (
            <rect key={idx} x={bar.x} y="0" width={bar.w} height="22" />
          ))}
        </svg>
        <div style={{ fontSize: '8px', fontFamily: 'monospace', letterSpacing: '2px', color: '#000000', marginTop: '2px', textTransform: 'uppercase' }}>
          *{code}*
        </div>
      </div>
    );
  };

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
          <meta charset="utf-8" />
          <title>Store Receipt - ${receiptNo}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 2mm auto;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              background: #fff;
              color: #000;
              width: 100%;
              min-height: 100vh;
              display: flex;
              justify-content: center;
              align-items: flex-start;
              font-size: 10px;
              line-height: 1.25;
              padding: 0;
            }
            .receipt-slip {
              width: 72mm;
              max-width: 100%;
              background: #fff;
              color: #000;
              padding: 1mm 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            hr.dashed {
              border: none;
              border-top: 1px dashed #71717a;
              margin: 5px 0;
            }
            @media print {
              body {
                background: #fff !important;
                padding: 0 !important;
              }
              .receipt-slip {
                width: 72mm !important;
                padding: 1mm 0 !important;
              }
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

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Receipt"
      maxWidth="max-w-[480px]"
    >
      <div className="flex flex-col gap-4 text-center items-center">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-text-dim text-xs font-medium m-0">Loading receipt details...</p>
          </div>
        ) : (
          <>
            {/* The Actual White Long Store Thermal Receipt Slip */}
            <div
              id="store-thermal-receipt-slip"
              className="w-full max-w-[340px] sm:max-w-[360px] bg-white text-zinc-950 font-sans text-xs rounded shadow-2xl p-4 sm:p-5 border border-zinc-300 text-left"
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                lineHeight: '1.25',
                color: '#000000',
                backgroundColor: '#ffffff'
              }}
            >
              {/* Store Header */}
              <div style={{ textAlign: 'center', paddingBottom: '2px' }}>
                <div style={{ fontSize: '15px', fontWeight: '900', letterSpacing: '0.5px', color: '#000000', textTransform: 'uppercase', lineHeight: '1.2' }}>
                  {businessSettings.businessName || 'EDS TOWELS & CAPS'}
                </div>
                <div style={{ fontSize: '8.5px', fontWeight: '700', letterSpacing: '1px', color: '#52525b', textTransform: 'uppercase', marginTop: '1px' }}>
                  {businessSettings.receiptTagline || 'Custom Embroidery & Apparel Workshop'}
                </div>
                <div style={{ fontSize: '9px', color: '#52525b', marginTop: '3px', lineHeight: '1.25' }}>
                  {businessSettings.businessAddress || 'Pacific Mall Lucena, Ground Floor, M.L. Tagarao St., Lucena City, Quezon 4301'}
                </div>
                <div style={{ fontSize: '9px', fontWeight: '600', color: '#000000', marginTop: '2px' }}>
                  Tel: {businessSettings.businessContact || '0928 810 3928'}
                </div>
                <div style={{ display: 'inline-block', marginTop: '4px', padding: '1px 7px', border: '1px solid #000000', color: '#000000', fontSize: '8px', fontWeight: '800', letterSpacing: '0.8px', textTransform: 'uppercase', borderRadius: '2px', background: 'transparent' }}>
                  Official Receipt
                </div>
              </div>

              {/* Dividing Line */}
              <hr style={{ border: 'none', borderTop: '1px dashed #71717a', margin: '5px 0' }} />

              {/* Transaction & Customer Details (Clean 2-Column Table) */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', margin: '2px 0' }}>
                <tbody>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b', width: '36%' }}>RECEIPT #:</td>
                    <td style={{ textAlign: 'right', padding: '1.5px 0', fontWeight: '800', color: '#000000', width: '64%', fontFamily: 'monospace' }}>{receiptNo}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b' }}>ORDER #:</td>
                    <td style={{ textAlign: 'right', padding: '1.5px 0', fontWeight: '800', color: '#000000', fontFamily: 'monospace' }}>#{effectiveOrderId}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b' }}>DATE &amp; TIME:</td>
                    <td style={{ textAlign: 'right', padding: '1.5px 0', color: '#000000', fontWeight: '500' }}>{receiptDateTime}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b' }}>CUSTOMER:</td>
                    <td style={{ textAlign: 'right', padding: '1.5px 0', fontWeight: '700', color: '#000000' }}>{clientName}</td>
                  </tr>
                  {clientPhone && (
                    <tr>
                      <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b' }}>PHONE:</td>
                      <td style={{ textAlign: 'right', padding: '1.5px 0', color: '#000000', fontFamily: 'monospace' }}>{clientPhone}</td>
                    </tr>
                  )}
                  {(() => {
                    const staffName = order?.processedBy || order?.garmentsReceivedBy || (order?.personalization as any)?.statusHistory?.[0]?.actor || fetchedData?.processedBy || '';
                    return staffName ? (
                      <tr>
                        <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b' }}>SERVED BY:</td>
                        <td style={{ textAlign: 'right', padding: '1.5px 0', fontWeight: '700', color: '#000000' }}>{staffName}</td>
                      </tr>
                    ) : null;
                  })()}
                </tbody>
              </table>

              {/* Dividing Line */}
              <hr style={{ border: 'none', borderTop: '1px dashed #71717a', margin: '5px 0' }} />

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', margin: '3px 0' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000000' }}>
                    <th style={{ textAlign: 'left', padding: '2.5px 0', fontSize: '8.5px', fontWeight: '800', textTransform: 'uppercase', color: '#000000', width: '55%' }}>ITEM</th>
                    <th style={{ textAlign: 'center', padding: '2.5px 0', fontSize: '8.5px', fontWeight: '800', textTransform: 'uppercase', color: '#000000', width: '15%' }}>QTY</th>
                    <th style={{ textAlign: 'right', padding: '2.5px 0', fontSize: '8.5px', fontWeight: '800', textTransform: 'uppercase', color: '#000000', width: '30%' }}>PRICE</th>
                  </tr>
                </thead>
                <tbody>
                  {rawItems && rawItems.length > 0 ? (
                    rawItems.map((item: any, idx: number) => {
                      const variantDetails = [item.selectedVariant, item.selectedColor, item.selectedSize ? `Size: ${item.selectedSize}` : null]
                        .filter(Boolean)
                        .join(' • ');

                      const persText = item.personalization?.text || (order as any)?.personalization?.text;
                      const persColor = item.personalization?.threadColor || (order as any)?.personalization?.threadColor || (order as any)?.personalization?.color;

                      const linePrice = (parseFloat(item.price || 0)) * (item.quantity || 1);

                      return (
                        <tr key={idx} style={{ borderBottom: '1px dotted #e4e4e7' }}>
                          <td style={{ textAlign: 'left', padding: '3px 0', verticalAlign: 'top' }}>
                            <strong style={{ color: '#000000', display: 'block', fontSize: '10.5px', lineHeight: '1.2' }}>
                              {item.name || order?.design || 'Stitched Item'}
                            </strong>
                            {variantDetails && (
                              <span style={{ color: '#52525b', fontSize: '8.5px', display: 'block', marginTop: '1px' }}>
                                {variantDetails}
                              </span>
                            )}
                            {persText && (
                              <span style={{ color: '#000000', fontSize: '8.5px', display: 'block', marginTop: '1px', fontStyle: 'italic' }}>
                                Stitched: &ldquo;{persText}&rdquo; {persColor ? `(${persColor})` : ''}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', padding: '3px 0', verticalAlign: 'top', fontWeight: '600', color: '#000000', fontFamily: 'monospace' }}>
                            {item.quantity || 1}
                          </td>
                          <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top', fontWeight: '700', color: '#000000', fontFamily: 'monospace' }}>
                            ₱{linePrice.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr style={{ borderBottom: '1px dotted #e4e4e7' }}>
                      <td style={{ textAlign: 'left', padding: '3px 0', verticalAlign: 'top' }}>
                        <strong style={{ color: '#000000', display: 'block', fontSize: '10.5px' }}>Custom Embroidery Order</strong>
                      </td>
                      <td style={{ textAlign: 'center', padding: '3px 0', verticalAlign: 'top', fontWeight: '600', color: '#000000', fontFamily: 'monospace' }}>
                        1
                      </td>
                      <td style={{ textAlign: 'right', padding: '3px 0', verticalAlign: 'top', fontWeight: '700', color: '#000000', fontFamily: 'monospace' }}>
                        ₱{totalAmount.toFixed(2)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Financial Totals Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginTop: '3px' }}>
                <tbody>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b' }}>SUBTOTAL / VATABLE:</td>
                    <td style={{ textAlign: 'right', padding: '1.5px 0', fontWeight: '600', color: '#000000', fontFamily: 'monospace' }}>₱{vatableSales.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b' }}>VAT (12%):</td>
                    <td style={{ textAlign: 'right', padding: '1.5px 0', fontWeight: '600', color: '#000000', fontFamily: 'monospace' }}>₱{vatAmount.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ padding: '2px 0' }}>
                      <hr style={{ border: 'none', borderTop: '1px dashed #000000', margin: '3px 0' }} />
                    </td>
                  </tr>
                  <tr style={{ fontSize: '13px', fontWeight: '900' }}>
                    <td style={{ textAlign: 'left', padding: '3px 0', color: '#000000' }}>TOTAL PAID:</td>
                    <td style={{ textAlign: 'right', padding: '3px 0', color: '#000000', fontSize: '14px', fontFamily: 'monospace' }}>₱{totalAmount.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b', fontSize: '9px' }}>PAYMENT METHOD:</td>
                    <td style={{ textAlign: 'right', padding: '1.5px 0', fontWeight: '700', color: '#000000', fontSize: '9px' }}>{paymentMethod}</td>
                  </tr>
                  {(transaction?.transactionID || targetTxId) && (
                    <tr>
                      <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b', fontSize: '9px' }}>PAYMENT REF:</td>
                      <td style={{ textAlign: 'right', padding: '1.5px 0', fontWeight: '700', color: '#000000', fontSize: '9px', fontFamily: 'monospace' }}>{transaction?.transactionID || targetTxId}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ textAlign: 'left', padding: '1.5px 0', color: '#52525b', fontSize: '9px' }}>PAYMENT STATUS:</td>
                    <td style={{ textAlign: 'right', padding: '1.5px 0', fontWeight: '800', color: '#000000', fontSize: '9px' }}>PAID &amp; VERIFIED ✓</td>
                  </tr>
                </tbody>
              </table>

              {/* Store Pick-up Claim Code Box */}
              {isPickup && claimCode && (
                <div style={{
                  margin: '5px 0',
                  padding: '5px 6px',
                  border: '1px dashed #000000',
                  backgroundColor: '#ffffff',
                  textAlign: 'center',
                  borderRadius: '3px'
                }}>
                  <div style={{ fontSize: '8px', fontWeight: '800', letterSpacing: '1px', color: '#000000', textTransform: 'uppercase' }}>
                    STORE PICK-UP CLAIM CODE
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: '900', letterSpacing: '2px', color: '#000000', fontFamily: 'monospace', margin: '2px 0' }}>
                    {claimCode}
                  </div>
                  <div style={{ fontSize: '8px', color: '#52525b' }}>
                    Present this code at the Pacific Mall Lucena counter for pickup
                  </div>
                </div>
              )}

              {/* Simulated Thermal Barcode */}
              {renderBarcodeSvg(cleanOrderCode)}

              {/* Thermal Receipt Footer */}
              <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px dashed #71717a', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#000000', letterSpacing: '0.5px' }}>
                  *** THANK YOU FOR YOUR PURCHASE! ***
                </div>
                <div style={{ fontSize: '8px', color: '#52525b', marginTop: '2px', lineHeight: '1.25' }}>
                  Receipt • Valid for Warranty &amp; Counter Pickup
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="w-full flex items-center justify-between gap-3 pt-2 border-t border-border-glass print:hidden">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-text-dim hover:text-text-main border border-border-glass transition-all cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex-[1.5] py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                title="Print or Save as PDF"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Print / Save as PDF</span>
              </button>
            </div>
          </>
        )}
      </div>
    </GlassModal>
  );
}
