'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { useUIStore } from '@/stores/useUIStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';
import AddressSelect from '@/components/ui/AddressSelect';
import { auth, googleProvider } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, signInWithPopup, signInWithRedirect, getRedirectResult, type ConfirmationResult } from 'firebase/auth';

export default function AuthModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authParam = searchParams.get('auth'); // 'login' or 'register'
  
  const { isAuthOpen, authMode, setAuthOpen } = useUIStore();
  const mode = authMode;
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'customer' | 'employee' | 'admin'>('customer');

  // Registration Upfront Phone Verification (Approach B)
  const [regStep, setRegStep] = useState<'form' | 'otp'>('form');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [formattedPhone, setFormattedPhone] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isResending, setIsResending] = useState(false);

  const { login, register, sendPhoneOtp, resendPhoneOtp, registerWithOtp, loginWithGoogle, isAuthenticated } = useAuthStore();

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    try {
      // In production or mobile browsers, signInWithPopup is often blocked by cross-origin privacy / third-party cookie restrictions.
      // We attempt signInWithPopup, but fall back seamlessly to signInWithRedirect if blocked or closed.
      const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      
      if (!isLocalhost) {
        // Direct redirect on deployed production domain avoids popup cross-site cookie blocking
        await signInWithRedirect(auth, googleProvider);
        return;
      }

      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (!user.email) {
        showToast('No email associated with this Google account.', 'error');
        return;
      }

      const res = await loginWithGoogle({
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        uid: user.uid
      });

      if (res.success) {
        showToast('Signed in with Google successfully!', 'success');
        handleClose();
        window.location.href = '/';
      } else {
        showToast(res.message || 'Google sign-in failed on server.', 'error');
      }
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        // If popup was blocked or closed unexpectedly, initiate redirect instead
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr: any) {
          showToast(redirectErr.message || 'Failed to start Google sign-in.', 'error');
        }
      } else if (err.code === 'auth/unauthorized-domain') {
        showToast('Domain is not authorized in Firebase Console.', 'error');
      } else {
        showToast(err.message || 'Failed to sign in with Google.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };



  const getRecaptchaVerifier = () => {
    if (typeof window === 'undefined') return null;
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {}
      });
    }
    return (window as any).recaptchaVerifier;
  };

  // Reset regStep when modal opens/closes or switches mode
  useEffect(() => {
    if (!isAuthOpen) {
      setRegStep('form');
      setOtpDigits(['', '', '', '', '', '']);
      setConfirmationResult(null);
    }
  }, [isAuthOpen, authMode]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Sync from URL role param on open
  useEffect(() => {
    if (isAuthOpen) {
      const roleParam = searchParams.get('role');
      if (roleParam === 'admin' || roleParam === 'employee' || roleParam === 'customer') {
        setSelectedRole(roleParam);
      }
    }
  }, [isAuthOpen, searchParams]);

  // Force customer role in registration view
  useEffect(() => {
    if (authMode === 'register') {
      setSelectedRole('customer');
    }
  }, [authMode]);

  // Listen to deep links
  useEffect(() => {
    if (authParam === 'login' || authParam === 'register') {
      if (isAuthenticated) {
        handleClose();
      } else {
        setAuthOpen(true, authParam);
      }
    }
  }, [authParam, isAuthenticated, setAuthOpen]);

  const handleClose = () => {
    setAuthOpen(false);
    setRegStep('form');
    if (authParam) {
      router.replace('/');
    }
  };

  // Step 1 -> Step 2: Send Real SMS via Firebase
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      showToast('Please enter a valid 11-digit Philippine mobile number (e.g. 09171234567)', 'error');
      return;
    }

    let e164 = digitsOnly;
    if (digitsOnly.startsWith('09') && digitsOnly.length === 11) {
      e164 = `+63${digitsOnly.substring(1)}`;
    } else if (digitsOnly.startsWith('639') && digitsOnly.length === 12) {
      e164 = `+${digitsOnly}`;
    } else if (digitsOnly.startsWith('9') && digitsOnly.length === 10) {
      e164 = `+63${digitsOnly}`;
    } else if (!e164.startsWith('+')) {
      e164 = `+${e164}`;
    }

    setIsSubmitting(true);
    try {
      // Direct backend API fallback / simulation trigger if Firebase client recaptcha fails
      let confirmation: ConfirmationResult | null = null;
      try {
        const verifier = getRecaptchaVerifier();
        if (verifier) {
          confirmation = await signInWithPhoneNumber(auth, e164, verifier);
        }
      } catch (fbErr: any) {
        console.warn('Firebase Client SMS unavailable, falling back to backend SMS engine:', fbErr);
      }

      if (confirmation) {
        setConfirmationResult(confirmation);
        setFormattedPhone(e164);
        setCooldown(60);
        setRegStep('otp');
        showToast(`Real SMS verification code sent to ${e164}! Check your mobile phone.`, 'success');
      } else {
        // Fallback to backend SMS engine (Semaphore/Simulation)
        const otpRes = await sendPhoneOtp(username, email, e164);
        if (otpRes.success) {
          setFormattedPhone(e164);
          setCooldown(otpRes.cooldownSeconds || 60);
          setRegStep('otp');
          showToast(`Verification code sent to ${e164}! Check your mobile phone.`, 'success');
        } else {
          showToast(otpRes.message || 'Failed to dispatch verification code.', 'error');
        }
      }
    } catch (err: any) {
      console.error('SMS Dispatch Error:', err);
      if ((window as any).recaptchaVerifier) {
        try { (window as any).recaptchaVerifier.clear(); } catch {}
        (window as any).recaptchaVerifier = null;
      }
      showToast(err.message || 'Failed to send SMS code.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Resend Real SMS OTP
  const handleResendOtp = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      const verifier = getRecaptchaVerifier();
      if (!verifier) throw new Error('reCAPTCHA failed to initialize.');
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone || phoneNumber, verifier);
      setConfirmationResult(confirmation);
      setCooldown(60);
      showToast('A new SMS verification code has been dispatched to your phone!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to resend SMS code.', 'error');
    } finally {
      setIsResending(false);
    }
  };

  // Step 2: Submit OTP & Register
  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = otpDigits.join('').trim();
    if (fullCode.length !== 6) {
      showToast('Please enter the complete 6-digit verification code.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (confirmationResult) {
        await confirmationResult.confirm(fullCode);
      }

      const res = await registerWithOtp({
        username,
        email,
        password,
        phoneNumber: formattedPhone || phoneNumber,
        address,
        code: fullCode,
        firebaseVerified: !!confirmationResult
      });

      if (res.success) {
        showToast('Mobile number verified! Account created successfully!', 'success');
        handleClose();
        window.location.reload();
      } else {
        showToast(res.message || 'Verification failed. Please check the code.', 'error');
      }
    } catch (err: any) {
      console.error('OTP Verification Error:', err);
      showToast(err.message?.includes('invalid-verification-code') 
        ? 'Incorrect verification code. Please check the SMS sent to your phone.' 
        : err.message || 'Verification failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await login(email, password, rememberMe, selectedRole);
      if (res.success) {
        showToast('Signed in successfully!', 'success');
        handleClose();
        if (selectedRole === 'admin') {
          window.location.href = '/admin';
        } else if (selectedRole === 'employee') {
          window.location.href = '/employee';
        } else {
          window.location.reload();
        }
      } else {
        showToast(res.message || 'Authentication failed', 'error');
      }
    } catch (err) {
      showToast('An unexpected error occurred', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth={mode === 'register' ? 'max-w-[580px]' : 'max-w-[420px]'}>
      <div className="flex flex-col gap-4 font-sans text-left">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-xl font-extrabold text-text-main m-0 tracking-tight">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-text-dim text-xs mt-1 m-0">
            {mode === 'login' 
              ? 'Select your access level and sign in to continue' 
              : 'Join Stitch-Opt to browse & order custom designs'}
          </p>
        </div>

        {/* Role Segmented Switcher (Login mode only) */}
        {mode === 'login' && (
          <div className="bg-bg-surface border border-border-glass rounded-2xl p-1 flex gap-1 shadow-inner">
            {(['customer', 'employee', 'admin'] as const).map((role) => (
              <button
                key={role}
                type="button"
                suppressHydrationWarning
                onClick={() => setSelectedRole(role)}
                className={`
                  flex-1 py-2 rounded-xl text-xs font-bold transition-all border-none cursor-pointer text-center capitalize
                  ${selectedRole === role
                    ? 'bg-primary text-white shadow-[0_4px_14px_rgba(99,102,241,0.4)] font-bold scale-[1.02]'
                    : 'bg-transparent text-text-dim hover:text-text-main hover:bg-white/5'
                  }
                `}
              >
                {role === 'employee' ? 'Staff' : role}
              </button>
            ))}
          </div>
        )}

        {/* Step 2 of Registration: 6-Digit Phone OTP Verification */}
        {mode === 'register' && regStep === 'otp' ? (
          <form onSubmit={handleVerifyAndRegister} className="flex flex-col gap-4 text-center animate-[fadeIn_0.2s_ease-out]">
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary mb-1 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
              </div>
              <h3 className="text-lg font-black text-text-main m-0">Verify Mobile Number</h3>
              <p className="text-xs text-text-dim max-w-xs m-0">
                We sent a 6-digit code to <span className="font-mono font-bold text-primary">{formattedPhone || phoneNumber}</span>
              </p>
            </div>

            {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
            <div id="recaptcha-container"></div>

            {/* 6-Digit Cells */}
            <div className="flex justify-center gap-2 my-2">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-box-${idx}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    const newDigits = [...otpDigits];
                    newDigits[idx] = val ? val[val.length - 1] : '';
                    setOtpDigits(newDigits);
                    if (val && idx < 5) {
                      const nextEl = document.getElementById(`otp-box-${idx + 1}`);
                      nextEl?.focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
                      const prevEl = document.getElementById(`otp-box-${idx - 1}`);
                      prevEl?.focus();
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                    if (pasted) {
                      const newDigits = [...otpDigits];
                      for (let i = 0; i < pasted.length; i++) {
                        newDigits[i] = pasted[i];
                      }
                      setOtpDigits(newDigits);
                      const targetIdx = Math.min(pasted.length, 5);
                      document.getElementById(`otp-box-${targetIdx}`)?.focus();
                    }
                  }}
                  className="w-11 h-14 text-center text-xl font-mono font-black text-text-main bg-bg-surface border border-border-glass rounded-xl outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.3)] transition-all"
                />
              ))}
            </div>

            {/* Resend & Back actions */}
            <div className="flex items-center justify-between text-xs px-1">
              <button
                type="button"
                onClick={() => setRegStep('form')}
                className="bg-transparent border-none text-text-dim hover:text-text-main cursor-pointer p-0 underline text-xs"
              >
                ← Edit phone number
              </button>

              {cooldown > 0 ? (
                <span className="text-text-dim font-medium text-xs">
                  Resend code in <b className="font-mono text-primary">{cooldown}s</b>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isResending}
                  className="bg-transparent border-none text-primary font-bold cursor-pointer p-0 hover:underline disabled:opacity-50 text-xs"
                >
                  {isResending ? 'Resending...' : 'Resend SMS Code'}
                </button>
              )}
            </div>

            <GlassButton
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              className="mt-1 font-bold text-sm tracking-wide shadow-[0_4px_16px_rgba(99,102,241,0.35)]"
              disabled={isSubmitting || otpDigits.join('').trim().length !== 6}
            >
              {isSubmitting ? 'Verifying OTP...' : 'Verify & Create Account'}
            </GlassButton>
          </form>
        ) : (
          /* Step 1: Login or Registration Form */
          <form onSubmit={mode === 'login' ? handleLoginSubmit : handleRequestOtp} className="flex flex-col gap-3.5">
            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
                <div className="flex flex-col gap-1">
                  <label className="text-[0.75rem] font-bold text-text-dim ml-1">Username *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. johndoe"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-[0.75rem] font-bold text-text-dim">Phone Number *</label>
                    <span className="text-[0.65rem] text-primary font-semibold">(PH Format)</span>
                  </div>
                  <input 
                    type="tel" 
                    required
                    maxLength={13}
                    placeholder="0917 123 4567"
                    value={phoneNumber}
                    onChange={(e) => {
                      // Numbers only (allow + at start for international +63 format)
                      const raw = e.target.value;
                      const clean = raw.replace(/[^\d+]/g, '');
                      setPhoneNumber(clean);
                    }}
                    className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all"
                  />
                </div>
              </div>
            )}
            
            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-bold text-text-dim ml-1">
                {mode === 'login' 
                  ? selectedRole === 'employee' 
                    ? 'Staff Username / Email' 
                    : selectedRole === 'admin' 
                      ? 'Admin ID / Email' 
                      : 'Username / Email'
                  : 'Email Address *'}
              </label>
              <input 
                type={mode === 'login' ? 'text' : 'email'} 
                required 
                placeholder={
                  mode === 'login' 
                    ? selectedRole === 'employee' 
                      ? 'e.g. EMP-001 or email' 
                      : selectedRole === 'admin' 
                        ? 'e.g. admin or email' 
                        : 'e.g. johndoe'
                    : 'you@example.com'
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-bold text-text-dim ml-1">Password *</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required 
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 pr-10 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all"
                />
                <button 
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-dim hover:text-text-main cursor-pointer p-1 transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                      <line x1="3" y1="3" x2="21" y2="21"></line>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[0.75rem] font-bold text-text-dim">Delivery Address</label>
                  <span className="text-[0.65rem] text-primary">Optional</span>
                </div>
                <AddressSelect
                  value={address}
                  onChange={(fullAddress) => setAddress(fullAddress)}
                />
              </div>
            )}

            {mode === 'login' && (
              <div className="flex items-center justify-between px-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-text-dim hover:text-text-main transition-colors">
                  <input 
                    type="checkbox" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 cursor-pointer accent-primary rounded" 
                  />
                  <span>Remember me on this device</span>
                </label>
              </div>
            )}

            <GlassButton 
              type="submit" 
              variant="primary" 
              fullWidth 
              size="lg"
              className="mt-1 font-bold text-sm tracking-wide shadow-[0_4px_16px_rgba(99,102,241,0.35)]"
              disabled={isSubmitting}
            >
              {isSubmitting 
                ? 'Processing...' 
                : (mode === 'login' 
                    ? `Sign In as ${selectedRole === 'customer' ? 'Customer' : selectedRole === 'employee' ? 'Staff' : 'Admin'}` 
                    : 'Continue to Phone Verification →')}
            </GlassButton>

            {/* Google OAuth Button for Customers */}
            {selectedRole === 'customer' && (
              <>
                <div className="flex items-center gap-3 my-1">
                  <div className="h-px bg-border-glass flex-1" />
                  <span className="text-[0.7rem] text-text-dim uppercase tracking-wider font-semibold">Or continue with</span>
                  <div className="h-px bg-border-glass flex-1" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-bold flex items-center justify-center gap-2.5 cursor-pointer transition-all disabled:opacity-50 shadow-md hover:scale-[1.01]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </>
            )}
          </form>
        )}

        {/* Toggle between Login and Register */}
        <div className="text-center pt-2 border-t border-border-glass flex items-center justify-center gap-1.5">
          <span className="text-text-dim text-xs">
            {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
          </span>
          <button 
            type="button"
            suppressHydrationWarning
            onClick={() => {
              setRegStep('form');
              setAuthOpen(true, mode === 'login' ? 'register' : 'login');
            }}
            className="bg-transparent border-none text-primary font-bold text-xs hover:text-white cursor-pointer transition-colors underline"
          >
            {mode === 'login' ? "Register Now" : "Sign In"}
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
