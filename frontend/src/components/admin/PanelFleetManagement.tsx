'use client';

import { useState, useEffect } from 'react';
import GlassModal from '@/components/ui/GlassModal';
import { api, API_BASE } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import { CardSkeleton } from '@/components/ui/Skeletons';

interface PanelFleetManagementProps {
  users?: any[];
}

export default function PanelFleetManagement({ users = [] }: PanelFleetManagementProps) {
  const [machines, setMachines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [isOpen, setIsOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<any>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('Single-Head');
  const [assignedUserId, setAssignedUserId] = useState('');

  // Employees only (for assignment dropdown)
  const employees = users.filter(u => u.role === 'employee' || u.role === 'admin');

  const fetchMachines = async () => {
    try {
      setIsLoading(true);
      const res: any = await api.get('/api/machines');
      if (res && res.data) {
        setMachines(res.data);
      } else if (Array.isArray(res)) {
        setMachines(res);
      }
    } catch (err) {
      showToast('Failed to fetch machine fleet', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMachines();
  }, []);

  // Real-time Socket.IO listener for machine changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let activeSocket: any = null;
    let isCancelled = false;

    const script = document.createElement('script');
    script.src = `${API_BASE}/socket.io/socket.io.js`;
    script.async = true;
    script.onload = () => {
      if (isCancelled) return;
      const io = (window as any).io;
      if (!io) return;

      const socket = io(API_BASE, {
        withCredentials: true,
        transports: ['websocket', 'polling']
      });
      activeSocket = socket;

      socket.on('dataChanged', (data: any) => {
        if (data.entity === 'MACHINE') {
          fetchMachines();
        }
      });
    };

    document.head.appendChild(script);

    return () => {
      isCancelled = true;
      if (activeSocket) activeSocket.close();
    };
  }, []);

  const openModal = (machine?: any) => {
    if (machine) {
      setEditingMachine(machine);
      setName(machine.name);
      setType(machine.type);
      setAssignedUserId(machine.assignedUserId || '');
    } else {
      setEditingMachine(null);
      setName('');
      setType('Single-Head');
      setAssignedUserId('');
    }
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return showToast('Machine name required', 'error');

    try {
      if (editingMachine) {
        await api.put(`/api/machines/${editingMachine.id}`, { 
          name, 
          type,
          assignedUserId: assignedUserId || null
        });
        showToast('Machine updated', 'success');
      } else {
        await api.post('/api/machines', { name, type });
        showToast('Machine added to fleet', 'success');
      }
      setIsOpen(false);
      fetchMachines();
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Error saving machine', 'error');
    }
  };

  const [deletingMachine, setDeletingMachine] = useState<any>(null);

  const confirmDelete = async () => {
    if (!deletingMachine) return;
    try {
      await api.delete(`/api/machines/${deletingMachine.id}`);
      showToast('Machine removed from fleet', 'success');
      setDeletingMachine(null);
      fetchMachines();
    } catch (err) {
      showToast('Error removing machine', 'error');
    }
  };

  return (
    <section className="animate-fade flex flex-col min-h-full text-left">
      <header className="dash-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="dash-title">Live Production & Fleet</h1>
          <p className="dash-subtitle">Monitor physical embroidery machines, assign operators, and track equipment health and active lines.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-primary text-white font-bold px-5 py-2.5 rounded-xl text-[0.85rem] hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all cursor-pointer whitespace-nowrap border-none"
        >
          + Add Machine
        </button>
      </header>

      <div className="glass-card flex-1 pr-2 mt-4">
        <h3 className="text-xl font-bold m-0 mb-4 text-text-main">Machine Registry</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </>
          ) : machines.length === 0 ? (
            <p className="text-text-dim p-4">No machines registered in the fleet yet.</p>
          ) : (
            machines.map(m => (
              <div key={m.id} className="bg-white/5 border border-border-glass p-5 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-bold text-lg text-white">{m.name}</span>
                    <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider
                      ${m.status === 'Running' ? 'bg-success/20 text-success border border-success/30' :
                        m.status === 'Idle' ? 'bg-warning/20 text-warning border border-warning/30' :
                        m.status === 'Maintenance' ? 'bg-danger/20 text-danger border border-danger/30' :
                        'bg-text-dim/20 text-text-dim border border-text-dim/30'
                      }
                    `}>
                      {m.status}
                    </span>
                  </div>
                  <span className="text-xs text-text-dim uppercase tracking-wider block mb-1">Type</span>
                  <span className="text-sm font-medium mb-4 block">{m.type}</span>
                  
                  <span className="text-xs text-text-dim uppercase tracking-wider block mb-1">Current Operator</span>
                  <span className={`text-sm font-mono font-bold ${m.assignedUser?.username ? 'text-primary' : 'text-text-dim italic'}`}>
                    {m.assignedUser?.username || 'Unassigned'}
                  </span>
                </div>
                
                <div className="flex gap-2 mt-6">
                  <button onClick={() => openModal(m)} className="flex-1 bg-primary/10 text-primary py-2 rounded-lg text-xs font-bold hover:bg-primary/20 transition-all cursor-pointer border-none">Edit</button>
                  <button onClick={() => setDeletingMachine(m)} className="flex-1 bg-danger/10 text-danger py-2 rounded-lg text-xs font-bold hover:bg-danger/20 transition-all cursor-pointer border-none">Remove</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <GlassModal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editingMachine ? 'Edit Machine' : 'Add Machine'}>
        <form onSubmit={handleSubmit} className="modal-stack">
          <div className="modal-section">
            <label className="modal-label">Machine Name/Identifier</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Brother PR1055X #1" className="bg-bg-surface border border-border-glass p-3 rounded-xl w-full text-white outline-none font-sans" />
          </div>
          <div className="modal-section">
            <label className="modal-label">Machine Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="bg-bg-surface border border-border-glass p-3 rounded-xl w-full text-white cursor-pointer font-sans">
              <option value="Single-Head">Single-Head</option>
              <option value="Multi-Head">Multi-Head</option>
              <option value="DTF Printer">DTF Printer</option>
            </select>
          </div>
          {editingMachine && (
            <div className="modal-section">
              <label className="modal-label">Assign Operator</label>
              <select 
                value={assignedUserId} 
                onChange={e => setAssignedUserId(e.target.value)} 
                className="bg-bg-surface border border-border-glass p-3 rounded-xl w-full text-white cursor-pointer font-sans"
              >
                <option value="">— Unassigned —</option>
                {employees.map(u => (
                  <option key={u.id || u._id} value={u.id || u._id}>{u.username} ({u.role})</option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="bg-primary text-white font-bold py-3.5 rounded-xl w-full mt-4 cursor-pointer border-none hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all text-sm font-sans">{editingMachine ? 'Update Machine' : 'Add to Fleet'}</button>
        </form>
      </GlassModal>

      {/* Delete Confirmation Glass Modal */}
      <GlassModal
        isOpen={!!deletingMachine}
        onClose={() => setDeletingMachine(null)}
        title="Confirm Remove Machine"
      >
        <div className="modal-stack text-left">
          <p className="text-sm text-text-main m-0 leading-relaxed">
            Are you sure you want to remove machine <b className="text-danger font-bold">"{deletingMachine?.name}"</b> from the operational fleet?
          </p>
          <p className="text-xs text-text-dim m-0">
            Any current operator assignments and active production line links will be unassigned.
          </p>
          <div className="flex gap-3 justify-end mt-4">
            <button
              type="button"
              onClick={() => setDeletingMachine(null)}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-border-glass text-text-main text-xs font-bold hover:bg-white/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="px-4 py-2.5 rounded-xl bg-danger text-white text-xs font-bold hover:bg-danger-light cursor-pointer border-none shadow-[0_4px_12px_rgba(239,68,68,0.3)]"
            >
              Remove Machine
            </button>
          </div>
        </div>
      </GlassModal>
    </section>
  );
}
