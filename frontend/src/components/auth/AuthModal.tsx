'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { useUIStore } from '@/stores/useUIStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';

export default function AuthModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authParam = searchParams.get('auth'); // 'login' or 'register'
  
  // Subscribe to Zustand UI Store for instant rendering
  const { isAuthOpen, authMode, setAuthOpen } = useUIStore();
  const mode = authMode; // elegant map to preserve JSX references
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, register, isAuthenticated } = useAuthStore();

  // Listen to deep links (e.g. visiting /?auth=login directly from bookmarks)
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
    if (authParam) {
      router.replace('/'); // clear query param
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        const res = await login(email, password, rememberMe);
        if (res.success) {
          showToast('Logged in successfully!', 'success');
          handleClose();
        } else {
          showToast(res.message || 'Login failed', 'error');
        }
      } else {
        const res = await register(username, email, password, phoneNumber, address);
        
        if (res.success) {
          showToast('Registration successful!', 'success');
          handleClose();
        } else {
          showToast(res.message || 'Registration failed', 'error');
        }
      }
    } catch (err) {
      showToast('An unexpected error occurred', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth={mode === 'register' ? 'max-w-[550px]' : 'max-w-[400px]'}>
      <div className="modal-stack">
        <div className="text-center mb-2">
          <h2 className="modal-title-sm">
            {mode === 'login' ? 'Secure Access' : 'Join Stitch-Opt'}
          </h2>
          <p className="text-text-dim mt-1 text-xs">
            {mode === 'login' 
              ? 'Enter your details to access your account.' 
              : 'Sign up to purchase premium designs.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
              <div className="flex flex-col gap-1">
                <label className="modal-label ml-1">Username</label>
                <input 
                  type="text" 
                  required 
                  placeholder="johndoe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-xl text-text-main text-sm outline-none focus:border-primary transition-all"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="modal-label ml-1">Phone</label>
                <input 
                  type="tel" 
                  required 
                  placeholder="+63..."
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-xl text-text-main text-sm outline-none focus:border-primary transition-all"
                />
              </div>
            </div>
          )}
          
          <div className="flex flex-col gap-1">
            <label className="modal-label ml-1">
              {mode === 'login' ? 'Username / Email' : 'Email Address'}
            </label>
            <input 
              type={mode === 'login' ? 'text' : 'email'} 
              required 
              placeholder={mode === 'login' ? 'e.g. johndoe' : 'you@example.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-xl text-text-main text-sm outline-none focus:border-primary transition-all"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="modal-label ml-1">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                minLength={8}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-3 py-2 pr-10 rounded-xl text-text-main text-sm outline-none focus:border-primary transition-all"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-dim hover:text-text-main cursor-pointer p-1"
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
              <label className="modal-label ml-1">Full Address</label>
              <textarea 
                required 
                placeholder="123 Street, City, ZIP"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-xl text-text-main text-sm outline-none focus:border-primary transition-all min-h-[60px] resize-none"
              />
            </div>
          )}

          {mode === 'login' && (
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="login-remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 cursor-pointer accent-primary" 
              />
              <label htmlFor="login-remember" className="text-[0.8rem] text-text-dim cursor-pointer m-0">Stay logged in</label>
            </div>
          )}

          <GlassButton 
            type="submit" 
            variant="primary" 
            fullWidth 
            className="mt-2 py-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : (mode === 'login' ? 'Establish Link' : 'Secure Registration')}
          </GlassButton>
        </form>

        <div className="text-center">
          <span className="text-text-dim text-[0.8rem]">
            {mode === 'login' ? "No account? " : "Already have an account? "}
          </span>
          <button 
            onClick={() => setAuthOpen(true, mode === 'login' ? 'register' : 'login')}
            className="bg-transparent border-none text-primary font-bold text-[0.8rem] hover:text-white cursor-pointer transition-colors"
          >
            {mode === 'login' ? "Create one here" : "Sign In"}
          </button>
        </div>

        {mode === 'login' && (
          <div className="pt-4 border-t border-border-glass flex justify-around text-[0.75rem]">
            <span className="text-text-dim font-bold">Staff:</span>
            <Link href="/admin" className="text-primary no-underline hover:text-white transition-colors">Admin</Link>
            <Link href="/employee" className="text-primary no-underline hover:text-white transition-colors">Employee</Link>
          </div>
        )}
      </div>
    </GlassModal>
  );
}
