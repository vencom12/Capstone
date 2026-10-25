'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeletons';
import { useAuthStore } from '@/stores/useAuthStore';
import Pagination from '@/components/ui/Pagination';
import InlineError from '@/components/ui/InlineError';
import { validateEmail } from '@/lib/emailValidator';

interface PanelStaffingProps {
  users: any[];
  machines?: any[];
  isSyncing: boolean;
  refreshData: () => Promise<void>;
  setUsers?: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function PanelStaffing({
  users,
  machines = [],
  isSyncing,
  refreshData,
  setUsers
}: PanelStaffingProps) {
  const { user: currentAdmin } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals state
  const [isOpen, setIsOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [disablingUser, setDisablingUser] = useState<any>(null);
  const [disableReason, setDisableReason] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [viewingProfileUser, setViewingProfileUser] = useState<any>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('employee');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; email?: string; password?: string; phone?: string }>({});
  const [touched, setTouched] = useState<{ username?: boolean; email?: boolean; password?: boolean; phone?: boolean }>({});
  const [shakeKey, setShakeKey] = useState(0);

  const validateField = (field: 'username' | 'email' | 'password' | 'phone', val: string, isEditing: boolean = !!editingStaff) => {
    let err = '';
    const clean = val.trim();
    if (field === 'username') {
      if (!clean) err = 'Username is required';
      else if (clean.length < 3) err = 'Must be at least 3 characters';
      else if (!/^[a-zA-Z0-9_]+$/.test(clean)) err = 'Only letters, numbers, and underscores allowed';
    } else if (field === 'email') {
      if (!clean) err = 'Email address is required';
      else {
        const res = validateEmail(clean);
        if (!res.isValid) err = res.error || 'Please enter a valid email address';
      }
    } else if (field === 'password') {
      if (!isEditing && !clean) err = 'Password is required';
      else if (clean && clean.length < 8) err = 'Password must be at least 8 characters';
    } else if (field === 'phone') {
      if (clean) {
        const digits = clean.replace(/\D/g, '');
        if (digits.length < 10) err = 'Please enter a valid phone number (at least 10 digits)';
      }
    }
    setFieldErrors((prev) => ({ ...prev, [field]: err }));
    return err;
  };

  const handleBlur = (field: 'username' | 'email' | 'password' | 'phone') => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = field === 'username' ? username : field === 'email' ? email : field === 'password' ? password : phone;
    validateField(field, val);
  };

  const [activeTab, setActiveTab] = useState<'staff' | 'customers'>('staff');

  // Security Helper Rules
  const isTargetAdmin = (u: any) => u?.role === 'admin';
  const isCurrentAdmin = (u: any) => Boolean(u && currentAdmin?.id && (u.id || u._id) === currentAdmin.id);
  const isCustomer = (u: any) => u?.role === 'customer';
  const isDeletedUser = (u: any) => Boolean(
    (u?.email && u.email.endsWith('@stitchopt.local') && u.email.startsWith('deleted_')) ||
    (u?.username && u.username.startsWith('Deleted User #')) ||
    (u?.disabledReason && u.disabledReason.toLowerCase().includes('deleted'))
  );

  // Counts for tabs (exclude anonymized deleted users from regular active staff/customer counts)
  const staffUsers = users.filter((u) => (u.role === 'admin' || u.role === 'employee') && !isDeletedUser(u));
  const customerUsers = users.filter((u) => u.role === 'customer' && !isDeletedUser(u));
  const deletedUsers = users.filter((u) => isDeletedUser(u));
  const onShiftCount = staffUsers.filter((u) => u.shiftStatus === 'clocked_in').length;
  const disabledCount = users.filter((u) => u.isActive === false && !isDeletedUser(u)).length;

  // Segmented counts for active / disabled / all
  const disabledStaffCount = staffUsers.filter((u) => u.isActive === false).length;
  const activeStaffCount = staffUsers.filter((u) => u.isActive !== false).length;

  const disabledCustomerCount = customerUsers.filter((u) => u.isActive === false).length;
  const activeCustomerCount = customerUsers.filter((u) => u.isActive !== false).length;

  // Numbers to display on the tab buttons (Staff & Operators, Customers) based on the active status filter
  const displayedStaffCount =
    statusFilter === 'disabled'
      ? disabledStaffCount
      : statusFilter === 'active'
      ? activeStaffCount
      : staffUsers.length;

  const displayedCustomerCount =
    statusFilter === 'disabled'
      ? disabledCustomerCount
      : statusFilter === 'active'
      ? activeCustomerCount
      : customerUsers.length;

