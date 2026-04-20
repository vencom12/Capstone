import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../hooks/useDashboard';
import { useToast } from '../components/ui/Toast';
import { adminAPI } from '../api/client';
import DashboardLayout from '../components/layout/DashboardLayout';
import OrderTable from '../components/OrderTable';
import Modal from '../components/ui/Modal';
import StitchAI from '../components/StitchAI';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const CHART_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#22c55e', '#f59e0b', '#60a5fa'];

// SVG Icons
const OverviewIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
const InventoryIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>;
const ProductionIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20"/><path d="m4.93 4.93 14.14 14.14"/><path d="M2 12h20"/><path d="m19.07 4.93-14.14 14.14"/></svg>;
const StaffIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const AnalyticsIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const HistoryIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-4 4"/></svg>;

export default function AdminDashboard() {
  const { user, login, logout, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const dashboard = useDashboard();
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [staffModal, setStaffModal] = useState(false);
  const [productModal, setProductModal] = useState(false);

  // Login gateway state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Staff form
  const [staffForm, setStaffForm] = useState({ username: '', email: '', password: '', role: 'employee' });
  // Product form
  const [productForm, setProductForm] = useState({ name: '', price: '', tag: '', description: '', imageUrl: '' });

  // Check if needs login gateway
  const needsLogin = !isAuthenticated || role !== 'admin';

  // Fetch analytics when tab activates
  useEffect(() => {
    if (activeTab === 'analytics' && !analyticsData && isAuthenticated && role === 'admin') {
      adminAPI.getAnalytics().then(setAnalyticsData).catch(console.error);
    }
  }, [activeTab, analyticsData, isAuthenticated, role]);

  const handleGatewayLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    const res = await login(loginEmail, loginPass);
    if (res.success && res.user.role === 'admin') {
      window.location.reload();
    } else {
      setLoginError(res.success ? 'Unauthorized: Admin privileges required.' : res.message);
      if (res.success) logout();
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    const success = await dashboard.createUser(staffForm);
    if (success) {
      showToast('Staff account created!');
      setStaffModal(false);
      setStaffForm({ username: '', email: '', password: '', role: 'employee' });
    } else {
      showToast('Failed to create staff account');
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    const imageFile = document.getElementById('admin-product-image-file')?.files[0];
    let imageUrl = productForm.imageUrl || 'https://via.placeholder.com/200';
    if (imageFile) {
      imageUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(imageFile);
      });
    }
    const success = await dashboard.createProduct({ ...productForm, price: parseFloat(productForm.price), imageUrl });
    if (success) {
      showToast('Design published!');
      setProductModal(false);
      setProductForm({ name: '', price: '', tag: '', description: '', imageUrl: '' });
    }
  };

  // Login Gateway
  if (needsLogin) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0f172a' }}>
        <div className="glass p-10 rounded-2xl w-full max-w-[420px] text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-5" style={{ color: 'var(--color-primary)' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <h2 className="text-2xl font-bold mb-2">Admin Portal</h2>
          <p className="text-text-dim mb-8">Authorized personnel only</p>
          <form onSubmit={handleGatewayLogin} className="flex flex-col gap-4">
            <input type="text" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Admin Credential" required className="input-field" />
            <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="Passcode" required className="input-field" />
            {loginError && <p className="text-sm text-left" style={{ color: '#ef4444' }}>{loginError}</p>}
            <button type="submit" className="btn-primary w-full !py-4">Initialize Link</button>
          </form>
          <a href="/" className="block mt-6 text-text-dim text-sm no-underline">← Return to Public Storefront</a>
        </div>
      </div>
    );
  }

  const inventory = dashboard.inventory || [];
  const orders = dashboard.orders || [];
  const users = dashboard.users || [];

  const navItems = [
    { id: 'overview', label: 'Overview', icon: <OverviewIcon />, active: activeTab === 'overview', onClick: () => setActiveTab('overview') },
    { id: 'inventory', label: 'Inventory', icon: <InventoryIcon />, active: activeTab === 'inventory', onClick: () => setActiveTab('inventory') },
    { id: 'production', label: 'Production', icon: <ProductionIcon />, active: activeTab === 'production', onClick: () => setActiveTab('production') },
    { id: 'staffing', label: 'Staffing', icon: <StaffIcon />, active: activeTab === 'staffing', onClick: () => setActiveTab('staffing') },
    { id: 'analytics', label: 'Analytics', icon: <AnalyticsIcon />, active: activeTab === 'analytics', onClick: () => setActiveTab('analytics') },
    { id: 'history', label: 'History', icon: <HistoryIcon />, active: activeTab === 'history', onClick: () => setActiveTab('history') },
  ];

  return (
    <DashboardLayout navItems={navItems} syncing={dashboard.syncing} requiredRole="admin"
      profile={{ avatar: 'AD', name: user?.username || 'Admin', role: 'System Manager' }}>

      {/* Overview */}
      {activeTab === 'overview' && (
        <section className="p-10 animate-fade">
          <header className="flex justify-between items-center mb-10">
            <div>
              <h1 className="text-3xl font-bold">Admin Console</h1>
              <p className="text-text-dim">System health is optimal today.</p>
            </div>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {inventory.slice(0, 2).map(inv => (
              <div key={inv.item} className="glass p-6">
                <span className="text-text-dim text-sm uppercase tracking-wider">{inv.item}</span>
                <span className="text-3xl font-bold block mt-2" style={{ color: 'var(--color-primary)' }}>{inv.count} {inv.unit}</span>
              </div>
            ))}
            <div className="glass p-6">
              <span className="text-text-dim text-sm uppercase tracking-wider">Revenue (MTD)</span>
              <span className="text-3xl font-bold block mt-2" style={{ color: 'var(--color-primary)' }}>
                ${((dashboard.analytics?.revenue || 0) / 1000).toFixed(1)}k
              </span>
            </div>
          </div>
          <OrderTable orders={orders} onUpdate={dashboard.updateOrder} onBatchUpdate={dashboard.batchUpdateOrders} />
        </section>
      )}

      {/* Inventory / Product Management */}
      {activeTab === 'inventory' && (
        <section className="p-10 animate-fade">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Product Management</h1>
            <button onClick={() => setProductModal(true)} className="btn-primary">+ Create New Design</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {dashboard.products.map(p => (
              <div key={p._id} className="glass p-4 flex items-center gap-5 animate-fade">
                <div className="w-20 h-20 rounded-xl flex-shrink-0" style={{
                  backgroundImage: `url('${p.imageUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center',
                  background: p.imageUrl ? `url('${p.imageUrl}') center/cover` : 'rgba(255,255,255,0.05)',
                }} />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-lg truncate">{p.name}</h4>
                  <p className="text-text-dim text-sm">{p.tag} • ${parseFloat(p.price).toFixed(2)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => dashboard.deleteProduct(p._id)} className="p-2 rounded-lg border-none cursor-pointer"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Production */}
      {activeTab === 'production' && (
        <section className="p-10 animate-fade">
          <h1 className="text-3xl font-bold mb-6">Live Production</h1>
          <div className="glass p-10 text-center text-text-dim"><p>Detailed machine metrics and schedules.</p></div>
        </section>
      )}

      {/* Staffing */}
      {activeTab === 'staffing' && (
        <section className="p-10 animate-fade">
          <header className="flex justify-between items-center mb-10">
            <div>
              <h1 className="text-3xl font-bold">Staff Management</h1>
              <p className="text-text-dim">Manage personnel access.</p>
            </div>
            <button onClick={() => setStaffModal(true)} className="btn-primary">+ Create Staff Account</button>
          </header>
          <div className="glass p-6 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Username', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                    <th key={h} className="text-left p-3 text-text-dim font-normal border-b" style={{ borderColor: 'var(--color-border-glass)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? <tr><td colSpan="5" className="text-center text-text-dim p-10">No personnel data.</td></tr> : users.map(u => (
                  <tr key={u._id} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <td className="p-4 font-medium">{u.username}</td>
                    <td className="p-4 text-text-dim">{u.email}</td>
                    <td className="p-4"><span className="status-pill" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' }}>{u.role}</span></td>
                    <td className="p-4 text-text-dim text-sm">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="p-4">
                      <button onClick={() => dashboard.deleteUser(u._id)} className="text-sm bg-transparent border-none cursor-pointer" style={{ color: '#ef4444' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Analytics */}
      {activeTab === 'analytics' && (
        <section className="p-10 animate-fade">
          <h1 className="text-3xl font-bold mb-2">Production Analytics</h1>
          <p className="text-text-dim mb-8">Real-time metrics and historical performance data.</p>
          {!analyticsData ? <p className="text-text-dim text-center py-20">Loading analytics...</p> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Order Trends */}
              <div className="glass p-6">
                <h3 className="font-semibold mb-5">Order & Revenue Trends</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={(analyticsData.orderTrends || []).map(t => ({ name: `${t._id.month}/${t._id.year}`, orders: t.count, revenue: t.revenue }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} /><YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} />
                    <Line type="monotone" dataKey="orders" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} />
                    <Line type="monotone" dataKey="revenue" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7' }} />
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Status Breakdown */}
              <div className="glass p-6">
                <h3 className="font-semibold mb-5">Order Status Breakdown</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={(analyticsData.statusDistribution || []).map(s => ({ name: s._id, value: s.count }))}
                      cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {(analyticsData.statusDistribution || []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Top Ordered */}
              <div className="glass p-6">
                <h3 className="font-semibold mb-5">Top Ordered Designs</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={(analyticsData.topOrdered || []).map(t => ({ name: t._id, count: t.count }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} /><YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Traffic */}
              <div className="glass p-6">
                <h3 className="font-semibold mb-5">Site Traffic (30 Days)</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={(analyticsData.trafficStats || []).map(t => ({ date: t._id, visits: t.visits }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} /><YAxis stroke="#94a3b8" fontSize={12}/>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} />
                    <Area type="monotone" dataKey="visits" stroke="#a855f7" fill="rgba(168,85,247,0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Order History */}
      {activeTab === 'history' && (
        <section className="p-10 animate-fade">
          <h1 className="text-3xl font-bold mb-6">Order History</h1>
          <OrderTable orders={orders} onUpdate={dashboard.updateOrder} onBatchUpdate={dashboard.batchUpdateOrders}
            showCheckboxes={false} showActions={false} filterCompleted={true} />
        </section>
      )}

      {/* Staff Modal */}
      <Modal isOpen={staffModal} onClose={() => setStaffModal(false)} title="Create Staff Account">
        <form onSubmit={handleCreateStaff} className="flex flex-col gap-5">
          <div><label className="block mb-2 text-text-dim text-sm">Username</label>
            <input type="text" value={staffForm.username} onChange={(e) => setStaffForm({...staffForm, username: e.target.value})} required className="input-field" /></div>
          <div><label className="block mb-2 text-text-dim text-sm">Email</label>
            <input type="email" value={staffForm.email} onChange={(e) => setStaffForm({...staffForm, email: e.target.value})} required className="input-field" /></div>
          <div><label className="block mb-2 text-text-dim text-sm">Password</label>
            <input type="password" value={staffForm.password} onChange={(e) => setStaffForm({...staffForm, password: e.target.value})} className="input-field" /></div>
          <div><label className="block mb-2 text-text-dim text-sm">Role</label>
            <select value={staffForm.role} onChange={(e) => setStaffForm({...staffForm, role: e.target.value})} className="input-field">
              <option value="employee">Production Employee</option>
              <option value="admin">System Administrator</option>
              <option value="customer">External Client</option>
            </select></div>
          <button type="submit" className="btn-primary w-full !py-4">Establish Personnel Account</button>
        </form>
      </Modal>

      {/* Product Modal */}
      <Modal isOpen={productModal} onClose={() => setProductModal(false)} title="Create New Design">
        <form onSubmit={handleCreateProduct} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block mb-2 text-text-dim text-sm">Design Name</label>
              <input type="text" value={productForm.name} onChange={(e) => setProductForm({...productForm, name: e.target.value})} required className="input-field" /></div>
            <div><label className="block mb-2 text-text-dim text-sm">Price ($)</label>
              <input type="number" step="0.01" value={productForm.price} onChange={(e) => setProductForm({...productForm, price: e.target.value})} required className="input-field" /></div>
          </div>
          <div><label className="block mb-2 text-text-dim text-sm">Tag</label>
            <input type="text" value={productForm.tag} onChange={(e) => setProductForm({...productForm, tag: e.target.value})} className="input-field" /></div>
          <div><label className="block mb-2 text-text-dim text-sm">Description</label>
            <textarea value={productForm.description} onChange={(e) => setProductForm({...productForm, description: e.target.value})} className="input-field !min-h-[80px]" /></div>
          <div><label className="block mb-2 text-text-dim text-sm">Image</label>
            <input type="file" id="admin-product-image-file" accept="image/*" className="text-white" /></div>
          <button type="submit" className="btn-primary w-full !py-4">Publish to Catalog</button>
        </form>
      </Modal>

      <StitchAI orders={orders} />
    </DashboardLayout>
  );
}
