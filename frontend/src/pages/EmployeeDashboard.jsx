import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../hooks/useDashboard';
import { useToast } from '../components/ui/Toast';
import DashboardLayout from '../components/layout/DashboardLayout';
import OrderTable from '../components/OrderTable';
import Modal from '../components/ui/Modal';
import StitchAI from '../components/StitchAI';

const WorkbenchIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
const OrdersIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const ProductsIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>;
const HistoryIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-4 4"/></svg>;
const SupportIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;

export default function EmployeeDashboard() {
  const { user, login, logout, isAuthenticated, role } = useAuth();
  const dashboard = useDashboard();
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState('workbench');
  const [productModal, setProductModal] = useState(false);
  const [machineStatus, setMachineStatus] = useState('running');

  // Login gateway
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [productForm, setProductForm] = useState({ name: '', price: '', tag: '', description: '' });

  const needsLogin = !isAuthenticated || role !== 'employee';

  const handleGatewayLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    const res = await login(loginEmail, loginPass);
    if (res.success && res.user.role === 'employee') {
      window.location.reload();
    } else {
      setLoginError(res.success ? 'Unauthorized: Employee privileges required.' : res.message);
      if (res.success) logout();
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    const imageFile = document.getElementById('emp-product-image-file')?.files[0];
    let imageUrl = 'https://via.placeholder.com/200';
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
      setProductForm({ name: '', price: '', tag: '', description: '' });
    }
  };

  if (needsLogin) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0f172a' }}>
        <div className="glass p-10 rounded-2xl w-full max-w-[420px] text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-5" style={{ color: 'var(--color-primary)' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <h2 className="text-2xl font-bold mb-2">Staff Terminal</h2>
          <p className="text-text-dim mb-8">Employee identification required</p>
          <form onSubmit={handleGatewayLogin} className="flex flex-col gap-4">
            <input type="text" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Staff ID / Email" required className="input-field" />
            <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="Passcode" required className="input-field" />
            {loginError && <p className="text-sm text-left" style={{ color: '#ef4444' }}>{loginError}</p>}
            <button type="submit" className="btn-primary w-full !py-4">Authenticate</button>
          </form>
          <a href="/" className="block mt-6 text-text-dim text-sm no-underline">← Return to Public Storefront</a>
        </div>
      </div>
    );
  }

  const orders = dashboard.orders || [];
  const products = dashboard.products || [];

  const navItems = [
    { id: 'workbench', label: 'Workbench', icon: <WorkbenchIcon />, active: activeTab === 'workbench', onClick: () => setActiveTab('workbench') },
    { id: 'orders', label: 'Order Queue', icon: <OrdersIcon />, active: activeTab === 'orders', onClick: () => setActiveTab('orders') },
    { id: 'products', label: 'Designs', icon: <ProductsIcon />, active: activeTab === 'products', onClick: () => setActiveTab('products') },
    { id: 'history', label: 'History', icon: <HistoryIcon />, active: activeTab === 'history', onClick: () => setActiveTab('history') },
    { id: 'support', label: 'Support', icon: <SupportIcon />, active: activeTab === 'support', onClick: () => setActiveTab('support') },
  ];

  return (
    <DashboardLayout navItems={navItems} syncing={dashboard.syncing} requiredRole="employee"
      profile={{ avatar: user?.username?.charAt(0).toUpperCase() || 'OP', name: user?.username || 'Operator', role: 'Production Staff' }}>

      {/* Workbench */}
      {activeTab === 'workbench' && (
        <section className="p-10 animate-fade">
          <header className="mb-10">
            <h1 className="text-3xl font-bold">Workbench: Station B</h1>
            <p className="text-text-dim">Good morning, {user?.username}. You have {orders.filter(o => o.status === 'In Queue').length} tasks in queue.</p>
          </header>

          <h2 className="text-xl font-semibold mb-5">Current Active Job</h2>
          <div className="glass p-8 mb-10">
            <div className="flex justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-lg">Corporate Polos - Nike Team</h3>
                <p className="text-text-dim text-sm">Design: Swoosh_Gold_v2.dst</p>
              </div>
              <span className="status-pill" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' }}>
                {machineStatus === 'running' ? 'Running: Head 1-4' : 'EMERGENCY STOPPED'}
              </span>
            </div>
            <div className="h-2 rounded overflow-hidden mt-5 mb-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded" style={{ width: '65%', background: 'linear-gradient(to right, var(--color-primary), var(--color-secondary))', transition: 'width 1s' }} />
            </div>
            <p className="text-right text-text-dim text-sm">6,500 / 10,000 stitches</p>

            <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <p className="font-semibold mb-2">Thread Configuration:</p>
              <div className="flex justify-between mb-1"><span>Needle 1: Gold Metallic</span><span>Madeira 1024</span></div>
              <div className="flex justify-between"><span>Needle 2: Deep Navy</span><span>Madeira 1103</span></div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setMachineStatus(s => s === 'running' ? 'STOPPED' : 'running')}
                className="btn-primary" style={{ background: 'var(--color-accent)' }}>
                {machineStatus === 'running' ? 'Emergency Stop' : 'Resume Machine'}
              </button>
              <button className="btn-primary">Log Maintenance</button>
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-5">Machine Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="glass p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />
                <span className="text-sm">Machine #1 (Happy 12-Head)</span>
              </div>
              <p className="text-text-dim text-sm">Running: Batch #42A</p>
            </div>
            <div className="glass p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f59e0b' }} />
                <span className="text-sm">Machine #2 (Brother Single)</span>
              </div>
              <p className="text-text-dim text-sm">Status: Idle / Ready</p>
            </div>
          </div>
        </section>
      )}

      {/* Order Queue */}
      {activeTab === 'orders' && (
        <section className="p-10 animate-fade">
          <h1 className="text-3xl font-bold mb-6">Active Order Queue</h1>
          <OrderTable orders={orders} onUpdate={dashboard.updateOrder} onBatchUpdate={dashboard.batchUpdateOrders} />
        </section>
      )}

      {/* Manage Designs */}
      {activeTab === 'products' && (
        <section className="p-10 animate-fade">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Manage Designs</h1>
            <button onClick={() => setProductModal(true)} className="btn-primary">+ Create New Design</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map(p => (
              <div key={p._id} className="glass p-4 flex items-center gap-5 animate-fade">
                <div className="w-20 h-20 rounded-xl flex-shrink-0" style={{
                  background: p.imageUrl ? `url('${p.imageUrl}') center/cover` : 'rgba(255,255,255,0.05)',
                }} />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold truncate">{p.name}</h4>
                  <p className="text-text-dim text-sm">{p.tag} • ${parseFloat(p.price).toFixed(2)}</p>
                </div>
                <button onClick={() => dashboard.deleteProduct(p._id)} className="p-2 rounded-lg border-none cursor-pointer"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            ))}
          </div>
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

      {/* Support */}
      {activeTab === 'support' && (
        <section className="p-10 animate-fade">
          <h1 className="text-3xl font-bold mb-6">Support Helpdesk</h1>
          <div className="glass p-10 text-center text-text-dim"><p>Contact tech support or view machine manuals.</p></div>
        </section>
      )}

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
            <input type="file" id="emp-product-image-file" accept="image/*" className="text-white" /></div>
          <button type="submit" className="btn-primary w-full !py-4">Publish to Catalog</button>
        </form>
      </Modal>

      <StitchAI orders={orders} />
    </DashboardLayout>
  );
}
