'use client';

import { useState } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface PanelStaffingProps {
  users: any[];
  machines?: any[];
  isSyncing: boolean;
  refreshData: () => Promise<void>;
}

export default function PanelStaffing({
  users,
  machines = [],
  isSyncing,
  refreshData
}: PanelStaffingProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isOpen, setIsOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('employee');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // 1. Filter Personnel list
  const filteredUsers = users.filter((u) => {
    const query = searchQuery.toLowerCase();
    return (
      !searchQuery ||
      u.username?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query) ||
      u.role?.toLowerCase().includes(query)
    );
  });

  // 2. Open Modal
  const openModal = (staff?: any) => {
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

    try {
      const path = editingStaff ? `/api/admin/users/${editingStaff.id || editingStaff._id}` : '/api/admin/users';

      if (editingStaff) {
        await api.put(path, payload);
      } else {
        await api.post(path, payload);
      }

      showToast(
        editingStaff ? 'Personnel details adjusted' : 'New staff credentials established successfully',
        'success'
      );
      setIsOpen(false);
      refreshData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save staff credentials details', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently disable this personnel account?')) return;
    try {
      await api.delete(`/api/admin/users/${id}`);
      showToast('Staff credentials disabled successfully', 'success');
      refreshData();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete staff credentials', 'error');
    }
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left">
      <header className="dash-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="dash-title">Personnel Management</h1>
          <p className="dash-subtitle">Establish access credentials and assign organizational roles.</p>
        </div>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Search staff credentials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-bg-surface border border-border-glass p-2.5 rounded-xl text-text-main text-[0.85rem] outline-none min-w-[200px]"
          />
          <button
            onClick={() => openModal()}
            className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl text-[0.85rem] hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all cursor-pointer whitespace-nowrap border-none"
          >
            + Add Staff User
          </button>
        </div>
      </header>

      {/* Active staff registry table */}
      <div className="glass-card flex-1 pr-2">
        <h3 className="text-xl font-bold m-0 mb-4 text-text-main">Personnel Registry</h3>

        {/* Desktop View */}
        <div className="glass-table-container max-[650px]:hidden">
          <table className="glass-table">
            <thead>
              <tr>
                <th className="glass-th text-left">Username</th>
                <th className="glass-th text-left">Email Address</th>
                <th className="glass-th text-left">Shift Status</th>
                <th className="glass-th text-left">Assigned Machine</th>
                <th className="glass-th text-left">Access Level</th>
                <th className="glass-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isSyncing && users.length === 0 ? (
                <tr className="glass-tr">
                  <td colSpan={7} className="glass-td text-center text-text-dim">
                    Syncing database personnel...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr className="glass-tr">
                  <td colSpan={7} className="glass-td text-center text-text-dim">
                    No active staff credentials cataloged.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const id = u.id || u._id;
                  return (
                    <tr key={id} className="glass-tr hover:bg-white/5 transition-all">
                      <td className="glass-td font-bold text-sm text-text-main text-left">
                        {u.username}
                      </td>
                      <td className="glass-td font-medium text-sm text-text-main text-left">
                        {u.email}
                      </td>
                      <td className="glass-td text-left">
                        <span
                          className={`inline-block text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider
                            ${u.shiftStatus === 'clocked_in'
                              ? 'bg-success/20 text-success border border-success/30'
                              : 'bg-text-dim/20 text-text-dim border border-text-dim/30'
                            }
                          `}
                        >
                          {u.shiftStatus === 'clocked_in' ? '● On Shift' : '○ Offline'}
                        </span>
                      </td>
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
                      <td className="glass-td text-left">
                        <span
                          className={`inline-block text-[0.7rem] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider
                            ${u.role === 'admin'
                              ? 'bg-secondary/20 text-secondary border border-secondary/30'
                              : 'bg-primary/20 text-primary border border-primary/30'
                            }
                          `}
                        >
                          {u.role || 'employee'}
                        </span>
                      </td>
                      <td className="glass-td text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => openModal(u)}
                            className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/25 transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(id)}
                            className="bg-danger/10 border border-danger/20 text-danger px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-danger/25 transition-all cursor-pointer"
                          >
                            Disable
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="min-[651px]:hidden flex flex-col gap-4">
          {filteredUsers.map((u) => {
            const id = u.id || u._id;
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
                  <button
                    onClick={() => openModal(u)}
                    className="flex-1 bg-primary/10 border border-primary/20 text-primary py-2.5 rounded-xl text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(id)}
                    className="flex-1 bg-danger/10 border border-danger/20 text-danger py-2.5 rounded-xl text-xs font-bold hover:bg-danger/20 transition-all cursor-pointer"
                  >
                    Disable
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Wizard Account Details */}
      <GlassModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingStaff ? 'Edit Account Details' : 'Create Staff Account'}
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
            className="bg-primary text-white font-bold py-3.5 rounded-xl mt-4 hover:bg-primary-light transition-all cursor-pointer border-none shadow-[0_10px_20px_rgba(99,102,241,0.3)] text-center w-full text-sm font-sans"
          >
            {editingStaff ? 'Update Personnel Account' : 'Establish Personnel Account'}
          </button>
        </form>
      </GlassModal>
    </section>
  );
}
