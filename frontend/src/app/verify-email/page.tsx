'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const { verifyEmailToken } = useAuthStore();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found. Please check your email link.');
      return;
    }

    const verify = async () => {
      try {
        const res = await verifyEmailToken(token);
        if (res.success) {
          setStatus('success');
          setMessage(res.message || 'Email verified successfully!');
        } else {
          setStatus('error');
          setMessage(res.message || 'Verification failed.');
        }
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Something went wrong during verification.');
      }
    };

    verify();
  }, [token, verifyEmailToken]);

  return (
    <div className="max-w-md w-full bg-bg-surface border border-border-glass rounded-xl p-8 text-center shadow-lg">
      {/* Icon */}
      <div className={`
        w-16 h-16 rounded-xl mx-auto mb-5 flex items-center justify-center text-3xl
        ${status === 'loading' ? 'bg-primary/20 border border-primary/30 animate-pulse' : ''}
        ${status === 'success' ? 'bg-green-500/20 border border-green-500/30' : ''}
        ${status === 'error' ? 'bg-red-500/20 border border-red-500/30' : ''}
      `}>
        {status === 'loading' && (
          <svg className="w-8 h-8 text-primary animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        {status === 'success' && (
          <svg className="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {status === 'error' && (
          <svg className="w-8 h-8 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
      </div>

      {/* Title */}
      <h1 className="text-xl font-extrabold text-text-main mb-2 tracking-tight">
        {status === 'loading' && 'Verifying Email...'}
        {status === 'success' && 'Email Verified!'}
        {status === 'error' && 'Verification Failed'}
      </h1>

      {/* Message */}
      <p className="text-sm text-text-dim mb-6 leading-relaxed">{message}</p>

      {/* CTA */}
      {status === 'success' && (
        <button
          onClick={() => router.push('/')}
          className="w-full py-3 px-6 rounded-lg font-bold text-sm text-white cursor-pointer
            bg-primary text-white 
            shadow-sm 
            hover:shadow-md 
            transition-all border-none"
        >
          Continue Shopping →
        </button>
      )}

      {status === 'error' && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 px-6 rounded-lg font-bold text-sm text-white cursor-pointer
              bg-primary text-white 
              shadow-sm 
              transition-all border-none"
          >
            Go to Homepage
          </button>
          <p className="text-xs text-text-dim">
            You can request a new verification email from your account dashboard.
          </p>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-dark p-4">
      <Suspense fallback={
        <div className="max-w-md w-full bg-bg-surface border border-border-glass rounded-xl p-8 text-center text-text-dim">
          <div className="w-16 h-16 rounded-xl mx-auto mb-5 flex items-center justify-center text-3xl bg-primary/20 border border-primary/30 animate-pulse">
            ⏳
          </div>
          <h2 className="text-lg font-bold text-text-main mb-2">Loading verification...</h2>
        </div>
      }>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
