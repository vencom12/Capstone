'use client';

import { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import InlineError from '@/components/ui/InlineError';
import { showToast } from '@/components/ui/Toast';

interface TokenInfo {
  maskedEmail?: string;
  username?: string;
}

interface FieldErrors {
  password?: string;
  confirm?: string;
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawToken = searchParams.get('token');
  const [token, setToken] = useState(rawToken || '');
  const { validateResetToken, resetPassword } = useAuthStore();
  const hasValidated = useRef(false);

  const [validating, setValidating] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formShaking, setFormShaking] = useState(false);
  const [status, setStatus] = useState<'form' | 'success' | 'error'>('form');
  const [message, setMessage] = useState('');
  const [redirectCount, setRedirectCount] = useState(4);

  // Pre-validate token on mount
  useEffect(() => {
    if (hasValidated.current) return;
    hasValidated.current = true;

    if (!rawToken) {
      setValidating(false);
      setStatus('error');
      setMessage('No reset link found. Please click the link sent to your email or request a new one.');
      return;
    }

    setToken(rawToken);
    setValidating(true);

    validateResetToken(rawToken)
      .then((res) => {
        if (res.valid) {
          setStatus('form');
          setTokenInfo({
            maskedEmail: res.maskedEmail,
            username: res.username,
          });
        } else {
          setStatus('error');
          setMessage(res.message || 'This reset link has expired or has already been used.');
        }
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Could not verify your reset link. It may have expired or already been used.');
      })
      .finally(() => {
        setValidating(false);
      });
  }, [rawToken, validateResetToken]);

  // Real-time password strength computation
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: 'bg-zinc-700' };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    switch (score) {
      case 1:
        return { score: 1, label: 'Weak', color: 'bg-rose-500', text: 'text-rose-400' };
      case 2:
        return { score: 2, label: 'Fair', color: 'bg-amber-500', text: 'text-amber-400' };
      case 3:
        return { score: 3, label: 'Good', color: 'bg-sky-500', text: 'text-sky-400' };
      case 4:
        return { score: 4, label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-400' };
      default:
        return { score: 0, label: 'Too Short', color: 'bg-rose-500', text: 'text-rose-400' };
    }
  }, [password]);

  // Criteria checklist
  const criteria = useMemo(() => {
    const hasMinLength = password.length >= 8;
    const hasNumOrSymbol = /[0-9]|[^A-Za-z0-9]/.test(password);
    const matches = confirm.length > 0 && password === confirm;
    const isValid = hasMinLength && matches;
    return { hasMinLength, hasNumOrSymbol, matches, isValid };
  }, [password, confirm]);

  // Auto-redirect timer on success
  useEffect(() => {
    if (status !== 'success') return;
    const timer = setInterval(() => {
      setRedirectCount((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/dashboard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status, router]);

  const validateField = (name: keyof FieldErrors, customVal?: string) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (name === 'password') {
        const val = customVal !== undefined ? customVal : password;
        if (!val) {
          next.password = 'Please enter a password.';
        } else if (val.length < 8) {
          next.password = 'Must be at least 8 characters.';
        } else {
          delete next.password;
        }
      } else if (name === 'confirm') {
        const val = customVal !== undefined ? customVal : confirm;
        if (!val) {
          next.confirm = 'Please confirm your password.';
        } else if (password && val !== password) {
          next.confirm = 'Passwords do not match. Please retype them.';
        } else {
          delete next.confirm;
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setMessage('Reset link is missing or has expired.');
      return;
    }

    const errors: FieldErrors = {};
    if (!password) {
      errors.password = 'Please enter a password.';
    } else if (password.length < 8) {
      errors.password = 'Must be at least 8 characters.';
    }
    if (!confirm) {
      errors.confirm = 'Please confirm your password.';
    } else if (password !== confirm) {
      errors.confirm = 'Passwords do not match. Please retype them.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormShaking(true);
      setTimeout(() => setFormShaking(false), 450);
      showToast({
        title: 'Please Check Your Password',
        message: 'Please fill in the password fields properly before submitting.',
        type: 'warning',
      });
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      const res = await resetPassword(token, password);
      if (res.success) {
        setStatus('success');
        setMessage(res.message || 'Password updated successfully!');
        showToast({
          title: 'Password Updated',
          message: 'Your password has been changed successfully. You are now signed in!',
          type: 'success',
        });
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else {
        const errMsg = res.message || 'Could not reset password.';
        if (
          errMsg.toLowerCase().includes('already been used') ||
          errMsg.toLowerCase().includes('expired') ||
          errMsg.toLowerCase().includes('invalid')
        ) {
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

  const getInputCls = (hasError?: boolean) => `
    w-full bg-bg-dark border px-4 py-2.5 rounded-lg text-text-main text-sm outline-none transition-all placeholder:text-zinc-500
    ${hasError 
      ? 'border-rose-500/70 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25 bg-rose-500/[0.04]' 
      : 'border-border-glass focus:border-primary focus:ring-2 focus:ring-primary/20'
    }
  `;

  // Loading / Token validating state
  if (validating) {
    return (
      <div className="max-w-md w-full bg-bg-surface border border-border-glass rounded-2xl p-8 shadow-2xl text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-primary/10 border border-primary/20 text-primary">
          <svg className="w-8 h-8 text-primary animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-text-main m-0">Checking Your Reset Link...</h2>
        <p className="text-xs text-text-dim mt-2 mb-0">Just a moment while we verify your link.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full bg-bg-surface border border-border-glass rounded-2xl p-8 shadow-2xl relative overflow-hidden">
      {/* Glow accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />

      {/* Header Icon & Title */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-3.5 flex items-center justify-center border transition-all duration-300">
          {status === 'success' ? (
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ) : status === 'error' ? (
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-rose-500/10 border-rose-500/30 text-rose-400">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" strokeLinecap="round" />
                <line x1="9" y1="9" x2="15" y2="15" strokeLinecap="round" />
              </svg>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-primary/10 border-primary/20 text-primary">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          )}
        </div>

        <h1 className="text-2xl font-extrabold text-text-main m-0 tracking-tight">
          {status === 'success' ? 'Password Updated!' : status === 'error' ? 'Reset Link Problem' : 'Create New Password'}
        </h1>

        {status === 'form' && tokenInfo && (
          <p className="text-xs text-text-dim mt-1.5 mb-0">
            Updating password for <span className="font-semibold text-primary">{tokenInfo.maskedEmail || tokenInfo.username}</span>
          </p>
        )}
      </div>

      {/* Main Password Reset Form */}
      {status === 'form' && (
        <form noValidate onSubmit={handleSubmit} className={`flex flex-col gap-4 ${formShaking ? 'animate-shake' : ''}`} suppressHydrationWarning>
          {/* New Password Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center min-w-0 gap-2">
              <label className="text-xs font-semibold text-text-main whitespace-nowrap shrink-0">New Password *</label>
              <div className="shrink min-w-0 justify-end">
                {fieldErrors.password ? (
                  <InlineError variant="label" message={fieldErrors.password} />
                ) : password && strength.label ? (
                  <span className={`text-[11px] font-bold ${strength.text} whitespace-nowrap`}>
                    {strength.label}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={password}
                onBlur={() => validateField('password')}
                onChange={(e) => {
                  const val = e.target.value;
                  setPassword(val);
                  if (fieldErrors.password) validateField('password', val);
                  if (message) setMessage('');
                }}
                className={`${getInputCls(Boolean(fieldErrors.password))} pr-10`}
                suppressHydrationWarning
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors p-1 bg-transparent border-none cursor-pointer"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {/* Interactive Strength Bar */}
            {password.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      strength.score >= level ? strength.color : 'bg-zinc-800'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Confirm Password Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center min-w-0 gap-2">
              <label className="text-xs font-semibold text-text-main whitespace-nowrap shrink-0">Confirm Password *</label>
              <div className="shrink min-w-0 justify-end">
                {fieldErrors.confirm ? (
                  <InlineError variant="label" message={fieldErrors.confirm} />
                ) : confirm.length > 0 ? (
                  <span
                    className={`text-[11px] font-bold ${
                      criteria.matches ? 'text-emerald-400' : 'text-rose-400'
                    } whitespace-nowrap`}
                  >
                    {criteria.matches ? '✓ Matches' : '✗ Does not match'}
                  </span>
                ) : null}
              </div>
            </div>
            <input
              type={show ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={confirm}
              onBlur={() => validateField('confirm')}
              onChange={(e) => {
                const val = e.target.value;
                setConfirm(val);
                if (fieldErrors.confirm) validateField('confirm', val);
                if (message) setMessage('');
              }}
              className={getInputCls(Boolean(fieldErrors.confirm))}
              suppressHydrationWarning
              autoComplete="new-password"
            />
          </div>

          {/* Real-time Checklist */}
          <div className="bg-bg-dark/60 border border-border-glass rounded-xl p-3 flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className={criteria.hasMinLength ? 'text-emerald-400' : 'text-zinc-500'}>
                {criteria.hasMinLength ? '✓' : '○'}
              </span>
              <span className={criteria.hasMinLength ? 'text-text-main font-medium' : 'text-zinc-500'}>
                At least 8 characters
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={criteria.hasNumOrSymbol ? 'text-emerald-400' : 'text-zinc-500'}>
                {criteria.hasNumOrSymbol ? '✓' : '○'}
              </span>
              <span className={criteria.hasNumOrSymbol ? 'text-text-main font-medium' : 'text-zinc-500'}>
                Contains at least 1 number or symbol
              </span>
            </div>
            {confirm.length > 0 && (
              <div className="flex items-center gap-2">
                <span className={criteria.matches ? 'text-emerald-400' : 'text-rose-400'}>
                  {criteria.matches ? '✓' : '✗'}
                </span>
                <span className={criteria.matches ? 'text-text-main font-medium' : 'text-rose-400'}>
                  Passwords match
                </span>
              </div>
            )}
          </div>

          <InlineError variant="banner" message={message} />

          <button
            type="submit"
            disabled={submitting}
            suppressHydrationWarning
            className="w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary-hover active:scale-[0.99] border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/25 mt-1"
          >
            {submitting ? 'Updating Password...' : 'Update Password & Sign In'}
          </button>
        </form>
      )}

      {/* Success State with Auto-Redirect */}
      {status === 'success' && (
        <div className="flex flex-col gap-4 text-center">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <p className="text-sm font-semibold text-emerald-400 m-0">{message}</p>
            <p className="text-xs text-text-dim mt-1.5 mb-0">
              A security notification has also been dispatched to your email address for your protection.
            </p>
          </div>

          <p className="text-xs text-text-dim m-0">
            Redirecting to your dashboard in <span className="font-bold text-primary">{redirectCount}s</span>...
          </p>

          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary-hover border-none cursor-pointer transition-all shadow-lg shadow-primary/25"
          >
            Go to Dashboard Now →
          </button>
        </div>
      )}

      {/* Error / Expired Link State */}
      {status === 'error' && (
        <div className="flex flex-col gap-4 text-center">
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <p className="text-sm text-rose-300 font-medium m-0">{message}</p>
          </div>

          <button
            onClick={() => router.push('/?auth=forgot')}
            className="w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-primary hover:bg-primary-hover border-none cursor-pointer transition-all shadow-lg shadow-primary/25"
          >
            Request a New Reset Link →
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-text-dim hover:text-text-main bg-bg-dark border border-border-glass cursor-pointer transition-all"
          >
            Return to Homepage
          </button>
        </div>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-dark p-4">
      <Suspense
        fallback={
          <div className="text-text-dim flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Loading password reset...</span>
          </div>
        }
      >
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}
