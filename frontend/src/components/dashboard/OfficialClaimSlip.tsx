'use client';

import React from 'react';

interface OfficialClaimSlipProps {
  order: any | null;
  onPrint?: () => void;
  showPrintAction?: boolean;
  mode?: 'auto' | 'claim_slip' | 'receipt';
}

function toSafeString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object' && typeof val.name === 'string') return val.name;
  return '';
}

export default function OfficialClaimSlip({
  order,
  showPrintAction = true,
  mode = 'auto',
}: OfficialClaimSlipProps) {
  if (!order) return null;

  const orderId = order.orderId || order.id || 'N/A';
  const cleanId = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();

  // Personalization & Fulfillment details
  const pers = (order.personalization && typeof order.personalization === 'object') ? order.personalization : {};
  const clientName = toSafeString(pers.claimantName || order.client || order.clientName) || 'Walk-In Customer';

  // Verification anti-fraud claim code
  const claimCode = order.verificationCode || pers.claimCode || (
    orderId.startsWith('WI-')
      ? `#${orderId.replace('WI-', 'A-')}`
      : `#A-${cleanId.slice(-4)}`
  );

  // Items extraction
  let itemsList: any[] = [];
  if (Array.isArray(order.items) && order.items.length > 0) {
    itemsList = order.items;
  } else if (typeof order.items === 'string') {
    try {
      itemsList = JSON.parse(order.items);
    } catch {
      itemsList = [];
    }
  } else if (order.itemName) {
    itemsList = [{
      name: order.itemName,
      quantity: order.quantity || 1,
      price: order.price || order.totalAmount || 0,
      selectedVariant: order.selectedVariant || pers.variant || '',
      personalization: {
        text: order.personalizationText || pers.text || '',
        threadColor: { name: order.threadColor || pers.color || '' },
      }
    }];
  }

  const totalQuantity = itemsList.length > 0
    ? itemsList.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 1), 0)
    : (order.quantity || 1);

  const rawStatus = (order.status || '').toLowerCase();
  const isCanceled = rawStatus.includes('cancel');

  const orderDate = new Date(order.date || (order as any).createdAt || Date.now());
  const formattedDate = isNaN(orderDate.getTime())
    ? new Date().toLocaleDateString('en-PH')
    : orderDate.toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

  // Check if order has any custom embroidery
  const hasCustomEmbroidery = Boolean(
    (order.personalizationText && order.personalizationText.trim() && !order.personalizationText.toLowerCase().includes('plain') && order.personalizationText.trim() !== 'None') ||
    (pers.text && pers.text.trim() && !pers.text.toLowerCase().includes('plain')) ||
    itemsList.some((item: any) => {
      const itemText = item.personalization?.text || '';
      return itemText && itemText.trim() && !itemText.toLowerCase().includes('plain') && itemText.trim() !== 'None';
    })
  );

  const isHoldForPickup = Boolean(order.isHoldForPickup || pers.isHoldForPickup);

  // If mode is 'auto', direct off-the-shelf sales (plain walk-ins with no pickup hold) render the Official Sales Receipt
  const isDirectSale = mode === 'receipt' ? true : (
    mode === 'claim_slip' ? false : Boolean(
      order.isDirectSale ||
      (!hasCustomEmbroidery && !isHoldForPickup && (
        rawStatus === 'completed' ||
        rawStatus === 'order delivered' ||
        order.deliveryTime?.includes('Direct Handover') ||
        order.deliveryTime?.includes('Completed On-Site') ||
        Number(order.progress) >= 100
      ))
    )
  );

  // Estimated Ready to Pick Up Time (for pickup/embroidery claim slips only)
  const createdTime = orderDate.getTime();
  const rawDue = order.dueDate || pers.estimatedReadyDate;
  const isCorruptedDue = rawDue && !isNaN(createdTime) && new Date(rawDue).getTime() < createdTime;
  const effectiveDue = isCorruptedDue ? pers.estimatedReadyDate : (rawDue || pers.estimatedReadyDate);

  let estimatedReadyFormatted = '';
  if (effectiveDue) {
    const dueDateObj = new Date(effectiveDue);
    if (!isNaN(dueDateObj.getTime())) {
      estimatedReadyFormatted = dueDateObj.toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
  }

  if (!estimatedReadyFormatted) {
    const estMinutes = Number(order.estimatedTime) || (order.isRush ? 15 : 30);
    const fallbackDueDate = new Date((!isNaN(createdTime) ? createdTime : Date.now()) + estMinutes * 60 * 1000);
    estimatedReadyFormatted = fallbackDueDate.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Financial calculations
  const totalAmount = Number(order.totalAmount || order.amount || 0);
  const calculatedItemsTotal = itemsList.reduce((sum: number, it: any) => {
    const qty = Number(it.quantity) || 1;
    const p = Number(it.price || it.unitPrice || 0);
    return sum + (p * qty);
  }, 0);
  const effectiveTotal = totalAmount > 0 ? totalAmount : calculatedItemsTotal;
  const paymentMethod = order.paymentMethod || 'Cash';

  const handlePrint = () => {
    const slipElement = document.getElementById(`official-claim-slip-${orderId}`);
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
          <title>${isDirectSale ? `Sales Receipt - #${orderId}` : `Claim Slip - ${claimCode}`}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 4mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
              background: #fff;
              color: #000;
              width: 100%;
              display: flex;
              justify-content: center;
              align-items: flex-start;
            }
            .slip-card {
              width: 80mm;
              max-width: 100%;
              background: #fff;
              color: #000;
              padding: 10px 8px;
              font-family: monospace;
              font-size: 11px;
              line-height: 1.35;
              text-align: center;
            }
            .border-b-dashed { border-bottom: 1.5px dashed #333; }
            .py-2 { padding-top: 8px; padding-bottom: 8px; }
            .my-2 { margin-top: 8px; margin-bottom: 8px; }
            .flex { display: flex; }
            .flex-col { flex-direction: column; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .font-black { font-weight: 900; }
            .uppercase { text-transform: uppercase; }
            .text-2xl { font-size: 24px; }
            .text-3xl { font-size: 28px; }
            .w-full { width: 100%; }
          </style>
        </head>
        <body>
          <div class="slip-card">
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
    <div className="flex flex-col gap-3 font-sans text-text-main">
      {/* Helper Action Header */}
      {showPrintAction && (
        <div className="bg-bg-surface border border-border-glass rounded-xl p-3 text-xs flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isDirectSale
                ? 'bg-white/5 border border-border-glass text-text-main'
                : 'bg-primary/10 border border-primary/25 text-primary'
            }`}>
              {isDirectSale ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="7" y1="7" x2="7.01" y2="7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div>
              <p className="font-bold text-text-main m-0">
                {isDirectSale ? 'Official Sales Receipt' : 'Counter Claim Slip'}
              </p>
              <p className="text-[0.7rem] text-text-dim m-0">
                {isDirectSale ? (
                  <>Receipt Ref: <strong className="text-text-main font-mono">#{orderId}</strong> • Direct Sale Handover</>
                ) : (
                  <>Claim code: <strong className="text-primary font-mono">{claimCode}</strong> • Order #{orderId}</>
                )}
              </p>
            </div>
          </div>
          {isCanceled ? (
            <span className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 font-bold text-xs border border-red-500/25">
              Voided
            </span>
          ) : (
            <button
              type="button"
              onClick={handlePrint}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer border shadow-sm flex items-center gap-1.5 ${
                isDirectSale
                  ? 'bg-white/5 hover:bg-white/10 text-text-main border-border-glass'
                  : 'bg-primary hover:bg-primary/90 text-white border-primary'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>{isDirectSale ? 'Print Sales Receipt' : 'Print Claim Slip'}</span>
            </button>
          )}
        </div>
      )}

      {/* Slip / Receipt Card */}
      <div
        id={`official-claim-slip-${orderId}`}
        className="bg-white text-zinc-950 p-6 rounded-2xl font-mono text-center flex flex-col gap-3 text-xs border border-zinc-300 shadow-md select-all print:border-none print:shadow-none print:p-0 print:m-0 print:w-full"
      >
        {isDirectSale ? (
          /* ========================================================= */
          /* DIRECT SALE OFFICIAL RECEIPT (PLAIN WALK-IN NO EMBROIDERY)*/
          /* ========================================================= */
          <>
            {/* Direct Sale Header */}
            <div className="border-b border-dashed border-zinc-400 pb-2.5 flex flex-col items-center">
              <div className="text-[10px] font-bold tracking-widest uppercase text-zinc-600">
                OFFICIAL SALES RECEIPT
              </div>
              <div className="text-lg font-black text-black mt-0.5 tracking-wider">
                EDS TOWELS &amp; CAPS
              </div>
              <div className="text-[10px] text-zinc-600">
                Pacific Mall Lucena • Ground Floor Counter
              </div>
              <div className="text-[9px] text-zinc-500 mt-0.5">
                M.L. Tagarao St., Lucena City • 0928 810 3928
              </div>
            </div>

            {/* Direct Sale Status Badge */}
            <div className="py-2 border-b border-dashed border-zinc-400 flex flex-col items-center gap-1 bg-zinc-50 rounded-lg border border-zinc-200">
              <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">
                TRANSACTION TYPE
              </span>
              <div className="text-xs font-black text-emerald-700 uppercase tracking-wide">
                ✓ DIRECT SALE • PAID IN FULL
              </div>
              <div className="text-[10px] text-zinc-600">
                Off-the-shelf garment handed over at counter
              </div>
            </div>

            {/* Transaction Details */}
            <div className="text-left flex flex-col gap-1.5 py-2 text-[11px] border-b border-dashed border-zinc-400">
              <div className="flex justify-between items-baseline">
                <span className="text-zinc-600">Receipt / Ref #:</span>
                <span className="font-bold text-black font-mono">#{orderId}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-zinc-600">Customer:</span>
                <span className="font-bold text-black text-right truncate max-w-[190px]">{clientName}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-zinc-600">Date &amp; Time:</span>
                <span className="text-zinc-800 text-right">{formattedDate}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-zinc-600">Payment Method:</span>
                <span className="font-bold text-black text-right">{paymentMethod}</span>
              </div>
            </div>

            {/* Items Purchased List */}
            <div className="text-left flex flex-col gap-2 py-2 border-b border-dashed border-zinc-400">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-zinc-700 tracking-wider">
                  ITEMS PURCHASED ({totalQuantity}):
                </span>
                <span className="text-[10px] uppercase font-bold text-zinc-500">
                  AMOUNT
                </span>
              </div>
              {itemsList.length > 0 ? (
                itemsList.map((item: any, idx: number) => {
                  const qty = Number(item.quantity) || 1;
                  const itemPrice = Number(item.price || item.unitPrice || (effectiveTotal > 0 && totalQuantity > 0 ? (effectiveTotal / totalQuantity) : 0));
                  const lineTotal = itemPrice > 0 ? itemPrice * qty : 0;
                  const itemName = toSafeString(item.name || item.itemName || order.design) || 'Plain Garment';
                  const variantName = [toSafeString(item.selectedVariant), toSafeString(item.selectedColor), item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');

                  return (
                    <div key={idx} className="flex justify-between items-start bg-zinc-50 p-2 rounded border border-zinc-200">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-black text-xs">
                          {qty}x {itemName}
                        </span>
                        {variantName && (
                          <span className="text-[10px] text-zinc-600">
                            Option: {variantName}
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500">
                          ₱{itemPrice.toFixed(2)} each
                        </span>
                      </div>
                      <span className="font-mono font-bold text-black text-xs">
                        ₱{lineTotal.toFixed(2)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="flex justify-between bg-zinc-50 p-2 rounded border border-zinc-200">
                  <span className="font-bold text-black">{order.design || 'Plain Garment'}</span>
                  <span className="font-mono font-bold text-black">₱{effectiveTotal.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Financial Summary */}
            <div className="text-left flex flex-col gap-1.5 py-2 border-b border-dashed border-zinc-400 text-xs">
              <div className="flex justify-between items-center text-sm font-black text-black">
                <span>TOTAL AMOUNT:</span>
                <span className="font-mono text-base text-black">₱{effectiveTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-zinc-600">
                <span>Amount Paid:</span>
                <span className="font-bold text-black font-mono">₱{effectiveTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-500">
                <span>Payment Status:</span>
                <span className="font-bold text-emerald-700">PAID IN FULL</span>
              </div>
            </div>

            {/* Direct Sale Footer Notice */}
            <div className="pt-1.5 flex flex-col items-center gap-1 text-center">
              <p className="text-[10px] font-bold text-zinc-800 uppercase m-0 leading-tight">
                Thank you for shopping at Eds Towels &amp; Caps!
              </p>
              <p className="text-[9px] text-zinc-500 m-0 leading-tight">
                Direct counter purchase • No claim code required
              </p>
              <p className="text-[8px] text-zinc-400 m-0 leading-tight">
                Please retain this receipt for warranty or returns within 7 days.
              </p>
            </div>
          </>
        ) : (
          /* ========================================================= */
          /* COUNTER CLAIM SLIP (EMBROIDERY ORDERS / ORDERS HELD FOR PICKUP) */
          /* ========================================================= */
          <>
            {/* Header */}
            <div className="border-b border-dashed border-zinc-400 pb-2.5 flex flex-col items-center">
              <div className="text-[10px] font-bold tracking-widest uppercase text-zinc-600">
                COUNTER CLAIM SLIP
              </div>
              <div className="text-lg font-black text-black mt-0.5 tracking-wider">
                EDS TOWELS &amp; CAPS
              </div>
              <div className="text-[10px] text-zinc-600">
                Pacific Mall Lucena • Ground Floor Counter
              </div>
            </div>

            {/* Claim Code Section */}
            <div className="py-2.5 border-b border-dashed border-zinc-400 flex flex-col items-center">
              <span className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">
                CLAIM CODE / NUMBER
              </span>
              <div className="text-3xl font-black text-black font-mono tracking-wider my-1 bg-zinc-100 border border-zinc-300 px-4 py-1.5 rounded-lg w-full">
                {claimCode}
              </div>
              <div className="text-[11px] font-mono text-zinc-700 mt-0.5">
                Order Ref: <strong>#{orderId}</strong>
              </div>
            </div>

            {/* Customer, Placed Time & Estimated Ready Time */}
            <div className="text-left flex flex-col gap-1.5 py-2 text-[11px] border-b border-dashed border-zinc-400">
              <div className="flex justify-between items-baseline">
                <span className="text-zinc-600">Customer:</span>
                <span className="font-bold text-black text-right truncate max-w-[190px]">{clientName}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-zinc-600">Order Placed:</span>
                <span className="text-zinc-800 text-right">{formattedDate}</span>
              </div>
              <div className="flex justify-between items-baseline bg-zinc-100/80 p-1.5 rounded border border-zinc-300 mt-0.5">
                <span className="font-bold text-zinc-900 flex items-center gap-1">
                  <span>⏱</span> Estimated Ready:
                </span>
                <span className="font-bold text-black text-right font-mono">
                  {estimatedReadyFormatted}
                </span>
              </div>
            </div>

            {/* Items Ordered List */}
            <div className="text-left flex flex-col gap-2 py-2 border-b border-dashed border-zinc-400">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-zinc-700 tracking-wider">
                  ITEMS ORDERED ({totalQuantity}):
                </span>
              </div>
              {itemsList.length > 0 ? (
                itemsList.map((item: any, idx: number) => {
                  const itemPers = item.personalization || {};
                  const customText = toSafeString(itemPers.text || pers.text);
                  const threadName = toSafeString(itemPers.threadColor?.name || itemPers.color || pers.color);
                  const fontName = toSafeString(itemPers.font?.name || pers.font);
                  const variantName = [toSafeString(item.selectedVariant), item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');
                  const itemName = toSafeString(item.name || 'Embroidered Item');

                  return (
                    <div key={idx} className="flex flex-col gap-0.5 bg-zinc-50 p-2 rounded border border-zinc-200">
                      <span className="font-bold text-black text-xs">
                        {item.quantity || 1}x {itemName}
                      </span>
                      {variantName && (
                        <span className="text-[10px] text-zinc-600">
                          Option: {variantName}
                        </span>
                      )}
                      {customText && (
                        <div className="text-[10px] text-zinc-800 font-semibold italic mt-0.5">
                          Embroidery: "{customText}"
                          {threadName && <span className="not-italic text-zinc-500"> ({threadName})</span>}
                          {fontName && <span className="not-italic text-zinc-500"> • {fontName}</span>}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="flex justify-between bg-zinc-50 p-2 rounded border border-zinc-200">
                  <span className="font-bold text-black">{order.design || 'Custom Embroidery'}</span>
                  <span className="font-mono text-black">1x</span>
                </div>
              )}
            </div>

            {/* Counter Instructions Footer */}
            <div className="pt-1.5 flex flex-col items-center gap-1">
              <p className="text-[10px] font-bold text-zinc-800 uppercase m-0 leading-tight">
                Present this slip or Claim Code upon pickup
              </p>
              <p className="text-[9px] text-zinc-500 m-0 leading-tight">
                Eds Towels &amp; Caps Counter • Pacific Mall Lucena
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
