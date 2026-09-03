'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import GCashPayment from './GCashPayment';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PaymentMethod = 'gcash';

export default function CheckoutModal({ isOpen, onClose }: CheckoutModalProps) {
  const { items, getTotal, clearBasket } = useBasketStore();
  const { user, setUser, refreshUser } = useAuthStore();
  const { fetchDashboardState } = useProductStore();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('gcash');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [aiVerificationResult, setAiVerificationResult] = useState<string | null>(null);

  const [giftPackaging, setGiftPackaging] = useState(false);
  const [calligraphyMessage, setCalligraphyMessage] = useState('');
  const [giftPackagingPrice, setGiftPackagingPrice] = useState(5.00);
  const [gcashQrCodeUrl, setGcashQrCodeUrl] = useState<string | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.get<{giftPackagingPrice: number, gcashQrCodeUrl: string}>('/api/customer/settings')
        .then(res => {
          if (res) {
            setGiftPackagingPrice(res.giftPackagingPrice);
            setGcashQrCodeUrl(res.gcashQrCodeUrl);
          }
        })
        .catch(console.error);
      api.get<{estimatedMinutes: number}>('/api/customer/capacity')
        .then(res => res && setEstimatedMinutes(res.estimatedMinutes))
        .catch(console.error);
    }
  }, [isOpen]);

  const finalTotal = getTotal() + (giftPackaging ? giftPackagingPrice : 0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setReceiptFile(file);
    setAiAnalyzing(true);
    setPaymentVerified(false);
    setAiVerificationResult(null);

    try {
      // Step 1: Upload receipt image to Cloudinary
      const formData = new FormData();
      formData.append('receipt', file);
      
      const uploadRes = await fetch('/api/customer/upload-receipt', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.url) {
        throw new Error(uploadData.message || 'Failed to upload receipt');
      }

      setReceiptUrl(uploadData.url);

      // Step 2: Submit order first (in "Awaiting Payment" status) to get orderId
      const orderRes = await api.post<{ order: { orderId: string }, receiptID: string }>('/api/customer/order/submit', {
        items,
        totalAmount: finalTotal,
        address: user?.address,
        notes,
        paymentMethod,
        receiptUrl: uploadData.url,
        giftPackaging,
        calligraphyMessage
      });

      // Step 3: Call AI verification with the uploaded receipt
      const verifyRes = await api.post<{
        success: boolean;
        message: string;
        verificationStatus?: string;
        flaggedReason?: string;
        aiResult?: { extractedAmount?: number; confidence?: number; referenceId?: string; paymentPlatform?: string };
      }>('/api/ai/verify-receipt', {
        receiptUrl: uploadData.url,
        orderTotal: finalTotal,
        orderId: orderRes.order.orderId
      });

      if (verifyRes.success) {
        setPaymentVerified(true);
        const conf = verifyRes.aiResult?.confidence ? `${Math.round(verifyRes.aiResult.confidence * 100)}%` : '';
        setAiVerificationResult(`✅ Verified${conf ? ` (${conf} confidence)` : ''} — Amount: $${verifyRes.aiResult?.extractedAmount?.toFixed(2) || '?'}`);
        showToast('StitchMaster AI: Payment verified! Your order is now in the queue.', 'success');
        await refreshUser();
        await fetchDashboardState();
        clearBasket();
        onClose();
      } else {
        setAiVerificationResult(`⚠️ ${verifyRes.message}`);
        showToast(verifyRes.message || 'AI could not verify this receipt', 'error');
        // Order exists but remains in "Awaiting Payment" — admin can review
        await fetchDashboardState();
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Verification failed';
      setAiVerificationResult(`❌ ${msg}`);
      showToast(msg, 'error');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handlePlaceOrder = async () => {
    // For e-wallet methods, the order is already placed during handleFileSelect
    if (paymentMethod === 'gcash') {
      if (!paymentVerified) {
        showToast('Please upload and verify your payment receipt', 'error');
      }
      return;
    }

    setIsProcessing(true);
    try {
      await api.post('/api/customer/order/submit', {
        items,
        totalAmount: finalTotal,
        address: user?.address,
        notes,
        paymentMethod,
        giftPackaging,
        calligraphyMessage
      });
      
      showToast('Order placed successfully!', 'success');
      await refreshUser();
      await fetchDashboardState();
      clearBasket();
      onClose();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to place order';
      showToast(errorMessage, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[750px]" noPadding>
      <div className="p-6 max-[650px]:p-4 flex flex-col">
        <div className="flex justify-between items-center mb-6 max-[650px]:mb-3">
          <h2 className="text-xl max-[650px]:text-lg font-bold m-0 flex items-center gap-3 max-[650px]:gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="max-[650px]:w-5 max-[650px]:h-5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
            Secure Checkout
          </h2>
        </div>

        <div className="grid grid-cols-[1.1fr_1fr] gap-8 max-[650px]:grid-cols-1 max-[650px]:gap-3">
          {/* Left: Delivery & Summary */}
          <div className="flex flex-col gap-6 max-[650px]:gap-3">
            <div className="flex flex-col gap-3 max-[650px]:gap-2">
              <h3 className="text-[0.9rem] font-bold m-0 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                Delivery Details
              </h3>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <input 
                    type="text" 
                    readOnly 
                    value={user?.address || 'No registered address'}
                    className="w-full bg-white/5 border border-border-glass p-2.5 max-[650px]:p-2 rounded-xl max-[650px]:rounded-lg text-text-dim text-[0.9rem] max-[650px]:text-[0.8rem] cursor-not-allowed"
                  />
                  <p className="text-[0.7rem] text-text-dim ml-1 max-[650px]:hidden">To change address or delivery time, please update your profile settings.</p>
                </div>
                <textarea 
                  placeholder="Special notes to seller..." 
                  rows={1}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2 max-[650px]:p-1.5 rounded-xl max-[650px]:rounded-lg text-text-main text-[0.85rem] max-[650px]:text-[0.75rem] outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border-glass pt-5 max-[650px]:pt-3 max-[650px]:gap-2">
              <h3 className="text-[0.9rem] font-bold m-0">Order Summary</h3>
              <div className="max-h-[200px] max-[650px]:max-h-[120px] overflow-y-auto pr-2 flex flex-col gap-2">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-white/5 border border-border-glass/50 rounded-xl">
                    <div className="flex flex-col">
                      <span className="font-bold text-[0.85rem]">{item.name}</span>
                      <span className="text-[0.75rem] text-text-dim">Qty: {item.quantity}</span>
                    </div>
                    <span className="font-mono font-bold text-[0.9rem]">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {/* Gift Suite Upsell */}
              <div className="flex flex-col gap-2 mt-2 bg-primary/10 border border-primary/20 p-3 rounded-xl transition-all">
                 <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={giftPackaging} onChange={(e) => setGiftPackaging(e.target.checked)} className="accent-primary w-4 h-4" />
                    <span className="text-[0.85rem] font-bold text-primary">Add Luxury Gift Suite (+${giftPackagingPrice.toFixed(2)})</span>
                 </label>
                 {giftPackaging && (
                    <div className="flex flex-col animate-[fadeIn_0.3s_ease-out]">
                       <span className="text-[0.7rem] text-text-dim mb-1 ml-6">Includes Premium Linen Box & Handwritten Calligraphy</span>
                       <input 
                         type="text" 
                         placeholder="Enter brief calligraphy message (e.g. Happy Birthday!)" 
                         value={calligraphyMessage}
                         onChange={(e) => setCalligraphyMessage(e.target.value)}
                         className="ml-6 bg-black/20 border border-white/10 p-2 rounded-lg text-white text-[0.8rem] outline-none focus:border-primary"
                       />
                    </div>
                 )}
              </div>

              {/* Delivery ETA */}
              {estimatedMinutes !== null && (
                 <div className="flex justify-between items-center px-2 mt-1 text-[0.8rem] text-text-dim">
                    <span>Estimated Completion:</span>
                    <span className="font-bold text-white">~{Math.max(1, Math.ceil(estimatedMinutes / 60))} Hours</span>
                 </div>
              )}

              <div className="flex justify-between items-center px-2 mt-1">
                <span className="font-bold text-base">Total Amount:</span>
                <span className="text-xl font-extrabold text-primary font-mono">${finalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Right: Payment */}
          <div className="flex flex-col gap-6 max-[650px]:gap-3 bg-white/5 border border-border-glass p-6 max-[650px]:p-4 rounded-[24px] max-[650px]:rounded-[16px]">
            <div className="flex flex-col gap-4 max-[650px]:gap-3">
              <h3 className="text-[1rem] max-[650px]:text-[0.9rem] font-bold m-0">Payment Method</h3>
              
              <div className="flex flex-col max-[650px]:flex-row gap-4 max-[650px]:gap-2 max-[650px]:items-stretch">
                <div className="flex-1">
                  <button
                    className="w-full flex flex-col items-center justify-center gap-2 p-3 rounded-xl border bg-primary/20 border-primary text-white shadow-lg transition-all duration-200"
                  >
                    <span className="text-[#007df2] font-bold text-xl">G</span>
                    <span className="text-[0.85rem] font-bold">GCash</span>
                  </button>
                </div>
              </div>

              {paymentMethod === 'gcash' && (
                <GCashPayment
                  receiptFile={receiptFile}
                  aiAnalyzing={aiAnalyzing}
                  aiVerificationResult={aiVerificationResult}
                  paymentVerified={paymentVerified}
                  onFileSelect={handleFileSelect}
                  qrCodeUrl={gcashQrCodeUrl}
                />
              )}

              <div className="flex items-center justify-between border-t border-border-glass pt-4 max-[650px]:pt-2.5 mt-auto">
                <span className="text-[0.85rem] max-[650px]:text-[0.75rem] text-text-dim">Payment Status:</span>
                <span className={`
                  px-3 max-[650px]:px-2 py-1 max-[650px]:py-0.5 rounded-full text-[0.7rem] max-[650px]:text-[0.6rem] font-bold uppercase tracking-wider
                  ${paymentVerified ? 'bg-success/20 text-success border border-success/30' : 'bg-warning/20 text-warning border border-warning/30'}
                `}>
                  {paymentVerified ? 'Verified' : 'Pending'}
                </span>
              </div>

              <div className="mt-4 max-[650px]:mt-2">
                <GlassButton
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handlePlaceOrder}
                  disabled={isProcessing || !paymentVerified}
                  className={`max-[650px]:py-2 max-[650px]:text-[0.9rem] ${!paymentVerified ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isProcessing ? 'Processing Order...' : 'Place Order'}
                </GlassButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GlassModal>
  );
}
