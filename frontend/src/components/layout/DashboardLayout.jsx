import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import SyncIndicator from '../ui/SyncIndicator';

export default function DashboardLayout({ navItems, profile, children, syncing = false, requiredRole }) {
  const { isAuthenticated, role, logout } = useAuth();

  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (requiredRole && role !== requiredRole) {
    const routes = { admin: '/admin', employee: '/employee', customer: '/dashboard' };
    return <Navigate to={routes[role] || '/'} replace />;
  }

  return (
    <div className="flex min-h-screen w-full" style={{ paddingTop: '0' }}>
      <Sidebar navItems={navItems} profile={profile} onLogout={logout} />
      <main className="flex-1 h-screen overflow-y-auto" style={{ background: 'radial-gradient(circle at top right, rgba(99,102,241,0.05), transparent)' }}>
        {children}
      </main>
      <SyncIndicator syncing={syncing} />

      <style>{`
        @media (max-width: 768px) {
          .flex.min-h-screen { padding-top: 70px; display: block !important; }
          main { height: auto !important; overflow: visible !important; }
        }
      `}</style>
    </div>
  );
}
