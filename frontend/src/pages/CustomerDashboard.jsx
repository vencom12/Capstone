import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../hooks/useDashboard';
import { useBasket } from '../hooks/useBasket';
import { useToast } from '../components/ui/Toast';
import DashboardLayout from '../components/layout/DashboardLayout';
import ProductCard from '../components/ProductCard';
import BasketDrawer from '../components/BasketDrawer';
import StatusPill from '../components/ui/StatusPill';
import { formatOrderDesign } from '../utils/formatters';

// SVG Icons
const ShopIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7l-3 5H5l-3-5"/></svg>;
const TrackIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const HeartIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
const SettingsIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const CartIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;

export default function CustomerDashboard() {
  const { user, updateProfile } = useAuth();
  const dashboard = useDashboard();
  const basket = useBasket();
  const showToast = useToast();
  const [activeTab, setActiveTab] = useState('shop');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [settingsName, setSettingsName] = useState(user?.username || '');
  const [settingsEmail, setSettingsEmail] = useState(user?.email || '');

  const favIds = (dashboard.favorites || []).map(f => f._id);

  const handleAddToBasket = (product, qty) => {
    basket.addItem(product, qty);
    showToast(`Added ${qty} of ${product.name} to basket`);
    setDrawerOpen(true);
  };

  const handleCheckout = async () => {
    if (basket.items.length === 0) return;
    const orderData = {
      orderId: `ORD-${Math.floor(Math.random() * 9000) + 1000}`,
      client: user?.username || 'Client',
      design: basket.items.map(i => `${i.name}${i.quantity > 1 ? ' ×' + i.quantity : ''}`).join(', '),
      items: basket.items,
      status: 'In Queue',
      progress: 0,
    };
    const success = await dashboard.createOrder(orderData);
    if (success) {
      basket.clear();
      setDrawerOpen(false);
      showToast('Order placed successfully!');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await updateProfile({ username: settingsName, email: settingsEmail });
      showToast('Profile updated successfully!');
    } catch (err) {
      showToast(err.message || 'Update failed');
    }
  };

  const filteredProducts = dashboard.products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.tag.toLowerCase().includes(search.toLowerCase())
  );

  const activeOrders = (dashboard.orders || []).filter(o => o.status !== 'Completed' && o.status !== 'Order Canceled' && o.status !== 'Order Delivered');

  const navItems = [
    { id: 'shop', label: 'Shop Designs', icon: <ShopIcon />, active: activeTab === 'shop', onClick: () => setActiveTab('shop') },
    { id: 'tracking', label: 'Order Tracking', icon: <TrackIcon />, active: activeTab === 'tracking', onClick: () => setActiveTab('tracking') },
    { id: 'favs', label: 'My Favorites', icon: <HeartIcon />, active: activeTab === 'favs', onClick: () => setActiveTab('favs') },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon />, active: activeTab === 'settings', onClick: () => setActiveTab('settings') },
    { id: 'cart', label: 'Cart', icon: <><CartIcon /><span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: 'var(--color-primary)', fontSize: '0.65rem' }}>{basket.count}</span></>, active: false, onClick: () => setDrawerOpen(true) },
  ];

  return (
    <DashboardLayout navItems={navItems} syncing={dashboard.syncing} requiredRole="customer"
      profile={{ avatar: user?.username?.charAt(0).toUpperCase(), name: user?.username, role: 'Customer' }}>

      {/* Shop Tab */}
      {activeTab === 'shop' && (
        <section className="p-10 animate-fade">
          <header className="flex justify-between items-center flex-wrap gap-5 mb-10">
            <div>
              <h1 className="text-3xl font-bold mb-2">Design Catalog</h1>
              <p className="text-text-dim">Select a professional design for your next project.</p>
            </div>
            <div className="glass flex items-center gap-3 px-6 py-3 rounded-2xl flex-1 max-w-[400px]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-dim"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Search designs..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent border-none text-white outline-none w-full text-sm" />
            </div>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map(p => (
              <ProductCard key={p._id} product={p} isFavorite={favIds.includes(p._id)}
                onToggleFavorite={(id, isFav) => dashboard.toggleFavorite(id, isFav)}
                onAddToBasket={handleAddToBasket} />
            ))}
          </div>
        </section>
      )}

      {/* Order Tracking Tab */}
      {activeTab === 'tracking' && (
        <section className="p-10 animate-fade">
          <h1 className="text-3xl font-bold mb-6">Order Tracking</h1>
          {activeOrders.length === 0 ? (
            <div className="text-center py-16 text-text-dim">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-4 opacity-30"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              <p>No active orders.</p>
            </div>
          ) : activeOrders.map(order => (
            <div key={order._id} className="glass p-8 mb-6">
              <div className="flex justify-between mb-5 flex-wrap gap-3">
                <div>
                  <h3 className="font-semibold mb-1">Order #{order.orderId}</h3>
                  <p className="text-text-dim text-sm">{formatOrderDesign(order)}</p>
                </div>
                <StatusPill status={order.status} />
              </div>
              <div className="h-2 rounded overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded transition-all duration-1000" style={{
                  width: `${order.progress || 0}%`,
                  background: 'var(--color-primary)',
                  boxShadow: '0 0 10px var(--color-primary-glow)',
                }} />
              </div>
              <p className="text-right text-text-dim text-sm">{order.progress || 0}% Processed</p>
            </div>
          ))}
        </section>
      )}

      {/* Favorites Tab */}
      {activeTab === 'favs' && (
        <section className="p-10 animate-fade">
          <h1 className="text-3xl font-bold mb-6">My Favorites</h1>
          {(dashboard.favorites || []).length === 0 ? (
            <div className="h-[300px] border-2 border-dashed rounded-3xl flex items-center justify-center text-text-dim text-center p-5"
              style={{ borderColor: 'var(--color-border-glass)' }}>
              <div>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-3" style={{ color: 'var(--color-accent)' }}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                <p>You haven't favorited any designs yet.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {dashboard.favorites.map(p => (
                <ProductCard key={p._id} product={p} isFavorite={true}
                  onToggleFavorite={(id) => dashboard.toggleFavorite(id, true)}
                  onAddToBasket={handleAddToBasket} showQuantity={false} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <section className="p-10 animate-fade">
          <h1 className="text-3xl font-bold mb-8">Settings</h1>
          <div className="glass p-8 max-w-[600px]">
            <div className="mb-6">
              <label className="block text-text-dim text-sm mb-2">Display Name</label>
              <input type="text" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} className="input-field" />
            </div>
            <div className="mb-6">
              <label className="block text-text-dim text-sm mb-2">Email Address</label>
              <input type="email" value={settingsEmail} onChange={(e) => setSettingsEmail(e.target.value)} className="input-field" />
            </div>
            <button onClick={handleSaveSettings} className="btn-primary">Save Changes</button>
          </div>
        </section>
      )}

      {/* Basket Drawer */}
      <BasketDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)}
        items={basket.items} total={basket.total}
        onUpdateQuantity={basket.updateQuantity} onRemove={basket.removeItem}
        onCheckout={handleCheckout} isAuthenticated={true} />
    </DashboardLayout>
  );
}
