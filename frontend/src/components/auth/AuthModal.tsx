'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GlassModal from '@/components/ui/GlassModal';
import GlassButton from '@/components/ui/GlassButton';
import { useUIStore } from '@/stores/useUIStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';

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

  const { login, register, isAuthenticated } = useAuthStore();

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
    if (authParam) {
      router.replace('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
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
      } else {
        const res = await register(username, email, password, phoneNumber, address);
        
        if (res.success) {
          showToast('Account created successfully!', 'success');
          handleClose();
          window.location.reload();
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
    <GlassModal isOpen={isAuthOpen} onClose={handleClose} maxWidth={mode === 'register' ? 'max-w-[520px]' : 'max-w-[420px]'}>
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

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
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
                  <label className="text-[0.75rem] font-bold text-text-dim">Phone Number</label>
                  <span className="text-[0.65rem] text-text-dim/80">(PH Format)</span>
                </div>
                <input 
                  type="tel" 
                  placeholder="0917 123 4567"
                  value={phoneNumber}
                  onChange={(e) => {
                    const raw = e.target.value;
                    let formatted = raw;
                    if (raw.startsWith('09') && raw.length === 11) {
                      formatted = `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7)}`;
                    } else if (raw.startsWith('639') && raw.length === 12) {
                      formatted = `+${raw.slice(0, 2)} ${raw.slice(2, 5)} ${raw.slice(5, 8)} ${raw.slice(8)}`;
                    }
                    setPhoneNumber(formatted);
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
              <textarea 
                placeholder="Street address, City, Province, ZIP"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all min-h-[50px] resize-none"
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
              ? 'Authenticating...' 
              : (mode === 'login' ? `Sign In as ${selectedRole === 'customer' ? 'Customer' : selectedRole === 'employee' ? 'Staff' : 'Admin'}` : 'Create Account')}
          </GlassButton>
        </form>

        {/* Toggle between Login and Register */}
        <div className="text-center pt-2 border-t border-border-glass flex items-center justify-center gap-1.5">
          <span className="text-text-dim text-xs">
            {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
          </span>
          <button 
            type="button"
            suppressHydrationWarning
            onClick={() => setAuthOpen(true, mode === 'login' ? 'register' : 'login')}
            className="bg-transparent border-none text-primary font-bold text-xs hover:text-white cursor-pointer transition-colors underline"
          >
            {mode === 'login' ? "Register Now" : "Sign In"}
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
