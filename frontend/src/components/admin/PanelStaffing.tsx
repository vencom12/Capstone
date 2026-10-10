'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeletons';
import { useAuthStore } from '@/stores/useAuthStore';
import Pagination from '@/components/ui/Pagination';

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
  const pageSize = 10;

  // Modals state
  const [isOpen, setIsOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [disablingUser, setDisablingUser] = useState<any>(null);

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('employee');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const [activeTab, setActiveTab] = useState<'staff' | 'customers' | 'all'>('staff');

  // Security Helper Rules
  const isTargetAdmin = (u: any) => u?.role === 'admin';
  const isCurrentAdmin = (u: any) => Boolean(u && currentAdmin?.id && (u.id || u._id) === currentAdmin.id);
  const isFellowAdmin = (u: any) => isTargetAdmin(u) && !isCurrentAdmin(u);
  const isCustomer = (u: any) => u?.role === 'customer';

  // Counts for tabs
  const staffUsers = users.filter((u) => u.role === 'admin' || u.role === 'employee');
  const customerUsers = users.filter((u) => u.role === 'customer');
  const onShiftCount = staffUsers.filter((u) => u.shiftStatus === 'clocked_in').length;

  // 1. Filter Personnel list based on activeTab and searchQuery
  const filteredUsers = users.filter((u) => {
    // Tab filter
    if (activeTab === 'staff' && u.role === 'customer') return false;
    if (activeTab === 'customers' && u.role !== 'customer') return false;

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

  // Reset to first page when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab]);

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // 2. Open Modal
  const openModal = (staff?: any) => {
    if (staff) {
      if (isFellowAdmin(staff)) {
        showToast('Security Alert: You cannot modify credentials of another administrator', 'error');
        return;
      }
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

    if (editingStaff && isFellowAdmin(editingStaff)) {
      showToast('Action forbidden: Fellow administrator accounts are protected', 'error');
      return;
    }

    if (!username.trim()) return showToast('Username is required', 'error');
    if (!email.trim()) return showToast('Email is required', 'error');
    if (!editingStaff && !password.trim()) {
      return showToast('Password is required on account establishment', 'error');
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

    const isEdit = !!editingStaff;
    const optimisticUser = {
      ...(editingStaff || {}),
      username: username.trim(),
      email: email.trim(),
      role,
      phoneNumber: phone.trim(),
      address: address.trim(),
      shiftStatus: editingStaff?.shiftStatus || 'offline',
      walletBalance: editingStaff?.walletBalance || 0
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
    showToast(
      isEdit ? 'Personnel details updated' : 'New staff credentials established successfully',
      'success'
    );

    try {
      const path = isEdit ? `/api/admin/users/${editingStaff.id || editingStaff._id}` : '/api/admin/users';

      const res: any = isEdit
        ? await api.put(path, payload)
        : await api.post(path, payload);

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
      showToast(err?.message || 'Failed to save staff credentials details — reverted', 'error');
    }
  };

  const confirmDisable = async () => {
    if (!disablingUser) return;
    const id = disablingUser.id || disablingUser._id;

    if (isFellowAdmin(disablingUser)) {
      showToast('Security Violation: You cannot disable fellow administrator accounts', 'error');
      setDisablingUser(null);
      return;
    }

    const prevUsers = [...users];

    // Optimistically remove user from table immediately
    if (setUsers) {
      setUsers((prev) => prev.filter((u) => (u.id || u._id) !== id));
    }
    setDisablingUser(null);
    showToast(`Account "${disablingUser.username}" disabled successfully`, 'success');

    try {
      await api.delete(`/api/admin/users/${id}`);
      refreshData().catch(() => {});
    } catch (err: any) {
      console.warn('Disable user notice:', err?.message || err);
      if (setUsers) {
        setUsers(prevUsers);
      }
      showToast(err?.message || 'Failed to disable user account — restored', 'error');
    }
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left">
      {/* Compact Top Action Toolbar */}
      <div className="flex justify-start items-center flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search staff credentials..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
        />
        <button
          onClick={() => openModal()}
          className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl text-[0.85rem] shadow-sm hover:shadow-md transition-all cursor-pointer whitespace-nowrap border-none"
        >
          + Add Staff
        </button>
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
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Staff &amp; Operators</span>
              <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold ${activeTab === 'staff' ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary'}`}>
                {staffUsers.length}
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
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Customers</span>
              <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold ${activeTab === 'customers' ? 'bg-white/20 text-white' : 'bg-white/10 text-text-dim'}`}>
                {customerUsers.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-white/20 text-text-main border-white/30'
                  : 'bg-white/5 text-text-dim border-border-glass hover:bg-white/10'
              }`}
            >
              <span>All</span>
              <span className="text-[0.65rem] text-text-dim">({users.length})</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 border border-success/20 text-success text-[0.7rem] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              {onShiftCount} Active On-Shift
            </span>
          </div>
        </div>

        {/* Desktop View */}
        {isSyncing && users.length === 0 ? (
          <div className="max-[650px]:hidden mb-4 w-full animate-pulse">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : (
          <div className="glass-table-container max-[650px]:hidden">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="glass-th text-left">User</th>
                  <th className="glass-th text-left">Contact Info</th>
                  {activeTab !== 'customers' && <th className="glass-th text-left">Shift Status</th>}
                  {activeTab !== 'customers' && <th className="glass-th text-left">Assigned Machine</th>}
                  {activeTab === 'customers' && <th className="glass-th text-left">Wallet Balance</th>}
                  <th className="glass-th text-left">Access / Role</th>
                  <th className="glass-th text-right">Actions</th>
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
                  const fellowAdmin = isFellowAdmin(u);
                  const customer = isCustomer(u);

                  return (
                    <tr key={id} className="glass-tr hover:bg-white/5 transition-all">
                      <td className="glass-td font-bold text-sm text-text-main text-left">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold uppercase">
                            {(u.username || 'U')[0]}
                          </span>
                          <div>
                            <div className="font-bold text-sm text-text-main">{u.username}</div>
                            {customer && u.isEmailVerified && (
                              <span className="text-[0.62rem] text-success flex items-center gap-0.5">
                                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>Verified Email</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="glass-td font-medium text-sm text-text-main text-left">
                        <div>{u.email}</div>
                        {u.phoneNumber && <div className="text-[0.7rem] text-text-dim">{u.phoneNumber}</div>}
                      </td>
                      {activeTab !== 'customers' && (
                        <td className="glass-td text-left">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider
                              ${u.shiftStatus === 'clocked_in'
                                ? 'bg-success/20 text-success border border-success/30'
                                : 'bg-text-dim/20 text-text-dim border border-text-dim/30'
                              }
                            `}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${u.shiftStatus === 'clocked_in' ? 'bg-success' : 'bg-text-dim'}`} />
                            <span>{u.shiftStatus === 'clocked_in' ? 'On Shift' : 'Offline'}</span>
                          </span>
                        </td>
                      )}
                      {activeTab !== 'customers' && (
                        <td className="glass-td text-left text-sm">
                          {(() => {
                            const assignedMachine = machines.find((m: any) => m.assignedUserId === (u.id || u._id));
                            return assignedMachine ? (
                              <span className="font-mono font-bold text-primary text-xs">{assignedMachine.name}</span>
                            ) : (
                              <span className="text-text-dim italic text-xs">Unassigned</span>
                            );
                          })()}
                        </td>
                      )}
                      {activeTab === 'customers' && (
                        <td className="glass-td text-left text-sm font-mono font-bold text-text-main">
                          ₱{(u.walletBalance || 0).toFixed(2)}
                        </td>
                      )}
                      <td className="glass-td text-left">
                        <span
                          className={`inline-block text-[0.7rem] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider
                            ${u.role === 'admin'
                              ? 'bg-secondary/20 text-secondary border border-secondary/30'
                              : u.role === 'customer'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-primary/20 text-primary border border-primary/30'
                            }
                          `}
                        >
                          {u.role || 'employee'}
                        </span>
                      </td>
                      <td className="glass-td text-right">
                        <div className="flex gap-2 justify-end items-center">
                          {fellowAdmin ? (
                            <span
                              className="text-[0.68rem] text-text-dim/70 italic font-mono px-2 py-1 bg-white/5 rounded-lg border border-border-glass select-none"
                              title="Administrator accounts cannot be modified or disabled by fellow admins"
                            >
                              Protected Admin
                            </span>
                          ) : customer ? (
                            <>
                              <button
                                onClick={() => openModal(u)}
                                className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-500/25 transition-all cursor-pointer border-none"
                                title="Promote customer account to staff"
                              >
                                Promote / Edit
                              </button>
                              <button
                                onClick={() => setDisablingUser(u)}
                                className="bg-danger/10 border border-danger/20 text-danger px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-danger/25 transition-all cursor-pointer border-none"
                              >
                                Disable
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => openModal(u)}
                                className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/25 transition-all cursor-pointer border-none"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setDisablingUser(u)}
                                className="bg-danger/10 border border-danger/20 text-danger px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-danger/25 transition-all cursor-pointer border-none"
                              >
                                Disable
                              </button>
                            </>
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
            const fellowAdmin = isFellowAdmin(u);
            const customer = isCustomer(u);

            return (
              <div
                key={id}
                className="bg-bg-card backdrop-blur-[12px] border border-border-glass rounded-[20px] p-4 flex flex-col gap-3 text-left relative"
              >
                <div className="flex justify-between items-start">
                  <span className="font-bold text-text-main text-sm">{u.username}</span>
                  <span
                    className={`inline-block text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider
                      ${u.role === 'admin'
                        ? 'bg-secondary/20 text-secondary border border-secondary/30'
                        : u.role === 'customer'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-primary/20 text-primary border border-primary/30'
                      }
                    `}
                  >
                    {u.role || 'employee'}
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-[0.65rem] text-text-dim block mb-0.5">Email</span>
                  <span className="text-text-main font-semibold">{u.email}</span>
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

                <div className="flex gap-2 w-full mt-2">
                  {fellowAdmin ? (
                    <span className="w-full text-center text-xs text-text-dim/70 italic font-mono py-2 bg-white/5 rounded-xl border border-border-glass">
                      Protected Admin
                    </span>
                  ) : customer ? (
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => openModal(u)}
                        className="flex-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 py-2.5 rounded-xl text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer border-none"
                      >
                        Promote / Edit
                      </button>
                      <button
                        onClick={() => setDisablingUser(u)}
                        className="flex-1 bg-danger/10 border border-danger/20 text-danger py-2.5 rounded-xl text-xs font-bold hover:bg-danger/20 transition-all cursor-pointer border-none"
                      >
                        Disable
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => openModal(u)}
                        className="flex-1 bg-primary/10 border border-primary/20 text-primary py-2.5 rounded-xl text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer border-none"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDisablingUser(u)}
                        className="flex-1 bg-danger/10 border border-danger/20 text-danger py-2.5 rounded-xl text-xs font-bold hover:bg-danger/20 transition-all cursor-pointer border-none"
                      >
                        Disable
                      </button>
                    </>
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
        itemLabel="personnel accounts"
      />
    </div>

      {/* Modal: Create or Edit Staff Account */}
      <GlassModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingStaff ? (editingStaff.role === 'customer' ? 'Promote / Edit Customer Account' : 'Edit Personnel Details') : 'Add Staff Member'}
      >
        <form onSubmit={handleSubmit} className="modal-stack text-left max-h-[80vh] overflow-y-auto pr-1">
          <div className="modal-section">
            <label className="modal-label">Username</label>
            <input
              type="text"
              required
              placeholder="e.g. revin_artisan"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans"
            />
          </div>

          <div className="modal-section">
            <label className="modal-label">Email Address</label>
            <input
              type="email"
              required
              placeholder="e.g. revin@stitchopt.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="modal-section">
              <label className="modal-label" id="staff-password-label">
                {editingStaff ? 'Reset Password (Optional)' : 'Password'}
              </label>
              <input
                type="password"
                required={!editingStaff}
                placeholder={editingStaff ? '••••••••' : 'Enter strong password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full"
              />
            </div>
            <div className="modal-section">
              <label className="modal-label">Access Role designation</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full cursor-pointer font-sans"
              >
                <option value="employee">Artisan / Employee</option>
                <option value="admin">Administrator</option>
                <option value="customer">Customer</option>
              </select>
            </div>
          </div>

          <div className="modal-section">
            <label className="modal-label">Phone Number</label>
            <input
              type="tel"
              placeholder="e.g. +639123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-mono"
            />
          </div>

          <div className="modal-section">
            <label className="modal-label">Physical Address</label>
            <input
              type="text"
              placeholder="e.g. City Central, Manila"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="bg-bg-surface border border-border-glass p-3 rounded-xl text-text-main text-sm outline-none w-full font-sans"
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-sm hover:shadow-md text-center w-full text-sm font-sans"
          >
            {editingStaff ? (editingStaff.role === 'customer' ? 'Save & Update Role' : 'Save Personnel Details') : 'Add Staff'}
          </button>
        </form>
      </GlassModal>

      {/* Delete / Disable Confirmation Glass Modal */}
      <GlassModal
        isOpen={!!disablingUser}
        onClose={() => setDisablingUser(null)}
        title={isCustomer(disablingUser) ? 'Confirm Disable Customer Account' : 'Confirm Disable Staff Account'}
      >
        <div className="modal-stack text-left">
          <p className="text-sm text-text-main m-0 leading-relaxed">
            Are you sure you want to disable account <b className="text-danger font-bold">"{disablingUser?.username}"</b>?
          </p>
          <p className="text-xs text-text-dim m-0">
            {isCustomer(disablingUser)
              ? 'Warning: Customer credentials should remain self-managed. Disabling this customer will revoke their storefront checkout access. Use only for explicit policy violations.'
              : 'This will revoke all active operational access for this personnel account.'}
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={() => setDisablingUser(null)}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDisable}
              className="px-4 py-2.5 rounded-xl bg-danger text-white text-xs font-bold hover:bg-danger-light cursor-pointer border-none shadow-sm"
            >
              Disable Account
            </button>
          </div>
        </div>
      </GlassModal>
    </section>
  );
}
