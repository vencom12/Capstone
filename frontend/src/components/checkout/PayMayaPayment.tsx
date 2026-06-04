'use client';

import React from 'react';

interface PayMayaPaymentProps {
  receiptFile: File | null;
  aiAnalyzing: boolean;
  aiVerificationResult: string | null;
  paymentVerified: boolean;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function PayMayaPayment({
  receiptFile,
  aiAnalyzing,
  aiVerificationResult,
  paymentVerified,
  onFileSelect
}: PayMayaPaymentProps) {
  return (
    <div className="flex flex-col gap-4 border-t border-border-glass pt-4 mt-2 animate-[fadeIn_0.3s_ease-out]">
      {/* PayMaya Quick Transfer Info Card */}
      <div className="bg-[#16a34a]/10 border border-[#16a34a]/30 p-4 rounded-xl flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-[#16a34a] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">P</span>
          <span className="text-[0.85rem] font-extrabold text-white">PayMaya (Maya) P2P Transfer</span>
        </div>
        <p className="text-[0.75rem] text-text-dim m-0 leading-relaxed">
          Send the exact order total to our PayMaya/Maya account and upload the receipt below:
        </p>
        <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg border border-white/5 font-mono text-[0.8rem]">
          <span className="text-text-dim">Account Number:</span>
          <span className="text-[#16a34a] font-bold">0918-987-6543</span>
        </div>
        <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg border border-white/5 font-mono text-[0.8rem]">
          <span className="text-text-dim">Account Name:</span>
          <span className="text-white font-bold">STITCH-OPT CORP</span>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[0.85rem] font-bold m-0 flex items-center gap-2 text-text-main">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          Upload Maya Receipt
        </h4>
        <div 
          onClick={() => document.getElementById('paymaya-upload')?.click()}
          className="border-2 border-dashed border-border-glass rounded-xl p-5 text-center cursor-pointer hover:border-[#16a34a]/50 transition-all bg-black/20 hover:bg-[#16a34a]/5"
        >
          <input id="paymaya-upload" type="file" className="hidden" accept="image/*" onChange={onFileSelect} />
          {receiptFile ? (
            <span className="text-[0.85rem] text-[#16a34a] font-semibold">{receiptFile.name}</span>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-dim"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <span className="text-[0.75rem] text-text-dim">Click to upload Maya screenshot</span>
            </div>
          )}
        </div>
      </div>

      {/* Verification Feedback */}
      {aiAnalyzing && (
        <div className="flex items-center gap-2 bg-[#16a34a]/10 border border-[#16a34a] p-3 rounded-lg animate-pulse">
          <div className="w-2 h-2 bg-[#16a34a] rounded-full"></div>
          <span className="text-[0.75rem] text-white font-bold">StitchMaster AI is verifying your Maya payment...</span>
        </div>
      )}

      {aiVerificationResult && !aiAnalyzing && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-[0.75rem] font-medium border ${
          paymentVerified 
            ? 'bg-success/10 border-success/30 text-success' 
            : 'bg-warning/10 border-warning/30 text-warning'
        }`}>
          <span className="leading-relaxed">{aiVerificationResult}</span>
        </div>
      )}
    </div>
  );
}
