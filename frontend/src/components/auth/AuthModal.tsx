'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { useUIStore } from '@/stores/useUIStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';
import { auth, googleProvider } from '@/lib/firebase';
import { signInWithRedirect } from 'firebase/auth';

export default function AuthModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authParam = searchParams.get('auth'); // 'login' or 'register'
  
  const { isAuthOpen, authMode, setAuthOpen, googleSetupData, setGoogleSetupData } = useUIStore();
  const mode = authMode;
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const isSubmitting = isFormSubmitting || isGoogleSubmitting;

  // Alternate views: normal login/register, forgot-password, or first-time Google password setup
  const [view, setView] = useState<'main' | 'forgot' | 'googleSetup'>('main');
  const [forgotSent, setForgotSent] = useState(false);
  const [googleSetup, setGoogleSetup] = useState<{ token: string; email: string; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { login, register, loginWithGoogle, completeGoogleSignup, forgotPassword, isAuthenticated } = useAuthStore();

  // Listen to deep links (?auth=login or ?auth=register)
  useEffect(() => {
    if (authParam === 'login' || authParam === 'register') {
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
    }
  }, [googleSetupData]);

  // Reset submitting state and views whenever modal visibility changes
  useEffect(() => {
    if (!isAuthOpen) {
      setIsFormSubmitting(false);
      setIsGoogleSubmitting(false);
      setView('main');
    }
  }, [isAuthOpen]);

  const handleClose = () => {
    setIsFormSubmitting(false);
    setIsGoogleSubmitting(false);
    setAuthOpen(false);
    setView('main');
    setForgotSent(false);
    setGoogleSetup(null);
    setGoogleSetupData(null);
    setNewPassword('');
    setConfirmPassword('');
    if (authParam) {
      router.replace('/');
    }
  };

  // Handle 1-Click Google Sign-In & Sign-Up via Full-Page Redirect (whole screen)
  const handleGoogleSignIn = async () => {
    if (isSubmitting) return;
    setIsGoogleSubmitting(true);

    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err: any) {
      setIsGoogleSubmitting(false);
      console.error('Google Sign-In Redirect Error:', err);
      if (err.code === 'auth/unauthorized-domain') {
        showToast('Domain is not authorized in Firebase Console.', 'error');
      } else {
        showToast(err.message || 'Failed to redirect to Google.', 'error');
      }
    }
  };

  // Handle Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }

    setIsFormSubmitting(true);
    try {
      const res = await register(
        username.trim(),
        email.trim().toLowerCase(),
        password,
        phoneNumber.trim() || undefined
      );

      if (res.success) {
        showToast(`Account created! Welcome, ${res.user?.username || 'Customer'}!`, 'success');
        handleClose();
        router.refresh();
      } else {
        showToast(res.message || 'Registration failed.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Registration error occurred.', 'error');
    } finally {
      setIsFormSubmitting(false);
    }
  };

  // Smart Unified Login: Single clean toast, automatic role-based routing
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      showToast('Please enter your username/email and password.', 'error');
      return;
    }

    setIsFormSubmitting(true);
    try {
      const res = await login(email.trim(), password, rememberMe);
      
      if (res.success) {
        showToast(`Welcome back, ${res.user?.username || 'User'}!`, 'success');
        handleClose();

        // Smart Role-Based Routing
        if (res.user?.role === 'admin') {
          router.replace('/admin');
        } else if (res.user?.role === 'employee') {
          router.replace('/employee');
        } else {
          router.replace('/');
          router.refresh();
        }
      } else {
        showToast(res.message || 'Invalid username or password.', 'error');
      }
    } catch {
      showToast('An unexpected error occurred during sign-in.', 'error');
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    setForgotSent(false);
    setView('forgot');
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target || !target.includes('@')) {
      showToast('Please enter the email address of your account.', 'error');
      return;
    }
    setIsFormSubmitting(true);
    try {
      await forgotPassword(target.toLowerCase());
      setForgotSent(true);
    } catch (err: any) {
      showToast(err.message || 'Could not send reset email.', 'error');
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleGoogleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleSetup) return;
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    setIsFormSubmitting(true);
    try {
      const res = await completeGoogleSignup(googleSetup.token, newPassword, googleSetup.username);
      if (res.success) {
        showToast(`Welcome, ${res.user?.username || 'Customer'}! You can now also sign in with your password.`, 'success');
        handleClose();
        router.replace('/');
        router.refresh();
      } else {
        showToast(res.message || 'Could not finish sign-up.', 'error');
      }
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-bg-surface border border-border-glass px-4 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-dim/40';

  if (view === 'forgot') {
    return (
      <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth="max-w-[440px]">
        <div className="flex flex-col gap-5 font-sans text-left pt-1 pb-1">
          <div className="text-center">
            <h2 className="text-2xl font-black text-text-main m-0 tracking-tight">Reset Password</h2>
            <p className="text-text-dim text-xs mt-1.5 m-0 leading-relaxed">
              {forgotSent
                ? 'Check your inbox. If an account exists for that email, a reset link is on its way (valid for 1 hour).'
                : "Enter your account email and we'll send you a link to set a new password."}
            </p>
          </div>
          {!forgotSent && (
            <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[0.75rem] font-bold text-text-dim ml-1">Email Address *</label>
                <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </div>
              <GlassButton type="submit" variant="primary" fullWidth size="lg" className="mt-1 font-bold text-sm" disabled={isSubmitting}>
                {isFormSubmitting ? 'Sending...' : 'Send Reset Link'}
              </GlassButton>
            </form>
          )}
          <button type="button" onClick={() => setView('main')} className="bg-transparent border-none text-primary font-bold hover:underline cursor-pointer p-0 text-xs">
            ← Back to Sign In
          </button>
        </div>
      </GlassModal>
    );
  }

  if (view === 'googleSetup' && googleSetup) {
    return (
      <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth="max-w-[440px]">
        <div className="flex flex-col gap-5 font-sans text-left pt-1 pb-1">
          <div className="text-center">
            <h2 className="text-2xl font-black text-text-main m-0 tracking-tight">Create a Password</h2>
            <p className="text-text-dim text-xs mt-1.5 m-0 leading-relaxed">
              Welcome! Set a password for <strong className="text-text-main">{googleSetup.email}</strong> so you can sign in with Google or with your email and password.
            </p>
          </div>
          <form onSubmit={handleGoogleSetupSubmit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-bold text-text-dim ml-1">Username</label>
              <input type="text" value={googleSetup.username} onChange={(e) => setGoogleSetup({ ...googleSetup, username: e.target.value })} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-bold text-text-dim ml-1">Password *</label>
              <input type={showPassword ? 'text' : 'password'} required minLength={6} placeholder="At least 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-bold text-text-dim ml-1">Confirm Password *</label>
              <input type={showPassword ? 'text' : 'password'} required minLength={6} placeholder="Re-enter password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer ml-1 select-none text-xs text-text-dim">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="accent-primary rounded cursor-pointer w-4 h-4" />
              <span>Show password</span>
            </label>
            <GlassButton type="submit" variant="primary" fullWidth size="lg" className="mt-1 font-bold text-sm" disabled={isSubmitting}>
              {isFormSubmitting ? 'Creating Account...' : 'Create Account'}
            </GlassButton>
          </form>
          <button type="button" onClick={handleClose} className="bg-transparent border-none text-text-dim hover:underline cursor-pointer p-0 text-xs">
            Cancel
          </button>
        </div>
      </GlassModal>
    );
  }

  return (
    <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth="max-w-[440px]">
      <div className="flex flex-col gap-5 font-sans text-left pt-1 pb-1">
        
        {/* Header & Subtitle */}
        <div className="text-center">
          <h2 className="text-2xl font-black text-text-main m-0 tracking-tight">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-text-dim text-xs mt-1.5 m-0 leading-relaxed">
            {mode === 'login' 
              ? 'Sign in to access your orders, designs & custom projects' 
              : 'Join Stitch-Opt for custom embroidery orders & tracking'}
          </p>
        </div>

        {/* Credentials Form */}
        <form onSubmit={mode === 'login' ? handleLoginSubmit : handleRegisterSubmit} className="flex flex-col gap-3.5">
          {mode === 'register' && (
            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-bold text-text-dim ml-1">Username *</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. johndoe"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-4 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-dim/40"
              />
            </div>
          )}
          
          <div className="flex flex-col gap-1">
            <label className="text-[0.75rem] font-bold text-text-dim ml-1">
              {mode === 'login' ? 'Email or Username *' : 'Email Address *'}
            </label>
            <input 
              type={mode === 'login' ? 'text' : 'email'} 
              required 
              placeholder={mode === 'login' ? 'e.g. johndoe or user@email.com' : 'you@example.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bg-surface border border-border-glass px-4 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-dim/40"
            />
          </div>

          {mode === 'register' && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[0.75rem] font-bold text-text-dim">Mobile Number</label>
                <span className="text-[0.65rem] text-primary/80 font-medium">Optional (For SMS updates)</span>
              </div>
              <input 
                type="tel" 
                maxLength={13}
                placeholder="0917 123 4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d+]/g, ''))}
                className="w-full bg-bg-surface border border-border-glass px-4 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-dim/40"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center ml-1">
              <label className="text-[0.75rem] font-bold text-text-dim">Password *</label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="bg-transparent border-none text-[0.7rem] text-primary hover:underline cursor-pointer p-0 font-medium"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-4 py-2.5 pr-11 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-dim/40"
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
          className="w-full py-2.5 px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] active:bg-white/[0.16] border border-white/15 text-text-main font-bold text-sm flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md hover:border-primary/40 disabled:opacity-50"
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
  );
}