  // 1. Filter Personnel list based on activeTab, statusFilter, and searchQuery
  const filteredUsers = users.filter((u) => {
    const isDeleted = isDeletedUser(u);

    // If viewing staff tab, never show deleted customers or regular customers
    if (activeTab === 'staff') {
      if (u.role === 'customer' || isDeleted) return false;
      if (statusFilter === 'active' && u.isActive === false) return false;
      if (statusFilter === 'disabled' && u.isActive !== false) return false;
    }

    // If viewing customers tab:
    if (activeTab === 'customers') {
      if (u.role !== 'customer') return false;

      // By default ('all' or 'active'), hide deleted/anonymized accounts so they don't pollute customer registry
      if (statusFilter === 'active') {
        if (u.isActive === false || isDeleted) return false;
      } else if (statusFilter === 'all') {
        if (isDeleted) return false;
      } else if (statusFilter === 'disabled') {
        // Disabled filter shows both manually deactivated and deleted accounts
        if (u.isActive !== false && !isDeleted) return false;
      }
    }

    // Search filter
    const query = searchQuery.toLowerCase();
    return (
      !searchQuery ||
      u.username?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query) ||
      u.phoneNumber?.toLowerCase().includes(query) ||
      u.role?.toLowerCase().includes(query)
    );
  });

  // Reset to first page when search, tab, or status filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, statusFilter]);

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // 2. Open Modal
  const openModal = (staff?: any) => {
    setFieldErrors({});
    setTouched({});
    if (staff) {
      setEditingStaff(staff);
      setUsername(staff.username || '');
      setEmail(staff.email || '');
      setPassword(''); // Do not populate password on edit
      setRole(staff.role || 'employee');
      setPhone(staff.phoneNumber || '');
      setAddress(staff.address || '');
    } else {
      setEditingStaff(null);
      setUsername('');
      setEmail('');
      setPassword('');
      setRole('employee');
      setPhone('');
      setAddress('');
    }
    setIsOpen(true);
  };

  // 3. Submit Create or Edit Personnel
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isEdit = !!editingStaff;
    const errUsername = validateField('username', username, isEdit);
    const errEmail = validateField('email', email, isEdit);
    const errPassword = validateField('password', password, isEdit);
    const errPhone = validateField('phone', phone, isEdit);

    if (errUsername || errEmail || errPassword || errPhone) {
      setTouched({ username: true, email: true, password: true, phone: true });
      setShakeKey((k) => k + 1);
      showToast({
        title: 'Form Validation Error',
        message: errUsername || errEmail || errPassword || errPhone || 'Please fix the highlighted fields',
        type: 'error'
      });
      return;
    }

    const payload: any = {
      username: username.trim(),
      email: email.trim(),
      role,
      phoneNumber: phone.trim(),
      address: address.trim()
    };

    if (password.trim()) {
      payload.password = password.trim();
    }

    const optimisticUser = {
      ...(editingStaff || {}),
      username: username.trim(),
      email: email.trim(),
      role,
      phoneNumber: phone.trim(),
      address: address.trim(),
      shiftStatus: editingStaff?.shiftStatus || 'offline',
      isEmailVerified: editingStaff?.isEmailVerified ?? false
    };

    const prevUsers = [...users];
    const tempId = `temp_user_${Date.now()}`;

    // Optimistically update users in state immediately (0ms UI latency)
    if (setUsers) {
      if (isEdit) {
        const targetId = editingStaff.id || editingStaff._id;
        setUsers((prev) =>
          prev.map((u) => ((u.id || u._id) === targetId ? { ...u, ...optimisticUser } : u))
        );
      } else {
        setUsers((prev) => [{ ...optimisticUser, id: tempId, _id: tempId }, ...prev]);
      }
    }

    setIsOpen(false);

    try {
      const path = isEdit ? `/api/admin/users/${editingStaff.id || editingStaff._id}` : '/api/admin/users';

      const res: any = isEdit
        ? await api.put(path, payload)
        : await api.post(path, payload);

      showToast(isEdit ? 'Staff updated successfully' : 'Staff added successfully', 'success');

      if (!isEdit && res?.user && setUsers) {
        setUsers((prev) =>
          prev.map((u) => (u.id === tempId || u._id === tempId ? { ...u, ...res.user } : u))
        );
      }

      refreshData().catch(() => {});
    } catch (err: any) {
      console.warn('Personnel submit notice:', err?.message || err);
      if (setUsers) {
        setUsers(prevUsers);
      }
      showToast(err?.message || 'Failed to save staff', 'error');
    }
  };

  const confirmToggleStatus = async () => {
    if (!disablingUser) return;
    const id = disablingUser.id || disablingUser._id;

    if (isCurrentAdmin(disablingUser)) {
      showToast('Cannot deactivate your own administrator account', 'error');
      setDisablingUser(null);
      return;
    }

    const nextActive = disablingUser.isActive === false ? true : false;
    const prevUsers = [...users];

    // Optimistically update status in table immediately
    if (setUsers) {
      setUsers((prev) =>
        prev.map((u) => ((u.id || u._id) === id ? { ...u, isActive: nextActive, disabledReason: nextActive ? null : disableReason } : u))
      );
    }
    const targetUsername = disablingUser.username;
    setDisablingUser(null);
    const reasonToSend = disableReason.trim();
    setDisableReason('');
    showToast(nextActive ? `Account "${targetUsername}" reactivated` : `Account "${targetUsername}" deactivated (records preserved)`, 'success');

    try {
      await api.patch(`/api/admin/users/${id}/status`, {
        isActive: nextActive,
        reason: reasonToSend || undefined
      });
      refreshData().catch(() => {});
    } catch (err: any) {
      console.warn('Toggle user status notice:', err?.message || err);
      if (setUsers) {
        setUsers(prevUsers);
      }
      showToast(err?.message || 'Failed to update account status', 'error');
    }
  };

  const formatLastActive = (dateString?: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 2) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleSendResetEmail = async (userId: string, userEmail: string) => {
    if (isSendingReset) return;
    setIsSendingReset(true);
    try {
      const res = await api.post<{ message: string; simulated?: boolean; resetUrl?: string }>(`/api/admin/users/${userId}/reset-password`, {});
      if (res?.resetUrl) {
        navigator.clipboard?.writeText(res.resetUrl).catch(() => {});
        if (res.simulated) {
          showToast(`Reset link generated & copied to clipboard! (${userEmail})`, 'info');
        } else {
          showToast(`Reset email sent to ${userEmail} & copied to clipboard for counter walk-in support!`, 'success');
        }
      } else {
        showToast(res?.message || `Password reset link sent to ${userEmail}!`, 'success');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to send reset email', 'error');
    } finally {
      setIsSendingReset(false);
    }
  };

  const exportUsersToCSV = () => {
    if (!users || users.length === 0) {
      showToast('No users available to export', 'error');
      return;
    }

    const headers = [
      'User ID',
      'Username',
      'Email',
      'Phone Number',
      'Role',
      'Account Status',
      'Email Verified',
      'Total Orders',
      'Lifetime Spend (PHP)',
      'Registered Date',
      'Last Active'
    ];

    const targetList = filteredUsers.length > 0 ? filteredUsers : users;

    const rows = targetList.map((u) => [
      `"${u.id || u._id || ''}"`,
      `"${(u.username || '').replace(/"/g, '""')}"`,
      `"${(u.email || '').replace(/"/g, '""')}"`,
      `"${(u.phoneNumber || 'N/A').replace(/"/g, '""')}"`,
      `"${u.role || 'customer'}"`,
      `"${u.isActive === false ? 'Disabled' : 'Active'}"`,
      `"${u.isEmailVerified ? 'Verified' : 'Unverified'}"`,
      u.totalOrders ?? 0,
      (u.totalSpent ?? 0).toFixed(2),
      `"${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}"`,
      `"${u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `stitch_master_accounts_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${targetList.length} accounts to CSV!`, 'success');
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left">
      {/* Compact Top Action Toolbar */}
      <div className="flex justify-start items-center flex-wrap gap-3 mb-4">
        <button
          type="button"
          onClick={() => openModal()}
          className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl text-[0.85rem] shadow-sm hover:shadow-md transition-all cursor-pointer whitespace-nowrap border-none"
        >
          + Add Staff
        </button>
        <button
          type="button"
          onClick={exportUsersToCSV}
          className="bg-white/5 hover:bg-white/10 border border-border-glass text-text-main font-bold px-4 py-2.5 rounded-xl text-[0.85rem] transition-all cursor-pointer flex items-center whitespace-nowrap"
          title="Download accounts as Excel CSV"
        >
          Export CSV
        </button>
        <input
          type="text"
          placeholder="Search credentials or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[220px]"
        />
        {/* Status Filter Chips */}
        <div className="flex items-center bg-bg-surface p-1 rounded-xl border border-border-glass gap-1 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer border-none ${
              statusFilter === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-dim hover:text-text-main bg-transparent'
            }`}
          >
            Active &amp; Inactive ({activeTab === 'staff' ? staffUsers.length : customerUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer border-none flex items-center ${
              statusFilter === 'active'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shadow-sm'
                : 'text-text-dim hover:text-emerald-500 bg-transparent'
            }`}
          >
            Active ({activeTab === 'staff' ? activeStaffCount : activeCustomerCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('disabled')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer border-none flex items-center ${
              statusFilter === 'disabled'
                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 shadow-sm'
                : 'text-text-dim hover:text-rose-500 bg-transparent'
            }`}
          >
            Disabled {activeTab === 'customers' && deletedUsers.length > 0 ? `& Archived (${disabledCustomerCount + deletedUsers.length})` : `(${disabledStaffCount})`}
          </button>
        </div>
      </div>

      {/* Active staff registry table */}
      <div className="glass-card flex-1 pr-2">
        <h3 className="text-xl font-bold m-0 mb-4 text-text-main">Personnel Registry</h3>

        {/* Role Segregation Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4 border-b border-border-glass pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('staff')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-2 ${
                activeTab === 'staff'
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
              }`}
            >
              <span>Staff &amp; Operators</span>
              <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold ${activeTab === 'staff' ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary'}`}>
                {displayedStaffCount}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-2 ${
                activeTab === 'customers'
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
              }`}
            >
              <span>Customers</span>
              <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold ${activeTab === 'customers' ? 'bg-white/20 text-white' : 'bg-white/10 text-text-dim'}`}>
                {displayedCustomerCount}
              </span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 text-xs">
            {activeTab === 'staff' ? (
              <span className="text-success font-semibold text-xs">
                {statusFilter === 'disabled'
                  ? `${disabledStaffCount} Disabled Personnel`
                  : statusFilter === 'active'
                  ? `${onShiftCount} Currently On Shift • ${activeStaffCount} Active Personnel`
                  : `${onShiftCount} Currently On Shift • ${staffUsers.length} Total Personnel`}
              </span>
            ) : (
              <span className="text-text-dim text-xs">
                {statusFilter === 'disabled'
                  ? `${disabledCustomerCount} Disabled Customers`
                  : statusFilter === 'active'
                  ? `${activeCustomerCount} Active Customers`
                  : `${customerUsers.length} Registered Customers`}
              </span>
            )}
          </div>
        </div>

        {/* Desktop View */}
        {isSyncing && users.length === 0 ? (
          <div className="max-[650px]:hidden mb-4 w-full animate-pulse">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : (
          <div className="glass-table-container max-[650px]:hidden overflow-x-auto w-full">
            <table className="glass-table w-full">
              <thead>
                <tr>
                  <th className="glass-th text-left w-[20%]">{activeTab === 'staff' ? 'Staff & Role' : 'Customer'}</th>
                  <th className="glass-th text-left w-[24%]">Contact Info</th>
                  {activeTab === 'staff' ? (
                    <th className="glass-th text-left w-[14%]">Shift Status</th>
                  ) : (
                    <>
                      <th className="glass-th text-left w-[10%]">Orders</th>
                      <th className="glass-th text-left w-[14%]">Lifetime Spend</th>
                    </>
                  )}
                  <th className="glass-th text-left w-[14%]">Last Active</th>
                  <th className="glass-th text-left w-[10%]">Status</th>
                  <th className="glass-th text-right w-[18%]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr className="glass-tr">
                    <td colSpan={7} className="glass-td text-center text-text-dim">
                      {activeTab === 'customers' ? 'No registered customers found.' : 'No personnel accounts found.'}
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u) => {
                  const id = u.id || u._id;
                  const isSelf = isCurrentAdmin(u);
                  const customer = isCustomer(u);
                  const isDeleted = isDeletedUser(u);

                  return (
                    <tr key={id} className={`glass-tr hover:bg-white/5 transition-all ${isDeleted ? 'opacity-60 bg-white/[0.02]' : ''}`}>
                      <td className="glass-td font-bold text-sm text-text-main text-left">
                        <div className="font-bold text-sm text-text-main truncate max-w-[180px]" title={u.username}>
                          {isDeleted ? `Deleted Customer (#${id.slice(0, 6)})` : u.username}
                        </div>
                        {activeTab === 'staff' ? (
                          <div
                            className={`text-[0.68rem] font-bold tracking-wide ${
                              u.role === 'admin'
                                ? 'text-rose-500 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {u.role === 'admin' ? 'Administrator' : 'Artisan / Employee'}
                          </div>
                        ) : isDeleted ? (
                          <span className="text-[0.65rem] text-rose-400 font-semibold inline-block">
                            Account Closed &bull; Data Scrubbed
                          </span>
                        ) : (
                          u.address ? (
                            <div className="text-[0.68rem] text-text-dim truncate max-w-[180px]" title={u.address}>
                              {u.address}
                            </div>
                          ) : null
                        )}
                      </td>
                      <td className="glass-td font-medium text-sm text-text-main text-left">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="truncate max-w-[180px] font-mono text-xs text-text-main" title={u.email}>
                            {isDeleted ? 'privacy-scrubbed@anonymized' : u.email}
                          </span>
                          {customer && !isDeleted && (
                            <span className={`text-[0.65rem] font-semibold shrink-0 ${u.isEmailVerified ? 'text-success' : 'text-text-dim'}`}>
                              {u.isEmailVerified ? 'Verified' : 'Unverified'}
                            </span>
                          )}
                        </div>
                        {u.phoneNumber && !isDeleted && (
                          <div className="text-[0.7rem] text-text-dim font-mono">{u.phoneNumber}</div>
                        )}
                      </td>
                      {activeTab === 'staff' && (
                        <td className="glass-td text-left">
                          <span
                            className={`text-xs ${
                              u.shiftStatus === 'clocked_in' ? 'text-success font-semibold' : 'text-text-dim'
                            }`}
                          >
                            {u.shiftStatus === 'clocked_in' ? 'On Shift' : 'Offline'}
                          </span>
                        </td>
                      )}

                      {activeTab === 'customers' && (
                        <td className="glass-td text-left">
                          <div className="font-mono font-bold text-xs text-text-main">
                            {u.totalOrders || 0}
                          </div>
                        </td>
                      )}
                      {activeTab === 'customers' && (
                        <td className="glass-td text-left font-mono font-extrabold text-xs text-success">
                          ₱{(u.totalSpent || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      )}
                      <td className="glass-td text-left text-xs font-mono text-text-dim">
                        <span title={u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never logged in')}>
                          {formatLastActive(u.lastActiveAt || u.lastLoginAt)}
                        </span>
                      </td>
                      <td className="glass-td text-left">
                        <span
                          className={`text-xs font-semibold ${
                            isDeleted
                              ? 'text-text-dim bg-white/5 border border-white/10 px-2 py-0.5 rounded'
                              : u.isActive === false
                                ? 'text-danger'
                                : 'text-success'
                          }`}
                        >
                          {isDeleted ? 'Archived' : u.isActive === false ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td className="glass-td text-right">
                        <div className="flex gap-2 justify-end items-center">
                          <button
                            onClick={() => setViewingProfileUser(u)}
                            className="w-16 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-border-glass text-text-main hover:bg-white/10 hover:border-white/20 transition-all text-center cursor-pointer"
                            title={customer ? "View Customer Profile, CRM Spend & Recent Orders" : "View Staff Activity & Details"}
                          >
                            Profile
                          </button>
                          {!customer && !isDeleted && (
                            <button
                              onClick={() => openModal(u)}
                              className="w-14 py-1.5 rounded-lg text-xs font-bold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all text-center cursor-pointer"
                              title="Edit personnel details or change role"
                            >
                              Edit
                            </button>
                          )}
                          {isSelf ? (
                            <span
                              className="w-16 py-1.5 text-[0.68rem] text-text-dim font-semibold font-mono text-center select-none"
                              title="You cannot deactivate your own active session"
                            >
                              (You)
                            </span>
                          ) : isDeleted ? (
                            <span
                              className="w-16 py-1.5 text-[0.68rem] text-text-dim text-center font-mono select-none"
                              title="Account was permanently scrubbed & closed upon customer request"
                            >
                              Closed
                            </span>
                          ) : (
                            <button
                              onClick={() => setDisablingUser(u)}
                              className={`w-16 py-1.5 rounded-lg text-xs font-bold transition-all text-center cursor-pointer border ${
                                u.isActive === false
                                  ? 'bg-success/10 border-success/20 text-success hover:bg-success/20'
                                  : 'bg-danger/10 border-danger/20 text-danger hover:bg-danger/20'
                              }`}
                              title={u.isActive === false ? 'Reactivate account' : 'Deactivate account'}
                            >
                              {u.isActive === false ? 'Enable' : 'Disable'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Mobile View */}
        <div className="min-[651px]:hidden flex flex-col gap-4">
          {isSyncing && users.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))
          ) : filteredUsers.length === 0 ? (
            <div className="glass-card p-6 text-center text-text-dim">No personnel accounts found.</div>
          ) : (
            paginatedUsers.map((u) => {
            const id = u.id || u._id;
            const isSelf = isCurrentAdmin(u);
            const customer = isCustomer(u);

            return (
              <div
                key={id}
                className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-lg p-4 flex flex-col gap-3 text-left relative"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text-main text-sm">{u.username}</span>
                    <span
                      className={`text-xs font-semibold ${
                        u.isActive === false ? 'text-danger' : 'text-success'
                      }`}
                    >
                      {u.isActive === false ? 'Disabled' : 'Active'}
                    </span>
                  </div>
                  {!customer && (
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${
                        u.role === 'admin'
                          ? 'text-rose-500 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {u.role === 'admin' ? 'Administrator' : 'Artisan'}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-[0.65rem] text-text-dim block mb-0.5">Email</span>
                  <div className="flex items-center justify-between">
                    <span className="text-text-main font-semibold">{u.email}</span>
                    {customer && (
                      <span className={`text-[0.65rem] font-semibold ${u.isEmailVerified ? 'text-success' : 'text-text-dim'}`}>
                        {u.isEmailVerified ? 'Verified' : 'Unverified'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-medium">
                  <div>
                    <span className="text-[0.65rem] text-text-dim block mb-0.5">Phone Number</span>
                    <span className="font-mono text-text-main font-bold">
                      {u.phoneNumber || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[0.65rem] text-text-dim block mb-0.5">Address</span>
                    <span className="text-text-main font-bold truncate block max-w-[120px]">
                      {u.address || 'N/A'}
                    </span>
                  </div>
                </div>

                {customer && (
                  <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-white/5 text-xs font-mono">
                    <div>
                      <span className="text-[0.65rem] text-text-dim block">Total Orders</span>
                      <span className="font-bold text-text-main">{u.totalOrders || 0} orders</span>
                    </div>
                    <div>
                      <span className="text-[0.65rem] text-text-dim block">Lifetime Spend</span>
                      <span className="font-bold text-success">₱{(u.totalSpent || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 w-full mt-2">
                  <button
                    onClick={() => setViewingProfileUser(u)}
                    className="bg-white/5 border border-border-glass text-text-main hover:bg-white/10 hover:border-white/20 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1"
                  >
                    Profile
                  </button>
                  {!customer && (
                    <button
                      onClick={() => openModal(u)}
                      className="flex-1 bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                  {isSelf ? (
                    <span className="flex-1 flex items-center justify-center text-xs text-text-dim font-semibold font-mono py-2.5 bg-white/5 rounded-xl border border-border-glass select-none">
                      (You)
                    </span>
                  ) : (
                    <button
                      onClick={() => setDisablingUser(u)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        u.isActive === false
                          ? 'bg-success/10 border-success/20 text-success hover:bg-success/20'
                          : 'bg-danger/10 border-danger/20 text-danger hover:bg-danger/20'
                      }`}
                    >
                      {u.isActive === false ? 'Enable' : 'Disable'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      <Pagination
        currentPage={currentPage}
        totalItems={filteredUsers.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        pageSizeOptions={[5, 10, 20, 50]}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
        itemLabel="personnel accounts"
      />
    </div>

      {/* Modal: Create or Edit Staff Account */}
      <GlassModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingStaff ? 'Edit Personnel Details' : 'Add Staff Member'}
        onDiscard={() => {
          setEditingStaff(null);
          setUsername('');
          setEmail('');
          setPassword('');
          setRole('employee');
          setPhone('');
          setAddress('');
          setFieldErrors({});
          setTouched({});
        }}
      >
        <form
          key={shakeKey}
          noValidate
          onSubmit={handleSubmit}
          className={`modal-stack text-left max-h-[80vh] overflow-y-auto pr-1 ${shakeKey > 0 ? 'animate-shake' : ''}`}
        >
          <div className="modal-section">
            <label className="modal-label flex items-center justify-between">
              <span>Username</span>
              {touched.username && !fieldErrors.username && username.trim() && (
                <span className="text-emerald-400 text-[0.68rem] font-bold">✓ Valid</span>
              )}
            </label>
            <input
              type="text"
              placeholder="e.g. revin_artisan"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (touched.username) validateField('username', e.target.value);
              }}
              onBlur={() => handleBlur('username')}
              className={`bg-bg-surface border p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans transition-all ${
                touched.username && fieldErrors.username
                  ? 'border-rose-500/70 bg-rose-500/[0.04] ring-1 ring-rose-500/30'
                  : 'border-border-glass focus:border-white/40'
              }`}
            />
            {touched.username && fieldErrors.username && (
              <InlineError message={fieldErrors.username} variant="field" />
            )}
          </div>

          <div className="modal-section">
            <label className="modal-label flex items-center justify-between">
              <span>Email Address</span>
              {touched.email && !fieldErrors.email && email.trim() && (
                <span className="text-emerald-400 text-[0.68rem] font-bold">✓ Valid syntax</span>
              )}
            </label>
            <input
              type="email"
              placeholder="e.g. revin@stitchopt.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (touched.email) validateField('email', e.target.value);
              }}
              onBlur={() => handleBlur('email')}
              className={`bg-bg-surface border p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans transition-all ${
                touched.email && fieldErrors.email
                  ? 'border-rose-500/70 bg-rose-500/[0.04] ring-1 ring-rose-500/30'
                  : 'border-border-glass focus:border-white/40'
              }`}
            />
            {touched.email && fieldErrors.email && (
              <InlineError message={fieldErrors.email} variant="field" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="modal-section">
              <label className="modal-label flex items-center justify-between" id="staff-password-label">
                <span>{editingStaff ? 'Reset Password (Optional)' : 'Password'}</span>
                {touched.password && !fieldErrors.password && password.trim() && (
                  <span className="text-emerald-400 text-[0.68rem] font-bold">✓ Good</span>
                )}
              </label>
              <input
                type="password"
                placeholder={editingStaff ? '••••••••' : 'Enter strong password (min 8 chars)'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (touched.password) validateField('password', e.target.value);
                }}
                onBlur={() => handleBlur('password')}
                className={`bg-bg-surface border p-3 rounded-xl text-text-main text-sm outline-none w-full transition-all ${
                  touched.password && fieldErrors.password
                    ? 'border-rose-500/70 bg-rose-500/[0.04] ring-1 ring-rose-500/30'
                    : 'border-border-glass focus:border-white/40'
                }`}
              />
              {touched.password && fieldErrors.password && (
                <InlineError message={fieldErrors.password} variant="field" />
              )}
            </div>
            <div className="modal-section">
              <label className="modal-label">Access Role designation</label>
              {editingStaff && isCurrentAdmin(editingStaff) ? (
                <div>
                  <select
                    value={role}
                    disabled
                    className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-dim text-sm outline-none w-full cursor-not-allowed font-sans opacity-70"
                    title="You cannot change your own role to prevent accidental admin lockout"
                  >
                    <option value="admin">Administrator (Your Account)</option>
                  </select>
                  <span className="text-[0.65rem] text-text-dim/60 italic block mt-1">
                    Your own administrative role is locked to prevent accidental lockout.
                  </span>
                </div>
              ) : (
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
                >
                  <option value="employee">Artisan / Employee</option>
                  <option value="admin">Administrator</option>
                </select>
              )}
            </div>
          </div>

          <div className="modal-section">
            <label className="modal-label flex items-center justify-between">
              <span>Phone Number (Optional)</span>
              {touched.phone && !fieldErrors.phone && phone.trim() && (
                <span className="text-emerald-400 text-[0.68rem] font-bold">✓ Valid</span>
              )}
            </label>
            <input
              type="tel"
              placeholder="e.g. +639123456789 or 09123456789"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (touched.phone) validateField('phone', e.target.value);
              }}
              onBlur={() => handleBlur('phone')}
              className={`bg-bg-surface border p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono transition-all ${
                touched.phone && fieldErrors.phone
                  ? 'border-rose-500/70 bg-rose-500/[0.04] ring-1 ring-rose-500/30'
                  : 'border-border-glass focus:border-white/40'
              }`}
            />
            {touched.phone && fieldErrors.phone && (
              <InlineError message={fieldErrors.phone} variant="field" />
            )}
          </div>

          <div className="modal-section">
            <label className="modal-label">Physical Address (Optional)</label>
            <input
              type="text"
              placeholder="e.g. City Central, Lucena"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans focus:border-white/40"
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-sm hover:shadow-md text-center w-full text-sm font-sans"
          >
            {editingStaff ? 'Save Personnel Details' : 'Add Staff'}
          </button>
        </form>
      </GlassModal>

      {/* Soft Deactivate / Reactivate Confirmation Glass Modal */}
      <GlassModal
        isOpen={!!disablingUser}
        onClose={() => { setDisablingUser(null); setDisableReason(''); }}
        title={
          disablingUser?.isActive === false
            ? 'Confirm Reactivate Account'
            : isCustomer(disablingUser)
              ? 'Confirm Deactivate Customer Account'
              : 'Confirm Deactivate Staff Account'
        }
      >
        <div className="modal-stack text-left">
          <p className="text-sm text-text-main m-0 leading-relaxed">
            {disablingUser?.isActive === false ? (
              <>Are you sure you want to reactivate account <b className="text-success font-bold">"{disablingUser?.username}"</b>?</>
            ) : (
              <>Are you sure you want to deactivate account <b className="text-danger font-bold">"{disablingUser?.username}"</b>?</>
            )}
          </p>

          {disablingUser?.isActive === false ? (
            <p className="text-xs text-text-dim m-0">
              This will immediately restore login privileges, checkout ability, and system access.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-dim m-0">
                {isCustomer(disablingUser)
                  ? 'Login access will be revoked. All orders, receipts, wallet balances, and audit records remain 100% preserved in the database for auditing and accounting compliance.'
                  : 'Operational portal access will be revoked immediately. Historical audit trail is preserved.'}
              </p>
              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[0.72rem] font-bold text-text-dim">Reason for Deactivation (Optional):</label>
                <input
                  type="text"
                  placeholder="e.g. Account suspended, policy violation, customer requested..."
                  value={disableReason}
                  onChange={(e) => setDisableReason(e.target.value)}
                  className="bg-bg-surface border border-border-glass rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-primary transition-all font-sans"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={() => { setDisablingUser(null); setDisableReason(''); }}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmToggleStatus}
              className={`px-4 py-2.5 rounded-xl text-white text-xs font-bold cursor-pointer border-none shadow-sm ${
                disablingUser?.isActive === false
                  ? 'bg-success hover:bg-success/90'
                  : 'bg-danger hover:bg-danger/90'
              }`}
            >
              {disablingUser?.isActive === false ? 'Reactivate Account' : 'Deactivate Account'}
            </button>
          </div>
        </div>
      </GlassModal>

      {/* Customer Profile & Order History Glass Modal */}
      <GlassModal
        isOpen={!!viewingProfileUser}
        onClose={() => setViewingProfileUser(null)}
        title={viewingProfileUser?.role === 'customer' ? 'Customer Profile & CRM Insights' : 'Staff Profile & Activity'}
      >
        {viewingProfileUser && (
          <div className="flex flex-col gap-4 text-left">
            {/* Top Identity Card */}
            <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-white/5 border border-border-glass">
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center text-lg font-extrabold uppercase border border-primary/30">
                  {(viewingProfileUser.username || 'U')[0]}
                </span>
                <div>
                  <div className="font-extrabold text-base text-text-main flex items-center gap-2">
                    <span>{viewingProfileUser.username}</span>
                    <span className="text-[0.65rem] uppercase px-2 py-0.5 rounded-full font-bold bg-primary/20 text-primary border border-primary/30">
                      {viewingProfileUser.role}
                    </span>
                  </div>
                  <div className="text-xs text-text-dim flex items-center gap-1.5 mt-0.5">
                    <span>{viewingProfileUser.email}</span>
                    {viewingProfileUser.isEmailVerified ? (
                      <span className="text-success font-semibold text-[0.68rem] px-1.5 py-0.5 rounded bg-success/10 border border-success/20">Verified</span>
                    ) : (
                      <span className="text-warning font-semibold text-[0.68rem] px-1.5 py-0.5 rounded bg-warning/10 border border-warning/20">Unverified</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <span
                  className={`text-xs font-semibold ${
                    viewingProfileUser.isActive === false ? 'text-danger' : 'text-success'
                  }`}
                >
                  {viewingProfileUser.isActive === false ? 'Disabled' : 'Active'}
                </span>
              </div>
            </div>

            {/* CRM Stats Grid (No wallet balance displayed) */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1">
                <span className="text-[0.68rem] text-text-dim font-bold uppercase tracking-wider">Total Orders</span>
                <span className="text-base font-extrabold text-primary font-mono">
                  {viewingProfileUser.totalOrders || 0}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1">
                <span className="text-[0.68rem] text-text-dim font-bold uppercase tracking-wider">Lifetime Spend</span>
                <span className="text-base font-extrabold text-success font-mono">
                  ₱{(viewingProfileUser.totalSpent || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-bg-surface border border-border-glass flex flex-col gap-1">
                <span className="text-[0.68rem] text-text-dim font-bold uppercase tracking-wider">Last Active</span>
                <span className="text-xs font-bold text-text-main font-mono">
                  {formatLastActive(viewingProfileUser.lastActiveAt || viewingProfileUser.lastLoginAt)}
                </span>
              </div>
            </div>

            {/* Contact Details */}
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-bg-surface border border-border-glass text-xs">
              <div className="flex justify-between">
                <span className="text-text-dim font-bold">Contact Phone:</span>
                <span className="font-mono text-text-main font-bold">{viewingProfileUser.phoneNumber || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim font-bold">Address:</span>
                <span className="text-text-main font-medium max-w-[260px] text-right truncate">
                  {viewingProfileUser.address || 'Not provided'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-dim font-bold">Registered Date:</span>
                <span className="text-text-main font-mono">
                  {viewingProfileUser.createdAt ? new Date(viewingProfileUser.createdAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>

            {/* Recent Orders History */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-text-main uppercase tracking-wider">Recent Orders</span>
                <span className="text-[0.68rem] text-text-dim">Latest {viewingProfileUser.recentOrders?.length || 0}</span>
              </div>

              {(!viewingProfileUser.recentOrders || viewingProfileUser.recentOrders.length === 0) ? (
                <div className="p-4 rounded-xl bg-white/5 border border-border-glass text-center text-xs text-text-dim">
                  No purchase history on record yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                  {viewingProfileUser.recentOrders.map((ord: any) => (
                    <div
                      key={ord.id}
                      className="p-2.5 rounded-xl bg-white/5 border border-border-glass flex items-center justify-between text-xs hover:bg-white/10 transition-all"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono font-bold text-text-main">#{ord.orderId || ord.id.slice(0, 8)}</span>
                        <span className="text-[0.68rem] text-text-dim">
                          {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-bold bg-white/10 text-text-dim">
                          {ord.status}
                        </span>
                        <span className="font-mono font-extrabold text-success">
                          ₱{(ord.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Administrative Quick Actions */}
            <div className="pt-3 border-t border-border-glass flex items-center gap-2">
              <button
                type="button"
                disabled={isSendingReset}
                onClick={() => handleSendResetEmail(viewingProfileUser.id || viewingProfileUser._id, viewingProfileUser.email)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-primary/10 border border-primary/20 text-primary font-bold text-xs hover:bg-primary/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2l-2 2m-1.5 1.5L14 9a5 5 0 1 0 3 3l6-6-2-2-3.5 3.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>{isSendingReset ? 'Sending...' : "Send Reset Email to User's Gmail"}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewingProfileUser(null)}
                className="px-4 py-2.5 rounded-xl bg-bg-surface border border-border-glass text-text-main font-bold text-xs hover:bg-white/10 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </GlassModal>
    </section>
  );
}
