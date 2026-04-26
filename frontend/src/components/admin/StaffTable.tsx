'use client';

import type { User } from '@/types';
import Button from '@/components/ui/Button';

interface StaffTableProps {
  users: User[];
  onUpdateRole: (id: string, role: 'customer' | 'admin' | 'employee') => void;
  onDelete: (id: string) => void;
}

export default function StaffTable({ users, onUpdateRole, onDelete }: StaffTableProps) {
  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/5 bg-white/5 text-[10px] uppercase font-black tracking-widest text-slate-500">
            <th className="px-6 py-4">User</th>
            <th className="px-6 py-4">Role</th>
            <th className="px-6 py-4">Email</th>
            <th className="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {users.map((u) => (
            <tr key={u.id} className="group hover:bg-white/[0.02] transition-colors">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold text-white">{u.username}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <select 
                  className="bg-bg-deeper border border-white/10 rounded-lg text-xs px-2 py-1 outline-none focus:border-primary"
                  value={u.role}
                  onChange={(e) => onUpdateRole(u.id, e.target.value as any)}
                >
                  <option value="customer">Customer</option>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td className="px-6 py-4 text-xs text-slate-500">{u.email || 'N/A'}</td>
              <td className="px-6 py-4 text-right">
                <button 
                  onClick={() => onDelete(u.id)}
                  className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
