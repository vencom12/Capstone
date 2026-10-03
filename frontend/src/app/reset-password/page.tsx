'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const { resetPassword } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'form' | 'success' | 'error'>(token ? 'form' : 'error');
  const [message, setMessage] = useState(token ? '' : 'No reset token found. Please use the link from your email.');

  const inputCls =
    'w-full bg-bg-dark border border-border-glass px-4 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const res = await resetPassword(token!, password);
      if (res.success) {
        setStatus('success');
        setMessage(res.message);
      } else {
        setMessage(res.message || 'Could not reset password.');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'This reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  const goSignIn = () => {
    useUIStore.getState().setAuthOpen(true, 'login', 'customer');
    router.push('/');
  };

  return (
    <div className="max-w-md w-full bg-bg-surface border border-border-glass rounded-2xl p-8 shadow-lg">
      <div className="text-center mb-5">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl bg-primary/20 border border-primary/30">
          {status === 'success' ? '✅' : status === 'error' ? '❌' : '🔑'}
        </div>
        <h1 className="text-xl font-extrabold text-text-main m-0 tracking-tight">
          {status === 'success' ? 'Password Updated' : status === 'error' ? 'Reset Link Problem' : 'Choose a New Password'}
        </h1>
      </div>

      {status === 'form' && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <input
            type={show ? 'text' : 'password'}
            required
            minLength={6}
            placeholder="New password (min. 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          <input
            type={show ? 'text' : 'password'}
            required
            minLength={6}
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputCls}
          />
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-text-dim">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-primary w-4 h-4" />
            <span>Show passwords</span>
          </label>
          {message && <p className="text-xs text-red-400 m-0">{message}</p>}
          <button
            type="submit"
            disabled={submitting}
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
