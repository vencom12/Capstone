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

  // Generate a standardized J&T tracking code from order ID
  const cleanId = order.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  const trackingNumber = `JNT-PH-78${cleanId}`;

  // QR code representation for J&T Express handheld terminal
  const qrData = `JNT-EXPRESS|AWB:${trackingNumber}|ORDER:${order.orderId}|DEST:${encodeURIComponent(
    order.address || 'Lucena'
  )}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
    qrData
  )}&size=140x140&margin=0`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Courier Air Waybill (AWB)"
      maxWidth="max-w-[480px]"
    >
      <div className="flex flex-col gap-4 font-sans text-text-main">
        {/* Helper Notice */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-base">🏷️</span>
            <div>
              <p className="font-bold text-text-main m-0">Standard 4x6" Thermal Sticker</p>
              <p className="text-[0.7rem] text-text-dim m-0">
                Official J&T Express Philippine delivery waybill format
              </p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-lg bg-primary text-white font-bold text-xs hover:bg-primary/90 transition-all cursor-pointer border-none shadow-sm flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print Sticker</span>
          </button>
        </div>

        {/* Printable 4x6 AWB Sticker Container */}
        <div
          id="jnt-thermal-waybill"
          className="bg-white text-black p-4 rounded-xl border border-black shadow-md flex flex-col gap-2 font-mono text-[11px] leading-tight select-all print:border-none print:shadow-none print:p-0 print:m-0 print:w-full"
        >
          {/* Top Bar: J&T Brand & Service Type */}
          <div className="border-b-2 border-black pb-2 flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <div className="bg-[#e11d48] text-white px-2 py-0.5 font-black text-xs tracking-wider rounded-sm">
                J&T
              </div>
              <span className="font-black text-xs tracking-tight">EXPRESS</span>
              <span className="text-[9px] font-bold text-black/60">PHILIPPINES</span>
            </div>
            <div className="text-right">
              <span className="bg-black text-white px-2 py-0.5 text-[9px] font-black uppercase">
                EZ STANDARD
              </span>
            </div>
          </div>

          {/* Barcode Section */}
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

          {/* Hub Routing Codes */}
          <div className="grid grid-cols-2 border-b-2 border-black divide-x-2 divide-black text-center py-1">
            <div className="p-1">
              <span className="text-[8px] text-black/60 block font-sans">ORIGIN HUB</span>
              <span className="font-black text-xs">LCN-PAC-01</span>
              <span className="text-[8px] block text-black/60">Pacific Mall Lucena</span>
            </div>
            <div className="p-1">
              <span className="text-[8px] text-black/60 block font-sans">DESTINATION ROUTE</span>
              <span className="font-black text-xs">CAL-MNL-EZ</span>
              <span className="text-[8px] block text-black/60">Standard Transit</span>
            </div>
          </div>

          {/* Shipper & Consignee Block */}
          <div className="grid grid-cols-2 border-b-2 border-black divide-x-2 divide-black py-1.5 text-[10px]">
            {/* Shipper */}
            <div className="pr-1.5">
              <span className="font-sans font-black text-[9px] uppercase block mb-0.5 text-black/70">
                SHIPPER (FROM):
              </span>
              <p className="font-bold m-0 leading-tight">Stitch-Opt Studio</p>
              <p className="m-0 text-[9px] text-black/80">Pacific Mall Lucena, M.L. Tagarao St.</p>
              <p className="m-0 text-[9px] text-black/80">Brgy. 3, Lucena City, Quezon 4301</p>
              <p className="m-0 text-[9px] font-bold mt-1">Tel: (042) 710-3321 / 0917-882-1490</p>
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
                Notice: Electronic thermal waybill generated via Stitch-Opt Logistics Engine.
              </p>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCodeUrl}
              alt="J&T Package QR"
              className="w-16 h-16 border border-black p-0.5 shrink-0"
            />
          </div>
        </div>

        {/* Print Styles */}
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #jnt-thermal-waybill,
            #jnt-thermal-waybill * {
              visibility: visible;
            }
            #jnt-thermal-waybill {
              position: fixed;
              left: 0;
              top: 0;
              width: 100mm !important;
              max-width: 100mm !important;
              border: 1px solid black !important;
              box-shadow: none !important;
              margin: 0 !important;
              padding: 4mm !important;
            }
          }
        `}</style>
      </div>
    </GlassModal>
  );
}
