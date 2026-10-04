'use client';

import GlassModal from '@/components/ui/GlassModal';
import type { Order } from '@/lib/types';

interface WaybillModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
}

export default function WaybillModal({ isOpen, onClose, order }: WaybillModalProps) {
  if (!order) return null;

  const personalization = (order.personalization && typeof order.personalization === 'object') ? order.personalization as any : {};
  const cleanId = order.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  const isPickup = personalization.fulfillmentType === 'pickup' ||
    (typeof order.address === 'string' && order.address.toLowerCase().includes('pick-up')) ||
    (personalization.courier && personalization.courier.toLowerCase().includes('pick-up')) ||
    (personalization.trackingNumber && personalization.trackingNumber.startsWith('PU-'));

  const trackingNumber = personalization.trackingNumber || null;
  const courierName = isPickup ? 'IN-STORE PICK-UP' : (personalization.courier || 'Delivery Courier');

  // QR code representation for parcel sorting & claiming
  const qrData = `${courierName}|TRACK:${trackingNumber}|ORDER:${order.orderId}|CLIENT:${encodeURIComponent(
    order.client || 'Customer'
  )}|DEST:${encodeURIComponent(order.address || 'Pacific Mall Counter')}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
    qrData
  )}&size=140x140&margin=0`;

  const handlePrint = () => {
    const labelElement = document.getElementById('jnt-thermal-waybill');
    if (!labelElement) {
      window.print();
      return;
    }

    // Create a hidden iframe for 100% isolated print rendering
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
          <title>Shipping Label - ${order.orderId}</title>
          <style>
            @page {
              size: 100mm 150mm;
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
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, monospace;
              background: #fff;
              color: #000;
              padding: 0;
              margin: 0;
              display: flex;
              justify-content: center;
              align-items: flex-start;
            }
            .label-card {
              width: 100mm;
              max-width: 100%;
              border: 2px solid #000;
              border-radius: 8px;
              padding: 10px;
              background: #fff;
              display: flex;
              flex-direction: column;
              gap: 8px;
              font-family: monospace;
              font-size: 11px;
              line-height: 1.25;
            }
            .border-b-2 { border-bottom: 2px solid #000; }
            .border-b { border-bottom: 1px solid #000; }
            .border-t { border-top: 1px solid #000; }
            .border-r-2 { border-right: 2px solid #000; }
            .divide-black > * + * { border-left: 2px solid #000; }
            .flex { display: flex; }
            .flex-col { flex-direction: column; }
            .flex-1 { flex: 1; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: 1fr 1fr; }
            .grid-cols-3 { grid-template-columns: 1fr 1fr 1fr; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .font-black { font-weight: 900; }
            .uppercase { text-transform: uppercase; }
            .text-xs { font-size: 12px; }
            .text-white { color: #fff !important; }
            .bg-black { background-color: #000 !important; color: #fff !important; }
            .bg-emerald-700 { background-color: #047857 !important; color: #fff !important; }
            .bg-\\[\\#e11d48\\] { background-color: #e11d48 !important; color: #fff !important; }
            .p-4 { padding: 8px; }
            .p-1 { padding: 4px; }
            .p-0\\.5 { padding: 2px; }
            .py-1 { padding-top: 4px; padding-bottom: 4px; }
            .py-1\\.5 { padding-top: 6px; padding-bottom: 6px; }
            .py-2 { padding-top: 8px; padding-bottom: 8px; }
            .pb-2 { padding-bottom: 8px; }
            .pt-1 { padding-top: 4px; }
            .pr-1\\.5 { padding-right: 6px; }
            .pl-1\\.5 { padding-left: 6px; }
            .gap-1 { gap: 4px; }
            .gap-1\\.5 { gap: 6px; }
            .gap-2 { gap: 8px; }
            .w-16 { width: 64px; }
            .h-16 { height: 64px; }
            .w-full { width: 100%; }
            .h-12 { height: 48px; }
            svg { display: block; }
          </style>
        </head>
        <body>
          <div class="label-card">
            ${labelElement.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    // Trigger print from the isolated iframe
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 250);
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={isPickup ? "Pick-Up Counter Claim Slip" : "Parcel Shipping & Dispatch Label (4x6\")"}
      maxWidth="max-w-[480px]"
    >
      <div className="flex flex-col gap-4 font-sans text-text-main">
        {/* Helper Notice */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary shrink-0">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <path d="M6 14h12v8H6z" />
            </svg>
            <div>
              <p className="font-bold text-text-main m-0">Standard 4x6" Thermal Pouch Label</p>
              <p className="text-[0.7rem] text-text-dim m-0">
                {isPickup ? 'Store counter claim slip & parcel verification' : 'Ready for pouch sticker printing & courier handover'}
              </p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-lg bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer border-none shadow-sm flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print Label</span>
          </button>
        </div>

        {/* Printable 4x6 Thermal Sticker Container */}
        <div
          id="jnt-thermal-waybill"
          className="bg-white text-black p-4 rounded-xl border border-black shadow-md flex flex-col gap-2 font-mono text-[11px] leading-tight select-all print:border-none print:shadow-none print:p-0 print:m-0 print:w-full"
        >
          {/* Top Bar: Shipper Hub Brand & Dispatch Route */}
          <div className="border-b-2 border-black pb-2 flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <div className={`${isPickup ? 'bg-emerald-700' : 'bg-black'} text-white px-2 py-0.5 font-black text-xs tracking-wider rounded-sm`}>
                {isPickup ? 'PICK-UP' : 'DISPATCH'}
              </div>
              <span className="font-black text-xs tracking-tight">EDS TOWELS & CAPS</span>
              <span className="text-[9px] font-bold text-black/60">PACIFIC MALL LUCENA</span>
            </div>
            <div className="text-right">
              <span className="border border-black px-1.5 py-0.5 text-[8.5px] font-black uppercase text-black">
                {isPickup ? 'STORE PICKUP' : (courierName || 'PARCEL COURIER')}
              </span>
            </div>
          </div>

          {/* Barcode Section (Rendered when tracking number is assigned) */}
          {trackingNumber && (
            <div className="flex flex-col items-center py-2 border-b-2 border-black">
              {/* Visual Barcode Pattern */}
              <div className="w-full h-12 flex items-center justify-center overflow-hidden py-1">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 240 40">
                  <rect x="0" y="0" width="4" height="40" fill="black" />
                  <rect x="6" y="0" width="2" height="40" fill="black" />
                  <rect x="10" y="0" width="6" height="40" fill="black" />
                  <rect x="18" y="0" width="2" height="40" fill="black" />
                  <rect x="22" y="0" width="4" height="40" fill="black" />
                  <rect x="28" y="0" width="8" height="40" fill="black" />
                  <rect x="38" y="0" width="2" height="40" fill="black" />
                  <rect x="42" y="0" width="6" height="40" fill="black" />
                  <rect x="50" y="0" width="4" height="40" fill="black" />
                  <rect x="56" y="0" width="2" height="40" fill="black" />
                  <rect x="60" y="0" width="6" height="40" fill="black" />
                  <rect x="68" y="0" width="8" height="40" fill="black" />
                  <rect x="78" y="0" width="2" height="40" fill="black" />
                  <rect x="82" y="0" width="4" height="40" fill="black" />
                  <rect x="88" y="0" width="6" height="40" fill="black" />
                  <rect x="96" y="0" width="2" height="40" fill="black" />
                  <rect x="100" y="0" width="6" height="40" fill="black" />
                  <rect x="108" y="0" width="4" height="40" fill="black" />
                  <rect x="114" y="0" width="2" height="40" fill="black" />
                  <rect x="118" y="0" width="8" height="40" fill="black" />
                  <rect x="128" y="0" width="4" height="40" fill="black" />
                  <rect x="134" y="0" width="6" height="40" fill="black" />
                  <rect x="142" y="0" width="2" height="40" fill="black" />
                  <rect x="146" y="0" width="6" height="40" fill="black" />
                  <rect x="154" y="0" width="4" height="40" fill="black" />
                  <rect x="160" y="0" width="8" height="40" fill="black" />
                  <rect x="170" y="0" width="2" height="40" fill="black" />
                  <rect x="174" y="0" width="6" height="40" fill="black" />
                  <rect x="182" y="0" width="4" height="40" fill="black" />
                  <rect x="188" y="0" width="2" height="40" fill="black" />
                  <rect x="192" y="0" width="8" height="40" fill="black" />
                  <rect x="202" y="0" width="4" height="40" fill="black" />
                  <rect x="208" y="0" width="6" height="40" fill="black" />
                  <rect x="216" y="0" width="2" height="40" fill="black" />
                  <rect x="220" y="0" width="8" height="40" fill="black" />
                  <rect x="230" y="0" width="4" height="40" fill="black" />
                  <rect x="236" y="0" width="4" height="40" fill="black" />
                </svg>
              </div>
              <span className="font-mono text-xs font-black tracking-widest mt-1">
                {trackingNumber}
              </span>
            </div>
          )}

          {/* Dispatch Identifier Header */}
          <div className="flex justify-between items-center py-1.5 border-b-2 border-black">
            <div>
              <span className="text-[8px] text-black/60 block font-sans">
                {trackingNumber ? 'CARRIER TRACKING NO.' : 'SHOP PARCEL REF.'}
              </span>
              <span className="font-mono text-xs font-black tracking-wider">
                {trackingNumber || `PKG-${cleanId}`}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[8px] text-black/60 block font-sans">ORDER ID</span>
              <span className="font-mono text-xs font-black">#{order.orderId}</span>
            </div>
          </div>

          {/* Shipper & Consignee Block */}
          <div className="grid grid-cols-2 border-b-2 border-black divide-x-2 divide-black py-1.5 text-[10px]">
            {/* Shipper */}
            <div className="pr-1.5">
              <span className="font-sans font-black text-[9px] uppercase block mb-0.5 text-black/70">
                SHIPPER (FROM):
              </span>
              <p className="font-bold m-0 leading-tight">Eds Towels & Caps</p>
              <p className="m-0 text-[9px] text-black/80">Pacific Mall Lucena, M.L. Tagarao St.</p>
              <p className="m-0 text-[9px] text-black/80">Lucena City, Quezon Province 4301</p>
              <p className="m-0 text-[9px] font-bold mt-1">Contact: 0928 810 3928</p>
            </div>

            {/* Consignee */}
            <div className="pl-1.5">
              <span className="font-sans font-black text-[9px] uppercase block mb-0.5 text-black/70">
                RECIPIENT (TO):
              </span>
              <p className="font-bold m-0 leading-tight">{order.client || 'Customer Recipient'}</p>
              <p className="m-0 text-[9px] leading-snug line-clamp-2 mt-0.5">
                {order.address?.split('(Landmark:')[0]?.trim() || order.address || 'Address on file'}
              </p>
              {order.address?.includes('(Landmark:') && (
                <p className="m-0 text-[8.5px] italic text-black/80">
                  Landmark: {order.address.split('(Landmark:')[1]?.replace(')', '')?.trim()}
                </p>
              )}
              <p className="m-0 text-[9px] font-bold mt-1">Tel: (Customer On File)</p>
            </div>
          </div>

          {/* Payment & Goods Specifications */}
          <div className="grid grid-cols-3 border-b-2 border-black divide-x-2 divide-black text-center py-1 text-[9px]">
            <div>
              <span className="text-black/60 block font-sans text-[8px]">PAYMENT TERM</span>
              <span className="font-black text-black">
                {order.paymentMethod?.toLowerCase().includes('cod') ? 'COD' : 'NON-COD (PAID)'}
              </span>
            </div>
            <div>
              <span className="text-black/60 block font-sans text-[8px]">TOTAL AMOUNT</span>
              <span className="font-black text-black">₱{(order.totalAmount || 0).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-black/60 block font-sans text-[8px]">PKG WEIGHT</span>
              <span className="font-black text-black">0.40 KG</span>
            </div>
          </div>

          {/* Package Content & QR Code Footer */}
          <div className="flex items-center justify-between pt-1 gap-2">
            <div className="flex-1 text-[9px]">
              <span className="font-sans font-black text-[8px] uppercase block text-black/60">
                PACKAGE CONTENTS:
              </span>
              <p className="font-bold m-0 leading-tight">
                {order.items && order.items.length > 0
                  ? order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')
                  : order.design || 'Custom Embroidery Product'}
              </p>
              <p className="text-[8px] text-black/60 m-0 mt-0.5">
                Order Ref: #{order.orderId} • Date: {new Date(order.date).toLocaleDateString()}
              </p>
              <p className="text-[7.5px] text-black/50 m-0 mt-1 italic">
                Dispatch Slip • Eds Towels & Caps Pacific Mall Hub
              </p>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCodeUrl}
              alt="Package Verification QR"
              className="w-16 h-16 border border-black p-0.5 shrink-0"
            />
          </div>
        </div>

        {/* Print Styles */}
        <style jsx global>{`
          @media print {
            body {
              background: #fff !important;
            }
            body * {
              visibility: hidden;
            }
            #jnt-thermal-waybill,
            #jnt-thermal-waybill * {
              visibility: visible;
            }
            #jnt-thermal-waybill {
              position: absolute !important;
              left: 50% !important;
              top: 20mm !important;
              transform: translateX(-50%) !important;
              width: 100mm !important;
              max-width: 100mm !important;
              border: 2px solid black !important;
              box-shadow: none !important;
              margin: 0 auto !important;
              padding: 5mm !important;
              background: white !important;
              color: black !important;
              z-index: 999999 !important;
            }
          }
        `}</style>
      </div>
    </GlassModal>
  );
}
