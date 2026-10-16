'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawToken = searchParams.get('token');
  const [token, setToken] = useState(rawToken || '');
  const { resetPassword } = useAuthStore();
  const hasCapturedToken = useRef(Boolean(rawToken));

  const [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'form' | 'success' | 'error'>('form');
  const [message, setMessage] = useState('');

  // Mount gate & token extraction
  useEffect(() => {
    setMounted(true);
    if (rawToken) {
      hasCapturedToken.current = true;
      setToken(rawToken);
      setStatus('form');
    } else if (!hasCapturedToken.current && !token) {
      setStatus('error');
      setMessage('No reset token found. Please use the link from your email.');
    }
  }, [rawToken, token]);

  const inputCls =
    'w-full bg-bg-dark border border-border-glass px-4 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setMessage('Reset token is missing or has expired.');
      return;
    }
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const res = await resetPassword(token, password);
      if (res.success) {
        setStatus('success');
        setMessage(res.message);
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else {
        const errMsg = res.message || 'Could not reset password.';
        if (errMsg.toLowerCase().includes('already been used') || errMsg.toLowerCase().includes('expired') || errMsg.toLowerCase().includes('invalid')) {
          setStatus('error');
        }
        setMessage(errMsg);
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'This reset link has already been used or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  const goSignIn = () => {
    useUIStore.getState().setAuthOpen(true, 'login', 'customer');
    router.push('/');
  };

  if (!mounted) {
    return (
      <div className="max-w-md w-full bg-bg-surface border border-border-glass rounded-2xl p-8 shadow-lg text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-primary/20 border border-primary/30 text-primary">
          <svg className="w-8 h-8 text-primary animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
        </div>
        <p className="text-sm text-text-dim m-0">Verifying security token...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full bg-bg-surface border border-border-glass rounded-2xl p-8 shadow-lg">
      <div className="text-center mb-5">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-primary/20 border border-primary/30 text-primary">
          {status === 'success' ? (
            <svg className="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : status === 'error' ? (
            <svg className="w-8 h-8 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2l-2 2m-1.5 1.5L14 9a5 5 0 1 0 3 3l6-6-2-2-3.5 3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <h1 className="text-xl font-extrabold text-text-main m-0 tracking-tight">
          {status === 'success' ? 'Password Updated' : status === 'error' ? 'Reset Link Problem' : 'Choose a New Password'}
        </h1>
      </div>

      {status === 'form' && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" suppressHydrationWarning>
          <input
            type={show ? 'text' : 'password'}
            required
            minLength={6}
            placeholder="New password (min. 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            suppressHydrationWarning
          />
          <input
            type={show ? 'text' : 'password'}
            required
            minLength={6}
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputCls}
            suppressHydrationWarning
          />
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-text-dim">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-primary w-4 h-4" />
            <span>Show passwords</span>
          </label>
          {message && <p className="text-xs text-red-400 m-0">{message}</p>}
          <button
            type="submit"
            disabled={submitting}
            suppressHydrationWarning
            className="w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-primary border-none cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Update Password'}
          </button>
        </form>
      )}

      {status === 'success' && (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-sm text-text-dim m-0">{message}</p>
          <button onClick={goSignIn} className="w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-primary border-none cursor-pointer">
            Sign In →
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-sm text-text-dim m-0">{message}</p>
          <button onClick={() => router.push('/')} className="w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-primary border-none cursor-pointer">
            Go to Homepage
          </button>
          <p className="text-xs text-text-dim m-0">You can request a new link from the &ldquo;Forgot password?&rdquo; option on the sign-in form.</p>
        </div>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-dark p-4">
      <Suspense fallback={<div className="text-text-dim">Loading...</div>}>
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}
