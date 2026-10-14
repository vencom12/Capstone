'use client';

import React from 'react';

interface OfficialClaimSlipProps {
  order: any | null;
  onPrint?: () => void;
  showPrintAction?: boolean;
}

export default function OfficialClaimSlip({
  order,
  showPrintAction = true,
}: OfficialClaimSlipProps) {
  if (!order) return null;

  const orderId = order.orderId || order.id || 'N/A';
  const cleanId = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  
  // Personalization & Fulfillment details
  const pers = (order.personalization && typeof order.personalization === 'object') ? order.personalization : {};
  const clientName = pers.claimantName || order.client || order.clientName || 'Customer';
  const clientPhone = pers.claimantPhone || order.phoneNumber || order.user?.phoneNumber || order.clientPhone || '';

  // Verification anti-fraud claim code
  const verificationCode = order.verificationCode || pers.claimCode || (
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
      price: order.grandTotal ? order.grandTotal / (order.quantity || 1) : undefined,
      personalization: {
        text: order.personalizationText || pers.text || '',
        threadColor: { name: order.threadColor || pers.color || '' },
      }
    }];
  }

  const totalQuantity = itemsList.length > 0
    ? itemsList.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 1), 0)
    : (order.quantity || 1);

  const grandTotal = parseFloat(order.grandTotal ?? order.totalAmount ?? order.amount ?? 0);
  const paymentMethod = (order.paymentMethod || 'GCash').toUpperCase();
  const isPaid = (order.paymentStatus || 'paid').toLowerCase() === 'paid';
  const paymentRef = pers.referenceNumber || order.receipt?.referenceId || (order as any).referenceNumber || '';

  const rawStatus = (order.status || '').toLowerCase();
  const orderStatus = (order.status || 'In Queue').toUpperCase();
  const isCanceled = rawStatus.includes('cancel');
  const isReadyForPickup = !isCanceled && rawStatus.includes('ready');
  const isClaimed = !isCanceled && (rawStatus === 'completed' || rawStatus === 'order delivered' || Number(order.progress) >= 100);
  const isInProduction = !isCanceled && !isReadyForPickup && !isClaimed;

  const readyEstimate = isCanceled ? 'CANCELLED (VOID)' : (order.readyBy || (order.estimatedTime
    ? `~${order.estimatedTime} mins`
    : '~15–20 mins'));

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

  const trackUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/track?id=${encodeURIComponent(orderId)}`
    : `http://localhost:3000/track?id=${encodeURIComponent(orderId)}`;

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
          <title>Claim Slip - ${orderId}</title>
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
              padding: 8px 6px;
              font-family: monospace;
              font-size: 11px;
              line-height: 1.3;
              text-align: center;
            }
            .border-b-dashed { border-bottom: 1px dashed #555; }
            .border-t-dashed { border-top: 1px dashed #555; }
            .py-1 { padding-top: 4px; padding-bottom: 4px; }
            .py-2 { padding-top: 8px; padding-bottom: 8px; }
            .pb-2 { padding-bottom: 8px; }
            .pt-2 { padding-top: 8px; }
            .flex { display: flex; }
            .flex-col { flex-direction: column; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .font-extrabold { font-weight: 800; }
            .font-black { font-weight: 900; }
            .uppercase { text-transform: uppercase; }
            .text-xs { font-size: 11px; }
            .text-sm { font-size: 13px; }
            .text-base { font-size: 15px; }
            .text-2xl { font-size: 22px; }
            .text-zinc-600 { color: #52525b; }
            .text-zinc-700 { color: #3f3f46; }
            .text-zinc-800 { color: #27272a; }
            .bg-emerald-100 { background-color: #d1fae5; }
            .text-emerald-800 { color: #065f46; }
            .qr-code { width: 90px; height: 90px; margin: 4px auto; display: block; }
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted shrink-0">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <path d="M6 14h12v8H6z" />
            </svg>
            <div>
              <p className="font-bold text-text-main m-0">
                {isCanceled
                  ? 'Order Voided (Cancelled)'
                  : isReadyForPickup
                    ? 'Counter Claim Slip (Ready for Pick-up)'
                    : isClaimed
                      ? 'Order Receipt & Claim Record'
                      : 'Order Ticket & Intake Receipt'}
              </p>
              <p className="text-[0.7rem] text-text-dim m-0">
                {isCanceled
                  ? 'Order cancelled • Production stopped'
                  : isReadyForPickup
                    ? 'Items ready for claiming at Pacific Mall Lucena ground floor counter'
                    : isClaimed
                      ? 'Order completed and released to customer'
                      : 'Standard 80mm thermal receipt • Keep for counter pick-up'}
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
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-text-main font-bold text-xs transition-all cursor-pointer border border-border-glass shadow-sm flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>{isClaimed ? 'Print Receipt' : isReadyForPickup ? 'Print Claim Slip' : 'Print Ticket'}</span>
            </button>
          )}
        </div>
      )}

      {/* Official Standard 80mm Thermal Claim Slip Card */}
      <div
        id={`official-claim-slip-${orderId}`}
        className="bg-white text-zinc-950 p-5 rounded-xl font-mono text-center flex flex-col gap-2.5 text-xs border border-zinc-300 shadow-md select-all print:border-none print:shadow-none print:p-0 print:m-0 print:w-full"
      >
        {/* Brand Header */}
        <div className="border-b border-dashed border-zinc-400 pb-2 flex flex-col items-center">
          <div className="text-[10px] font-bold tracking-widest uppercase text-zinc-700">
            CLAIM STUB &amp; INTAKE RECEIPT
          </div>
          <div className="text-base font-extrabold text-black mt-0.5 tracking-wider">
            EDS TOWELS &amp; CAPS
          </div>
          <div className="text-[10px] text-zinc-600">
            Pacific Mall Lucena • Ground Floor
          </div>
          <div className="text-[9px] text-zinc-500 mt-0.5">
            M.L. Tagarao St., Lucena City • Tel: 0928 810 3928
          </div>
        </div>

        {/* Claim Ticket & Queue Status */}
        <div className="py-2 border-b border-dashed border-zinc-400 flex flex-col items-center">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600 font-bold">
            {isClaimed ? 'TRANSACTION RECORD' : isReadyForPickup ? 'CLAIM TICKET NUMBER' : 'ORDER TICKET NUMBER'}
          </div>
          <div className="text-2xl font-black text-black tracking-widest my-0.5">
            #{orderId}
          </div>

          {isCanceled ? (
            <div className="bg-red-50 border border-red-300 text-red-700 font-bold p-2 my-1.5 rounded text-xs tracking-wider uppercase w-full">
              VOID — ORDER CANCELLED
              <div className="text-[9px] font-normal normal-case text-red-600 mt-0.5">
                Production stopped. Not valid for pickup or fulfillment.
              </div>
            </div>
          ) : isReadyForPickup ? (
            <div className="bg-zinc-100 border border-zinc-400 text-zinc-950 font-bold p-2 my-1.5 rounded text-xs tracking-wider uppercase w-full">
              STATUS: READY FOR PICK-UP
              <div className="text-[9.5px] font-normal normal-case text-zinc-700 mt-0.5">
                Present this Claim Ticket &amp; Counter Claim Code at Eds Towels &amp; Caps, Ground Floor, Pacific Mall Lucena.
              </div>
            </div>
          ) : isClaimed ? (
            <div className="bg-zinc-100 border border-zinc-300 text-zinc-900 font-bold p-2 my-1.5 rounded text-xs tracking-wider uppercase w-full">
              STATUS: CLAIMED &amp; COMPLETED
              <div className="text-[9.5px] font-normal normal-case text-zinc-600 mt-0.5">
                Order fulfilled and released at Eds Towels counter. This document serves as your official receipt.
              </div>
            </div>
          ) : (
            <div className="bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold p-2 my-1.5 rounded text-xs tracking-wider uppercase w-full">
              STATUS: IN PRODUCTION
              <div className="text-[9.5px] font-normal normal-case text-zinc-600 mt-0.5">
                Stitching in progress. Please wait for the ready notification before claiming at the counter.
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-semibold text-zinc-800">
              Status: <strong className="uppercase">{orderStatus}</strong>
            </span>
            <span className="text-[9px] text-zinc-500">• Ready: {readyEstimate}</span>
          </div>
          <div className="text-[9px] text-zinc-500 mt-0.5">
            Placed: {formattedDate}
          </div>
        </div>

        {/* Claimant & Stitched Items Block */}
        <div className="text-left flex flex-col gap-1.5 py-2 text-[11px] border-b border-dashed border-zinc-400">
          <div className="flex justify-between items-baseline">
            <span className="text-zinc-600 shrink-0">Claimant:</span>
            <span className="font-bold text-black text-right truncate max-w-[190px]">{clientName}</span>
          </div>
          {clientPhone && (
            <div className="flex justify-between items-baseline">
              <span className="text-zinc-600 shrink-0">Phone:</span>
              <span className="font-bold text-black font-mono">{clientPhone}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline">
            <span className="text-zinc-600 shrink-0">Pickup Counter:</span>
            <span className="font-bold text-black text-right">Pacific Mall Studio</span>
          </div>

          {/* Stitched Items List */}
          <div className="border-t border-dashed border-zinc-300 pt-1.5 mt-1 flex flex-col gap-1.5">
            <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">
              Stitched Item Details ({totalQuantity} total):
            </span>
            {itemsList.length > 0 ? (
              itemsList.map((item: any, idx: number) => {
                const itemPers = item.personalization || {};
                const customText = itemPers.text || pers.text || '';
                const threadName = itemPers.threadColor?.name || itemPers.color || pers.color || '';
                const fontName = itemPers.font?.name || pers.font || '';
                const variantName = item.selectedVariant || item.variant || '';

                return (
                  <div key={idx} className="flex flex-col gap-0.5 bg-zinc-50 p-1.5 rounded border border-zinc-200">
                    <div className="flex justify-between items-baseline">
                      <span className="font-bold text-black">
                        {item.quantity || 1}x {item.name || 'Embroidered Item'}
                      </span>
                      {item.price !== undefined && (
                        <span className="font-mono text-zinc-800">
                          ₱{(Number(item.price) * (Number(item.quantity) || 1)).toFixed(2)}
                        </span>
                      )}
                    </div>
                    {variantName && (
                      <span className="text-[9px] text-zinc-600">
                        Option: {variantName}
                      </span>
                    )}
                    {customText && (
                      <div className="text-[9.5px] text-zinc-800 font-semibold italic">
                        Embroidery: "{customText}"
                        {threadName && <span className="not-italic text-zinc-500 text-[9px]"> ({threadName})</span>}
                        {fontName && <span className="not-italic text-zinc-500 text-[9px]"> • {fontName}</span>}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="flex justify-between">
                <span className="font-bold text-black">{order.design || 'Custom Embroidery'}</span>
                <span className="font-mono text-black">1x</span>
              </div>
            )}
          </div>

          {/* Anti-Fraud Verification Box */}
          <div className="flex justify-between items-center bg-zinc-100 p-1.5 rounded border border-zinc-300 mt-1">
            <span className="text-[10px] font-bold text-zinc-700">Counter Claim Code:</span>
            <span className="font-mono font-black text-xs text-black px-1.5 py-0.5 bg-white border border-zinc-400 rounded">
              {verificationCode}
            </span>
          </div>
        </div>

        {/* Financial & Payment Summary */}
        <div className="flex flex-col gap-1 py-1.5 text-[11px] border-b border-dashed border-zinc-400">
          <div className="flex justify-between font-bold text-xs">
            <span>TOTAL AMOUNT:</span>
            <span className="font-mono font-black text-sm text-black">₱{grandTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-zinc-700 text-[10px]">
            <span>Payment Method:</span>
            <span className="font-bold text-black">{paymentMethod}</span>
          </div>
          <div className="flex justify-between text-zinc-700 text-[10px]">
            <span>Payment Status:</span>
            <span className={`font-bold ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isPaid ? 'PAID IN FULL' : 'PENDING PAYMENT'}
            </span>
          </div>
          {paymentRef && (
            <div className="flex justify-between text-zinc-600 text-[9px]">
              <span>Payment Reference:</span>
              <span className="font-mono text-zinc-800">{paymentRef}</span>
            </div>
          )}
        </div>

        {/* Dynamic Live Mobile Tracking QR Code */}
        <div className="py-2 border-b border-dashed border-zinc-400 flex flex-col items-center justify-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data=${encodeURIComponent(trackUrl)}`}
            alt="Track Order QR Code"
            className="w-20 h-20 border border-zinc-300 p-0.5 bg-white rounded shadow-xs"
          />
          <div className="text-[9px] font-bold text-zinc-800 uppercase tracking-wider mt-0.5">
            Scan to Track Live Queue on Phone
          </div>
          <div className="text-[8px] text-zinc-500 font-mono">
            /track?id={orderId}
          </div>
        </div>

        {/* Official Store Policy Footer */}
        <div className={`pt-1 text-[9.5px] font-bold uppercase leading-snug ${isCanceled ? 'text-red-600' : 'text-zinc-700'}`}>
          {isCanceled
            ? 'THIS CLAIM SLIP HAS BEEN VOIDED — ORDER CANCELLED'
            : isReadyForPickup
              ? 'Ready for pickup • Please present counter claim code upon arrival'
              : isClaimed
                ? 'Official Transaction & Claim Record • Order Completed'
                : 'Intake Receipt • Present counter claim code once notified ready'}
          <div className="font-normal normal-case text-zinc-500 text-[8.5px] mt-0.5">
            {isCanceled
              ? 'Order cancelled • Not valid for pickup at Pacific Mall Lucena Counter'
              : 'Strict anti-fraud counter protection • Eds Towels & Caps, Ground Floor, Pacific Mall Lucena'}
          </div>
        </div>
      </div>
    </div>
  );
}
