'use client';

import { useState, useEffect } from 'react';
import TermsAndPoliciesModal from '@/components/ui/TermsAndPoliciesModal';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { api, apiFetch } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import AddressSelect from '@/components/ui/AddressSelect';
import GCashPayment from './GCashPayment';
import AddressBookModal from '@/components/dashboard/AddressBookModal';
import type { SavedAddress, BasketItem } from '@/lib/types';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkoutItems?: BasketItem[];
  initialFulfillmentType?: 'delivery' | 'pickup';
}

type PaymentMethod = 'gcash';

export default function CheckoutModal({ isOpen, onClose, checkoutItems, initialFulfillmentType }: CheckoutModalProps) {
  const { items: allBasketItems, removeItem, clearBasket } = useBasketStore();
  const items = checkoutItems && checkoutItems.length > 0 ? checkoutItems : allBasketItems;
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

  // Shopee-Style Delivery Address & Contact Phone management
  const [isAddressBookOpen, setIsAddressBookOpen] = useState(false);
  const [selectedSavedAddress, setSelectedSavedAddress] = useState<SavedAddress | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>('pickup');
  const [claimantName, setClaimantName] = useState('');
  const [claimantPhone, setClaimantPhone] = useState('');
  const [pickupNote, setPickupNote] = useState('');
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [termsInitialTab, setTermsInitialTab] = useState<'refunds' | 'pickup' | 'copyright' | 'colors' | 'privacy'>('refunds');

  useEffect(() => {
    if (initialFulfillmentType) {
      if (initialFulfillmentType === 'delivery' && !deliveryEnabled) {
        setFulfillmentType('pickup');
      } else {
        setFulfillmentType(initialFulfillmentType);
      }
    }
  }, [initialFulfillmentType, isOpen, deliveryEnabled]);

  useEffect(() => {
    if (user && isOpen) {
      setClaimantName(user.username || '');
      setClaimantPhone(user.phoneNumber || '');
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (user) {
      if (user.savedAddresses && user.savedAddresses.length > 0) {
        const primary = user.savedAddresses.find((a) => a.isDefault) || user.savedAddresses[0];
        setSelectedSavedAddress(primary);
        setDeliveryAddress(primary.fullAddress || primary.streetAddress);
        setDeliveryPhone(primary.phoneNumber || user.phoneNumber || '');
      } else {
        setDeliveryAddress(user.address || '');
        setDeliveryPhone(user.phoneNumber || '');
      }
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (isOpen) {
      api.get<{giftPackagingPrice: number, gcashQrCodeUrl: string, deliveryEnabled?: boolean}>('/api/customer/settings')
        .then(res => {
          if (res) {
            setGiftPackagingPrice(res.giftPackagingPrice);
            setGcashQrCodeUrl(res.gcashQrCodeUrl);
            const isDelivOn = Boolean(res.deliveryEnabled);
            setDeliveryEnabled(isDelivOn);
            if (!isDelivOn) {
              setFulfillmentType('pickup');
            }
          }
        })
        .catch(console.error);
      api.get<{estimatedMinutes: number}>('/api/customer/capacity')
        .then(res => res && setEstimatedMinutes(res.estimatedMinutes))
        .catch(console.error);
    }
  }, [isOpen]);

  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const finalTotal = itemsTotal + (giftPackaging ? giftPackagingPrice : 0);

  const handleClearProcessedItems = () => {
    if (checkoutItems && checkoutItems.length > 0 && checkoutItems.length < allBasketItems.length) {
      checkoutItems.forEach(i => removeItem(i.id));
    } else {
      handleClearProcessedItems();
    }
  };

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);

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

    const isPickup = !deliveryEnabled || fulfillmentType === 'pickup';
    let currentAddress = '';
    
    if (isPickup) {
      const phone = claimantPhone.trim() || user?.phoneNumber || '';
      if (!phone) {
        showToast('Please provide a claimant phone number so our counter team can contact you.', 'error');
        return;
      }
      const name = claimantName.trim() || user?.username || 'Customer';
      currentAddress = `Store Pick-up: Eds Towels & Caps, Pacific Mall Lucena, Quezon 4301 (Claimant: ${name}, Phone: ${phone})`;
    } else {
      currentAddress = deliveryAddress.trim() || user?.address || '';
      if (!currentAddress) {
        showToast('Please enter and confirm your delivery address before uploading payment.', 'error');
        setIsAddressBookOpen(true);
        return;
      }
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
      
      let uploadData: { url?: string };
      try {
        uploadData = await apiFetch<{ url?: string }>('/api/customer/upload-receipt', {
          method: 'POST',
          body: formData
        });
      } catch {
        showToast('We could not upload your receipt. Please try again with a clear screenshot.', 'error');
        setReceiptFile(null);
        setAiAnalyzing(false);
        return;
      }

      if (!uploadData?.url) {
        showToast('We could not upload your receipt. Please try again with a clear screenshot.', 'error');
        setReceiptFile(null);
        setAiAnalyzing(false);
        return;
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

      const firstPersonalizedItem = items.find((i) => i.personalization?.text);
      const orderRes = await api.post<{ order: { orderId: string }, receiptID: string }>('/api/customer/order/submit', {
        items,
        totalAmount: finalTotal,
        address: currentAddress,
        notes: isPickup ? (pickupNote.trim() ? `[Pick-up Note: ${pickupNote.trim()}]` : '') : notes,
        paymentMethod: 'gcash',
        receiptUrl: uploadData.url,
        giftPackaging,
        calligraphyMessage,
        personalization: {
          fulfillmentType: isPickup ? 'pickup' : 'delivery',
          courier: isPickup ? 'Store Pick-up' : 'J&T Express',
          claimantName: isPickup ? (claimantName.trim() || user?.username) : undefined,
          claimantPhone: isPickup ? (claimantPhone.trim() || user?.phoneNumber) : undefined,
          pickupNote: isPickup ? pickupNote.trim() : undefined,
          text: firstPersonalizedItem?.personalization?.text,
          color: firstPersonalizedItem?.personalization?.threadColor,
          font: firstPersonalizedItem?.personalization?.font,
        }
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
        if (verifyRes.verificationStatus === 'pending_manual_verification') {
          setAiVerificationResult('📄 Receipt uploaded! Please enter your GCash Reference Number below to finalize your order.');
          showToast('Receipt received! Please enter your GCash Reference Number below.', 'info');
        } else {
          setPaymentVerified(true);
          const conf = verifyRes.aiResult?.confidence ? `${Math.round(verifyRes.aiResult.confidence * 100)}%` : '';
          setAiVerificationResult(`✅ Payment Verified${conf ? ` (${conf} confidence)` : ''} — Amount: ₱${verifyRes.aiResult?.extractedAmount?.toFixed(2) || finalTotal.toFixed(2)}`);
          showToast('Payment verified! Your order is now in the workshop queue.', 'success');
          await refreshUser();
          await fetchDashboardState();
          handleClearProcessedItems();
          onClose();
        }
      } else {
        const friendlyFallback = "Receipt image received! Please enter your GCash Reference Number below to complete your order.";
        setAiVerificationResult(`📄 ${friendlyFallback}`);
        showToast('Receipt received! Please enter your GCash Reference Number below.', 'info');
        await fetchDashboardState();
      }
    } catch (err: any) {
      console.error('[Receipt Verification Catch]:', err);
      const friendlyMsg = "Receipt image uploaded! Please enter your GCash Reference Number below so our team can confirm your payment.";
      setAiVerificationResult(`📄 ${friendlyMsg}`);
      showToast('Receipt uploaded! Please enter your GCash Reference Number below.', 'info');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleSubmitManualRef = async () => {
    const cleanRef = manualRef.trim();
    if (!cleanRef) {
      showToast('Please enter your GCash Reference Number.', 'error');
      return;
    }

    const isPickup = fulfillmentType === 'pickup';
    let currentAddress = '';
    
    if (isPickup) {
      const phone = claimantPhone.trim() || user?.phoneNumber || '';
      if (!phone) {
        showToast('Please provide a claimant phone number for pick-up.', 'error');
        return;
      }
      const name = claimantName.trim() || user?.username || 'Customer';
      currentAddress = `Store Pick-up: Eds Towels & Caps, Pacific Mall Lucena, Quezon 4301 (Claimant: ${name}, Phone: ${phone})`;
    } else {
      currentAddress = deliveryAddress.trim() || user?.address || '';
      if (!currentAddress) {
        showToast('Please enter and confirm your delivery address before submitting.', 'error');
        setIsAddressBookOpen(true);
        return;
      }
    }

    setIsProcessing(true);
    try {
      const firstPersonalizedItem = items.find((i) => i.personalization?.text);
      await api.post('/api/customer/order/submit', {
        items,
        totalAmount: finalTotal,
        address: currentAddress,
        notes: isPickup ? (pickupNote.trim() ? `[Pick-up Note: ${pickupNote.trim()}]` : '') : notes,
        paymentMethod: 'gcash',
        giftPackaging,
        calligraphyMessage,
        personalization: {
          fulfillmentType: isPickup ? 'pickup' : 'delivery',
          courier: isPickup ? 'Store Pick-up' : 'J&T Express',
          referenceNumber: cleanRef,
          claimantName: isPickup ? (claimantName.trim() || user?.username) : undefined,
          claimantPhone: isPickup ? (claimantPhone.trim() || user?.phoneNumber) : undefined,
          pickupNote: isPickup ? pickupNote.trim() : undefined,
          text: firstPersonalizedItem?.personalization?.text,
          color: firstPersonalizedItem?.personalization?.threadColor,
          font: firstPersonalizedItem?.personalization?.font,
        }
      });

      setPaymentVerified(true);
      setAiVerificationResult(`✅ GCash Reference Recorded: ${cleanRef}`);
      showToast('Order placed! GCash Reference recorded for workshop queue.', 'success');
      await refreshUser();
      await fetchDashboardState();
      handleClearProcessedItems();
      onClose();
    } catch (err: any) {
      console.error('[Manual Ref Order Submit Catch]:', err);
      showToast(err.message || 'Failed to submit order. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!paymentVerified) {
      showToast('Please upload your receipt or enter your GCash reference number.', 'error');
      return;
    }
    showToast('Order confirmed! We have received your order.', 'success');
    await refreshUser();
    await fetchDashboardState();
    handleClearProcessedItems();
    onClose();
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[780px]" noPadding>
      <div className="p-6 max-md:p-4 flex flex-col">
        <div className="flex justify-between items-center mb-5 max-md:mb-3">
          <h2 className="text-xl max-md:text-lg font-bold m-0 flex items-center gap-3 max-md:gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="max-[650px]:w-5 max-[650px]:h-5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
            Secure Checkout
          </h2>
        </div>

        <div className="grid grid-cols-[1.15fr_1fr] gap-7 max-md:grid-cols-1 max-md:gap-4">
          {/* Left: Delivery & Summary */}
          <div className="flex flex-col gap-5 max-md:gap-3">
            {/* Fulfillment Method Selector / Policy Header */}
            {deliveryEnabled ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[0.72rem] font-bold text-text-dim uppercase tracking-wider">
                  Fulfillment Method
                </span>
                <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 rounded-xl border border-border-glass">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('delivery')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                      fulfillmentType === 'delivery'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-transparent text-text-dim border-transparent hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <rect x="1" y="3" width="15" height="13" />
                      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                      <circle cx="5.5" cy="18.5" r="2.5" />
                      <circle cx="18.5" cy="18.5" r="2.5" />
                    </svg>
                    <span>Door Delivery</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('pickup')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                      fulfillmentType === 'pickup'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-transparent text-text-dim border-transparent hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>Store Pick-up</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-primary/10 border border-primary/20 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">In-Store Counter Pick-up</span>
                    <span className="text-[0.7rem] text-text-dim">Claim your customized items directly at our Pacific Mall studio counter</span>
                  </div>
                </div>
                <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold uppercase tracking-wider">
                  Active Mode
                </span>
              </div>
            )}

            {/* Delivery Address Section (When Door Delivery is enabled & selected) */}
            {deliveryEnabled && fulfillmentType === 'delivery' ? (
              <div className="flex flex-col gap-2 animate-[fadeIn_0.2s_ease-out]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[0.9rem] font-bold m-0 flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                    Delivery Address
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsAddressBookOpen(true)}
                    className="text-xs font-bold text-primary hover:underline bg-transparent border-none cursor-pointer p-0"
                  >
                    {deliveryAddress || user?.address ? 'Change' : '+ Add Address'}
                  </button>
                </div>

                {/* Shopee-style active address card */}
                <div
                  onClick={() => setIsAddressBookOpen(true)}
                  className="p-3.5 bg-white/[0.04] border border-border-glass hover:border-primary/40 rounded-2xl flex flex-col gap-1.5 cursor-pointer transition-all group"
                >
                  {deliveryAddress || user?.address ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-text-main">
                            {selectedSavedAddress?.recipientName || user?.username || 'Customer'}
                          </span>
                          <span className="text-xs text-text-dim">
                            | {deliveryPhone || selectedSavedAddress?.phoneNumber || user?.phoneNumber || 'No phone set'}
                          </span>
                          {selectedSavedAddress?.label && (
                            <span className="px-1.5 py-0.5 rounded text-[0.65rem] font-bold uppercase bg-white/10 text-text-dim border border-border-glass">
                              {selectedSavedAddress.label}
                            </span>
                          )}
                          {selectedSavedAddress?.isDefault && (
                            <span className="px-1.5 py-0.5 rounded text-[0.65rem] font-bold uppercase bg-primary/20 text-primary border border-primary/30">
                              Default
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-primary font-bold group-hover:underline">Edit ›</span>
                      </div>
                      <p className="text-xs text-text-dim m-0 leading-relaxed group-hover:text-text-main transition-colors">
                        {deliveryAddress || selectedSavedAddress?.fullAddress || user?.address}
                      </p>
                    </>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-text-dim py-1">
                      <span>No delivery address specified</span>
                      <span className="text-primary font-bold">+ Choose Address</span>
                    </div>
                  )}
                </div>

                <textarea 
                  placeholder="Special notes or landmark instructions for delivery..." 
                  rows={1}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none focus:border-primary resize-none placeholder:text-text-dim/40"
                />
              </div>
            ) : (
              /* Store Pick-up Section */
              <div className="flex flex-col gap-2.5 animate-[fadeIn_0.2s_ease-out]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[0.9rem] font-bold m-0 flex items-center gap-2 text-text-main">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>Store Pick-up Counter</span>
                  </h3>
                  <span className="text-[0.68rem] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-extrabold uppercase">
                    Free • Ready When Stitched
                  </span>
                </div>

                <div className="p-3.5 bg-white/[0.04] border border-border-glass rounded-2xl flex flex-col gap-1.5 text-xs">
                  <div className="flex items-start gap-2.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary mt-0.5 shrink-0">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-extrabold text-text-main text-[0.82rem]">
                        Eds Towels & Caps Embroidery Studio
                      </span>
                      <span className="text-text-dim text-[0.75rem] leading-relaxed">
                        Pacific Mall Lucena, M.L. Tagarao St., Brgy. 3, Lucena City, Quezon 4301
                      </span>
                      <span className="text-[0.7rem] text-primary/90 font-medium mt-0.5 flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        Mall Hours: 10:00 AM – 8:00 PM Daily • Free 30-day storage
                      </span>
                      <button
                        type="button"
                        onClick={() => { setTermsInitialTab('pickup'); setIsTermsModalOpen(true); }}
                        className="text-[0.68rem] text-primary hover:underline text-left bg-transparent border-none p-0 cursor-pointer w-fit mt-0.5"
                      >
                        View pick-up &amp; holding policies ›
                      </button>
                    </div>
                  </div>
                </div>

                {/* Claimant Details */}
                <div className="grid grid-cols-2 max-[500px]:grid-cols-1 gap-2.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.68rem] font-bold text-text-dim uppercase tracking-wider">
                      Claimant Name
                    </label>
                    <input
                      type="text"
                      placeholder="Person claiming"
                      value={claimantName}
                      onChange={(e) => setClaimantName(e.target.value)}
                      className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary placeholder:text-text-dim/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.68rem] font-bold text-text-dim uppercase tracking-wider">
                      Claimant Phone Number *
                    </label>
                    <input
                      type="tel"
                      placeholder="09XXXXXXXXX (For SMS)"
                      value={claimantPhone}
                      onChange={(e) => setClaimantPhone(e.target.value)}
                      className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary placeholder:text-text-dim/40"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[0.68rem] font-bold text-text-dim uppercase tracking-wider">
                    Pick-up Instructions or Authorized Representative (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Authorized brother to claim, or weekend pickup"
                    value={pickupNote}
                    onChange={(e) => setPickupNote(e.target.value)}
                    className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary placeholder:text-text-dim/40"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-border-glass pt-4 max-[650px]:pt-3 max-md:gap-2">
              <h3 className="text-[0.9rem] font-bold m-0">Order Summary</h3>
              <div className="max-h-[180px] max-[650px]:max-h-[120px] overflow-y-auto pr-2 flex flex-col gap-2">
                {items.map((item) => {
                  const variantText = [item.selectedVariant, item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');
                  return (
                    <div key={item.id} className="flex justify-between items-start p-2.5 bg-white/5 border border-border-glass/50 rounded-xl">
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-[0.85rem]">{item.name}</span>
                        <div className="flex items-center gap-1.5 text-[0.72rem] text-text-dim mt-0.5 flex-wrap">
                          {item.selectedColor && (
                            <span 
                              className="w-2.5 h-2.5 rounded-full border border-white/20 inline-block shrink-0" 
                              style={{ backgroundColor: item.selectedColor }} 
                            />
                          )}
                          <span>{variantText ? `${variantText} • Qty: ${item.quantity}` : `Qty: ${item.quantity}`}</span>
                          {item.personalization?.text && (
                            <span className="text-primary font-semibold flex items-center gap-1">
                              • 
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <circle cx="6" cy="6" r="3" />
                                <path d="M8.5 8.5L21 21" />
                              </svg>
                              &ldquo;{item.personalization.text}&rdquo; ({item.personalization.threadColor || 'Gold'})
                            </span>
                          )}
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
                    <span className="font-bold text-text-main">~{Math.max(1, Math.ceil(estimatedMinutes / 60))} Hours</span>
                 </div>
              )}

              <div className="flex justify-between items-center px-2 pt-2 border-t border-border-glass">
                <span className="font-bold text-sm">Total Payable:</span>
                <span className="font-mono font-black text-lg text-primary">₱{finalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Right: Payment & Receipt AI Verification */}
          <div className="flex flex-col gap-5 border-l border-border-glass pl-7 max-md:border-l-0 max-md:pl-0 max-md:pt-4 max-md:border-t max-md:gap-3">
             {/* Data Privacy & Custom Goods Compliance Note */}
             <div className="p-3 bg-white/[0.03] border border-border-glass rounded-xl flex flex-col gap-1.5 text-[0.72rem] text-text-dim">
               <div className="flex items-center gap-1.5 text-text-main font-bold">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                 <span>Philippine Data Privacy Act (RA 10173)</span>
               </div>
               <p className="m-0 leading-relaxed text-[0.68rem]">
                 Your contact phone, fulfillment details, and GCash receipt are encrypted and processed solely for order completion and courier delivery.
               </p>
               <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-[0.68rem]">
                 <span>Custom Goods (RA 7394 Non-cancellable once stitched)</span>
                 <button
                   type="button"
                   onClick={() => { setTermsInitialTab('refunds'); setIsTermsModalOpen(true); }}
                   className="text-primary hover:underline font-bold bg-transparent border-none p-0 cursor-pointer"
                 >
                   View Policies ›
                 </button>
               </div>
             </div>

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
                 className="shadow-sm hover:shadow-md"
               >
                 Confirm & Dispatch Order
               </GlassButton>
             )}
          </div>
        </div>
      </div>
          {/* Shopee-style Address Book Modal */}
      <AddressBookModal
        isOpen={isAddressBookOpen}
        onClose={() => setIsAddressBookOpen(false)}
        onSelectAddress={(addr) => {
          setSelectedSavedAddress(addr);
          setDeliveryAddress(addr.fullAddress || addr.streetAddress);
          setDeliveryPhone(addr.phoneNumber);
        }}
        selectedAddressId={selectedSavedAddress?.id}
      />
      {/* Terms & Policies Modal */}
      <TermsAndPoliciesModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        initialTab={termsInitialTab}
      />
    </GlassModal>
  );
}
