'use client';

import React, { useState } from 'react';
import { showToast } from '@/components/ui/Toast';

interface GCashPaymentProps {
  receiptFile?: File | null;
  aiAnalyzing?: boolean;
  isAnalyzing?: boolean;
  aiVerificationResult?: string | null;
  paymentVerified?: boolean;
  isVerified?: boolean;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  qrCodeUrl?: string | null;
  finalTotal?: number;
  totalAmount?: number;
  manualRef: string;
  setManualRef?: (val: string) => void;
  onManualRefChange?: (val: string) => void;
  onSubmitManualRef: () => void;
}

export default function GCashPayment({
  receiptFile,
  aiAnalyzing,
  isAnalyzing,
  aiVerificationResult,
  paymentVerified,
  isVerified,
  onFileSelect,
  qrCodeUrl,
  finalTotal,
  totalAmount,
  manualRef,
  setManualRef,
  onManualRefChange,
  onSubmitManualRef
}: GCashPaymentProps) {
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const accountNo = "09171234567";
  const total = Number(finalTotal ?? totalAmount ?? 0);
  const analyzing = Boolean(aiAnalyzing ?? isAnalyzing);
  const verified = Boolean(paymentVerified ?? isVerified);
  const handleRefChange = setManualRef || onManualRefChange || (() => {});

  const copyToClipboard = (text: string, type: 'number' | 'amount') => {
    navigator.clipboard.writeText(text);
    if (type === 'number') {
      setCopiedNumber(true);
      showToast('Account number copied to clipboard!', 'success');
      setTimeout(() => setCopiedNumber(false), 2000);
    } else {
      setCopiedAmount(true);
      showToast('Amount copied to clipboard!', 'success');
      setTimeout(() => setCopiedAmount(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-border-glass pt-4 mt-2 animate-[fadeIn_0.3s_ease-out]">
      {/* GCash Quick Transfer Info Card */}
      <div className="bg-[#007df2]/10 border border-[#007df2]/30 p-4 rounded-xl flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-[#007df2] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">G</span>
            <span className="text-[0.85rem] font-extrabold text-white">GCash Express Pay</span>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(total.toFixed(2), 'amount')}
            className="text-[0.72rem] bg-[#007df2]/20 hover:bg-[#007df2]/30 border border-[#007df2]/40 text-[#007df2] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1"
          >
            {copiedAmount ? '✓ Copied Total' : `Copy ₱${total.toFixed(2)}`}
          </button>
        </div>
        
        <p className="text-[0.75rem] text-text-dim m-0 leading-relaxed">
          Transfer to our official account & upload your payment screenshot:
        </p>

        <div className="flex justify-between items-center bg-black/30 p-2.5 rounded-lg border border-white/5 font-mono text-[0.8rem]">
          <div className="flex flex-col">
            <span className="text-[0.7rem] text-text-dim">Account Number</span>
            <span className="text-[#007df2] font-bold text-[0.9rem]">0917-123-4567</span>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(accountNo, 'number')}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-lg text-[0.75rem] transition-all cursor-pointer border border-white/10"
          >
            {copiedNumber ? '✓ Copied' : 'Copy No.'}
          </button>
        </div>

        <div className="flex justify-between items-center bg-black/30 p-2.5 rounded-lg border border-white/5 font-mono text-[0.8rem]">
          <span className="text-text-dim">Account Name:</span>
          <span className="text-white font-bold">STITCH-OPT CORP</span>
        </div>

        {qrCodeUrl && (
          <div className="mt-1 flex flex-col items-center">
            <div 
              onClick={() => setShowQrModal(true)}
              className="relative group cursor-pointer bg-white p-2 rounded-xl shadow-lg border border-white/20 hover:scale-105 transition-all duration-200"
            >
              <img src={qrCodeUrl} alt="GCash QR Code" className="max-h-36 object-contain rounded-lg" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-xl flex items-center justify-center transition-opacity">
                <span className="text-white font-bold text-[0.75rem] bg-black/60 px-3 py-1 rounded-full">Tap to Enlarge</span>
              </div>
            </div>
            <span className="text-[0.7rem] text-text-dim mt-1.5">Tap QR image to scan full screen</span>
          </div>
        )}
      </div>

      {/* Upload Zone */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[0.85rem] font-bold m-0 flex items-center gap-2 text-text-main">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          Upload GCash Receipt Screenshot
        </h4>
        <div 
          onClick={() => document.getElementById('gcash-upload')?.click()}
          className="border-2 border-dashed border border-primary/40 rounded-xl p-4 text-center cursor-pointer hover:border-[#007df2] transition-all bg-black/20 hover:bg-[#007df2]/5"
        >
          <input id="gcash-upload" type="file" className="hidden" accept="image/*" onChange={onFileSelect} />
          {receiptFile ? (
            <div className="flex items-center justify-center gap-2">
              <span className="text-[0.85rem] text-[#007df2] font-bold">{receiptFile.name}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <span className="text-[0.8rem] text-text-main font-semibold">Click or tap to upload receipt</span>
              <span className="text-[0.7rem] text-text-dim">Supports JPG, PNG, WEBP</span>
            </div>
          )}
        </div>
      </div>

      {/* AI Processing Status */}
      {analyzing && (
        <div className="flex items-center gap-3 bg-[#007df2]/15 border border-[#007df2] p-3.5 rounded-xl animate-pulse">
          <div className="w-3 h-3 bg-[#007df2] rounded-full animate-ping"></div>
          <div className="flex flex-col">
            <span className="text-[0.8rem] text-white font-bold">StitchMaster AI is verifying receipt...</span>
            <span className="text-[0.7rem] text-text-dim">Extracting GCash reference number & amount</span>
          </div>
        </div>
      )}

      {/* AI Result or Fail-Safe Fallback */}
      {aiVerificationResult && !analyzing && (
        <div className={`flex flex-col gap-2 p-3.5 rounded-xl text-[0.78rem] font-medium border ${
          verified 
            ? 'bg-success/10 border-success/30 text-success' 
            : 'bg-warning/10 border-warning/30 text-warning'
        }`}>
          <span className="leading-relaxed font-bold">{aiVerificationResult}</span>
          
          {!verified && (
            <div className="flex flex-col gap-2 border-t border-white/10 pt-2.5 mt-1">
              <span className="text-[0.72rem] text-text-dim font-bold">If AI missed your reference number, enter it manually below:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 1002 9384 1029"
                  value={manualRef}
                  onChange={(e) => handleRefChange(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/20 px-3 py-1.5 rounded-lg text-white font-mono text-[0.8rem] outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={onSubmitManualRef}
                  className="bg-primary text-white font-bold px-3 py-1.5 rounded-lg text-[0.75rem] hover:bg-primary/80 transition-all cursor-pointer"
                >
                  Submit Ref
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QR Code Fullscreen Lightbox Modal */}
      {showQrModal && qrCodeUrl && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]" onClick={() => setShowQrModal(false)}>
          <div className="bg-bg-dark border border-white/20 p-6 rounded-3xl flex flex-col items-center gap-4 max-w-sm w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-text-dim hover:text-white text-lg font-bold w-8 h-8 rounded-full bg-white/10 flex items-center justify-center cursor-pointer"
            >
              ✕
            </button>
            <h3 className="text-white font-bold text-base m-0">GCash Official QR Code</h3>
            <div className="bg-white p-3 rounded-2xl shadow-inner">
              <img src={qrCodeUrl} alt="GCash QR Code Enlarged" className="w-64 h-64 object-contain" />
            </div>
            <p className="text-text-dim text-[0.75rem] text-center m-0">Open your GCash App, tap QR, and scan this code directly.</p>
          </div>
        </div>
      )}
    </div>
  );
}
