'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { useAuthStore } from '@/stores/useAuthStore';
import { showToast } from '@/components/ui/Toast';
import InlineError from '@/components/ui/InlineError';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const { changePassword, user } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formShaking, setFormShaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isDirty = Boolean(currentPassword || newPassword || confirmPassword);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setFormShaking(false);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateField = (name: keyof FieldErrors, customVal?: string) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (name === 'currentPassword') {
        const val = customVal !== undefined ? customVal : currentPassword;
        if (!val) {
          next.currentPassword = 'Current password is required.';
        } else {
          delete next.currentPassword;
        }
      } else if (name === 'newPassword') {
        const val = customVal !== undefined ? customVal : newPassword;
        if (!val) {
          next.newPassword = 'New password is required.';
        } else if (val.length < 6) {
          next.newPassword = 'Must be at least 6 characters.';
        } else if (currentPassword && val === currentPassword) {
          next.newPassword = 'Cannot be same as current.';
        } else {
          delete next.newPassword;
        }
      } else if (name === 'confirmPassword') {
        const val = customVal !== undefined ? customVal : confirmPassword;
        if (!val) {
          next.confirmPassword = 'Confirmation is required.';
        } else if (newPassword && val !== newPassword) {
          next.confirmPassword = 'Passwords do not match.';
        } else {
          delete next.confirmPassword;
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const errors: FieldErrors = {};
    if (!currentPassword) {
      errors.currentPassword = 'Current password is required.';
    }
    if (!newPassword) {
      errors.newPassword = 'New password is required.';
    } else if (newPassword.length < 6) {
      errors.newPassword = 'Must be at least 6 characters.';
    } else if (currentPassword && newPassword === currentPassword) {
      errors.newPassword = 'Cannot be same as current.';
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Confirmation is required.';
    } else if (newPassword && confirmPassword !== newPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormShaking(true);
      setTimeout(() => setFormShaking(false), 450);
      showToast({
        title: 'Review Password Form',
        message: 'Please resolve the highlighted fields before submitting.',
        type: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changePassword(currentPassword, newPassword, confirmPassword);
      if (res.success) {
        setSuccessMessage(res.message || 'Password updated successfully.');
        showToast({
          title: 'Password Changed',
          message: 'Your password has been successfully updated.',
          type: 'success',
        });
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

  const getInputCls = (hasError?: boolean) => `
    w-full bg-bg-dark/80 border px-3.5 py-2.5 rounded-xl text-text-main text-sm outline-none transition-all placeholder:text-text-dim/60
    ${hasError 
      ? 'border-rose-500/70 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25 bg-rose-500/[0.04]' 
      : 'border-border-glass focus:border-primary focus:ring-1 focus:ring-primary/30'
    }
  `;

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
          <form noValidate onSubmit={handleSubmit} className={`flex flex-col gap-3.5 ${formShaking ? 'animate-shake' : ''}`} suppressHydrationWarning>
            {/* Current Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between ml-0.5 min-w-0 gap-2">
                <label className="text-xs font-medium text-text-dim whitespace-nowrap shrink-0">Current Password *</label>
                <div className="shrink min-w-0 justify-end">
                  {fieldErrors.currentPassword && (
                    <InlineError variant="label" message={fieldErrors.currentPassword} />
                  )}
                </div>
              </div>
              <input
                type={showPasswords ? 'text' : 'password'}
                placeholder="Enter current password"
                value={currentPassword}
                onBlur={() => validateField('currentPassword')}
                onChange={(e) => {
                  const val = e.target.value;
                  setCurrentPassword(val);
                  if (fieldErrors.currentPassword) validateField('currentPassword', val);
                  if (errorMessage) setErrorMessage('');
                }}
                className={getInputCls(Boolean(fieldErrors.currentPassword))}
                autoComplete="current-password"
                suppressHydrationWarning
              />
            </div>

            {/* New Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between ml-0.5 min-w-0 gap-2">
                <label className="text-xs font-medium text-text-dim whitespace-nowrap shrink-0">New Password *</label>
                <div className="shrink min-w-0 justify-end">
                  {fieldErrors.newPassword && (
                    <InlineError variant="label" message={fieldErrors.newPassword} />
                  )}
                </div>
              </div>
              <input
                type={showPasswords ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={newPassword}
                onBlur={() => validateField('newPassword')}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewPassword(val);
                  if (fieldErrors.newPassword) validateField('newPassword', val);
                  if (errorMessage) setErrorMessage('');
                }}
                className={getInputCls(Boolean(fieldErrors.newPassword))}
                autoComplete="new-password"
                suppressHydrationWarning
              />
            </div>

            {/* Confirm New Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between ml-0.5 min-w-0 gap-2">
                <label className="text-xs font-medium text-text-dim whitespace-nowrap shrink-0">Confirm New Password *</label>
                <div className="shrink min-w-0 justify-end">
                  {fieldErrors.confirmPassword && (
                    <InlineError variant="label" message={fieldErrors.confirmPassword} />
                  )}
                </div>
              </div>
              <input
                type={showPasswords ? 'text' : 'password'}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onBlur={() => validateField('confirmPassword')}
                onChange={(e) => {
                  const val = e.target.value;
                  setConfirmPassword(val);
                  if (fieldErrors.confirmPassword) validateField('confirmPassword', val);
                  if (errorMessage) setErrorMessage('');
                }}
                className={getInputCls(Boolean(fieldErrors.confirmPassword))}
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
            <InlineError variant="banner" message={errorMessage} />

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
