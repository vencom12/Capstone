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

  // Alternate views: normal login/register, forgot-password, first-time Google password setup, or OTP verification
  const [view, setView] = useState<'main' | 'forgot' | 'googleSetup' | 'verifyOtp'>('main');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
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
  const [isRegistrationSuccess, setIsRegistrationSuccess] = useState(false);

  const checkUsernameTimer = useRef<NodeJS.Timeout | null>(null);
  const checkEmailTimer = useRef<NodeJS.Timeout | null>(null);
  const abortUsernameCtrl = useRef<AbortController | null>(null);
  const abortEmailCtrl = useRef<AbortController | null>(null);
  const availabilityCache = useRef<Map<string, { available: boolean; message?: string }>>(new Map());

  const { login, register, sendRegistrationOtp, loginWithGoogle, completeGoogleSignup, forgotPassword, isAuthenticated } = useAuthStore();

  // OTP Resend cooldown timer
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  // Clear errors when mode or view changes
  useEffect(() => {
    setFieldErrors({});
    setFormError(null);
    setForgotError(null);
    setSetupError(null);
    setOtpError(null);
    setIsUsernameAvailable(null);
    setIsEmailAvailable(null);
    setCheckingUsername(false);
    setCheckingEmail(false);
    setIsRegistrationSuccess(false);
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

  // Handle Registration:
  // If email is provided -> request OTP and open 'verifyOtp' view
  // If email is empty -> frictionless registration directly!
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    const cleanUser = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUser) {
      errors.username = 'Please choose a username.';
    } else if (cleanUser.length < 3) {
      errors.username = 'Must be at least 3 characters.';
    }

    if (cleanEmail) {
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
          message: 'Please fill in the required fields before submitting.',
          type: 'error',
        });
      }
      return;
    }

    // SCENARIO 1: Email is provided -> Trigger OTP verification step
    if (cleanEmail) {
      setIsFormSubmitting(true);
      try {
        const res = await sendRegistrationOtp(cleanEmail, cleanUser);
        if (res.success) {
          setOtpCode('');
          setOtpError(null);
          setOtpCooldown(60);
          setView('verifyOtp');
          showToast({
            title: 'Verification Code Sent',
            message: `A 6-digit verification code was sent to ${cleanEmail}.`,
            type: 'info',
          });
        } else {
          setFormError(res.message);
          showToast({
            title: 'Email Notice',
            message: res.message,
            type: 'error',
          });
        }
      } catch (err: any) {
        const msg = err.message || 'Failed to send verification code. Please check your email.';
        setFormError(msg);
      } finally {
        setIsFormSubmitting(false);
      }
      return;
    }

    // SCENARIO 2: No Email -> Instant Frictionless Registration
    setIsFormSubmitting(true);
    try {
      const res = await register(cleanUser, '', password);

      if (res.success) {
        setIsRegistrationSuccess(true);
        showToast({
          title: 'Welcome to Eds Towels & Caps!',
          message: `Account created successfully for ${res.user?.username || 'Customer'}.`,
          type: 'success',
        });
        setTimeout(() => {
          handleClose(true);
          useUIStore.getState().startCustomerTour();
          if (authParam) {
            router.replace('/');
          }
        }, 700);
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

  // Submit OTP Verification code and finalize registration
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);

    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length < 6) {
      setOtpError('Please enter the full 6-digit verification code.');
      return;
    }

    setIsFormSubmitting(true);
    try {
      const res = await register(
        username.trim(),
        email.trim().toLowerCase(),
        password,
        undefined,
        undefined,
        cleanOtp
      );

      if (res.success) {
        setIsRegistrationSuccess(true);
        showToast({
          title: 'Email Verified & Account Created!',
          message: `Welcome, ${res.user?.username || 'Customer'}! Your account is verified.`,
          type: 'success',
        });
        setTimeout(() => {
          handleClose(true);
          useUIStore.getState().startCustomerTour();
          if (authParam) {
            router.replace('/');
          }
        }, 700);
      } else {
        setOtpError(res.message || 'Invalid or expired verification code.');
        showToast({
          title: 'Verification Notice',
          message: res.message || 'Invalid or expired verification code.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setOtpError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsFormSubmitting(false);
    }
  };

  // Resend OTP code with cooldown
  const handleResendOtp = async () => {
    if (otpCooldown > 0 || isSendingOtp) return;
    setIsSendingOtp(true);
    try {
      const res = await sendRegistrationOtp(email.trim().toLowerCase(), username.trim());
      if (res.success) {
        setOtpCooldown(60);
        showToast({
          title: 'New Code Sent',
          message: `A fresh 6-digit code was sent to ${email.trim()}.`,
          type: 'info',
        });
      } else {
        setOtpError(res.message);
      }
    } catch (err: any) {
      setOtpError(err.message || 'Failed to resend code.');
    } finally {
      setIsSendingOtp(false);
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
        setIsRegistrationSuccess(true);
        showToast({
          title: 'Account Ready',
          message: `Welcome, ${res.user?.username || 'Customer'}! Your password has been set.`,
          type: 'success',
        });
        setTimeout(() => {
          handleClose();
          useUIStore.getState().startCustomerTour();
          router.replace('/');
          router.refresh();
        }, 700);
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
            // Optional during registration: empty is completely valid
            delete next.email;
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
    w-full bg-bg-surface border px-3.5 py-2 rounded-lg text-text-main text-sm outline-none transition-all placeholder:text-text-dim/40
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
            <div className="flex flex-col gap-2.5">
              <p className="py-2 px-3 rounded-lg bg-white/[0.04] border border-border-glass text-xs text-text-main flex items-center justify-center gap-2 text-center m-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-text-main shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Instructions sent to <strong className="text-white">{email}</strong> if registered.</span>
              </p>
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
    const isGoogleStep1Done = Boolean(googleSetup.username.trim().length >= 3);
    const isGoogleStep2Done = Boolean(newPassword.length >= 6 && !fieldErrors.googlePassword);
    const isGoogleStep3Done = Boolean(confirmPassword.length >= 6 && confirmPassword === newPassword && !fieldErrors.googleConfirm);
    const isGoogleStep4Done = Boolean(isFormSubmitting || isRegistrationSuccess);

    const activeGoogleStep = !isGoogleStep1Done ? 1 : !isGoogleStep2Done ? 2 : !isGoogleStep3Done ? 3 : 4;
    const googlePercentage = isGoogleStep4Done ? 100 : activeGoogleStep === 4 ? 75 : activeGoogleStep === 3 ? 50 : activeGoogleStep === 2 ? 25 : 0;

    const googleTrackFillPercent = isGoogleStep4Done
      ? 100
      : activeGoogleStep === 1
      ? 0
      : activeGoogleStep === 2
      ? 33.33
      : activeGoogleStep === 3
      ? 66.66
      : 66.66;

    const googleSteps = [
      { id: 1, label: 'Google Username', shortLabel: 'User', done: isGoogleStep1Done },
      { id: 2, label: 'Create Password', shortLabel: 'Pass', done: isGoogleStep2Done },
      { id: 3, label: 'Confirm Password', shortLabel: 'Confirm', done: isGoogleStep3Done },
      { id: 4, label: 'Create My Account', shortLabel: 'Finish', done: isGoogleStep4Done },
    ];

    return (
      <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth="max-w-[440px]" zIndex="z-[100005]" isDirty={false}>
        <div className="flex flex-col gap-2.5 font-sans text-left pt-0 pb-0.5">
          {/* Modal Top Header */}
          <div className="text-center pt-0 pb-1 px-8">
            <h2 className="text-xl sm:text-2xl font-black text-text-main m-0 tracking-tight">
              Create Account
            </h2>
          </div>

          {/* 4-Step Sticky Google Setup Progress Bar with Checkpoints */}
          <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-2.5 bg-bg-card/95 backdrop-blur-md border-b border-border-glass transition-all">
            {/* Checkpoints & Connecting Progress Line (Finish checkpoint sits precisely at the end of the bar) */}
            <div className="relative flex items-center justify-between px-3 pt-0.5 pb-0.5">
              {/* Enclosed Track: Bounded strictly between center of node 1 (x=24px) and center of node 4 (x=calc(100%-24px)) */}
              <div className="absolute left-[24px] right-[24px] top-4 -translate-y-1/2 h-1 bg-bg-surface border border-border-glass rounded-full overflow-hidden z-0">
                <div 
                  className={`h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500 ease-out z-0 ${
                    isGoogleStep4Done ? 'shadow-[0_0_12px_var(--color-primary-glow)] animate-pulse' : 'shadow-[0_0_6px_var(--color-primary-glow)]'
                  }`}
                  style={{
                    width: `${googleTrackFillPercent}%`
                  }}
                />
              </div>

              {/* Checkpoints */}
              {googleSteps.map((s) => {
                const isCompleted = s.done;
                const isCurrent = activeGoogleStep === s.id && !s.done;

                return (
                  <div key={s.id} className="relative z-10 flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                        isCompleted
                          ? 'bg-primary text-white shadow-[0_0_8px_var(--color-primary-glow)] scale-105'
                          : isCurrent
                          ? 'bg-bg-card border-2 border-primary text-primary shadow-[0_0_10px_var(--color-primary-glow)] ring-2 ring-primary/25 scale-110'
                          : 'bg-bg-surface border border-border-glass text-text-dim'
                      }`}
                      title={`Step ${s.id}: ${s.label}`}
                    >
                      {isCompleted ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <span>{s.id}</span>
                      )}
                    </div>
                    <span
                      className={`text-[9px] mt-1 font-semibold tracking-tight uppercase whitespace-nowrap transition-colors ${
                        isCompleted
                          ? 'text-primary font-bold'
                          : isCurrent
                          ? 'text-primary font-black'
                          : 'text-text-dim/60'
                      }`}
                    >
                      {s.shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <form noValidate autoComplete="off" onSubmit={handleGoogleSetupSubmit} className={`flex flex-col gap-2.5 ${formShaking ? 'animate-shake' : ''}`}>
            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-bold text-text-dim ml-1">Username *</label>
              <input 
                type="text" 
                autoComplete="off"
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
              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  autoComplete="new-password"
                  placeholder="At least 6 characters" 
                  value={newPassword} 
                  onBlur={() => validateField('googlePassword')}
                  onChange={(e) => { 
                    const val = e.target.value;
                    setNewPassword(val); 
                    if (fieldErrors.googlePassword) validateField('googlePassword', val);
                    if (setupError) setSetupError(null); 
                  }} 
                  className={`${getInputCls(Boolean(fieldErrors.googlePassword))} pr-9`} 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main bg-transparent border-none p-0 cursor-pointer flex items-center"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
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
              <div className="relative">
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
                  className={`${getInputCls(Boolean(fieldErrors.googleConfirm))} pr-9`} 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main bg-transparent border-none p-0 cursor-pointer flex items-center"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <GlassButton
              type="submit"
              variant="primary"
              fullWidth
              size="md"
              className="mt-1 font-bold text-sm tracking-wide shadow-sm py-2.5"
              disabled={isSubmitting}
            >
              {isFormSubmitting ? 'Creating My Account...' : 'Create My Account'}
            </GlassButton>
            <InlineError variant="banner" message={setupError} />
          </form>

          <div className="text-center pt-1 border-t border-border-glass">
            <button type="button" onClick={handleClose} className="bg-transparent border-none text-text-dim hover:underline cursor-pointer p-0 text-xs">
              Cancel setup
            </button>
          </div>
        </div>
      </GlassModal>
    );
  }

  if (view === 'verifyOtp') {
    return (
      <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth="max-w-[420px]" zIndex="z-[100005]" isDirty={false}>
        <div className="flex flex-col gap-3 font-sans text-left pt-0 pb-1">
          {/* Top Header */}
          <div className="text-center pt-1 pb-1 px-4">
            <div className="w-10 h-10 rounded-full bg-white/[0.06] border border-border-glass mx-auto flex items-center justify-center mb-2 text-text-main">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-text-main m-0 tracking-tight">
              Verify Your Email
            </h2>
            <p className="text-xs text-text-dim mt-1.5 mb-0">
              We sent a 6-digit verification code to <span className="font-semibold text-text-main">{email}</span>. Enter it below to complete registration.
            </p>
          </div>

          <form noValidate autoComplete="off" onSubmit={handleOtpSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-bold text-text-dim ml-1">
                6-Digit Verification Code
              </label>
              <input
                type="text"
                maxLength={6}
                autoFocus
                placeholder="000000"
                value={otpCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtpCode(val);
                  if (otpError) setOtpError(null);
                }}
                className="w-full text-center text-2xl font-mono tracking-[0.3em] font-bold py-2.5 px-3 rounded-lg bg-bg-surface/80 border border-border-glass text-text-main placeholder:text-text-dim/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all"
              />
              {otpError && (
                <div className="mt-1">
                  <InlineError variant="field" message={otpError} />
                </div>
              )}
            </div>

            <GlassButton
              type="submit"
              variant="primary"
              fullWidth
              size="md"
              className="mt-1 font-bold text-sm tracking-wide shadow-sm py-2.5"
              disabled={isFormSubmitting || otpCode.length < 6}
            >
              {isFormSubmitting ? 'Verifying...' : 'Verify & Create Account'}
            </GlassButton>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-border-glass">
              <button
                type="button"
                onClick={() => setView('main')}
                className="bg-transparent border-none text-text-dim hover:text-text-main hover:underline cursor-pointer p-0 text-xs"
              >
                ← Back / Edit Email
              </button>
              <button
                type="button"
                disabled={otpCooldown > 0 || isSendingOtp}
                onClick={handleResendOtp}
                className="bg-transparent border-none text-primary hover:underline font-semibold cursor-pointer p-0 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : 'Resend Code'}
              </button>
            </div>
          </form>
        </div>
      </GlassModal>
    );
  }

  // 5-Step Customer Registration Progress (Username -> Email (Optional) -> Password -> Policies -> Create My Account)
  const isStep1Done = Boolean(username.trim().length >= 3 && !fieldErrors.username);
  const isStep2Done = Boolean(email.trim().length === 0 || (!fieldErrors.email && email.includes('@')));
  const isStep3Done = Boolean(password.length >= 6 && !fieldErrors.password);
  const isStep4Done = Boolean(agreedToTerms);
  // Step 5 is ONLY done when the user clicks Create My Account and submission is in progress or completed!
  const isStep5Done = Boolean(isFormSubmitting || isRegistrationSuccess);

  const activeStep = !isStep1Done ? 1 : !isStep2Done ? 2 : !isStep3Done ? 3 : !isStep4Done ? 4 : 5;
  const regPercentage = isStep5Done ? 100 : activeStep === 5 ? 80 : activeStep * 20;

  // Track fill strictly between node 1 (0%) and node 5 (100%)
  const trackFillPercent = isStep5Done
    ? 100
    : activeStep === 1
    ? 0
    : activeStep === 2
    ? 25
    : activeStep === 3
    ? 50
    : 75;

  const regSteps = [
    { id: 1, label: 'Username', shortLabel: 'User', done: isStep1Done },
    { id: 2, label: 'Email (Optional)', shortLabel: 'Email', done: isStep2Done },
    { id: 3, label: 'Password', shortLabel: 'Pass', done: isStep3Done },
    { id: 4, label: 'Studio Policies', shortLabel: 'Terms', done: isStep4Done },
    { id: 5, label: 'Create My Account', shortLabel: 'Finish', done: isStep5Done },
  ];

  return (
    <>
      <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth="max-w-[440px]" zIndex="z-[99999]" isDirty={false}>
        <div className="flex flex-col gap-2.5 font-sans text-left pt-0 pb-0.5">

          {/* Modal Top Header */}
          <div className="text-center pt-0 pb-1 px-8">
            <h2 className="text-xl sm:text-2xl font-black text-text-main m-0 tracking-tight">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </h2>
          </div>

          {/* 5-Step Sticky Registration Progress Bar with Checkpoints (Stays fixed regardless of scrolling) */}
          {mode === 'register' && (
          <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-2.5 bg-bg-card/95 backdrop-blur-md border-b border-border-glass transition-all">
            {/* Checkpoints & Connecting Progress Line (Finish checkpoint sits precisely at the end of the bar) */}
            <div className="relative flex items-center justify-between px-3 pt-0.5 pb-0.5">
              {/* Enclosed Track: Bounded strictly between center of node 1 (x=24px) and center of node 5 (x=calc(100%-24px)) */}
              <div className="absolute left-[24px] right-[24px] top-4 -translate-y-1/2 h-1 bg-bg-surface border border-border-glass rounded-full overflow-hidden z-0">
                <div 
                  className={`h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500 ease-out z-0 ${
                    isStep5Done ? 'shadow-[0_0_12px_var(--color-primary-glow)] animate-pulse' : 'shadow-[0_0_6px_var(--color-primary-glow)]'
                  }`}
                  style={{
                    width: `${trackFillPercent}%`
                  }}
                />
              </div>

              {/* Checkpoints */}
              {regSteps.map((s) => {
                const isCompleted = s.done;
                const isCurrent = activeStep === s.id && !s.done;

                return (
                  <div key={s.id} className="relative z-10 flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                        isCompleted
                          ? 'bg-primary text-white shadow-[0_0_8px_var(--color-primary-glow)] scale-105'
                          : isCurrent
                          ? 'bg-bg-card border-2 border-primary text-primary shadow-[0_0_10px_var(--color-primary-glow)] ring-2 ring-primary/25 scale-110'
                          : 'bg-bg-surface border border-border-glass text-text-dim'
                      }`}
                      title={`Step ${s.id}: ${s.label}`}
                    >
                      {isCompleted ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <span>{s.id}</span>
                      )}
                    </div>
                    <span
                      className={`text-[9px] mt-1 font-semibold tracking-tight uppercase whitespace-nowrap transition-colors ${
                        isCompleted
                          ? 'text-primary font-bold'
                          : isCurrent
                          ? 'text-primary font-black'
                          : 'text-text-dim/60'
                      }`}
                    >
                      {s.shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Credentials Form */}
        <form 
          noValidate 
          autoComplete="off"
          onSubmit={mode === 'login' ? handleLoginSubmit : handleRegisterSubmit} 
          className={`flex flex-col gap-2.5 ${formShaking ? 'animate-shake' : ''}`}
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
                  autoComplete="off"
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
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-main pointer-events-none animate-fadeIn">
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
                {mode === 'login' ? 'Email or Username *' : 'Email Address (Optional)'}
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
                ) : mode === 'register' && email.trim() && !checkingEmail && isEmailAvailable ? (
                  <span className="text-[0.7rem] text-text-main font-semibold flex items-center gap-1 animate-fadeIn leading-none whitespace-nowrap">
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
                autoComplete={mode === 'register' ? 'off' : 'username'}
                placeholder={mode === 'login' ? 'e.g. johndoe or user@email.com' : 'you@example.com (optional)'}
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
                  if (mode === 'register' && val.trim()) {
                    checkEmailAvailability(val);
                  } else if (mode === 'register' && !val.trim()) {
                    setIsEmailAvailable(null);
                  }
                }}
                className={`${getInputCls(Boolean(fieldErrors.email))} ${mode === 'register' ? 'pr-9' : ''}`}
              />
              {mode === 'register' && checkingEmail && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                  <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {mode === 'register' && !checkingEmail && isEmailAvailable && !fieldErrors.email && email.trim() && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-main pointer-events-none animate-fadeIn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </div>
            {mode === 'register' && (
              !email.trim() ? (
                <p className="mt-1 text-[0.72rem] text-text-dim flex items-center gap-1.5 leading-snug">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-text-dim/80">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Optional — You can register with just your username and link an email later for receipts.</span>
                </p>
              ) : (
                <p className="mt-1 text-[0.72rem] text-text-dim flex items-center gap-1.5 leading-snug">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-text-dim/80">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span>A 6-digit verification code will be sent to confirm this email.</span>
                </p>
              )
            )}
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
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
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

          {mode === 'login' && (
            <label className="flex items-center gap-2 cursor-pointer ml-1 select-none text-xs text-text-dim">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)}
                className="accent-primary rounded cursor-pointer w-4 h-4"
              />
              <span>Keep me signed in on this device</span>
            </label>
          )}

          {mode === 'register' && (
            <div className="flex flex-col gap-1 pt-0.5">
              <div 
                className={`flex items-center gap-2 select-none text-xs text-text-dim px-2.5 py-1.5 rounded-lg border transition-all duration-200 ${
                  fieldErrors.terms 
                    ? 'bg-rose-500/10 border-rose-500/60 ring-1 ring-rose-500/30' 
                    : 'bg-white/[0.02] border-border-glass hover:border-white/20'
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
                  className="accent-primary rounded cursor-pointer w-4 h-4 shrink-0"
                />
                <label htmlFor="register-terms-agree" className="text-[0.72rem] text-text-dim text-left cursor-pointer flex-1 flex flex-wrap items-center gap-1">
                  <span>I agree to the</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsTermsOpen(true);
                    }}
                    className="text-primary hover:underline font-bold bg-transparent border-none p-0 cursor-pointer inline text-[0.72rem]"
                  >
                    Terms &amp; Studio Policies
                  </button>
                  <span className="text-[0.68rem] text-text-dim/60">(Non-cancellation on stitching)</span>
                </label>
              </div>
              {fieldErrors.terms && (
                <InlineError variant="field" message={fieldErrors.terms} className="ml-1" />
              )}
            </div>
          )}

          <GlassButton
            type="submit"
            variant="primary"
            fullWidth
            size="md"
            className="mt-1 font-bold text-sm tracking-wide shadow-sm py-2.5"
            disabled={isSubmitting}
          >
            {isFormSubmitting 
              ? (mode === 'login' ? 'Signing In...' : (email.trim() ? 'Sending Code...' : 'Creating Account...')) 
              : (mode === 'login' ? 'Sign In' : (email.trim() ? 'Verify Email & Create Account' : 'Create My Account'))}
          </GlassButton>
          <InlineError variant="banner" message={formError} />
        </form>

        {/* 1-Click Google Sign-In */}
        <div className="relative flex items-center justify-center my-0.5">
          <div className="border-t border-border-glass w-full" />
          <span className="bg-bg-card px-3 text-[0.68rem] font-bold text-text-dim uppercase tracking-wider shrink-0">
            or continue with
          </span>
          <div className="border-t border-border-glass w-full" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="w-full py-2 px-4 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] active:bg-white/[0.16] border border-white/15 text-text-main font-bold text-sm flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md hover:border-primary/40 disabled:opacity-50"
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
