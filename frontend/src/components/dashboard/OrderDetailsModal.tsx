'use client';

import { isValidProductImage } from '@/lib/imageOptimizer';
import ProductImagePlaceholder from '@/components/ui/ProductImagePlaceholder';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import WaybillModal from '@/components/dashboard/WaybillModal';
import CustomerHelpModal from '@/components/dashboard/CustomerHelpModal';
import OrderReviewModal from '@/components/dashboard/OrderReviewModal';
import InvoiceModal from '@/components/dashboard/InvoiceModal';
import type { Order } from '@/lib/types';
import { api, apiFetch } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { useProductStore } from '@/stores/useProductStore';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { getOrderStage, getOrderCreditSummary, TOTAL_STEPS } from '@/lib/orderStatus';

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'summary' | 'tracking';
  onOrderCancelled?: (orderId: string) => void;
  onReorder?: (order: Order) => void;
}

function groupNames(names: string[]): Array<{ name: string; count: number }> {
  if (!Array.isArray(names) || names.length === 0) return [];
  const map = new Map<string, number>();
  for (const raw of names) {
    const trimmed = String(raw || '').trim();
    if (trimmed) {
      map.set(trimmed, (map.get(trimmed) || 0) + 1);
    }
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
}

export default function OrderDetailsModal({
  order,
  isOpen,
  onClose,
  onOrderCancelled,
  onReorder
}: OrderDetailsModalProps) {
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isClaimSlipOpen, setIsClaimSlipOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [helpCategory, setHelpCategory] = useState<string | undefined>(undefined);
  const [expandedRosterIdx, setExpandedRosterIdx] = useState<number | null>(null);
  const [balanceRef, setBalanceRef] = useState('');
  const [isSubmittingBalance, setIsSubmittingBalance] = useState(false);
  const [isUploadingTopUp, setIsUploadingTopUp] = useState(false);
  const [topUpReceiptUrl, setTopUpReceiptUrl] = useState('');
  const [isAnalyzingReceipt, setIsAnalyzingReceipt] = useState(false);
  const [receiptVerificationResult, setReceiptVerificationResult] = useState<string | null>(null);
  const [receiptVerified, setReceiptVerified] = useState(false);
  const [allowManualRef, setAllowManualRef] = useState(false);
  const [lastVerifyResult, setLastVerifyResult] = useState<any | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [refError, setRefError] = useState('');
  const [refTouched, setRefTouched] = useState(false);
  const [storeGcashSettings, setStoreGcashSettings] = useState<{ gcashQrCodeUrl?: string; gcashAccountName?: string; gcashAccountNumber?: string } | null>(null);
  const { user, refreshUser } = useAuthStore();

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);

  useEffect(() => {
    if (isOpen && !storeGcashSettings) {
      api.get<any>('/api/customer/settings').then(res => {
        if (res) {
          setStoreGcashSettings({
            gcashQrCodeUrl: res.gcashQrCodeUrl || undefined,
            gcashAccountName: res.gcashAccountName || undefined,
            gcashAccountNumber: res.gcashAccountNumber || undefined
          });
        }
      }).catch(() => {});
    }
  }, [isOpen, storeGcashSettings]);

  const validateBalanceRef = (val: string) => {
    const clean = val.trim();
    if (!clean) {
      const err = 'Please enter your GCash reference number';
      setRefError(err);
      return err;
    }
    const cleanChars = clean.replace(/[\s-]/g, '');
    if (cleanChars.length < 9) {
      const err = 'Please enter at least 9 characters from your GCash reference number';
      setRefError(err);
      return err;
    }
    setRefError('');
    return '';
  };

  const copyToClipboard = (text: string, type: 'number' | 'amount') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === 'number') {
      setCopiedNumber(true);
      showToast(`GCash number (${text}) copied to clipboard!`, 'success');
      setTimeout(() => setCopiedNumber(false), 2000);
    } else {
      setCopiedAmount(true);
      showToast(`Amount (₱${text}) copied to clipboard!`, 'success');
      setTimeout(() => setCopiedAmount(false), 2000);
    }
  };

  const processBalanceReceiptFile = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image screenshot (PNG, JPG, or WEBP).', 'warning');
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setReceiptPreviewUrl(localUrl);
    setIsAnalyzingReceipt(true);
    setReceiptVerificationResult(null);
    setReceiptVerified(false);
    setAllowManualRef(false);
    setLastVerifyResult(null);

    try {
      // Step 1: Upload receipt screenshot to Cloudinary
      const formData = new FormData();
      formData.append('receipt', file);
      const uploadData = await apiFetch<{ url?: string }>('/api/customer/upload-receipt', {
        method: 'POST',
        body: formData
      });

      if (!uploadData?.url) {
        showToast('We could not upload your receipt. Please try again with a clear screenshot.', 'error');
        setReceiptPreviewUrl(null);
        return;
      }

      // Step 2: Run AI OCR receipt verification against outstanding balance
      const balanceDue = order ? getOrderCreditSummary(order).outstandingBalance : 0;
      try {
        const verifyRes = await api.post<{
          success: boolean;
          message: string;
          verificationStatus?: string;
          needsManualRef?: boolean;
          imageHash?: string | null;
          flaggedReason?: string;
          isInsufficientPayment?: boolean;
          isOverpayment?: boolean;
          overpaymentAmount?: number;
          extractedAmount?: number;
          accountCredit?: number;
          outstandingBalance?: number;
          aiResult?: {
            isValidReceipt?: boolean;
            extractedAmount?: number;
            confidence?: number;
            referenceId?: string;
            paymentPlatform?: string;
          };
        }>('/api/ai/verify-receipt', {
          receiptUrl: uploadData.url,
          orderTotal: balanceDue,
          isBalanceSettlement: true,
          orderId: order?.orderId
        });

        setLastVerifyResult(verifyRes);

        if (verifyRes.success) {
          // Authentic receipt & payment confirmed
          setTopUpReceiptUrl(uploadData.url);
          setReceiptVerified(true);
          setAllowManualRef(false);
          const extAmt = verifyRes.aiResult?.extractedAmount ?? verifyRes.extractedAmount;
          const refId = verifyRes.aiResult?.referenceId || '';
          if (refId) {
            setBalanceRef(refId);
          }

          // Auto-submit remaining balance payment upon successful verification
          setIsSubmittingBalance(true);
          try {
            await api.post<{ success: boolean; message: string }>(
              `/api/customer/orders/${order?.id || order?.orderId}/pay-balance`,
              {
                referenceNumber: refId || undefined,
                receiptUrl: uploadData.url,
                amountPaid: extAmt || balanceDue,
                paymentMethod: 'gcash',
                imageHash: verifyRes.imageHash || undefined,
                ocrData: verifyRes.aiResult || undefined,
                confidenceScore: verifyRes.aiResult?.confidence || undefined,
                flaggedReason: verifyRes.flaggedReason || undefined
              }
            );

            if (verifyRes.isOverpayment && verifyRes.overpaymentAmount) {
              const msg = `Overpayment detected: You sent ₱${Number(extAmt || (balanceDue + verifyRes.overpaymentAmount)).toFixed(2)} for a ₱${balanceDue.toFixed(2)} balance. The excess ₱${Number(verifyRes.overpaymentAmount).toFixed(2)} has been added to your Store Wallet!`;
              setReceiptVerificationResult(msg);
              showToast(msg, 'success');
            } else {
              const msg = `✓ Receipt verified! Remaining balance payment submitted (Ref: ${refId || 'Verified'}).`;
              setReceiptVerificationResult(msg);
              showToast(msg, 'success');
            }

            await refreshUser();
            await useProductStore.getState().fetchDashboardState();
          } catch (submitErr: any) {
            const errMsg = submitErr?.message || 'Failed to submit remaining balance payment.';
            setReceiptVerificationResult(errMsg);
            showToast(errMsg, 'error');
          } finally {
            setIsSubmittingBalance(false);
          }
        } else if (verifyRes.needsManualRef && verifyRes.verificationStatus === 'pending_manual_verification') {
          // Authentic payment receipt detected by OCR, but reference number needs user confirmation
          setTopUpReceiptUrl(uploadData.url);
          setReceiptVerified(false);
          setAllowManualRef(true);
          if (verifyRes.aiResult?.referenceId) {
            setBalanceRef(verifyRes.aiResult.referenceId);
          }
          const promptMsg = verifyRes.message || 'Receipt uploaded! Please confirm your 13-digit GCash Reference Number below to settle your balance.';
          setReceiptVerificationResult(promptMsg);
        } else {
          // Hard rejection (non-receipt image, duplicate receipt, outdated receipt, wrong recipient, or insufficient amount)
          setTopUpReceiptUrl(''); // Clear invalid receipt URL so it cannot be submitted
          setBalanceRef('');
          setReceiptVerified(false);
          setAllowManualRef(false);
          const rawReason = verifyRes.message || verifyRes.flaggedReason || '';
          const reasonText = (rawReason && !rawReason.includes('does not appear to be an authentic payment receipt'))
            ? rawReason
            : 'Please upload an authentic, clear GCash transaction confirmation screenshot for this balance payment showing the exact amount and reference number.';
          setReceiptVerificationResult(reasonText);
          showToast(reasonText, 'error');
        }
      } catch (ocrErr: any) {
        console.warn('[Balance OCR Check]:', ocrErr);
        setTopUpReceiptUrl(uploadData.url);
        setReceiptVerified(false);
        setAllowManualRef(true);
        const errMsg = ocrErr?.message || 'Could not verify receipt automatically. Please enter your GCash Reference Number below.';
        setReceiptVerificationResult(errMsg);
      }
    } catch {
      showToast('Could not upload receipt screenshot. You can manually enter your GCash reference number.', 'warning');
      setReceiptPreviewUrl(null);
    } finally {
      setIsAnalyzingReceipt(false);
    }
  };

  // Clipboard paste listener for Ctrl+V (Hook called unconditionally)
  useEffect(() => {
    if (!isOpen || !order) return;
    const creditSummary = getOrderCreditSummary(order);
    if (!creditSummary.isInsufficientPayment) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            showToast('Receipt screenshot pasted from clipboard!', 'success');
            processBalanceReceiptFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, order]);

  if (!order) return null;

  const stage = getOrderStage(order);
  const credit = getOrderCreditSummary(order);
  const percent = Math.min(100, Math.max(10, (stage.step / TOTAL_STEPS) * 100));

  const isCanceled = stage.tone === 'cancelled';
  const isCompletedOrDelivered = stage.tone === 'done';

  const isInProduction = [
    'Preparing Order',
    'In Transit',
    'Ready For Pick Up',
    'Ready For Pick-Up',
    'Ready for Pickup',
    'Out for Delivery'
  ].includes(order.status) && !isCompletedOrDelivered;

  // Option A: Paid orders (GCash, Maya, etc.) require workshop mediation/counter visit for cancellation & refund.
  // Direct self-service cancel is reserved for unpaid orders before production.
  const isPaid = order.paymentStatus?.toLowerCase() === 'paid' ||
    (Boolean(order.paymentMethod) && 
     !['none', 'unpaid', 'pending'].includes(order.paymentMethod.toLowerCase()) && 
     order.paymentStatus?.toLowerCase() !== 'unpaid');

  const canCancel = !isCanceled && !isInProduction && !isCompletedOrDelivered && !isPaid;

  const cleanId = order.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  const claimCode = (order.personalization as any)?.claimCode || (
    order.orderId.startsWith('WI-')
      ? `#${order.orderId.replace('WI-', 'A-')}`
      : `#A-${cleanId.slice(-4)}`
  );

  const handleCancelOrder = async () => {
    if (!canCancel || isCancelling) return;
    const confirmed = window.confirm(
      `Are you sure you want to cancel order #${order.orderId}?\n\nThis will cancel your order and release reserved materials.`
    );
    if (!confirmed) return;

    setIsCancelling(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/api/customer/orders/${order.id || order.orderId}/cancel`,
        {}
      );
      showToast(res?.message || 'Order cancelled successfully', 'success');
      onOrderCancelled?.(order.id || order.orderId);
      useProductStore.getState().fetchDashboardState().catch(() => {});
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to cancel order', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitRemainingBalance = async (manualOverrideRef?: string) => {
    const cleanRef = (typeof manualOverrideRef === 'string' ? manualOverrideRef : balanceRef).trim();
    if (!cleanRef && !topUpReceiptUrl) {
      showToast('Please enter your GCash reference number or upload your receipt screenshot for the remaining balance.', 'warning');
      return;
    }
    if (cleanRef) {
      const err = validateBalanceRef(cleanRef);
      if (err) {
        showToast(err, 'warning');
        return;
      }
    }
    setIsSubmittingBalance(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/api/customer/orders/${order.id || order.orderId}/pay-balance`,
        {
          referenceNumber: cleanRef || undefined,
          receiptUrl: topUpReceiptUrl || undefined,
          amountPaid: lastVerifyResult?.extractedAmount || credit.outstandingBalance,
          paymentMethod: 'gcash',
          imageHash: lastVerifyResult?.imageHash || undefined,
          ocrData: lastVerifyResult?.aiResult || undefined,
          confidenceScore: lastVerifyResult?.aiResult?.confidence || undefined,
          flaggedReason: lastVerifyResult?.flaggedReason || undefined
        }
      );
      showToast(res?.message || 'Remaining balance payment submitted!', 'success');
      setBalanceRef('');
      setTopUpReceiptUrl('');
      setReceiptPreviewUrl(null);
      setReceiptVerificationResult(null);
      setReceiptVerified(false);
      setAllowManualRef(false);
      setLastVerifyResult(null);
      await refreshUser();
      await useProductStore.getState().fetchDashboardState();
    } catch (err: any) {
      showToast(err?.message || 'Failed to submit remaining balance payment.', 'error');
    } finally {
      setIsSubmittingBalance(false);
    }
  };

  const handlePayBalanceWithWallet = async () => {
    if (!user || (user.walletBalance ?? 0) < credit.outstandingBalance) {
      showToast('Your Store Wallet balance is not sufficient to cover the remaining balance.', 'warning');
      return;
    }
    setIsSubmittingBalance(true);
    try {
      const res = await api.post<{ success: boolean; message: string; walletBalance?: number }>(
        `/api/customer/orders/${order.id || order.orderId}/pay-balance`,
        {
          amountPaid: credit.outstandingBalance,
          paymentMethod: 'wallet'
        }
      );
      showToast(res?.message || 'Paid with Store Wallet! Order is now in queue.', 'success');
      await refreshUser();
      await useProductStore.getState().fetchDashboardState();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to pay with store wallet.', 'error');
    } finally {
      setIsSubmittingBalance(false);
    }
  };

  const handleReorderAction = () => {
    if (onReorder) {
      onReorder(order);
      onClose();
      return;
    }
    if (!order.items || order.items.length === 0) {
      showToast('No items available to reorder from this order.', 'info');
      return;
    }
    const { addItem } = useBasketStore.getState();
    let count = 0;
    order.items.forEach((item) => {
      addItem({
        productId: item.productId,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
        selectedVariant: item.selectedVariant,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        quantity: item.quantity || 1
      });
      count += (item.quantity || 1);
    });
    showToast(`Added ${count} item(s) from #${order.orderId} to your basket!`, 'success');
    onClose();
  };

  // Tone color styling
  const statusBadgeStyle = isCanceled
    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
    : isCompletedOrDelivered
      ? 'bg-white/10 text-text-main border border-border-glass'
      : stage.tone === 'shipping'
        ? 'bg-secondary/15 text-secondary border border-secondary/30'
        : 'bg-primary/15 text-primary border border-primary/30';

  const statusCardStyle = isCanceled
    ? 'bg-red-500/10 border-red-500/25'
    : isCompletedOrDelivered
      ? 'bg-bg-surface border-border-glass'
      : stage.tone === 'shipping'
        ? 'bg-secondary/10 border-secondary/25'
        : 'bg-bg-surface border-border-glass';

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Order Tracking & Details" maxWidth="max-w-[560px]">
      <div className="flex flex-col gap-3 text-left">
        {/* 1. Header: Order ID + Status + Claim Code (Compact) */}
        <div className="flex items-center justify-between pb-2.5 border-b border-border-glass">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-primary text-base sm:text-lg">#{order.orderId}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeStyle}`}>
                {stage.label}
              </span>
            </div>
            <p className="text-[0.72rem] text-text-dim mt-0.5 m-0">
              Placed on {new Date(order.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} • {credit.isInsufficientPayment ? 'Partial Payment' : `Paid via ${order.paymentMethod.toUpperCase()}`}
            </p>
          </div>

          {claimCode && !isCanceled && (
            <div className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl text-right shrink-0">
              <span className="text-[0.62rem] text-text-dim block uppercase font-bold tracking-wider">Claim Code</span>
              <span className="font-mono font-black text-xs text-text-main">{claimCode}</span>
            </div>
          )}
        </div>

        {/* 2. Compact Status & Store Pick-up Card (Only shown when not on hold) */}
        {(!credit.isInsufficientPayment || credit.employeeApprovedPartial) && (
          <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${statusCardStyle}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                {isCanceled ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                ) : isCompletedOrDelivered ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 14 14" />
                  </svg>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-xs text-text-main leading-tight truncate">
                  {isCanceled
                    ? 'Order Cancelled'
                    : isCompletedOrDelivered
                      ? 'Claimed at Pacific Mall Studio'
                      : (order as any).processedBy
                        ? `Crafted by ${(order as any).processedBy}`
                        : 'Crafting at Pacific Mall Studio'}
                </span>
                <span className="text-[0.68rem] text-text-dim/80 mt-0.5">
                  {(order as any).processedBy && !isCompletedOrDelivered && !isCanceled
                    ? `Embroidery Specialist: ${(order as any).processedBy} • Pacific Mall Lucena`
                    : 'Pacific Mall Lucena • Ground Floor'}
                </span>
              </div>
            </div>

            {!isCanceled && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsClaimSlipOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-text-main text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                  title="View your digital claim slip & QR code"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>Claim Slip</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-text-main text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                  title="View receipt"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span>Receipt</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. Progress Bar (Step X of 5) — Hidden during Queue Hold to avoid redundancy */}
        {!isCanceled && !credit.isInsufficientPayment && (
          <div className="bg-bg-surface/60 border border-border-glass rounded-xl p-2.5 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[0.68rem]">
              <span className="text-text-dim font-medium">{stage.hint}</span>
              <span className="font-bold text-text-main">Step {stage.step} of {TOTAL_STEPS}</span>
            </div>
            <div className="w-full h-1.5 bg-border-glass rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {/* 3b. Insufficient Payment Breakdown Card (Single unified card when on queue hold) */}
        {credit.isInsufficientPayment && !credit.employeeApprovedPartial && !isCanceled && (
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-border-glass flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-text-main uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                <span>Payment Incomplete</span>
              </div>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-text-main text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap shrink-0"
                title="View receipt"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>Receipt</span>
              </button>
            </div>

            <p className="text-[0.72rem] text-text-dim m-0 leading-relaxed">
              Settle remaining balance below to begin production at Pacific Mall Studio.
            </p>

            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-bg-surface border border-border-glass font-mono text-xs text-center">
              <div>
                <span className="text-[0.62rem] text-text-dim block font-sans uppercase font-bold">Total</span>
                <span className="font-bold text-text-main">₱{credit.requiredAmount.toFixed(2)}</span>
              </div>
              <div className="border-x border-border-glass">
                <span className="text-[0.62rem] text-text-dim block font-sans uppercase font-bold">Credit Sent</span>
                <span className="font-bold text-text-main">₱{credit.accountCredit.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[0.62rem] text-primary block font-sans uppercase font-bold">Balance Due</span>
                <span className="font-extrabold text-primary">₱{credit.outstandingBalance.toFixed(2)}</span>
              </div>
            </div>

            {credit.balanceTopUpPending ? (
              <div className="p-2.5 rounded-lg bg-white/5 border border-border-glass text-[0.72rem] text-text-main font-medium flex items-center gap-1.5">
                <span>✓</span>
                <span>Remaining balance payment (+₱{credit.balanceTopUpAmount.toFixed(2)}{credit.balanceTopUpRef ? ` • Ref: ${credit.balanceTopUpRef}` : ''}) submitted — awaiting staff verification.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-1 border-t border-border-glass">
                {user?.walletBalance !== undefined && user.walletBalance >= credit.outstandingBalance && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-text-main flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Settle with Store Wallet Balance
                      </span>
                      <span className="text-[10px] text-text-dim">
                        Available Wallet Balance: <strong className="text-text-main font-mono">₱{user.walletBalance.toFixed(2)}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePayBalanceWithWallet}
                      disabled={isSubmittingBalance}
                      className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold cursor-pointer border-none shrink-0 transition-all shadow-sm active:scale-95"
                    >
                      {isSubmittingBalance ? 'Settling...' : `Pay ₱${credit.outstandingBalance.toFixed(2)} Instantly`}
                    </button>
                  </div>
                )}
                {/* Direct GCash QR & Account Info (Side-by-Side with copy buttons and click to enlarge) */}
                <div className="bg-white/[0.03] border border-border-glass/60 p-2.5 sm:p-3 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.68rem] font-bold text-text-main px-1.5 py-0.5 rounded bg-white/[0.06] border border-border-glass shrink-0">
                      Official Store GCash
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(credit.outstandingBalance.toFixed(2), 'amount')}
                      className="text-[0.68rem] bg-white/[0.05] hover:bg-white/[0.1] border border-border-glass/60 text-text-main font-semibold px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      {copiedAmount ? '✓ Copied' : `Copy ₱${credit.outstandingBalance.toFixed(2)}`}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 bg-bg-surface/80 p-2.5 rounded-lg border border-border-glass/50">
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <div>
                        <span className="text-[0.62rem] text-text-dim block uppercase tracking-wider font-semibold">GCash Number</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-text-main font-bold text-sm tracking-wide font-mono truncate">
                            {storeGcashSettings?.gcashAccountNumber || '0928 810 3928'}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard((storeGcashSettings?.gcashAccountNumber || '09288103928').replace(/\s+/g, ''), 'number')}
                            className="bg-white/10 hover:bg-white/20 text-white font-semibold px-2 py-0.5 rounded text-[0.65rem] transition-all cursor-pointer border border-white/20 shrink-0"
                          >
                            {copiedNumber ? '✓' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      <div className="border-t border-border-glass/40 pt-1">
                        <span className="text-[0.62rem] text-text-dim block uppercase tracking-wider font-semibold">Account Name</span>
                        <span className="text-text-main font-semibold text-[0.72rem] truncate block">
                          {storeGcashSettings?.gcashAccountName || 'Edz Towels & Caps'}
                        </span>
                      </div>
                    </div>

                    {(storeGcashSettings?.gcashQrCodeUrl || '/gcash-qr.png') && (
                      <div
                        onClick={() => setShowQrModal(true)}
                        className="relative group cursor-pointer bg-white p-1 rounded-lg shadow-sm border border-white/20 hover:scale-105 transition-all shrink-0"
                        title="Click to enlarge QR"
                      >
                        <img
                          src={storeGcashSettings?.gcashQrCodeUrl || '/gcash-qr.png'}
                          alt="GCash QR Code"
                          className="w-16 h-16 sm:w-18 sm:h-18 object-contain rounded"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                          <span className="text-white font-bold text-[0.55rem] bg-black/70 px-1 py-0.5 rounded">Enlarge</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload Zone (shown when NOT analyzing and NO verification notice / rejection box) */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <input
                    id="balance-receipt-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (e.target && 'value' in e.target) {
                        e.target.value = '';
                      }
                      if (file) processBalanceReceiptFile(file);
                    }}
                  />

                  {(!receiptVerificationResult || isAnalyzingReceipt) && (
                    <div
                      onClick={() => document.getElementById('balance-receipt-upload')?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) {
                          processBalanceReceiptFile(file);
                        }
                      }}
                      className={`group border-2 border-dashed rounded-xl p-3.5 text-center transition-all cursor-pointer ${
                        isDragging
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/40 scale-[1.01]'
                          : 'border-border-glass hover:border-primary/50 bg-white/[0.015] hover:bg-primary/[0.04]'
                      }`}
                    >
                      {receiptPreviewUrl && isAnalyzingReceipt ? (
                        <div className="flex items-center gap-3 p-1">
                          <div className="w-14 h-14 rounded-lg overflow-hidden border border-border-glass bg-bg-surface shrink-0">
                            <img src={receiptPreviewUrl} alt="Receipt preview" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex flex-col text-left min-w-0 flex-1">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 animate-spin text-text-main shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" />
                                  <path d="M12 2a10 10 0 0 1 10 10" />
                                </svg>
                                <span className="text-[0.78rem] text-text-main font-bold">Checking your receipt...</span>
                              </div>
                              <span className="text-[0.65rem] text-text-dim pl-5.5">Confirming payment details</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 py-1">
                          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all ${
                            isDragging
                              ? 'bg-primary text-white border-primary scale-110 shadow-md'
                              : 'bg-primary/10 border-primary/30 text-primary group-hover:bg-primary/15'
                          }`}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                          </div>
                          <span className="text-[0.78rem] text-text-main font-bold">
                            {isDragging ? 'Drop receipt screenshot here!' : 'Drag & drop receipt screenshot here, or tap to browse'}
                          </span>
                          <span className="text-[0.65rem] text-text-dim">
                            Screenshot or photo accepted, or press <strong className="text-text-main font-mono">Ctrl + V</strong> to paste
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Verification Notice or Rejection Box */}
                {receiptVerificationResult && !isAnalyzingReceipt && (
                  <div className="flex gap-3 p-2.5 rounded-lg text-[0.72rem] font-medium border border-border-glass bg-white/[0.04] text-text-main">
                    {/* Thumbnail beside message */}
                    {receiptPreviewUrl && (
                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-border-glass bg-bg-surface shrink-0 mt-0.5">
                        <img src={receiptPreviewUrl} alt="Receipt preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <div className="flex items-start gap-1.5 font-bold">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`shrink-0 mt-0.5 ${receiptVerified ? 'text-primary' : 'text-text-dim'}`}>
                          {receiptVerified ? <polyline points="20 6 9 17 4 12" /> : <circle cx="12" cy="12" r="10" />}
                        </svg>
                        <span className="leading-relaxed">{receiptVerificationResult}</span>
                      </div>

                      {!receiptVerified && !allowManualRef ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReceiptVerificationResult(null);
                            setReceiptPreviewUrl(null);
                            document.getElementById('balance-receipt-upload')?.click();
                          }}
                          className="w-full bg-primary hover:bg-primary/90 text-white font-bold px-4 py-2 rounded-xl text-[0.75rem] transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 border-none"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                          Re-upload Receipt
                        </button>
                      ) : !receiptVerified && allowManualRef ? (
                        <div className="flex flex-col gap-2 border-t border-white/10 pt-2 mt-1">
                          <span className="text-[0.72rem] text-text-main font-bold">
                            Please confirm your GCash Reference Number:
                          </span>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={19}
                              placeholder="e.g. 1002 9384 1029"
                              value={balanceRef}
                              onChange={(e) => setBalanceRef(e.target.value.replace(/[^0-9\s]/g, ''))}
                              className="flex-1 bg-bg-surface border border-border-glass rounded-lg px-3 py-1.5 text-xs font-mono text-text-main outline-none focus:border-primary"
                            />
                            <button
                              type="button"
                              onClick={() => handleSubmitRemainingBalance(balanceRef)}
                              disabled={isSubmittingBalance}
                              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-sm border-none cursor-pointer"
                            >
                              {isSubmittingBalance ? 'Submitting...' : 'Confirm'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. Unified Ordered Items & Payment Card (High-density) */}
        <div className="bg-bg-surface/80 border border-border-glass rounded-xl p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center pb-1.5 border-b border-white/5">
            <span className="text-[0.68rem] font-bold uppercase tracking-wider text-text-dim">
              Items Ordered ({order.items?.length || 0})
            </span>
          </div>

          {/* Items rows */}
          <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
            {order.items && order.items.length > 0 ? (
              order.items.map((item, idx) => {
                const rawItemName = String(item.name || 'Custom Garment').trim();
                const lowerItemName = rawItemName.toLowerCase();
                const variantParts = [
                  item.selectedVariant,
                  item.selectedSize ? `Size: ${item.selectedSize}` : null
                ]
                  .filter(Boolean)
                  .map((part) => String(part || '').trim())
                  .filter((part: string, pIdx: number, arr: string[]) => {
                    if (!part) return false;
                    if (lowerItemName.includes(part.toLowerCase())) return false;
                    return arr.indexOf(part) === pIdx;
                  });
                const variantText = variantParts.join(' · ');

                const persText = item.personalization?.text || (order.personalization as any)?.text;
                const rawPersColor = item.personalization?.threadColor || (order.personalization as any)?.threadColor || (order.personalization as any)?.color;
                const persColor = typeof rawPersColor === 'object' && rawPersColor !== null ? (rawPersColor.name || '') : (typeof rawPersColor === 'string' ? rawPersColor : '');

                const rawNamesList = Array.isArray(item.personalization?.namesList) && item.personalization.namesList.length > 0
                  ? item.personalization.namesList
                  : (Array.isArray((order.personalization as any)?.namesList) && (order.personalization as any).namesList.length > 0 ? (order.personalization as any).namesList : []);

                const namesList: string[] = rawNamesList.length > 0
                  ? rawNamesList.map((n: any) => String(n || '').trim()).filter(Boolean)
                  : (persText && persText.includes('\n')
                      ? persText.split(/[\r\n]+/).map((s: string) => s.trim()).filter(Boolean)
                      : []);

                const isBulk = namesList.length > 1;
                const isExpanded = expandedRosterIdx === idx;

                return (
                  <div key={idx} className="flex flex-col gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5 text-xs">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-bg-surface border border-border-glass shrink-0 flex items-center justify-center">
                          {isValidProductImage(item.imageUrl) ? (
                            <img 
                              src={item.imageUrl} 
                              alt={item.name} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <ProductImagePlaceholder name={item.name} size="thumb" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-text-main truncate text-xs leading-tight">{item.name}</span>
                          <div className="flex items-center gap-1 text-[0.68rem] text-text-dim flex-wrap">
                            <span>{variantText ? `${variantText} • Qty: ${item.quantity}` : `Qty: ${item.quantity}`}</span>
                            {isBulk ? (
                              <span className="text-text-main font-medium">
                                • Stitch: {namesList.length} Names ({persColor || 'Gold'})
                              </span>
                            ) : persText ? (
                              <span className="text-primary font-semibold">
                                • Stitch: &ldquo;{persText}&rdquo; ({persColor || 'Gold'})
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-xs text-text-main shrink-0 ml-2">
                        ₱{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>

                    {isBulk && (
                      <div className="border-t border-white/5 pt-1.5 flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => setExpandedRosterIdx(isExpanded ? null : idx)}
                          className="inline-flex items-center gap-1 text-[0.68rem] text-text-main hover:text-text-dim font-medium cursor-pointer transition-all self-start"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                            <rect x="9" y="3" width="6" height="4" rx="1" />
                            <path d="M9 14l2 2 4-4" />
                          </svg>
                          <span>{isExpanded ? 'Hide' : 'View'} personalized names ({namesList.length} pcs)</span>
                          <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
                        </button>

                        {isExpanded && (
                          <div className="p-2 rounded-lg bg-bg-surface border border-border-glass text-[0.7rem] font-mono mt-0.5">
                            <div className="flex flex-col gap-1">
                              {groupNames(namesList).map((g, gIdx) => (
                                <div key={gIdx} className="truncate text-text-main flex items-center gap-1.5">
                                  <span className="text-text-dim">•</span>
                                  <span className="font-semibold truncate">{g.count > 1 ? `${g.count}x ` : ''}&ldquo;{g.name}&rdquo;</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-text-dim italic">Custom embroidery stitch order</div>
            )}
          </div>

          {/* Total row */}
          <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs">
            <span className="text-text-dim">
              {credit.isInsufficientPayment ? 'Order Total:' : `Paid via ${order.paymentMethod.toUpperCase()}:`}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm text-text-main">₱{order.totalAmount.toFixed(2)}</span>
              {credit.isInsufficientPayment && (
                <span className="text-primary text-xs font-bold font-mono">
                  (₱{credit.outstandingBalance.toFixed(2)} Due)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 5. Notes / Instructions (if any) — hide internal manufacturing/packaging notes */}
        {order.notes && !order.notes.toLowerCase().includes('packaging only') && (
          <div className="px-3 py-2 bg-white/[0.02] border border-border-glass rounded-xl text-[0.72rem] text-text-dim flex items-center gap-2">
            <span className="font-bold text-text-main shrink-0">Note:</span>
            <span className="italic truncate">&ldquo;{order.notes}&rdquo;</span>
          </div>
        )}

        {/* 6. Action Buttons Bar */}
        <div className="pt-2 border-t border-border-glass flex items-center gap-2">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 h-9 rounded-xl font-bold text-xs bg-white/5 hover:bg-white/10 border border-border-glass transition-all cursor-pointer text-text-main flex items-center justify-center active:scale-[0.98]"
          >
            Close
          </button>

          {!isCanceled && !isCompletedOrDelivered && canCancel && (
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={isCancelling}
              className="flex-1 h-9 rounded-xl font-bold text-xs bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger transition-all cursor-pointer flex items-center justify-center active:scale-[0.98]"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Order'}
            </button>
          )}

          {isCompletedOrDelivered ? (
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(true)}
              className="flex-1 h-9 rounded-xl font-bold text-xs bg-primary hover:bg-primary/90 border border-primary text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <span>★</span>
              <span>{order.myReview ? 'Edit Review' : 'Rate Order'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setHelpCategory(undefined);
                setIsHelpModalOpen(true);
              }}
              className={`flex-1 h-9 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98] ${
                isPaid
                  ? 'bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary'
                  : 'bg-white/5 hover:bg-white/10 border border-border-glass text-text-dim hover:text-text-main font-semibold'
              }`}
              title={isPaid ? 'Need changes, cancellation, or workshop help? Contact our studio' : 'Workshop Help & FAQs'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Workshop Help</span>
            </button>
          )}
        </div>
      </div>

      <CustomerHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        defaultOrderId={order.orderId}
        defaultCategory={helpCategory}
      />

      <OrderReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        order={{
          orderId: order.orderId,
          design: order.items?.[0]?.name,
          items: order.items,
          status: order.status,
          totalAmount: order.totalAmount
        }}
        existingReview={order.myReview}
        onReviewSubmitted={() => useProductStore.getState().fetchDashboardState().catch(() => {})}
      />

      <InvoiceModal
        order={order}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
      />

      <WaybillModal
        order={order}
        isOpen={isClaimSlipOpen}
        onClose={() => setIsClaimSlipOpen(false)}
      />

      {/* QR Code Fullscreen Lightbox Modal */}
      {showQrModal && (storeGcashSettings?.gcashQrCodeUrl || '/gcash-qr.png') && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]" onClick={() => setShowQrModal(false)}>
          <div className="bg-bg-dark border border-white/20 p-6 rounded-xl flex flex-col items-center gap-4 max-w-sm w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-text-dim hover:text-text-main text-lg font-bold w-8 h-8 rounded-full bg-white/5 border border-border-glass flex items-center justify-center cursor-pointer"
            >
              ✕
            </button>
            <h3 className="text-text-main font-bold text-base m-0">GCash Official QR Code</h3>
            <div className="bg-white p-3 rounded-lg shadow-inner">
              <img
                src={storeGcashSettings?.gcashQrCodeUrl || '/gcash-qr.png'}
                alt="GCash QR Code Enlarged"
                className="w-64 h-64 object-contain"
              />
            </div>
            <p className="text-text-dim text-[0.75rem] text-center m-0">Open your GCash App, tap QR, and scan this code directly.</p>
          </div>
        </div>
      )}
    </GlassModal>
  );
}
