'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const { changePassword, user } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isDirty = Boolean(currentPassword || newPassword || confirmPassword);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!currentPassword) {
      setErrorMessage('Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setErrorMessage('New password cannot be the same as your current password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changePassword(currentPassword, newPassword, confirmPassword);
      if (res.success) {
        setSuccessMessage(res.message || 'Password updated successfully.');
        showToast('Password changed successfully', 'success');
        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        setErrorMessage(res.message || 'Failed to update password.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Current password is incorrect or could not be verified.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls =
    'w-full bg-bg-dark/80 border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-text-dim/60';

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-[440px]"
      isDirty={isDirty && !successMessage}
      onDiscard={handleClose}
    >
      <div className="flex flex-col gap-5 p-2">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-glass/40 pb-4">
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-border-glass flex items-center justify-center text-text-main shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-text-main m-0 leading-tight">Change Password</h3>
            <p className="text-xs text-text-dim m-0 mt-0.5">
              Update password for <span className="text-text-main font-medium">{user?.email || user?.username}</span>
            </p>
          </div>
        </div>

        {/* Success State */}
        {successMessage ? (
          <div className="flex flex-col items-center justify-center gap-2.5 py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-emerald-400 m-0">{successMessage}</p>
            <p className="text-xs text-text-dim m-0">Closing dialog...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" suppressHydrationWarning>
            {/* Current Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-dim">Current Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputCls}
                autoComplete="current-password"
                suppressHydrationWarning
              />
            </div>

            {/* New Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-dim">New Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={6}
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputCls}
                autoComplete="new-password"
                suppressHydrationWarning
              />
            </div>

            {/* Confirm New Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-dim">Confirm New Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={6}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputCls}
                autoComplete="new-password"
                suppressHydrationWarning
              />
            </div>

            {/* Show Password Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-text-dim pt-0.5">
              <input
                type="checkbox"
                checked={showPasswords}
                onChange={(e) => setShowPasswords(e.target.checked)}
                className="accent-primary w-3.5 h-3.5 rounded"
              />
              <span>Show passwords</span>
            </label>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                {errorMessage}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-glass/40">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-text-dim hover:text-text-main hover:bg-white/5 border border-transparent transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 border border-primary/40 shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </GlassModal>
  );
}
