'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { useUIStore } from '@/stores/useUIStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';
import InlineError from '@/components/ui/InlineError';
import { startGoogleSignIn, isGoogleAuthPending } from '@/lib/googleAuth';
import TermsAndPoliciesModal from '@/components/ui/TermsAndPoliciesModal';
import { validateEmail } from '@/lib/emailValidator';
import { api } from '@/lib/api';

export default function AuthModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authParam = searchParams.get('auth'); // 'login' or 'register'
  
  const { isAuthOpen, authMode, setAuthOpen, googleSetupData, setGoogleSetupData } = useUIStore();
  const mode = authMode;
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const isSubmitting = isFormSubmitting || isGoogleSubmitting;

  // Contextual inline errors & field-level validation
  interface FieldErrors {
    username?: string;
    email?: string;
    password?: string;
    terms?: string;
    forgotTarget?: string;
    googlePassword?: string;
    googleConfirm?: string;
  }
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formShaking, setFormShaking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Alternate views: normal login/register, forgot-password, or first-time Google password setup
  const [view, setView] = useState<'main' | 'forgot' | 'googleSetup'>('main');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [googleSetup, setGoogleSetup] = useState<{ token: string; email: string; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Industry-standard asynchronous availability checks
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [isEmailAvailable, setIsEmailAvailable] = useState<boolean | null>(null);

  const checkUsernameTimer = useRef<NodeJS.Timeout | null>(null);
  const checkEmailTimer = useRef<NodeJS.Timeout | null>(null);
  const abortUsernameCtrl = useRef<AbortController | null>(null);
  const abortEmailCtrl = useRef<AbortController | null>(null);
  const availabilityCache = useRef<Map<string, { available: boolean; message?: string }>>(new Map());

  const { login, register, loginWithGoogle, completeGoogleSignup, forgotPassword, isAuthenticated } = useAuthStore();

  // Clear errors when mode or view changes
  useEffect(() => {
    setFieldErrors({});
    setFormError(null);
    setForgotError(null);
    setSetupError(null);
    setIsUsernameAvailable(null);
    setIsEmailAvailable(null);
    setCheckingUsername(false);
    setCheckingEmail(false);
  }, [mode, view, isAuthOpen]);

  const checkUsernameAvailability = (rawVal: string) => {
    const val = rawVal.trim();
    if (checkUsernameTimer.current) clearTimeout(checkUsernameTimer.current);
    if (abortUsernameCtrl.current) abortUsernameCtrl.current.abort();

    if (!val || val.length < 3) {
      setCheckingUsername(false);
      setIsUsernameAvailable(null);
      return;
    }

    const cacheKey = `user:${val.toLowerCase()}`;
    if (availabilityCache.current.has(cacheKey)) {
      const cached = availabilityCache.current.get(cacheKey)!;
      setCheckingUsername(false);
      setIsUsernameAvailable(cached.available);
      if (!cached.available) {
        setFieldErrors((prev) => ({ ...prev, username: cached.message || `Username "${val}" is already taken.` }));
      } else {
        setFieldErrors((prev) => {
          const next = { ...prev };
          if (next.username?.includes('taken')) delete next.username;
          return next;
        });
      }
      return;
    }

    setCheckingUsername(true);
    checkUsernameTimer.current = setTimeout(async () => {
      abortUsernameCtrl.current = new AbortController();
      try {
        const res = await api.get<{ available: boolean; message?: string }>(
          `/api/auth/check-availability?username=${encodeURIComponent(val)}`,
          { signal: abortUsernameCtrl.current.signal }
        );
        availabilityCache.current.set(cacheKey, res);
        setCheckingUsername(false);
        if (!res.available) {
          setIsUsernameAvailable(false);
          setFieldErrors((prev) => ({ ...prev, username: res.message || `Username "${val}" is already taken.` }));
        } else {
          setIsUsernameAvailable(true);
          setFieldErrors((prev) => {
            const next = { ...prev };
            if (next.username?.includes('taken')) delete next.username;
            return next;
          });
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setCheckingUsername(false);
        }
      }
    }, 380);
  };

  const checkEmailAvailability = (rawVal: string) => {
    const val = rawVal.trim().toLowerCase();
    if (checkEmailTimer.current) clearTimeout(checkEmailTimer.current);
    if (abortEmailCtrl.current) abortEmailCtrl.current.abort();

    const check = validateEmail(val);
    if (!check.isValid) {
      setCheckingEmail(false);
      setIsEmailAvailable(null);
      return;
    }

    const cacheKey = `email:${val}`;
    if (availabilityCache.current.has(cacheKey)) {
      const cached = availabilityCache.current.get(cacheKey)!;
      setCheckingEmail(false);
      setIsEmailAvailable(cached.available);
      if (!cached.available) {
        setFieldErrors((prev) => ({ ...prev, email: cached.message || 'An account with this email already exists.' }));
      } else {
        setFieldErrors((prev) => {
          const next = { ...prev };
          if (next.email?.includes('already exists')) delete next.email;
          return next;
        });
      }
      return;
    }

    setCheckingEmail(true);
    checkEmailTimer.current = setTimeout(async () => {
      abortEmailCtrl.current = new AbortController();
      try {
        const res = await api.get<{ available: boolean; message?: string }>(
          `/api/auth/check-availability?email=${encodeURIComponent(val)}`,
          { signal: abortEmailCtrl.current.signal }
        );
        availabilityCache.current.set(cacheKey, res);
        setCheckingEmail(false);
        if (!res.available) {
          setIsEmailAvailable(false);
          setFieldErrors((prev) => ({ ...prev, email: res.message || 'An account with this email already exists.' }));
        } else {
          setIsEmailAvailable(true);
          setFieldErrors((prev) => {
            const next = { ...prev };
            if (next.email?.includes('already exists')) delete next.email;
            return next;
          });
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setCheckingEmail(false);
        }
      }
    }, 420);
  };

  // Listen to deep links (?auth=login or ?auth=register)
  useEffect(() => {
    // Suppress opening modal if returning from Google redirect
    if (isGoogleAuthPending()) return;

    if (authParam === 'forgot') {
      setView('forgot');
      setForgotSent(false);
      setForgotError(null);
      setFieldErrors({});
      setAuthOpen(true, 'login');
    } else if (authParam === 'login' || authParam === 'register') {
      setView('main');
      if (isAuthenticated) {
        handleClose();
      } else {
        setAuthOpen(true, authParam);
      }
    }
  }, [authParam, isAuthenticated, setAuthOpen]);

  // Sync googleSetupData from global store (e.g. after return from Google redirect)
  useEffect(() => {
    if (googleSetupData) {
      setGoogleSetup(googleSetupData);
      setView('googleSetup');
      setNewPassword('');
      setConfirmPassword('');
      setFieldErrors({});
    }
  }, [googleSetupData]);

  // Reset submitting state and views whenever modal visibility changes
  useEffect(() => {
    if (!isAuthOpen) {
      setIsFormSubmitting(false);
      setIsGoogleSubmitting(false);
      setView('main');
      setFieldErrors({});
      setFormError(null);
    }
  }, [isAuthOpen]);

  // Auto-close modal whenever user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && isAuthOpen) {
      handleClose(true);
    }
  }, [isAuthenticated, isAuthOpen]);

  const handleClose = (skipRedirect: boolean | any = false) => {
    const shouldSkip = typeof skipRedirect === 'boolean' ? skipRedirect : false;
    setIsFormSubmitting(false);
    setIsGoogleSubmitting(false);
    setFieldErrors({});
    setFormError(null);
    setForgotError(null);
    setSetupError(null);
    setAuthOpen(false);
    setView('main');
    setForgotSent(false);
    setGoogleSetup(null);
    setGoogleSetupData(null);
    setNewPassword('');
    setConfirmPassword('');
    setAgreedToTerms(false);
    setIsTermsOpen(false);
    if (authParam && !shouldSkip && !isAuthenticated) {
      router.replace('/');
    }
  };

  // Google sign-in. All Firebase logic lives in lib/googleAuth.ts.
  const handleGoogleSignIn = async () => {
    if (isSubmitting || isGoogleSubmitting) return;
    setIsGoogleSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    if (authParam) {
      router.replace('/');
    }

    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        // Backend exchange in progress = user actually signed in; keep spinner.
        if (!settled && !isGoogleAuthPending()) setIsGoogleSubmitting(false);
      }, 1200);
    };
    // Defer so the focus shift caused by opening the popup itself isn't counted.
    const attachTimer = setTimeout(() => window.addEventListener('focus', onFocus), 300);

    try {
      const failure = await startGoogleSignIn();
      settled = true;
      if (failure) {
        setIsGoogleSubmitting(false);
        if (!failure.cancelled) {
          setFormError(failure.message);
          showToast({ title: 'Google Sign-In Notice', message: failure.message, type: 'error' });
        }
      } else if (useAuthStore.getState().isAuthenticated || useUIStore.getState().googleSetupData) {
        handleClose(true);
      } else {
        setIsGoogleSubmitting(false);
      }
    } finally {
      clearTimeout(attachTimer);
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocus);
    }
  };

  // Handle Registration with Industry-Standard Field Validation
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    const cleanUser = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanUser) {
      errors.username = 'Please choose a username.';
    } else if (cleanUser.length < 3) {
      errors.username = 'Must be at least 3 characters.';
    }

    if (!cleanEmail) {
      errors.email = 'Please enter your email address.';
    } else {
      const emailCheck = validateEmail(cleanEmail);
      if (!emailCheck.isValid) {
        errors.email = emailCheck.error || 'Please enter a valid email address.';
      }
    }

    if (!password) {
      errors.password = 'Please create a password.';
    } else if (password.length < 6) {
      errors.password = 'Must be at least 6 characters.';
    }

    if (!agreedToTerms) {
      errors.terms = 'Please accept our Studio Policies to continue.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormShaking(true);
      setTimeout(() => setFormShaking(false), 450);

      if (errors.terms && Object.keys(errors).length === 1) {
        showToast({
          title: 'Studio Policies',
          message: 'Please review and check the agreement box before creating an account.',
          type: 'warning',
        });
      } else {
        showToast({
          title: 'Please Check Your Details',
          message: 'Please fill in the highlighted fields before submitting.',
          type: 'error',
        });
      }
      return;
    }

    setIsFormSubmitting(true);
    try {
      const res = await register(
        cleanUser,
        cleanEmail,
        password
      );

      if (res.success) {
        handleClose(true);
        showToast({
          title: 'Welcome to Eds Towels & Caps!',
          message: `Account created successfully for ${res.user?.username || 'Customer'}.`,
          type: 'success',
        });
        if (authParam) {
          router.replace('/');
        }
      } else {
        setFormError(res.message || 'We could not complete your registration. Please try again.');
        showToast({
          title: 'Registration Notice',
          message: res.message || 'We could not complete your registration. Please check your details and try again.',
          type: 'error',
        });
      }
    } catch (err: any) {
      const msg = err.message || 'We ran into an issue setting up your account. Please try again.';
      setFormError(msg);
      showToast({
        title: 'Connection Issue',
        message: 'Could not reach the server. Please check your internet connection and try again.',
        type: 'error',
      });
    } finally {
      setIsFormSubmitting(false);
    }
  };

  // Smart Unified Login: Instant unlock for customers, role-based routing for staff
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    const cleanTarget = email.trim();

    if (!cleanTarget) {
      errors.email = 'Please enter your email or username.';
    }

    if (!password) {
      errors.password = 'Please enter your password.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormShaking(true);
      setTimeout(() => setFormShaking(false), 450);
      showToast({
        title: 'Sign In Required',
        message: 'Please enter both your email or username and password to sign in.',
        type: 'warning',
      });
      return;
    }

    setIsFormSubmitting(true);
    try {
      const res = await login(cleanTarget, password, rememberMe);
      
      if (res.success) {
        if (res.user?.role === 'admin' || res.user?.role === 'employee') {
          useUIStore.getState().triggerWelcome(res.user?.username || 'Staff', res.user?.role);
        } else {
          showToast({
            title: 'Welcome Back',
            message: `Signed in as ${res.user?.username || 'Customer'}.`,
            type: 'success',
          });
        }
        handleClose(true);

        // Smart Role-Based Routing
        if (res.user?.role === 'admin') {
          router.replace('/admin');
        } else if (res.user?.role === 'employee') {
          router.replace('/employee');
        } else {
          if (authParam) {
            router.replace('/');
          }
        }
      } else {
        const raw = res.message || '';
        const isCredentialErr = /invalid credential|invalid username|wrong username|user not found/i.test(raw);
        const friendlyMessage = isCredentialErr
          ? 'Wrong username or password. Please check your spelling and try again.'
          : (raw || 'Wrong username or password. Please check your spelling and try again.');
        setFormError(friendlyMessage);
        showToast({
          title: 'Sign In Unsuccessful',
          message: friendlyMessage,
          type: 'error',
        });
      }
    } catch {
      const netMsg = 'Unable to connect to the store. Please check your internet connection and try again.';
      setFormError(netMsg);
      showToast({
        title: 'Connection Issue',
        message: 'Could not reach the server. Please check your internet connection.',
        type: 'error',
      });
    } finally {
      setIsFormSubmitting(false);
    }
  };

  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const interval = setInterval(() => {
      setForgotCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [forgotCooldown]);

  const handleForgotPassword = () => {
    setForgotSent(false);
    setForgotError(null);
    setFieldErrors({});
    setView('forgot');
  };

  const handleForgotSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (forgotCooldown > 0) return;
    setForgotError(null);
    setFieldErrors({});

    const target = email.trim();
    if (!target) {
      setFieldErrors({ forgotTarget: 'Please enter your email or username.' });
      setFormShaking(true);
      setTimeout(() => setFormShaking(false), 450);
      showToast({
        title: 'Account Needed',
        message: 'Please enter your account email or username so we can send a reset link.',
        type: 'warning',
      });
      return;
    }

    setIsFormSubmitting(true);
    try {
      const res = await forgotPassword(target.toLowerCase());
      setForgotSent(true);
      setForgotCooldown(res?.cooldownSeconds || 60);
      showToast({
        title: 'Reset Link Sent',
        message: 'If your account is registered, please check your inbox for password reset instructions.',
        type: 'success',
      });
    } catch (err: any) {
      const errMsg = err.message || 'Could not send reset email.';
      setForgotError(errMsg);
      showToast({
        title: 'Could Not Send Link',
        message: errMsg,
        type: 'error',
      });
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleGoogleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);
    setFieldErrors({});
    if (!googleSetup) return;

    const errors: FieldErrors = {};
    if (!newPassword || newPassword.length < 6) {
      errors.googlePassword = 'Password must be at least 6 characters.';
    }
    if (newPassword !== confirmPassword) {
      errors.googleConfirm = 'Passwords do not match. Please retype them.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormShaking(true);
      setTimeout(() => setFormShaking(false), 450);
      showToast({
        title: 'Password Needed',
        message: 'Please fill in the password fields to finish setting up your account.',
        type: 'warning',
      });
      return;
    }

    setIsFormSubmitting(true);
    try {
      const res = await completeGoogleSignup(googleSetup.token, newPassword, googleSetup.username);
      if (res.success) {
        showToast({
          title: 'Account Ready',
          message: `Welcome, ${res.user?.username || 'Customer'}! Your password has been set.`,
          type: 'success',
        });
        handleClose();
        router.replace('/');
        router.refresh();
      } else {
        setSetupError(res.message || 'Could not finish sign-up.');
        showToast({
          title: 'Setup Notice',
          message: res.message || 'Could not finish sign-up. Please try again.',
          type: 'error',
        });
      }
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const validateField = (name: keyof FieldErrors, customVal?: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (name === 'username') {
        const val = (customVal !== undefined ? customVal : username).trim();
        if (!val) {
          next.username = 'Please choose a username.';
        } else if (val.length < 3) {
          next.username = 'Must be at least 3 characters.';
        } else {
          delete next.username;
        }
      } else if (name === 'email') {
        const val = (customVal !== undefined ? customVal : email).trim();
        if (mode === 'register') {
          if (!val) {
            next.email = 'Please enter your email address.';
          } else {
            const emailCheck = validateEmail(val);
            if (!emailCheck.isValid) {
              next.email = emailCheck.error || 'Please enter a valid email address.';
            } else {
              delete next.email;
            }
          }
        } else {
          if (!val) {
            next.email = 'Please enter your email or username.';
          } else {
            delete next.email;
          }
        }
      } else if (name === 'password') {
        const val = customVal !== undefined ? customVal : password;
        if (mode === 'register') {
          if (!val) {
            next.password = 'Please create a password.';
          } else if (val.length < 6) {
            next.password = 'Must be at least 6 characters.';
          } else {
            delete next.password;
          }
        } else {
          if (!val) {
            next.password = 'Please enter your password.';
          } else {
            delete next.password;
          }
        }
      } else if (name === 'forgotTarget') {
        const val = (customVal !== undefined ? customVal : email).trim();
        if (!val) {
          next.forgotTarget = 'Please enter your email or username.';
        } else {
          delete next.forgotTarget;
        }
      } else if (name === 'googlePassword') {
        const val = customVal !== undefined ? customVal : newPassword;
        if (!val) {
          next.googlePassword = 'Password must be at least 6 characters.';
        } else if (val.length < 6) {
          next.googlePassword = 'Must be at least 6 characters.';
        } else {
          delete next.googlePassword;
        }
      } else if (name === 'googleConfirm') {
        const val = customVal !== undefined ? customVal : confirmPassword;
        if (!val) {
          next.googleConfirm = 'Please confirm your password.';
        } else if (val !== newPassword) {
          next.googleConfirm = 'Passwords do not match. Please retype them.';
        } else {
          delete next.googleConfirm;
        }
      }
      return next;
    });
  };

  const getInputCls = (hasError?: boolean) => `
    w-full bg-bg-surface border px-4 py-2.5 rounded-lg text-text-main text-sm outline-none transition-all placeholder:text-text-dim/40
    ${hasError 
      ? 'border-rose-500/70 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25 bg-rose-500/[0.04]' 
      : 'border-border-glass focus:border-primary focus:ring-2 focus:ring-primary/20'
    }
  `;

  if (view === 'forgot') {
    return (
      <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth="max-w-[440px]" zIndex="z-[100005]" isDirty={false}>
        <div className="flex flex-col gap-5 font-sans text-left pt-1 pb-1">
          <div className="text-center">
            <h2 className="text-2xl font-black text-text-main m-0 tracking-tight">Reset Password</h2>
            <p className="text-text-dim text-xs mt-1.5 m-0 leading-relaxed">
              {forgotSent
                ? 'Check your inbox and spam folder. If an account exists, a reset link is on its way (valid for 1 hour).'
                : "Enter your account email or username and we'll send a link to set a new password."}
            </p>
          </div>
          {!forgotSent ? (
            <form noValidate onSubmit={handleForgotSubmit} className={`flex flex-col gap-3.5 ${formShaking ? 'animate-shake' : ''}`}>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between ml-1 min-w-0 gap-2">
                  <label className="text-[0.75rem] font-bold text-text-dim whitespace-nowrap shrink-0">Email or Username *</label>
                  <div className="shrink min-w-0 justify-end">
                    {fieldErrors.forgotTarget && (
                      <InlineError variant="label" message={fieldErrors.forgotTarget} />
                    )}
                  </div>
                </div>
                <input 
                  type="text" 
                  placeholder="e.g. ryven or revinaryven7@gmail.com" 
                  value={email} 
                  onBlur={() => validateField('forgotTarget')}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEmail(val);
                    if (fieldErrors.forgotTarget) validateField('forgotTarget', val);
                    if (forgotError) setForgotError(null);
                  }} 
                  className={getInputCls(Boolean(fieldErrors.forgotTarget))} 
                />
              </div>
              <GlassButton 
                type="submit" 
                variant="primary" 
                fullWidth 
                size="lg" 
                className="mt-1 font-bold text-sm" 
                disabled={isSubmitting || forgotCooldown > 0}
              >
                {isFormSubmitting 
                  ? 'Sending...' 
                  : (forgotCooldown > 0 ? `Wait ${forgotCooldown}s to resend` : 'Send Reset Link')}
              </GlassButton>
              <InlineError variant="banner" message={forgotError} />
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 text-center">
                ✓ Reset instructions dispatched to <strong className="text-white">{email}</strong> if registered.
              </div>
              <GlassButton 
                type="button" 
                variant="secondary" 
                fullWidth 
                size="md" 
                className="text-xs font-semibold"
                disabled={isSubmitting || forgotCooldown > 0} 
                onClick={() => handleForgotSubmit()}
              >
                {forgotCooldown > 0 ? `Resend available in ${forgotCooldown}s` : 'Resend Email'}
              </GlassButton>
            </div>
          )}
          <button type="button" onClick={() => setView('main')} className="bg-transparent border-none text-primary font-bold hover:underline cursor-pointer p-0 text-xs text-center">
            ← Back to Sign In
          </button>
        </div>
      </GlassModal>
    );
  }

  if (view === 'googleSetup' && googleSetup) {
    return (
      <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth="max-w-[440px]" zIndex="z-[100005]" isDirty={false}>
        <div className="flex flex-col gap-5 font-sans text-left pt-1 pb-1">
          <div className="text-center">
            <h2 className="text-2xl font-black text-text-main m-0 tracking-tight">Create a Password</h2>
            <p className="text-text-dim text-xs mt-1.5 m-0 leading-relaxed">
              Welcome! Set a password for <strong className="text-text-main">{googleSetup.email}</strong> so you can sign in with Google or with your email and password.
            </p>
          </div>
          <form noValidate onSubmit={handleGoogleSetupSubmit} className={`flex flex-col gap-3.5 ${formShaking ? 'animate-shake' : ''}`}>
            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-bold text-text-dim ml-1">Username</label>
              <input 
                type="text" 
                value={googleSetup.username} 
                onChange={(e) => { 
                  setGoogleSetup({ ...googleSetup, username: e.target.value }); 
                  if (setupError) setSetupError(null); 
                }} 
                className={getInputCls()} 
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between ml-1 min-w-0 gap-2">
                <label className="text-[0.75rem] font-bold text-text-dim whitespace-nowrap shrink-0">Password *</label>
                <div className="shrink min-w-0 justify-end">
                  {fieldErrors.googlePassword && (
                    <InlineError variant="label" message={fieldErrors.googlePassword} />
                  )}
                </div>
              </div>
              <input 
                type={showPassword ? 'text' : 'password'} 
                placeholder="At least 6 characters" 
                value={newPassword} 
                onBlur={() => validateField('googlePassword')}
                onChange={(e) => { 
                  const val = e.target.value;
                  setNewPassword(val); 
                  if (fieldErrors.googlePassword) validateField('googlePassword', val);
                  if (setupError) setSetupError(null); 
                }} 
                className={getInputCls(Boolean(fieldErrors.googlePassword))} 
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between ml-1 min-w-0 gap-2">
                <label className="text-[0.75rem] font-bold text-text-dim whitespace-nowrap shrink-0">Confirm Password *</label>
                <div className="shrink min-w-0 justify-end">
                  {fieldErrors.googleConfirm && (
                    <InlineError variant="label" message={fieldErrors.googleConfirm} />
                  )}
                </div>
              </div>
              <input 
                type={showPassword ? 'text' : 'password'} 
                placeholder="Re-enter password" 
                value={confirmPassword} 
                onBlur={() => validateField('googleConfirm')}
                onChange={(e) => { 
                  const val = e.target.value;
                  setConfirmPassword(val); 
                  if (fieldErrors.googleConfirm) validateField('googleConfirm', val);
                  if (setupError) setSetupError(null); 
                }} 
                className={getInputCls(Boolean(fieldErrors.googleConfirm))} 
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer ml-1 select-none text-xs text-text-dim">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="accent-primary rounded cursor-pointer w-4 h-4" />
              <span>Show password</span>
            </label>
            <GlassButton type="submit" variant="primary" fullWidth size="lg" className="mt-1 font-bold text-sm" disabled={isSubmitting}>
              {isFormSubmitting ? 'Creating Account...' : 'Create Account'}
            </GlassButton>
            <InlineError variant="banner" message={setupError} />
          </form>
          <button type="button" onClick={handleClose} className="bg-transparent border-none text-text-dim hover:underline cursor-pointer p-0 text-xs">
            Cancel
          </button>
        </div>
      </GlassModal>
    );
  }

  return (
    <>
      <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth="max-w-[440px]" zIndex="z-[99999]" isDirty={false}>
        <div className="flex flex-col gap-5 font-sans text-left pt-1 pb-1">
        
        {/* Header & Subtitle */}
        <div className="text-center">
          <h2 className="text-2xl font-black text-text-main m-0 tracking-tight">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-text-dim text-xs mt-1.5 m-0 leading-relaxed">
            {mode === 'login' 
              ? 'Sign in to access your orders, designs & custom projects' 
              : 'Join Eds Towels & Caps for custom embroidery orders & tracking'}
          </p>
        </div>

        {/* Credentials Form */}
        <form 
          noValidate 
          onSubmit={mode === 'login' ? handleLoginSubmit : handleRegisterSubmit} 
          className={`flex flex-col gap-3.5 ${formShaking ? 'animate-shake' : ''}`}
        >
          {mode === 'register' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between ml-1 min-w-0 gap-2">
                <label className="text-[0.75rem] font-bold text-text-dim whitespace-nowrap shrink-0">Username *</label>
                <div className="flex items-center gap-1.5 shrink min-w-0 justify-end">
                  {fieldErrors.username ? (
                    <InlineError variant="label" message={fieldErrors.username} />
                  ) : !checkingUsername && isUsernameAvailable ? (
                    <span className="text-[0.7rem] text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn leading-none whitespace-nowrap">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Available</span>
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="e.g. johndoe"
                  value={username}
                  onBlur={() => {
                    validateField('username');
                    if (username.trim().length >= 3) {
                      checkUsernameAvailability(username);
                    }
                  }}
                  onChange={(e) => { 
                    const val = e.target.value;
                    setUsername(val); 
                    if (fieldErrors.username) validateField('username', val);
                    if (formError) setFormError(null); 
                    checkUsernameAvailability(val);
                  }}
                  className={`${getInputCls(Boolean(fieldErrors.username))} pr-9`}
                />
                {checkingUsername && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                    <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {!checkingUsername && isUsernameAvailable && !fieldErrors.username && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none animate-fadeIn">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between ml-1 min-w-0 gap-2">
              <label className="text-[0.75rem] font-bold text-text-dim whitespace-nowrap shrink-0">
                {mode === 'login' ? 'Email or Username *' : 'Email Address *'}
              </label>
              <div className="flex items-center gap-1.5 shrink min-w-0 justify-end">
                {fieldErrors.email ? (
                  <>
                    <InlineError variant="label" message={fieldErrors.email} />
                    {mode === 'register' && fieldErrors.email.includes('already exists') && (
                      <button
                        type="button"
                        onClick={() => setAuthOpen(true, 'login')}
                        className="text-[0.68rem] text-primary hover:underline font-bold bg-transparent border-none p-0 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Sign in →
                      </button>
                    )}
                  </>
                ) : mode === 'register' && !checkingEmail && isEmailAvailable ? (
                  <span className="text-[0.7rem] text-emerald-400 font-semibold flex items-center gap-1 animate-fadeIn leading-none whitespace-nowrap">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Available</span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="relative">
              <input 
                type={mode === 'login' ? 'text' : 'email'} 
                placeholder={mode === 'login' ? 'e.g. johndoe or user@email.com' : 'you@example.com'}
                value={email}
                onBlur={() => {
                  validateField('email');
                  if (mode === 'register' && email.trim()) {
                    checkEmailAvailability(email);
                  }
                }}
                onChange={(e) => { 
                  const val = e.target.value;
                  setEmail(val); 
                  if (fieldErrors.email) validateField('email', val);
                  if (formError) setFormError(null); 
                  if (mode === 'register') {
                    checkEmailAvailability(val);
                  }
                }}
                className={`${getInputCls(Boolean(fieldErrors.email))} ${mode === 'register' ? 'pr-9' : ''}`}
              />
              {mode === 'register' && checkingEmail && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                  <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {mode === 'register' && !checkingEmail && isEmailAvailable && !fieldErrors.email && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none animate-fadeIn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center ml-1 min-w-0 gap-2">
              <label className="text-[0.75rem] font-bold text-text-dim whitespace-nowrap shrink-0">Password *</label>
              <div className="flex items-center gap-2 shrink min-w-0 justify-end">
                {fieldErrors.password && (
                  <InlineError variant="label" message={fieldErrors.password} />
                )}
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="bg-transparent border-none text-[0.7rem] text-primary hover:underline cursor-pointer p-0 font-medium whitespace-nowrap shrink-0"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••"
                value={password}
                onBlur={() => validateField('password')}
                onChange={(e) => { 
                  const val = e.target.value;
                  setPassword(val); 
                  if (fieldErrors.password) validateField('password', val);
                  if (formError) setFormError(null); 
                }}
                className={`${getInputCls(Boolean(fieldErrors.password))} pr-11`}
              />
              <button 
                type="button" 
                suppressHydrationWarning
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-dim hover:text-text-main cursor-pointer p-1 transition-colors"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                    <line x1="3" y1="3" x2="21" y2="21"></line>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer ml-1 select-none text-xs text-text-dim">
            <input 
              type="checkbox" 
              checked={rememberMe} 
              onChange={(e) => setRememberMe(e.target.checked)}
              className="accent-primary rounded cursor-pointer w-4 h-4"
            />
            <span>Keep me signed in on this device</span>
          </label>

          {mode === 'register' && (
            <div className="flex flex-col gap-2.5 pt-1">
              <div 
                className={`flex items-start gap-2.5 ml-1 select-none text-xs text-text-dim p-2.5 rounded-lg border transition-all duration-200 ${
                  fieldErrors.terms 
                    ? 'bg-rose-500/10 border-rose-500/60 ring-2 ring-rose-500/20' 
                    : 'bg-white/[0.03] border-border-glass hover:border-white/20'
                }`}
              >
                <input 
                  type="checkbox" 
                  id="register-terms-agree"
                  checked={agreedToTerms} 
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked);
                    if (fieldErrors.terms) setFieldErrors((prev) => ({ ...prev, terms: undefined }));
                    if (formError) setFormError(null);
                  }}
                  className="accent-primary rounded cursor-pointer w-4 h-4 mt-0.5 shrink-0"
                />
                <label htmlFor="register-terms-agree" className="text-[0.72rem] text-text-dim text-left leading-relaxed cursor-pointer">
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsTermsOpen(true);
                    }}
                    className="text-primary hover:underline font-bold bg-transparent border-none p-0 cursor-pointer inline text-[0.72rem]"
                  >
                    Terms of Service &amp; Studio Policies
                  </button>
                  , including non-cancellation terms once custom machine stitching begins.
                </label>
              </div>
              {fieldErrors.terms && (
                <InlineError variant="field" message={fieldErrors.terms} className="ml-1" />
              )}

              <div className="text-[0.68rem] text-emerald-500/90 font-medium ml-1 flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Order receipts, tracking, &amp; notices are sent directly to your Gmail/Email.</span>
              </div>
            </div>
          )}

          <GlassButton
            type="submit"
            variant="primary"
            fullWidth
            size="lg"
            className="mt-2 font-bold text-sm tracking-wide shadow-sm"
            disabled={isSubmitting}
          >
            {isFormSubmitting 
              ? (mode === 'login' ? 'Signing In...' : 'Creating Account...') 
              : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </GlassButton>
          <InlineError variant="banner" message={formError} />
        </form>

        {/* 1-Click Google Sign-In */}
        <div className="relative flex items-center justify-center my-0.5">
          <div className="border-t border-border-glass w-full" />
          <span className="bg-bg-card px-3 text-[0.7rem] font-bold text-text-dim uppercase tracking-wider shrink-0">
            or continue with
          </span>
          <div className="border-t border-border-glass w-full" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] active:bg-white/[0.16] border border-white/15 text-text-main font-bold text-sm flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md hover:border-primary/40 disabled:opacity-50"
        >
          {isGoogleSubmitting ? (
            <>
              <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Connecting with Google...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z" />
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15Z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" />
              </svg>
              <span>{mode === 'login' ? 'Continue with Google' : 'Sign Up with Google'}</span>
            </>
          )}
        </button>

        <div className="text-center pt-1 border-t border-border-glass flex flex-col gap-2">
          <p className="text-xs text-text-dim m-0">
            {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setAuthOpen(true, mode === 'login' ? 'register' : 'login')}
              className="bg-transparent border-none text-primary font-bold hover:underline cursor-pointer p-0 text-xs"
            >
              {mode === 'login' ? 'Create an Account' : 'Sign In'}
            </button>
          </p>
        </div>

      </div>
    </GlassModal>

    <TermsAndPoliciesModal 
      isOpen={isTermsOpen} 
      onClose={() => setIsTermsOpen(false)} 
      zIndex="z-[100005]"
    />
  </>
  );
}
