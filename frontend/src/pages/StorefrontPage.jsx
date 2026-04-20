import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBasket } from '../hooks/useBasket';
import { useDashboard } from '../hooks/useDashboard';
import { useToast } from '../components/ui/Toast';
import ProductCard from '../components/ProductCard';
import BasketDrawer from '../components/BasketDrawer';
import SyncIndicator from '../components/ui/SyncIndicator';

export default function StorefrontPage() {
  const { user, isAuthenticated, login, logout } = useAuth();
  const { products, favorites, loading, syncing, toggleFavorite, createOrder } = useDashboard();
  const basket = useBasket();
  const showToast = useToast();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [search, setSearch] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    const result = await login(loginEmail, loginPass);
    if (result.success) {
      setAuthOpen(false);
      const role = result.user.role;
      if (role === 'admin') navigate('/admin');
      else if (role === 'employee') navigate('/employee');
      else navigate('/dashboard');
    } else {
      setLoginError(result.message || 'Invalid credentials.');
    }
  };

  const handleAddToBasket = (product, qty) => {
    if (!isAuthenticated) {
      setAuthOpen(true);
      showToast('Please login to add items to your basket.');
      return;
    }
    basket.addItem(product, qty);
    showToast(`Added ${qty} of ${product.name} to basket`);
    setDrawerOpen(true);
  };

  const handleToggleFav = (productId, isFav) => {
    if (!isAuthenticated) {
      setAuthOpen(true);
      showToast('Please login to save favorites.');
      return;
    }
    toggleFavorite(productId, isFav);
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
    const success = await createOrder(orderData);
    if (success) {
      basket.clear();
      setDrawerOpen(false);
      showToast('Order placed successfully!');
    } else {
      showToast('Checkout failed. Please try again.');
    }
  };

  const favIds = (favorites || []).map(f => f._id);
  const filteredProducts = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.tag.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className={`fixed top-0 w-full z-[1000] transition-all duration-300 ${
        scrolled ? 'py-3' : 'py-5'
      }`} style={{
        background: scrolled ? 'rgba(15, 23, 42, 0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--color-border-glass)' : 'none',
      }}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between gap-4">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-3 no-underline">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--color-primary)' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <h1 className="text-xl font-bold text-white">Stitch-Opt</h1>
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-lg relative hidden sm:block">
            <input type="text" placeholder="Search premium embroidery designs..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="input-field !rounded-full !pl-5 !pr-12" />
            <svg className="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {!isAuthenticated ? (
              <>
                <button onClick={() => setAuthOpen(true)} className="px-4 py-2 rounded-xl text-sm font-medium text-text-dim bg-transparent border border-border-glass cursor-pointer hover:bg-white/5 transition-all">Login</button>
                <Link to="/register" className="btn-primary !py-2 !px-4 !text-sm">Register</Link>
              </>
            ) : (
              <>
                <Link to={user.role === 'admin' ? '/admin' : user.role === 'employee' ? '/employee' : '/dashboard'}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium no-underline text-text-dim hover:bg-white/5 transition-all">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' }}>
                    {user.username?.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline">{user.username}</span>
                </Link>
                <button onClick={logout} className="px-3 py-2 rounded-xl text-sm font-medium text-text-dim bg-transparent border-none cursor-pointer hover:bg-white/5 transition-all">Logout</button>
              </>
            )}
            {/* Cart icon */}
            <button onClick={() => setDrawerOpen(true)} className="relative p-2.5 cursor-pointer bg-transparent border-none text-text-dim hover:text-white transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              <span className="absolute -top-1 -right-1 text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: 'var(--color-primary)', fontSize: '0.7rem' }}>{basket.count}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-36 pb-16 text-center animate-fade">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">Intelligence in Every Stitch.</h2>
        <p className="text-text-dim max-w-xl mx-auto mb-10 text-lg">
          Explore our curated catalog of professional embroidery designs optimized for high-speed production.
        </p>
      </section>

      {/* Product Grid */}
      <main className="max-w-7xl mx-auto px-6 pb-20">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="glass rounded-3xl overflow-hidden">
                <div className="skeleton h-[180px]" />
                <div className="p-6 flex flex-col gap-3">
                  <div className="skeleton h-4 w-16" />
                  <div className="skeleton h-5 w-3/4" />
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-10 w-full mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 text-text-dim">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-4 opacity-30">
              <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7l-3 5H5l-3-5"/>
            </svg>
            <p>{search ? 'No designs matching your search.' : 'No designs published yet.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map(p => (
              <ProductCard key={p._id} product={p} isFavorite={favIds.includes(p._id)}
                onToggleFavorite={handleToggleFav} onAddToBasket={handleAddToBasket} />
            ))}
          </div>
        )}
      </main>

      {/* Basket Drawer */}
      <BasketDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)}
        items={basket.items} total={basket.total}
        onUpdateQuantity={basket.updateQuantity} onRemove={basket.removeItem}
        onCheckout={handleCheckout} isAuthenticated={isAuthenticated} />

      {/* Auth Modal */}
      {authOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setAuthOpen(false); }}>
          <div className="glass animate-fade w-[90%] max-w-[420px] p-10">
            <button onClick={() => setAuthOpen(false)} className="absolute top-6 right-6 text-text-dim hover:text-white text-xl cursor-pointer bg-transparent border-none">✕</button>
            <h2 className="text-2xl font-bold mb-8">Secure Access</h2>
            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              <div>
                <label className="block mb-2 text-text-dim text-sm">Username / Email</label>
                <input type="text" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="e.g. user@stitchopt.com" required className="input-field" />
              </div>
              <div>
                <label className="block mb-2 text-text-dim text-sm">Password</label>
                <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••••" required className="input-field" />
              </div>
              {loginError && <p className="text-sm" style={{ color: '#ef4444' }}>{loginError}</p>}
              <button type="submit" className="btn-primary w-full !py-4">Establish Link</button>
              <p className="text-center text-text-dim text-sm mt-2">
                No account? <Link to="/register" className="font-semibold no-underline" style={{ color: 'var(--color-primary)' }}>Create one here</Link>
              </p>
              <div className="pt-5 mt-2 flex justify-around text-sm" style={{ borderTop: '1px solid var(--color-border-glass)' }}>
                <span className="text-text-dim font-semibold">Staff Modules:</span>
                <Link to="/admin" className="no-underline" style={{ color: 'var(--color-primary)' }}>Admin</Link>
                <Link to="/employee" className="no-underline" style={{ color: 'var(--color-primary)' }}>Employee</Link>
              </div>
            </form>
          </div>
        </div>
      )}

      <SyncIndicator syncing={syncing} />
    </div>
  );
}
