import { NavLink, useLocation } from 'react-router-dom';

const ShieldIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export default function Sidebar({ navItems, profile, onLogout }) {
  return (
    <aside className="sidebar-root">
      {/* Logo */}
      <NavLink to="/" className="flex items-center gap-4 px-5 py-3.5 rounded-2xl no-underline mb-6 hover:bg-white/5 transition-all">
        <ShieldIcon />
        <span className="text-xl font-bold text-white sidebar-text">Stitch-Opt</span>
      </NavLink>

      {/* Nav Links */}
      <ul className="flex flex-col gap-2 list-none mt-2 flex-1">
        {navItems.map((item) => (
          <li key={item.id}>
            <button
              onClick={item.onClick}
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl text-base font-medium cursor-pointer transition-all border-none ${
                item.active
                  ? 'text-white shadow-lg'
                  : 'text-text-dim hover:bg-white/5 hover:text-white hover:translate-x-1'
              }`}
              style={item.active ? {
                background: 'var(--color-primary)',
                boxShadow: '0 4px 15px var(--color-primary-glow)',
              } : { background: 'transparent' }}
            >
              {item.icon}
              <span className="sidebar-text">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* Profile Card */}
      {profile && (
        <div className="glass-subtle p-5 flex items-center gap-3 mt-auto sidebar-profile-card">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg text-white"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' }}>
            {profile.avatar}
          </div>
          <div className="flex flex-col sidebar-text">
            <span className="text-sm font-semibold text-text-main">{profile.name}</span>
            <span className="text-xs text-text-dim">{profile.role}</span>
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="mt-5">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl text-base font-medium cursor-pointer transition-all border-none bg-transparent hover:bg-white/5"
          style={{ color: 'var(--color-accent)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="sidebar-text">Logout</span>
        </button>
      </div>

      <style>{`
        .sidebar-root {
          width: 280px;
          flex-shrink: 0;
          padding: 40px 20px;
          display: flex;
          flex-direction: column;
          height: 100vh;
          position: sticky;
          top: 0;
          border-radius: 0;
          background: rgba(15, 23, 42, 0.4);
          border-right: 1px solid var(--color-border-glass);
          z-index: 100;
          overflow-y: auto;
        }
        /* Tablet: icon-only rail */
        @media (max-width: 1100px) and (min-width: 769px) {
          .sidebar-root { width: 70px; padding: 20px 8px; align-items: center; overflow: hidden; }
          .sidebar-text { display: none !important; }
          .sidebar-root ul button { justify-content: center; padding: 12px; gap: 0; }
          .sidebar-profile-card { display: none !important; }
        }
        /* Mobile: top bar */
        @media (max-width: 768px) {
          .sidebar-root {
            position: fixed; top: 0; left: 0; width: 100%; height: 70px;
            padding: 0; flex-direction: row; border-right: none;
            border-bottom: 1px solid var(--color-border-glass);
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(20px); z-index: 9999;
          }
          .sidebar-root > a:first-child { display: none !important; }
          .sidebar-profile-card { display: none !important; }
          .sidebar-root > div:last-child { display: none !important; }
          .sidebar-text { display: none !important; }
          .sidebar-root ul {
            flex-direction: row; margin: 0; padding: 0;
            justify-content: space-around; align-items: center; height: 100%;
          }
          .sidebar-root ul li { flex: 1; display: flex; justify-content: center; }
          .sidebar-root ul button {
            flex-direction: column; padding: 5px; gap: 2px;
            border-radius: 12px; width: 100%; justify-content: center;
          }
        }
      `}</style>
    </aside>
  );
}
