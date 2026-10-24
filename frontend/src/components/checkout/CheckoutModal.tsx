'use client';

import { useState, useEffect, useMemo } from 'react';
import TermsAndPoliciesModal from '@/components/ui/TermsAndPoliciesModal';
import GlassModal from '@/components/ui/GlassModal';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { api, apiFetch } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import GCashPayment from './GCashPayment';
import type { BasketItem } from '@/lib/types';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkoutItems?: BasketItem[];
  initialFulfillmentType?: 'delivery' | 'pickup';
  onSuccess?: (createdOrder?: any) => void;
}

type PaymentMethod = 'gcash';

export default function CheckoutModal({ isOpen, onClose, checkoutItems, initialFulfillmentType, onSuccess }: CheckoutModalProps) {
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
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [latestCreatedOrder, setLatestCreatedOrder] = useState<any | null>(null);
  const [isBypassing, setIsBypassing] = useState(false);

  const OFFICIAL_GCASH_QR = 'https://res.cloudinary.com/dzr6uwcr1/image/upload/v1790078256/stitch-master-products/wrdipkvspnz1fuewligw.jpg';
  const [gcashQrCodeUrl, setGcashQrCodeUrl] = useState<string | null>(OFFICIAL_GCASH_QR);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [readyLabel, setReadyLabel] = useState<string | null>(null);
  const [estimatedReadyDate, setEstimatedReadyDate] = useState<string | null>(null);
  const [activeQueueOrdersCount, setActiveQueueOrdersCount] = useState<number>(0);

  // PSA/Retail Style Appointment Window Selection (Option 1: Modern Retail Model)
  // Claim Date Selection (Customer chooses target day; pick up anytime during store hours)
  const [selectedDateStr, setSelectedDateStr] = useState<string>('');

  // Pick-up Fulfillment & Special Instructions
  const [fulfillmentType] = useState<'pickup'>('pickup');
  const [pickupNote, setPickupNote] = useState('');
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [termsInitialTab, setTermsInitialTab] = useState<'refunds' | 'pickup' | 'copyright' | 'colors' | 'privacy'>('refunds');

  useEffect(() => {
    if (isOpen) {
      api.get<{ gcashQrCodeUrl: string }>('/api/customer/settings')
        .then(res => {
          if (res) {
            setGcashQrCodeUrl(res.gcashQrCodeUrl);
          }
        })
        .catch(console.error);
      api.get<{ estimatedMinutes: number; readyLabel?: string; estimatedReadyDate?: string; activeOrders?: number }>('/api/customer/capacity')
        .then(res => {
          if (res) {
            setEstimatedMinutes(res.estimatedMinutes);
            if (res.readyLabel) setReadyLabel(res.readyLabel);
            if (res.estimatedReadyDate) {
              setEstimatedReadyDate(res.estimatedReadyDate);
            }
            if (typeof res.activeOrders === 'number') {
              setActiveQueueOrdersCount(res.activeOrders);
            }
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  const availableDates = useMemo(() => {
    const list: Array<{
      dateStr: string;
      dayOfWeek: string;
      dayNumber: string;
      friendlyLabel: string;
    }> = [];

    const start = estimatedReadyDate ? new Date(estimatedReadyDate) : new Date();
    const base = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date();
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    for (let i = 0; i < 30; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const diffDays = Math.round((d.getTime() - todayMid.getTime()) / (1000 * 60 * 60 * 24));
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      let friendlyLabel = `${weekday}, ${monthDay}`;
      if (diffDays === 0) friendlyLabel = `Today, ${monthDay}`;
      else if (diffDays === 1) friendlyLabel = `Tomorrow, ${monthDay}`;

      list.push({
        dateStr,
        dayOfWeek: weekday.toUpperCase(),
        dayNumber: String(d.getDate()),
        friendlyLabel
      });
    }

    return list;
  }, [estimatedReadyDate]);

  useEffect(() => {
    if (availableDates.length > 0 && !selectedDateStr) {
      setSelectedDateStr(availableDates[0].dateStr);
    }
  }, [availableDates, selectedDateStr]);

  const { chosenDueDate, chosenDeliveryTimeLabel } = useMemo(() => {
    const dateObj = availableDates.find(d => d.dateStr === selectedDateStr) || availableDates[0];

    if (!selectedDateStr || !dateObj) {
      return {
        chosenDueDate: estimatedReadyDate || undefined,
        chosenDeliveryTimeLabel: readyLabel || 'Earliest Available (10 AM–8 PM)'
      };
    }

    const earliestDateStr = availableDates[0]?.dateStr;
    const isEarliestDate = selectedDateStr === earliestDateStr;

    let chosen: Date;
    if (isEarliestDate && estimatedReadyDate) {
      chosen = new Date(estimatedReadyDate);
    } else {
      const [year, month, day] = selectedDateStr.split('-').map(Number);
      // For future dates, default to 10:00 AM store opening, but never earlier than estimatedReadyDate
      chosen = new Date(year, month - 1, day, 10, 0, 0);
      if (estimatedReadyDate && chosen.getTime() < new Date(estimatedReadyDate).getTime()) {
        chosen = new Date(estimatedReadyDate);
      }
    }

    const dateLabel = dateObj.friendlyLabel;
    const label = `${dateLabel} (Estimated completion${readyLabel ? `: ${readyLabel}` : ''})`;

    return {
      chosenDueDate: chosen.toISOString(),
      chosenDeliveryTimeLabel: label
    };
  }, [selectedDateStr, availableDates, estimatedReadyDate, readyLabel]);

  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const finalTotal = itemsTotal;

  const handleClearProcessedItems = () => {
    if (checkoutItems && checkoutItems.length > 0 && checkoutItems.length < allBasketItems.length) {
      checkoutItems.forEach(i => removeItem(i.id));
    } else {
      clearBasket();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    const currentAddress = 'Store Pick-up: Eds Towels & Caps, Pacific Mall Lucena, Quezon 4301';

    if (user && !user.isEmailVerified) {
      showToast('Please check your email to verify your account before placing an order.', 'error');
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

      const firstPersonalizedItem = items.find((i) => i.personalization?.text);
      const orderRes = await api.post<{ order: { orderId: string; totalAmount?: number }, receiptID: string }>('/api/customer/order/submit', {
        items,
        totalAmount: finalTotal,
        address: currentAddress,
        deliveryTime: chosenDeliveryTimeLabel,
        dueDate: chosenDueDate,
        notes: pickupNote.trim() ? `[Pick-up Note: ${pickupNote.trim()}]` : '',
        paymentMethod: 'gcash',
        receiptUrl: uploadData.url,
        personalization: {
          fulfillmentType: 'pickup',
          courier: 'Store Pick-up',
          claimSchedule: chosenDeliveryTimeLabel,
          claimantName: user?.username || 'Customer',
          claimantPhone: user?.phoneNumber || undefined,
          pickupNote: pickupNote.trim() || undefined,
          text: firstPersonalizedItem?.personalization?.text,
          color: firstPersonalizedItem?.personalization?.threadColor,
          font: firstPersonalizedItem?.personalization?.font,
        }
      });

      if (orderRes?.order?.orderId) {
        setPendingOrderId(orderRes.order.orderId);
        setLatestCreatedOrder(orderRes.order);
      }

      // Step 3: Call AI verification with the uploaded receipt
      const verifyRes = await api.post<{
        success: boolean;
        message: string;
        verificationStatus?: string;
        flaggedReason?: string;
        aiResult?: { extractedAmount?: number; confidence?: number; referenceId?: string; paymentPlatform?: string };
      }>('/api/ai/verify-receipt', {
        receiptUrl: uploadData.url,
        orderTotal: orderRes.order?.totalAmount ?? finalTotal,
        orderId: orderRes.order.orderId
      });

      if (verifyRes.success) {
        if (verifyRes.verificationStatus === 'pending_manual_verification') {
          if (verifyRes.aiResult?.referenceId) {
            setManualRef(verifyRes.aiResult.referenceId);
          }
          setAiVerificationResult('Receipt uploaded! Please confirm your GCash Reference Number below to finalize your order.');
          showToast('Receipt received! Please confirm your GCash Reference Number below.', 'info');
        } else {
          setPaymentVerified(true);
          const amountText = verifyRes.aiResult?.extractedAmount ? `₱${verifyRes.aiResult.extractedAmount.toFixed(2)}` : `₱${finalTotal.toFixed(2)}`;
          setAiVerificationResult(`Payment Confirmed — ${amountText}`);
          showToast('Payment confirmed! Your order is now in the queue.', 'success');
          try {
            await refreshUser();
            await fetchDashboardState();
            handleClearProcessedItems();
          } catch (cleanErr) {
            console.error('[Checkout Cleanup Notice]:', cleanErr);
          }
          handleModalClose(true, orderRes.order);
        }
      } else {
        // Auto-fill extracted reference ID so customer doesn't have to manually retype 13 digits!
        if (verifyRes.aiResult?.referenceId) {
          setManualRef(verifyRes.aiResult.referenceId);
        }
        const reasonText = verifyRes.message || verifyRes.flaggedReason || "Please confirm your GCash Reference Number below to complete your order.";
        setAiVerificationResult(`${reasonText}`);
        showToast(reasonText, 'info');
        await fetchDashboardState();
      }
    } catch (err: any) {
      console.warn('[Receipt Verification Notice]:', err?.message || err);
      const friendlyMsg = "Receipt image uploaded! Please confirm your GCash Reference Number below so our team can confirm your payment.";
      setAiVerificationResult(`${friendlyMsg}`);
      showToast('Receipt uploaded! Please confirm your GCash Reference Number below.', 'info');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleSubmitManualRef = async () => {
    const cleanRef = manualRef.trim();
    if (!cleanRef) {
      showToast('Please enter your GCash reference number.', 'error');
      return;
    }

    const currentAddress = 'Store Pick-up: Eds Towels & Caps, Pacific Mall Lucena, Quezon 4301';

    setIsProcessing(true);
    try {
      const firstPersonalizedItem = items.find((i) => i.personalization?.text);
      const res = await api.post<{ order: any; receiptID: string }>('/api/customer/order/submit', {
        items,
        totalAmount: finalTotal,
        address: currentAddress,
        deliveryTime: chosenDeliveryTimeLabel,
        dueDate: chosenDueDate,
        notes: pickupNote.trim() ? `[Pick-up Note: ${pickupNote.trim()}]` : '',
        paymentMethod: 'gcash',
        existingOrderId: pendingOrderId || undefined,
        referenceNumber: cleanRef,
        idempotencyKey: cleanRef ? `ref-${cleanRef}` : `checkout-${user?.id || 'anon'}-${Date.now()}`,
        personalization: {
          fulfillmentType: 'pickup',
          courier: 'Store Pick-up',
          claimSchedule: chosenDeliveryTimeLabel,
          referenceNumber: cleanRef,
          claimantName: user?.username || 'Customer',
          claimantPhone: user?.phoneNumber || undefined,
          pickupNote: pickupNote.trim() || undefined,
          text: firstPersonalizedItem?.personalization?.text,
          color: firstPersonalizedItem?.personalization?.threadColor,
          font: firstPersonalizedItem?.personalization?.font,
        }
      });

      setPaymentVerified(true);
      setLatestCreatedOrder(res?.order);
      setAiVerificationResult(`GCash Reference Saved: ${cleanRef}`);
      showToast('Order received! Thank you for your payment.', 'success');
      handleModalClose(true, res?.order);
      refreshUser().catch(() => {});
      fetchDashboardState().catch(() => {});
      handleClearProcessedItems();
    } catch (err: any) {
      console.error('[Manual Ref Order Submit Catch]:', err);
      showToast(err.message || 'We could not submit your order right now. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModalClose = (wasSuccessful = false, createdOrder: any = null) => {
    setPendingOrderId(null);
    setReceiptFile(null);
    setAiVerificationResult(null);
    setManualRef('');
    setPaymentVerified(false);
    setLatestCreatedOrder(null);
    onClose();
    if (wasSuccessful && onSuccess) {
      onSuccess(createdOrder);
    }
  };

  const handleBypassGCash = async () => {
    if (items.length === 0) {
      showToast('Your basket is empty. Please add items before checking out.', 'error');
      return;
    }

    const currentAddress = 'Store Pick-up: Eds Towels & Caps, Pacific Mall Lucena, Quezon 4301';

    setIsBypassing(true);
    const testRef = `TEST-GCASH-${Date.now().toString().slice(-8)}`;

    try {
      const firstPersonalizedItem = items.find((i) => i.personalization?.text);
      const bypassRes = await api.post<{ order: any; receiptID: string }>('/api/customer/order/submit', {
        items,
        totalAmount: finalTotal,
        address: currentAddress,
        deliveryTime: chosenDeliveryTimeLabel,
        dueDate: chosenDueDate,
        notes: pickupNote.trim() ? `[Pick-up Note: ${pickupNote.trim()}]` : '',
        paymentMethod: 'gcash',
        isTestBypass: true,
        referenceNumber: testRef,
        existingOrderId: pendingOrderId || undefined,
        receiptUrl: `https://res.cloudinary.com/dzr6uwcr1/image/upload/v1790078256/stitch-master-products/wrdipkvspnz1fuewligw.jpg?bypass=${testRef}`,
        personalization: {
          fulfillmentType: 'pickup',
          courier: 'Store Pick-up',
          claimSchedule: chosenDeliveryTimeLabel,
          referenceNumber: testRef,
          claimantName: user?.username || 'Customer',
          claimantPhone: user?.phoneNumber || undefined,
          pickupNote: pickupNote.trim() || undefined,
          text: firstPersonalizedItem?.personalization?.text,
          color: firstPersonalizedItem?.personalization?.threadColor,
          font: firstPersonalizedItem?.personalization?.font,
        }
      });

      setPaymentVerified(true);
      setLatestCreatedOrder(bypassRes?.order);
      setAiVerificationResult(`Test Mode: GCash payment bypassed & auto-approved (${testRef})`);
      showToast('Test Mode: GCash Payment Bypassed & Order Placed!', 'success');
      handleModalClose(true, bypassRes?.order);
      refreshUser().catch(() => {});
      fetchDashboardState().catch(() => {});
      handleClearProcessedItems();
    } catch (err: any) {
      console.error('[Bypass Order Error]:', err);
      showToast(err.message || 'Failed to bypass payment.', 'error');
    } finally {
      setIsBypassing(false);
    }
  };

  return (
    <GlassModal isOpen={isOpen} onClose={() => handleModalClose(false)} maxWidth="max-w-[880px]" noPadding>
      <div className="p-4 sm:p-5 flex flex-col">
        {/* Sticky/Fixed Modal Header */}
        <div className="flex justify-between items-center pb-3 mb-3 border-b border-border-glass/40 pr-10">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-text-main">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <h2 className="text-base sm:text-lg font-bold m-0 text-text-main">
              Secure Checkout
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.62rem] font-medium text-text-dim px-2.5 py-0.5 rounded-full bg-white/[0.03] border border-border-glass/50">
              Pick-up &amp; GCash
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[1.1fr_1fr] gap-5 max-md:grid-cols-1 max-md:gap-4">
          {/* Left Column: Store Pick-up Appointment & Order Items */}
          <div className="flex flex-col gap-3 min-w-0">
            {/* Unified Store Pick-up & Schedule Card */}
            <div className="bg-white/[0.02] border border-border-glass/60 rounded-xl p-3 flex flex-col gap-2.5">
              {/* Card Header: Store Location & Policies */}
              <div className="flex items-center justify-between pb-2 border-b border-border-glass/40">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-border-glass/60 flex items-center justify-center text-text-main shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </div>
                  <div className="flex flex-col text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-text-main text-[0.78rem] truncate">Eds Towels &amp; Caps Studio</span>
                      <span className="text-[0.58rem] px-1.5 py-0.2 rounded bg-white/[0.06] border border-white/10 text-text-main font-semibold uppercase tracking-wider shrink-0">
                        Free Pickup
                      </span>
                    </div>
                    <span className="text-[0.66rem] text-text-dim truncate">
                      Pacific Mall Lucena • Daily 10:00 AM – 8:00 PM
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setTermsInitialTab('pickup'); setIsTermsModalOpen(true); }}
                  className="text-[0.68rem] text-text-dim hover:text-text-main font-semibold underline underline-offset-2 shrink-0 cursor-pointer bg-transparent border-none p-1"
                >
                  Policies ›
                </button>
              </div>

              {/* Target Claim Date Selection */}
              <div className="flex flex-col gap-1">
                <label className="text-[0.62rem] font-bold text-text-dim uppercase tracking-wider flex items-center justify-between">
                  <span>Pick-up Date</span>
                  <span className="text-[0.6rem] text-text-dim/70 font-mono font-normal">Held 30 Days</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedDateStr}
                    onChange={(e) => setSelectedDateStr(e.target.value)}
                    style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', backgroundImage: 'none' }}
                    className="w-full bg-bg-surface border border-border-glass/70 text-text-main text-xs rounded-lg pl-3 pr-8 py-2.5 outline-none focus:border-white/40 cursor-pointer font-medium"
                  >
                    {availableDates.map((item, idx) => (
                      <option key={item.dateStr} value={item.dateStr} className="bg-[#12141c] text-white">
                        {item.friendlyLabel}{idx === 0 ? ' • Earliest Ready' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-dim flex items-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Dynamic Status Bar */}
              <div className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-border-glass/50 flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center min-w-0">
                    <span className="text-[0.7rem] font-medium text-text-main truncate">
                      {selectedDateStr === (availableDates[0]?.dateStr)
                        ? `Production Target: Today (~${estimatedMinutes || 15} mins active artisan time)`
                        : `Target claim date: ${availableDates.find(d => d.dateStr === selectedDateStr)?.friendlyLabel || selectedDateStr}`}
                    </span>
                  </div>
                  <span className="text-[0.58rem] px-1.5 py-0.5 rounded border border-border-glass/50 text-text-dim font-medium shrink-0 ml-2">
                    {activeQueueOrdersCount > 0 ? `${activeQueueOrdersCount} orders ahead in queue` : 'Workshop Ready'}
                  </span>
                </div>
                <p className="text-[0.62rem] text-amber-400/90 m-0 leading-normal">
                  ⏱️ Note: Your exact queue placement &amp; ready time will be locked in immediately once payment is verified.
                </p>
              </div>
            </div>

            {/* Pick-up Note (Compact Single-line) */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[0.62rem] font-bold text-text-dim uppercase tracking-wider">
                  Pick-up Notes / Claimant
                </label>
                <span className="text-[0.58rem] text-text-dim/60 font-normal lowercase">(optional)</span>
              </div>
              <input
                type="text"
                placeholder="e.g. Authorized sibling to claim, special request, etc."
                value={pickupNote}
                onChange={(e) => setPickupNote(e.target.value)}
                className="bg-bg-surface border border-border-glass/70 px-2.5 py-1.5 rounded-lg text-text-main text-xs outline-none focus:border-white/40 placeholder:text-text-dim/40"
              />
            </div>

            {/* Order Summary (Compact with internal scroll) */}
            <div className="flex flex-col gap-1.5 border-t border-border-glass/50 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[0.72rem] font-bold text-text-main m-0 uppercase tracking-wider">
                  Order Items ({items.length})
                </h3>
                <span className="text-[0.72rem] text-text-dim">
                  Total: <span className="font-mono font-bold text-text-main">₱{finalTotal.toFixed(2)}</span>
                </span>
              </div>
              <div className="max-h-[96px] overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-thin">
                {items.map((item) => {
                  const variantText = [item.selectedVariant, item.selectedSize ? `Size: ${item.selectedSize}` : null].filter(Boolean).join(' • ');
                  return (
                    <div key={item.id} className="flex justify-between items-center p-1.5 px-2 bg-white/[0.02] border border-border-glass/40 rounded-lg text-xs">
                      <div className="flex flex-col text-left min-w-0 pr-2">
                        <span className="font-semibold text-text-main text-[0.75rem] truncate">{item.name}</span>
                        <div className="flex items-center gap-1.5 text-[0.65rem] text-text-dim truncate">
                          {item.selectedColor && (
                            <span
                              className="w-2 h-2 rounded-full border border-white/20 inline-block shrink-0"
                              style={{ backgroundColor: item.selectedColor }}
                            />
                          )}
                          <span>{variantText ? `${variantText} • Qty: ${item.quantity}` : `Qty: ${item.quantity}`}</span>
                          {item.personalization?.text && (
                            <span className="text-text-main font-mono truncate">
                              • &ldquo;{item.personalization.text}&rdquo;
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[0.78rem] shrink-0">₱{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: GCash Payment & Place Order */}
          <div className="flex flex-col gap-3 border-l border-border-glass/50 pl-5 max-md:border-l-0 max-md:pl-0 max-md:pt-3 max-md:border-t min-w-0">
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
              onBypassPayment={handleBypassGCash}
              isBypassing={isBypassing}
            />
          </div>
        </div>
      </div>

      {/* Terms & Policies Modal */}
      <TermsAndPoliciesModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        initialTab={termsInitialTab}
      />
    </GlassModal>
  );
}
