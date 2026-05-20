'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { useBasketStore } from '@/stores/useBasketStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PaymentMethod = 'wallet' | 'cash_at_counter' | 'gcash' | 'paymaya';

export default function CheckoutModal({ isOpen, onClose }: CheckoutModalProps) {
  const { items, getTotal, clearBasket } = useBasketStore();
  const { user, setUser, refreshUser } = useAuthStore();
  const { fetchDashboardState } = useProductStore();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [deliveryTime, setDeliveryTime] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wallet');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);

  const handleTopUp = async () => {
    if (!topUpAmount || parseFloat(topUpAmount) <= 0) return;
    
    try {
      const data = await api.post<{ walletBalance: number }>('/api/customer/wallet/topup', { 
        amount: parseFloat(topUpAmount) 
      });
      
      if (user) {
        setUser({ ...user, walletBalance: data.walletBalance });
      }
      
      showToast(`Successfully topped up $${parseFloat(topUpAmount).toFixed(2)}`, 'success');
      setTopUpAmount('');
    } catch (err) {
      showToast('Failed to top up wallet', 'error');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setReceiptFile(e.target.files[0]);
      setAiAnalyzing(true);
      // Simulate AI analysis
      setTimeout(() => {
        setAiAnalyzing(false);
        setPaymentVerified(true);
        showToast('StitchMaster AI: Receipt verified successfully!', 'success');
      }, 2000);
    }
  };

  const handlePlaceOrder = async () => {
    if ((paymentMethod === 'gcash' || paymentMethod === 'paymaya') && !paymentVerified) {
      showToast('Please upload and verify your payment receipt', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      await api.post('/api/customer/order/submit', {
        items,
        totalAmount: getTotal(),
        address: user?.address,
        deliveryTime: deliveryTime || 'As soon as possible',
        notes,
        paymentMethod
      });
      
      showToast('Order placed successfully!', 'success');
      await refreshUser(); // Update wallet balance
      await fetchDashboardState(); // Instant update for orders/transactions
      clearBasket();
      onClose();
    } catch (err) {
      showToast('Failed to place order', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[750px]" noPadding>
      <div className="p-6 max-[650px]:p-4 flex flex-col max-h-[85vh] overflow-y-auto">
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
                  <p className="text-[0.7rem] text-text-dim ml-1 max-[650px]:hidden">To change address, please update your profile settings.</p>
                </div>
                <input 
                  type="text" 
                  placeholder="Preferred Delivery Time (Optional)" 
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass p-2 max-[650px]:p-1.5 rounded-xl max-[650px]:rounded-lg text-text-main text-[0.85rem] max-[650px]:text-[0.75rem] outline-none focus:border-primary"
                />
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
              <div className="flex justify-between items-center px-2 mt-1">
                <span className="font-bold text-base">Total Amount:</span>
                <span className="text-xl font-extrabold text-primary font-mono">${getTotal().toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Right: Payment */}
          <div className="flex flex-col gap-6 max-[650px]:gap-3 bg-white/5 border border-border-glass p-6 max-[650px]:p-4 rounded-[24px] max-[650px]:rounded-[16px]">
            <div className="flex flex-col gap-4 max-[650px]:gap-3">
              <h3 className="text-[1rem] max-[650px]:text-[0.9rem] font-bold m-0">Payment Method</h3>
              
              <div className="flex flex-col max-[650px]:flex-row gap-4 max-[650px]:gap-2 max-[650px]:items-stretch">
                {/* Wallet Card */}
                <div className="flex-[1.2] bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30 p-3 max-[650px]:p-2 rounded-xl max-[650px]:rounded-lg flex flex-col gap-2 max-[650px]:gap-1.5 max-[650px]:justify-center">
                <div className="flex justify-between items-center">
                  <span className="text-[0.75rem] max-[650px]:text-[0.65rem] text-text-dim">Wallet Balance</span>
                  <span className="text-lg max-[650px]:text-base font-extrabold text-white font-mono">${user?.walletBalance?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex gap-2 max-[650px]:gap-1.5">
                  <input 
                    type="number" 
                    placeholder="Add Amount" 
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className="flex-1 bg-black/30 border border-white/10 p-2 max-[650px]:p-1.5 rounded-lg max-[650px]:rounded-md text-white text-[0.85rem] max-[650px]:text-[0.75rem] outline-none focus:border-primary"
                  />
                  <button 
                    onClick={handleTopUp}
                    className="bg-primary text-white px-3 py-2 max-[650px]:px-2.5 max-[650px]:py-1.5 rounded-lg max-[650px]:rounded-md text-[0.8rem] max-[650px]:text-[0.75rem] font-bold hover:bg-primary/80 transition-all"
                  >
                    Top Up
                  </button>
                </div>
                </div>

                {/* Payment Methods Grid */}
                <div className="flex-1 grid grid-cols-2 max-[650px]:grid-cols-1 gap-3 max-[650px]:gap-1.5">
                {[
                  { id: 'wallet', label: 'Wallet Credits', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" /></svg> },
                  { id: 'cash_at_counter', label: 'Cash at Counter', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></svg> },
                  { id: 'gcash', label: 'GCash', icon: <span className="text-[#007df2] font-bold">G</span> },
                  { id: 'paymaya', label: 'PayMaya', icon: <span className="text-[#16a34a] font-bold">P</span> }
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setPaymentMethod(m.id as PaymentMethod);
                      setPaymentVerified(m.id === 'wallet' || m.id === 'cash_at_counter');
                    }}
                    className={`
                      flex flex-col max-[650px]:flex-row items-center justify-center gap-2 max-[650px]:gap-1.5 p-3 max-[650px]:p-2 rounded-xl max-[650px]:rounded-lg border transition-all duration-200
                      ${paymentMethod === m.id ? 'bg-primary/20 border-primary text-white shadow-lg' : 'bg-white/5 border-border-glass text-text-dim hover:bg-white/10 hover:text-text-main'}
                    `}
                  >
                    {m.icon}
                    <span className="text-[0.8rem] max-[650px]:text-[0.65rem] font-bold">{m.label}</span>
                  </button>
                ))}
                </div>
              </div>

              {/* Receipt Upload (for e-wallets) */}
              {(paymentMethod === 'gcash' || paymentMethod === 'paymaya') && (
                <div className="flex flex-col gap-3 max-[650px]:gap-2 border-t border-border-glass pt-4 max-[650px]:pt-2 mt-2 max-[650px]:mt-0 animate-[fadeIn_0.3s_ease-out]">
                  <h4 className="text-[0.85rem] max-[650px]:text-[0.75rem] font-bold m-0 flex items-center gap-2 max-[650px]:gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="max-[650px]:w-3.5 max-[650px]:h-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    Upload Payment Receipt
                  </h4>
                  <div 
                    onClick={() => document.getElementById('receipt-upload')?.click()}
                    className="border-2 border-dashed border-border-glass rounded-xl max-[650px]:rounded-lg p-5 max-[650px]:p-3 text-center cursor-pointer hover:border-primary/50 transition-all bg-black/20"
                  >
                    <input id="receipt-upload" type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                    {receiptFile ? (
                      <span className="text-[0.85rem] max-[650px]:text-[0.75rem] text-primary font-medium">{receiptFile.name}</span>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-dim max-[650px]:w-5 max-[650px]:h-5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                        <span className="text-[0.75rem] max-[650px]:text-[0.65rem] text-text-dim">Click to upload screenshot</span>
                      </div>
                    )}
                  </div>
                  
                  {aiAnalyzing && (
                    <div className="flex items-center gap-2 bg-primary/10 border border-primary p-3 rounded-lg">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                      <span className="text-[0.75rem] text-text-main font-bold">StitchMaster AI is analyzing...</span>
                    </div>
                  )}
                </div>
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
