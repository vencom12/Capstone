'use client';

import GlassModal from '@/components/ui/GlassModal';

interface ClaimStubModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
}

export default function ClaimStubModal({ isOpen, onClose, order }: ClaimStubModalProps) {
  if (!order) return null;

  const orderId = order.orderId || order.id || 'N/A';
  const clientName = order.client || order.clientName || 'Walk-In Customer';
  
  // Extract items summary
  let itemName = order.design || 'Custom Embroidery';
  let quantity = 1;
  if (Array.isArray(order.items) && order.items.length > 0) {
    quantity = order.items.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);
    itemName = order.items[0]?.name || itemName;
    if (order.items.length > 1) {
      itemName += ` (+${order.items.length - 1} more)`;
    }
  }

  // Personalization text
  const pers = order.personalization && typeof order.personalization === 'object' ? order.personalization : {};
  let personalizationText = pers.text || '';
  if (!personalizationText && Array.isArray(order.items) && order.items[0]?.personalization?.text) {
    personalizationText = order.items[0].personalization.text;
  }

  // Verification claim code
  const verificationCode = pers.claimCode || (
    orderId.startsWith('WI-')
      ? `#${orderId.replace('WI-', 'A-')}`
      : `#A-${orderId.slice(-4).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`
  );

  const grandTotal = parseFloat(order.totalAmount || order.amount || 0);
  const paymentMethod = (order.paymentMethod || 'Cash').toUpperCase();

  const handlePrint = () => {
    const stubElement = document.getElementById('thermal-claim-stub-print-view');
    if (!stubElement) {
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
          <title>Claim Stub - ${orderId}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 4mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, monospace;
              background: #fff;
              color: #000;
              width: 100%;
            }
            .stub-body {
              font-family: monospace;
              text-align: center;
              font-size: 11px;
              color: #000;
              width: 100%;
            }
            .border-b-dashed {
              border-bottom: 1px dashed #71717a;
            }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .flex-col { flex-direction: column; }
            .items-center { align-items: center; }
            .gap-1 { gap: 4px; }
            .gap-2 { gap: 8px; }
            .font-bold { font-weight: bold; }
            .font-extrabold { font-weight: 800; }
            .uppercase { text-transform: uppercase; }
            .text-black { color: #000; }
          </style>
        </head>
        <body>
          <div class="stub-body">
            ${stubElement.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 250);
  };

  const trackUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/track?id=${orderId}`
    : `http://localhost:3000/track?id=${orderId}`;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Store Counter Claim Stub"
      maxWidth="max-w-[400px]"
    >
      <div className="flex flex-col gap-4 font-sans text-text-main">
        {/* Helper Notice */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400 shrink-0">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <path d="M6 14h12v8H6z" />
            </svg>
            <div>
              <p className="font-bold text-text-main m-0">In-Store Claim Stub</p>
              <p className="text-[0.7rem] text-text-dim m-0">Standard 80mm thermal receipt</p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 transition-all cursor-pointer border-none shadow-sm flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print Stub</span>
          </button>
        </div>

        {/* Thermal Stub Container (Matching Walk-In Window Identically) */}
        <div
          id="thermal-claim-stub-print-view"
          className="bg-white text-zinc-950 p-5 rounded-lg font-mono text-center flex flex-col gap-2 text-xs border border-zinc-200 shadow-sm select-all"
        >
          <div className="border-b border-dashed border-zinc-400 pb-2">
            <div className="text-[10px] font-bold tracking-widest uppercase text-zinc-700">
              CLAIM STUB &amp; INTAKE RECEIPT
            </div>
            <div className="text-base font-extrabold text-black mt-0.5 tracking-wider">
              EDS TOWELS &amp; CAPS
            </div>
            <div className="text-[10px] text-zinc-600">
              Pacific Mall Lucena • Ground Floor
            </div>
          </div>

          <div className="py-2.5 border-b border-dashed border-zinc-400">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold">
              CLAIM TICKET NUMBER
            </div>
            <div className="text-3xl font-extrabold text-black tracking-widest my-1">
              #{orderId}
            </div>
            <div className="text-[11px] font-semibold text-zinc-800">
              Status: <span className="uppercase">{order.status || 'In Queue'}</span>
            </div>
          </div>

          <div className="text-left flex flex-col gap-1 py-1.5 text-[11px] border-b border-dashed border-zinc-400">
            <div className="flex justify-between">
              <span className="text-zinc-600">Customer:</span>
              <span className="font-bold text-black">{clientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Item:</span>
              <span className="font-bold text-black">
                {quantity}x {itemName}
              </span>
            </div>
            {personalizationText && (
              <div className="flex justify-between">
                <span className="text-zinc-600">Embroidery:</span>
                <span className="font-bold text-black">"{personalizationText}"</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-zinc-600">Verification:</span>
              <span className="font-bold text-black">{verificationCode}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 py-1 text-[11px] border-b border-dashed border-zinc-400">
            <div className="flex justify-between font-bold text-xs">
              <span>TOTAL DUE:</span>
              <span>₱{grandTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-700">
              <span>Payment:</span>
              <span className="font-semibold">
                {paymentMethod} (PAID IN FULL)
              </span>
            </div>
          </div>

          {/* DYNAMIC QR CODE FOR LIVE MOBILE TRACKING */}
          <div className="py-2.5 border-b border-dashed border-zinc-400 flex flex-col items-center justify-center gap-1">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(trackUrl)}`}
              alt="Track Order QR Code"
              className="w-20 h-20 border border-zinc-300 p-0.5 bg-white rounded"
            />
            <div className="text-[9px] font-bold text-zinc-800 uppercase tracking-wider">
              Scan QR to Track On Your Phone
            </div>
            <div className="text-[8px] text-zinc-500 font-mono">
              /track?id={orderId}
            </div>
          </div>

          <div className="pt-2 text-[10px] text-zinc-700 font-bold uppercase leading-relaxed">
            Please present this claim stub upon pickup.
            <div className="font-normal normal-case text-zinc-500 text-[9px] mt-0.5">
              Anti-fraud verification protection.
            </div>
          </div>
        </div>
      </div>
    </GlassModal>
  );
}
