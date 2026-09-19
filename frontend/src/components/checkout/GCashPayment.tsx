'use client';

import React from 'react';

interface GCashPaymentProps {
  receiptFile: File | null;
  aiAnalyzing: boolean;
  aiVerificationResult: string | null;
  paymentVerified: boolean;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  qrCodeUrl?: string | null;
}

export default function GCashPayment({
  receiptFile,
  aiAnalyzing,
  aiVerificationResult,
  paymentVerified,
  onFileSelect,
  qrCodeUrl
}: GCashPaymentProps) {
  return (
    <div className="flex flex-col gap-4 border-t border-border-glass pt-4 mt-2 animate-[fadeIn_0.3s_ease-out]">
      {/* GCash Quick Transfer Info Card */}
      <div className="bg-[#007df2]/10 border border-[#007df2]/30 p-4 rounded-xl flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-[#007df2] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">G</span>
          <span className="text-[0.85rem] font-extrabold text-white">GCash P2P Transfer</span>
        </div>
        <p className="text-[0.75rem] text-text-dim m-0 leading-relaxed">
          Send the exact order total to our GCash account and upload the receipt below:
        </p>
        <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg border border-white/5 font-mono text-[0.8rem]">
          <span className="text-text-dim">Account Number:</span>
          <span className="text-[#007df2] font-bold">0917-123-4567</span>
        </div>
        <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg border border-white/5 font-mono text-[0.8rem]">
          <span className="text-text-dim">Account Name:</span>
          <span className="text-white font-bold">STITCH-OPT CORP</span>
        </div>
        {qrCodeUrl && (
          <div className="mt-2 flex justify-center bg-white p-2 rounded-xl">
            <img src={qrCodeUrl} alt="GCash QR Code" className="max-h-48 object-contain" />
          </div>
        )}
      </div>

      {/* Upload Zone */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[0.85rem] font-bold m-0 flex items-center gap-2 text-text-main">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          Upload GCash Receipt
        </h4>
        <div 
          onClick={() => document.getElementById('gcash-upload')?.click()}
          className="border-2 border-dashed border-border-glass rounded-xl p-5 text-center cursor-pointer hover:border-[#007df2]/50 transition-all bg-black/20 hover:bg-[#007df2]/5"
        >
          <input id="gcash-upload" type="file" className="hidden" accept="image/*" onChange={onFileSelect} />
          {receiptFile ? (
            <span className="text-[0.85rem] text-[#007df2] font-semibold">{receiptFile.name}</span>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-dim"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <span className="text-[0.75rem] text-text-dim">Click to upload GCash screenshot</span>
            </div>
          )}
        </div>
      </div>

      {/* Verification Feedback */}
      {aiAnalyzing && (
        <div className="flex items-center gap-2 bg-[#007df2]/10 border border-[#007df2] p-3 rounded-lg animate-pulse">
          <div className="w-2 h-2 bg-[#007df2] rounded-full"></div>
          <span className="text-[0.75rem] text-white font-bold">StitchMaster AI is verifying your GCash payment...</span>
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
