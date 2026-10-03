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
    <div className="max-w-md w-full bg-bg-surface border border-border-glass rounded-2xl p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
      {/* Icon */}
      <div className={`
        w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center text-3xl
        ${status === 'loading' ? 'bg-primary/20 border border-primary/30 animate-pulse' : ''}
        ${status === 'success' ? 'bg-green-500/20 border border-green-500/30' : ''}
        ${status === 'error' ? 'bg-red-500/20 border border-red-500/30' : ''}
      `}>
        {status === 'loading' && '⏳'}
        {status === 'success' && '✅'}
        {status === 'error' && '❌'}
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
          className="w-full py-3 px-6 rounded-xl font-bold text-sm text-white cursor-pointer
            bg-primary text-white 
            shadow-[0_4px_16px_rgba(99,102,241,0.35)] 
            hover:shadow-[0_6px_24px_rgba(99,102,241,0.5)] 
            transition-all border-none"
        >
          Continue Shopping →
        </button>
      )}

      {status === 'error' && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 px-6 rounded-xl font-bold text-sm text-white cursor-pointer
              bg-primary text-white 
              shadow-[0_4px_16px_rgba(99,102,241,0.35)] 
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
        <div className="max-w-md w-full bg-bg-surface border border-border-glass rounded-2xl p-8 text-center text-text-dim">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center text-3xl bg-primary/20 border border-primary/30 animate-pulse">
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
