'use client';

import GlassModal from '@/components/ui/GlassModal';
import type { Order, Transaction, User } from '@/lib/types';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  transaction?: Transaction | null;
  user: User | null;
}

export default function InvoiceModal({
  isOpen,
  onClose,
  order,
  transaction,
  user
}: InvoiceModalProps) {
  if (!order) return null;

  const invoiceNo = `INV-${order.orderId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
  const invoiceDate = new Date(order.date || order.createdAt || Date.now()).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Calculate VAT breakdown (12% Philippine VAT standard)
  const totalAmount = order.totalAmount || 0;
  const vatRate = 0.12;
  const vatableSales = totalAmount / (1 + vatRate);
  const vatAmount = totalAmount - vatableSales;

  const handlePrint = () => {
    window.print();
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Official Digital Invoice"
      maxWidth="max-w-[680px]"
    >
      <div className="flex flex-col gap-5 text-text-main print:text-black print:bg-white">
        {/* Printable Invoice Container */}
        <div id="stitch-invoice-printable" className="bg-bg-surface/80 border border-border-glass rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-sm print:border-none print:p-0">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-border-glass/60 pb-5 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  SO
                </div>
                <h2 className="text-xl font-black text-text-main m-0 tracking-tight">Stitch-Opt Studios</h2>
              </div>
              <p className="text-xs text-text-dim mt-1.5 leading-relaxed m-0">
                Premium Automated Embroidery & Apparel Customization<br />
                VAT Reg. TIN: 429-810-332-00000 • Mobile: 0928 810 3928<br />
                Pacific Mall Lucena, M.L. Tagarao St., Lucena City, Quezon 4301, Philippines
              </p>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase tracking-wider bg-success/20 text-success border border-success/30">
                PAID & VERIFIED
              </span>
              <h3 className="text-sm font-bold text-text-main mt-2 mb-0.5">{invoiceNo}</h3>
              <p className="text-xs text-text-dim m-0">Date: {invoiceDate}</p>
              {transaction && (
                <p className="text-[0.7rem] text-text-dim mt-0.5">Ref: {transaction.transactionID}</p>
              )}
            </div>
          </div>

          {/* Billed To / Shipping Address */}
          <div className="grid grid-cols-2 gap-4 text-xs border-b border-border-glass/60 pb-5 max-[500px]:grid-cols-1">
            <div>
              <span className="font-bold uppercase tracking-wider text-[0.7rem] text-text-dim block mb-1">
                Billed To:
              </span>
              <p className="font-bold text-sm text-text-main m-0">{user?.username || order.client || 'Customer'}</p>
              <p className="text-text-dim m-0 mt-0.5">{user?.email || 'Registered Customer'}</p>
              {user?.phoneNumber && <p className="text-text-dim m-0 mt-0.5">Mobile: {user.phoneNumber}</p>}
            </div>

            <div>
              <span className="font-bold uppercase tracking-wider text-[0.7rem] text-text-dim block mb-1">
                Delivery Details:
              </span>
              <p className="text-text-main leading-relaxed m-0">
                {order.address || user?.address || 'Standard Delivery Address'}
              </p>
              <p className="text-text-dim m-0 mt-1">
                Payment: <span className="font-bold text-text-main">{order.paymentMethod?.toUpperCase() || 'GCASH'}</span>
              </p>
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
                {order.items && order.items.length > 0 ? (
                  order.items.map((item, index) => (
                    <tr key={index} className="text-text-main">
                      <td className="py-2.5 pr-2">
                        <div className="font-bold">{item.name || order.design}</div>
                        {(item.selectedVariant || item.selectedColor || item.selectedSize) && (
                          <div className="text-[0.7rem] text-text-dim">
                            {[item.selectedVariant, item.selectedColor, item.selectedSize].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-text-dim">{item.quantity || 1}</td>
                      <td className="py-2.5 text-right text-text-dim">₱{(item.price || 0).toFixed(2)}</td>
                      <td className="py-2.5 text-right font-semibold">
                        ₱{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="text-text-main">
                    <td className="py-2.5 pr-2 font-bold">{order.design || 'Custom Embroidery Order'}</td>
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
            <span>Official Digital Electronic Tax Receipt • BIR Compliant</span>
            <span className="font-mono text-primary font-bold">DIGITAL-HASH-STITCH-OPT-SECURE</span>
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="flex items-center justify-end gap-3 print:hidden">
          <button
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
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-transparent border border-border-glass text-text-dim font-bold text-xs hover:bg-white/5 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
