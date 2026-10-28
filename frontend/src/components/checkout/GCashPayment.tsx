'use client';

import React, { useState, useEffect } from 'react';
import { showToast } from '@/components/ui/Toast';
import InlineError from '@/components/ui/InlineError';

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
  onBypassPayment?: () => void;
  isBypassing?: boolean;
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
  onSubmitManualRef,
  onBypassPayment,
  isBypassing = false,
}: GCashPaymentProps) {
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [refTouched, setRefTouched] = useState(false);
  const [refError, setRefError] = useState('');
  const [shakeManualRef, setShakeManualRef] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (receiptFile) {
      const url = URL.createObjectURL(receiptFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [receiptFile]);

  // Global & Local clipboard listener for Ctrl+V instant screenshot paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            showToast('Receipt screenshot pasted from clipboard!', 'success');
            const syntheticEvent = {
              target: {
                files: [file]
              }
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            onFileSelect(syntheticEvent);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onFileSelect]);

  const accountNo = "09288103928";
  const displayAccountNo = "0928 810 3928";
  const OFFICIAL_GCASH_QR = "https://res.cloudinary.com/dzr6uwcr1/image/upload/v1790078256/stitch-master-products/wrdipkvspnz1fuewligw.jpg";
  const activeQrCodeUrl = qrCodeUrl || OFFICIAL_GCASH_QR;
  const total = Number(finalTotal ?? totalAmount ?? 0);
  const analyzing = Boolean(aiAnalyzing ?? isAnalyzing);
  const verified = Boolean(paymentVerified ?? isVerified);
  const handleRefChange = setManualRef || onManualRefChange || (() => {});

  const validateManualRef = (val: string) => {
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

  const handleManualRefBlur = () => {
    setRefTouched(true);
    validateManualRef(manualRef);
  };

  const handleConfirmManualRef = () => {
    setRefTouched(true);
    const err = validateManualRef(manualRef);
    if (err) {
      setShakeManualRef(true);
      setTimeout(() => setShakeManualRef(false), 600);
      showToast({
        title: 'Reference Number Needed',
        message: err,
        type: 'warning'
      });
      return;
    }
    onSubmitManualRef();
  };

  const copyToClipboard = (text: string, type: 'number' | 'amount') => {
    navigator.clipboard.writeText(text);
    if (type === 'number') {
      setCopiedNumber(true);
      showToast('GCash number (0928 810 3928) copied to clipboard!', 'success');
      setTimeout(() => setCopiedNumber(false), 2000);
    } else {
      setCopiedAmount(true);
      showToast('Amount copied to clipboard!', 'success');
      setTimeout(() => setCopiedAmount(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-3 animate-[fadeIn_0.3s_ease-out]">
      {/* GCash Quick Transfer Info Card - Compact Side-by-Side Layout */}
      <div className="bg-white/[0.03] border border-border-glass/60 p-2.5 sm:p-3 rounded-xl flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[0.68rem] font-bold text-text-main px-1.5 py-0.5 rounded bg-white/[0.06] border border-border-glass shrink-0">GCash</span>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(total.toFixed(2), 'amount')}
            className="text-[0.68rem] bg-white/[0.05] hover:bg-white/[0.1] border border-border-glass/60 text-text-main font-semibold px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1 shrink-0"
          >
            {copiedAmount ? '✓ Copied' : `Copy ₱${total.toFixed(2)}`}
          </button>
        </div>

        {/* Compact 2-column: Account Info on Left, QR Code on Right */}
        <div className="flex items-center gap-3 bg-bg-surface/80 p-2.5 rounded-lg border border-border-glass/50">
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <div>
              <span className="text-[0.62rem] text-text-dim block uppercase tracking-wider font-semibold">GCash Number</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-text-main font-bold text-sm tracking-wide font-mono truncate">{displayAccountNo}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(accountNo, 'number')}
                  className="bg-white/10 hover:bg-white/20 text-white font-semibold px-2 py-0.5 rounded text-[0.65rem] transition-all cursor-pointer border border-white/20 shrink-0"
                >
                  {copiedNumber ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="border-t border-border-glass/40 pt-1">
              <span className="text-[0.62rem] text-text-dim block uppercase tracking-wider font-semibold">Account Name</span>
              <span className="text-text-main font-semibold text-[0.72rem] truncate block">Eds Towels &amp; Caps</span>
            </div>
          </div>

          {activeQrCodeUrl && (
            <div
              onClick={() => setShowQrModal(true)}
              className="relative group cursor-pointer bg-white p-1 rounded-lg shadow-sm border border-white/20 hover:scale-105 transition-all shrink-0"
              title="Click to enlarge QR"
            >
              <img src={activeQrCodeUrl} alt="GCash QR Code" className="w-16 h-16 sm:w-18 sm:h-18 object-contain rounded" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                <span className="text-white font-bold text-[0.55rem] bg-black/70 px-1 py-0.5 rounded">Enlarge</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Zone */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h4 className="text-[0.72rem] font-bold m-0 flex items-center gap-1.5 text-text-main uppercase tracking-wider">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Upload GCash Receipt Screenshot
          </h4>
          <span className="text-[0.65rem] text-text-dim font-medium">
            Screenshot or photo accepted
          </span>
        </div>
        <div 
          onClick={() => document.getElementById('gcash-upload')?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith('image/')) {
              showToast('Receipt file dropped!', 'success');
              const syntheticEvent = {
                target: { files: [file] }
              } as unknown as React.ChangeEvent<HTMLInputElement>;
              onFileSelect(syntheticEvent);
            }
          }}
          className={`border border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
              : 'border-border-glass hover:border-white/40 bg-white/[0.01] hover:bg-white/[0.03]'
          }`}
        >
          <input id="gcash-upload" type="file" className="hidden" accept="image/*" onChange={onFileSelect} />
          {receiptFile ? (
            <div className="flex items-center gap-3 p-1">
              {previewUrl && (
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-border-glass bg-black/40 shrink-0">
                  <img src={previewUrl} alt="Receipt preview" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex flex-col text-left min-w-0 flex-1">
                <span className="text-[0.78rem] text-text-main font-bold truncate">{receiptFile.name}</span>
                <span className="text-[0.62rem] text-text-dim font-semibold flex items-center gap-1">
                  <span>✓</span>
                  <span>{(receiptFile.size / 1024).toFixed(0)} KB • Ready for scan</span>
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById('gcash-upload')?.click();
                }}
                className="text-[0.65rem] text-text-dim hover:text-text-main bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-border-glass cursor-pointer shrink-0"
              >
                Replace
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-dim">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span className="text-[0.78rem] text-text-main font-semibold">Tap to choose receipt from your phone or computer</span>
              <span className="text-[0.65rem] text-text-dim">Upload your GCash payment screenshot showing the amount</span>
            </div>
          )}
        </div>
      </div>

      {/* Receipt Processing Status */}
      {analyzing && (
        <div className="flex items-center gap-2.5 bg-white/[0.04] border border-border-glass p-2.5 rounded-xl">
          <svg className="w-3.5 h-3.5 animate-spin text-text-main shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <div className="flex flex-col">
            <span className="text-[0.75rem] text-text-main font-bold">Checking your receipt...</span>
            <span className="text-[0.65rem] text-text-dim">Confirming payment details</span>
          </div>
        </div>
      )}

      {/* Verification Notice or Friendly Encouragement Box */}
      {aiVerificationResult && !analyzing && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg text-[0.72rem] font-medium border border-border-glass bg-white/[0.04] text-text-main">
          <div className="flex items-center gap-1.5 font-bold">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-text-main">
              {verified ? <polyline points="20 6 9 17 4 12" /> : <circle cx="12" cy="12" r="10" />}
            </svg>
            <span className="leading-relaxed">{aiVerificationResult}</span>
          </div>
          
          {Boolean(
            aiVerificationResult.toLowerCase().includes('already') || 
            aiVerificationResult.toLowerCase().includes('duplicate') ||
            aiVerificationResult.toLowerCase().includes('earlier')
          ) ? (
            <div className="flex flex-col gap-2.5 border-t border-white/10 pt-2.5 mt-1">
              <span className="text-[0.75rem] text-text-dim leading-relaxed">
                To help us start embroidering your items without delay, please upload the official GCash receipt screenshot from this payment. Make sure the amount and reference number are clear!
              </span>
              <button
                type="button"
                onClick={() => document.getElementById('gcash-upload')?.click()}
                className="bg-primary hover:bg-primary/90 text-white font-bold px-4 py-2.5 rounded-xl text-[0.78rem] transition-all cursor-pointer shadow-md self-start flex items-center gap-2"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                Upload My Payment Receipt
              </button>
            </div>
          ) : !verified ? (
            <div className={`flex flex-col gap-2 border-t border-white/10 pt-2.5 mt-1 ${shakeManualRef ? 'animate-shake' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-[0.75rem] text-text-main font-bold">
                  Can't read clearly? You can also type your GCash Reference Number below:
                </span>
                {refTouched && !refError && manualRef.trim() && (
                  <span className="text-primary text-[0.68rem] font-bold">✓ Ready</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 1002 9384 1029"
                  value={manualRef}
                  onChange={(e) => {
                    handleRefChange(e.target.value);
                    if (refTouched) validateManualRef(e.target.value);
                  }}
                  onBlur={handleManualRefBlur}
                  className={`flex-1 bg-bg-surface border px-3 py-2 rounded-lg text-text-main font-mono text-[0.85rem] outline-none transition-all ${
                    refTouched && refError
                      ? 'border-danger/70 bg-danger/[0.04] ring-1 ring-danger/30'
                      : 'border-border-glass focus:border-primary'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleConfirmManualRef}
                  className="bg-primary text-white font-bold px-4 py-2 rounded-lg text-[0.78rem] hover:bg-primary/90 transition-all cursor-pointer shadow-sm shrink-0"
                >
                  Confirm Order →
                </button>
              </div>
              {refTouched && refError && (
                <InlineError message={refError} variant="field" />
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Developer / Testing Payment Bypass Link (Subtle, non-intrusive) */}
      {onBypassPayment && (
        <div className="flex items-center justify-center pt-2 border-t border-border-glass/40">
          <button
            type="button"
            onClick={onBypassPayment}
            disabled={isBypassing || analyzing}
            className="text-[0.72rem] text-text-dim hover:text-text-main font-medium cursor-pointer bg-transparent border-none p-1 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Instant test mode bypass for development"
          >
            {isBypassing ? (
              <>
                <div className="w-3 h-3 border-2 border-text-dim border-t-transparent rounded-full animate-spin" />
                <span>Bypassing GCash &amp; Placing Order...</span>
              </>
            ) : (
              <span>Test Mode: 1-Click Payment Bypass</span>
            )}
          </button>
        </div>
      )}

      {/* QR Code Fullscreen Lightbox Modal */}
      {showQrModal && activeQrCodeUrl && (
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeQrCodeUrl} alt="GCash QR Code Enlarged" className="w-64 h-64 object-contain" />
            </div>
            <p className="text-text-dim text-[0.75rem] text-center m-0">Open your GCash App, tap QR, and scan this code directly.</p>
          </div>
        </div>
      )}
    </div>
  );
}
