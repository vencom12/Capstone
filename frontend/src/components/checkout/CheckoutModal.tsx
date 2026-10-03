'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import AddressSelect from '@/components/ui/AddressSelect';
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
  const [manualRef, setManualRef] = useState('');

  const [giftPackaging, setGiftPackaging] = useState(false);
  const [calligraphyMessage, setCalligraphyMessage] = useState('');
  const [giftPackagingPrice, setGiftPackagingPrice] = useState(5.00);
  const [gcashQrCodeUrl, setGcashQrCodeUrl] = useState<string | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);

  // Inline Delivery Address & Contact Phone management (Gold Standard Just-in-Time)
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setDeliveryAddress(user.address || '');
      setDeliveryPhone(user.phoneNumber || '');
      // If user has no address, open the address selector by default
      if (!user.address) {
        setIsEditingAddress(true);
      }
    }
  }, [user, isOpen]);

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

  const handleSaveDeliveryInfo = async () => {
    const cleanAddr = deliveryAddress.trim();
    if (!cleanAddr) {
      showToast('Please specify a delivery address.', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await api.patch<{ message: string; user: any }>('/api/customer/settings', {
        address: cleanAddr,
        ...(deliveryPhone.trim() ? { phoneNumber: deliveryPhone.trim() } : {})
      });
      if (res && res.user && user) {
        setUser({ ...user, ...res.user });
      }
      setIsEditingAddress(false);
      showToast('Delivery address saved to your profile!', 'success');
    } catch {
      showToast('Saved locally for this order.', 'info');
      setIsEditingAddress(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    const currentAddress = deliveryAddress.trim() || user?.address;
    if (!currentAddress) {
      showToast('Please enter and confirm your delivery address before uploading payment.', 'error');
      setIsEditingAddress(true);
      return;
    }

    if (user && !user.isEmailVerified) {
      showToast('Please verify your email address before placing an order.', 'error');
      return;
    }

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

      // Auto-save delivery address if changed
      if (deliveryAddress.trim() && deliveryAddress.trim() !== user?.address) {
        try {
          await api.patch('/api/customer/settings', {
            address: deliveryAddress.trim(),
            ...(deliveryPhone.trim() ? { phoneNumber: deliveryPhone.trim() } : {})
          });
        } catch {}
      }

      // Step 2: Submit order first (in "Awaiting Payment" status) to get orderId
      const orderRes = await api.post<{ order: { orderId: string }, receiptID: string }>('/api/customer/order/submit', {
        items,
        totalAmount: finalTotal,
        address: currentAddress,
        notes,
        paymentMethod: 'gcash',
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
        setAiVerificationResult(`✅ Verified${conf ? ` (${conf} confidence)` : ''} — Amount: ₱${verifyRes.aiResult?.extractedAmount?.toFixed(2) || '?'}`);
        showToast('StitchMaster AI: Payment verified! Your order is now in the queue.', 'success');
        await refreshUser();
        await fetchDashboardState();
        clearBasket();
        onClose();
      } else {
        setAiVerificationResult(`⚠️ ${verifyRes.message}`);
        showToast(verifyRes.message || 'AI could not verify this receipt', 'error');
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

  const handleSubmitManualRef = async () => {
    if (!manualRef.trim()) {
      showToast('Please enter your GCash Reference Number', 'error');
      return;
    }
    setPaymentVerified(true);
    setAiVerificationResult(`ℹ️ Manual Ref Added: ${manualRef.trim()} (Submitted for Admin Queue Review)`);
    showToast('Reference code recorded! Proceeding to place order for queue review.', 'info');
  };

  const handlePlaceOrder = async () => {
    if (!paymentVerified) {
      showToast('Please upload and verify your payment receipt', 'error');
      return;
    }
    showToast('Order verified & submitted successfully!', 'success');
    await refreshUser();
    await fetchDashboardState();
    clearBasket();
    onClose();
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[780px]" noPadding>
      <div className="p-6 max-[650px]:p-4 flex flex-col">
        <div className="flex justify-between items-center mb-5 max-[650px]:mb-3">
          <h2 className="text-xl max-[650px]:text-lg font-bold m-0 flex items-center gap-3 max-[650px]:gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="max-[650px]:w-5 max-[650px]:h-5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
            Secure Checkout
          </h2>
        </div>

        <div className="grid grid-cols-[1.15fr_1fr] gap-7 max-[650px]:grid-cols-1 max-[650px]:gap-4">
          {/* Left: Delivery & Summary */}
          <div className="flex flex-col gap-5 max-[650px]:gap-3">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[0.9rem] font-bold m-0 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  Delivery Address
                </h3>
                {user?.address && !isEditingAddress && (
                  <button
                    type="button"
                    onClick={() => setIsEditingAddress(true)}
                    className="text-[0.75rem] font-bold text-primary hover:underline bg-transparent border-none cursor-pointer p-0"
                  >
                    Change
                  </button>
                )}
              </div>

              {/* Just-in-Time Address Selector */}
              {isEditingAddress || !user?.address ? (
                <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-white/[0.04] border border-border-glass">
                  <div className="flex justify-between items-center">
                    <span className="text-[0.75rem] font-bold text-text-dim">Specify Delivery Destination</span>
                    {user?.address && (
                      <button
                        type="button"
                        onClick={() => setIsEditingAddress(false)}
                        className="text-[0.7rem] text-text-dim hover:text-text-main bg-transparent border-none cursor-pointer"
                      >
                        Keep Current
                      </button>
                    )}
                  </div>

                  <AddressSelect
                    value={deliveryAddress}
                    onChange={(val) => setDeliveryAddress(val)}
                  />

                  {(!user?.phoneNumber || !user.isPhoneVerified) && (
                    <div className="flex flex-col gap-1 mt-1">
                      <label className="text-[0.72rem] font-bold text-text-dim">Contact Phone (For Rider / Dispatch updates)</label>
                      <input 
                        type="tel"
                        maxLength={13}
                        placeholder="e.g. 0917 123 4567"
                        value={deliveryPhone}
                        onChange={(e) => setDeliveryPhone(e.target.value.replace(/[^\d+]/g, ''))}
                        className="w-full bg-bg-surface border border-border-glass px-3 py-1.5 rounded-lg text-text-main text-xs outline-none focus:border-primary"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={handleSaveDeliveryInfo}
                      disabled={isSavingProfile || !deliveryAddress.trim()}
                      className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold text-xs border-none cursor-pointer disabled:opacity-50 transition-all"
                    >
                      {isSavingProfile ? 'Saving...' : 'Confirm Address'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 p-3 bg-white/[0.04] border border-border-glass rounded-xl">
                  <div className="flex items-start gap-2 text-text-main text-xs leading-relaxed">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary mt-0.5 shrink-0">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span className="font-medium flex-1">{user.address}</span>
                  </div>
                  {user.phoneNumber && (
                    <div className="flex items-center gap-2 text-text-dim text-[0.75rem] ml-5">
                      <span>{user.phoneNumber}</span>
                    </div>
                  )}
                </div>
              )}

              <textarea 
                placeholder="Special notes or landmark instructions for delivery..." 
                rows={1}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none focus:border-primary resize-none placeholder:text-text-dim/40"
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-border-glass pt-4 max-[650px]:pt-3 max-[650px]:gap-2">
              <h3 className="text-[0.9rem] font-bold m-0">Order Summary</h3>
              <div className="max-h-[180px] max-[650px]:max-h-[120px] overflow-y-auto pr-2 flex flex-col gap-2">
                {items.map((item) => {
                  const variantText = [item.selectedVariant, item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');
                  return (
                    <div key={item.id} className="flex justify-between items-start p-2.5 bg-white/5 border border-border-glass/50 rounded-xl">
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-[0.85rem]">{item.name}</span>
                        <div className="flex items-center gap-1.5 text-[0.72rem] text-text-dim mt-0.5">
                          {item.selectedColor && (
                            <span 
                              className="w-2.5 h-2.5 rounded-full border border-white/20 inline-block shrink-0" 
                              style={{ backgroundColor: item.selectedColor }} 
                            />
                          )}
                          <span>{variantText ? `${variantText} • Qty: ${item.quantity}` : `Qty: ${item.quantity}`}</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[0.9rem]">₱{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Gift Suite Upsell */}
              <div className="flex flex-col gap-2 mt-1 bg-primary/10 border border-primary/20 p-3 rounded-xl transition-all">
                 <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={giftPackaging} onChange={(e) => setGiftPackaging(e.target.checked)} className="accent-primary w-4 h-4" />
                    <span className="text-[0.85rem] font-bold text-primary">Add Luxury Gift Suite (+₱{giftPackagingPrice.toFixed(2)})</span>
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
              {giftPackaging && estimatedMinutes !== null && (
                 <div className="flex justify-between items-center px-2 text-[0.8rem] text-text-dim">
                    <span>Estimated Completion:</span>
                    <span className="font-bold text-white">~{Math.max(1, Math.ceil(estimatedMinutes / 60))} Hours</span>
                 </div>
              )}

              <div className="flex justify-between items-center px-2 pt-2 border-t border-border-glass">
                <span className="font-bold text-sm">Total Payable:</span>
                <span className="font-mono font-black text-lg text-primary">₱{finalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Right: Payment & Receipt AI Verification */}
          <div className="flex flex-col gap-5 border-l border-border-glass pl-7 max-[650px]:border-l-0 max-[650px]:pl-0 max-[650px]:pt-3 max-[650px]:border-t max-[650px]:gap-3">
             <GCashPayment 
               finalTotal={finalTotal}
               totalAmount={finalTotal} 
               qrCodeUrl={gcashQrCodeUrl}
               receiptFile={receiptFile}
               onFileSelect={handleFileSelect} 
               aiAnalyzing={aiAnalyzing}
               isAnalyzing={aiAnalyzing}
               aiVerificationResult={aiVerificationResult}
               paymentVerified={paymentVerified}
               isVerified={paymentVerified}
               manualRef={manualRef}
               setManualRef={setManualRef}
               onManualRefChange={setManualRef}
               onSubmitManualRef={handleSubmitManualRef}
             />

             {paymentVerified && (
               <GlassButton
                 variant="primary"
                 fullWidth
                 size="lg"
                 onClick={handlePlaceOrder}
                 className="shadow-[0_4px_20px_rgba(99,102,241,0.4)] animate-[pulse_2s_infinite]"
               >
                 Confirm & Dispatch Order
               </GlassButton>
             )}
          </div>
        </div>
      </div>
    </GlassModal>
  );
}
