'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';
import GlassButton from '@/components/ui/GlassButton';

interface StaffAuthModalProps {
  role: 'employee' | 'admin';
}

export default function StaffAuthModal({ role }: StaffAuthModalProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await login(email, password, false, role);
      if (res.success && res.user?.role === role) {
        showToast(`Authenticated as ${role}`, 'success');
        // Refresh to apply role state
        window.location.reload();
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
    <div className="fixed inset-0 z-[9999] bg-bg-dark flex justify-center items-center p-4">
      <div className="bg-bg-card backdrop-blur-[20px] border border-border-glass p-10 rounded-[20px] w-full max-w-[420px] text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-[modalScaleUp_0.3s_ease-out]">
        <div className="flex justify-center mb-6">
          <div className="bg-gradient-to-br from-primary to-secondary w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg">
            {role === 'employee' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-2 text-text-main">
          {role === 'employee' ? 'Staff Terminal' : 'Admin Control'}
        </h2>
        <p className="text-text-dim mb-8 text-[0.95rem]">
          {role === 'employee' ? 'Employee identification required' : 'Restricted Administrative Access'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-[0.85rem] text-text-dim font-medium ml-1">Staff ID / Email</label>
            <input
              type="text"
              required
              placeholder={role === 'employee' ? 'e.g. EMP-001' : 'Admin ID'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/20 border border-border-glass px-4 py-2.5 rounded-xl text-text-main outline-none focus:border-primary transition-all"
            />
          </div>

          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-[0.85rem] text-text-dim font-medium ml-1">Passcode</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/20 border border-border-glass px-4 py-2.5 pr-12 rounded-xl text-text-main outline-none focus:border-primary transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-dim hover:text-text-main cursor-pointer p-1"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                    <line x1="3" y1="3" x2="21" y2="21"></line>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <GlassButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            className="mt-4"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Authenticating...' : 'Authenticate'}
          </GlassButton>
        </form>
      </div>
    </div>
  );
}
