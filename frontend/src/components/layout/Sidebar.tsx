'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { User } from '@/types';

// ─── Icons (inline SVG to avoid extra deps) ───────────────────────────────────
const Icons = {
  store:     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-9H5.4M7 13L5.4 5M7 13l-2.3 2.3A1 1 0 006 17h12M17 17a2 2 0 100 4 2 2 0 000-4zM9 17a2 2 0 100 4 2 2 0 000-4z"/></svg>,
  orders:    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  favorites: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>,
  settings:  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  inventory: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>,
  users:     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197"/></svg>,
  analytics: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
};

// ─── Role-based nav config ────────────────────────────────────────────────────
const navConfig: Record<string, { href: string; label: string; icon: React.ReactNode }[]> = {
  customer: [
    { href: '/dashboard',          label: 'Shop',       icon: Icons.store },
    { href: '/dashboard/orders',   label: 'My Orders',  icon: Icons.orders },
    { href: '/dashboard/favorites',label: 'Favorites',  icon: Icons.favorites },
    { href: '/dashboard/settings', label: 'Settings',   icon: Icons.settings },
  ],
  admin: [
    { href: '/admin',              label: 'Orders',     icon: Icons.orders },
    { href: '/admin/inventory',    label: 'Inventory',  icon: Icons.inventory },
    { href: '/admin/staff',        label: 'Staff',      icon: Icons.users },
    { href: '/admin/analytics',    label: 'Analytics',  icon: Icons.analytics },
  ],
  employee: [
    { href: '/employee',           label: 'Order Queue',icon: Icons.orders },
    { href: '/employee/inventory', label: 'Inventory',  icon: Icons.inventory },
  ],
};

interface SidebarProps {
  user: User;
  onLogout: () => void;
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const links = navConfig[user.role] ?? [];

  return (
    <aside className="glass-card h-full flex flex-col p-4 gap-2 min-w-[220px]">
      {/* Logo */}
      <Link href="/" className="px-2 py-4 mb-2 block group">
        <span className="text-2xl font-bold gradient-text tracking-tight group-hover:opacity-80 transition-opacity">StitchOpt</span>
        <div className="text-xs text-slate-500 mt-0.5 capitalize">{user.role} Portal</div>
      </Link>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 flex-1">
        {links.map(link => {
          const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          return (
            <Link key={link.href} href={link.href} className={active ? 'nav-link-active' : 'nav-link'}>
              {link.icon}
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="border-t border-white/5 pt-4 mt-2">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-indigo-500/30 border border-indigo-500/40 flex items-center justify-center text-sm font-bold text-indigo-300">
            {user.username?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-semibold text-white truncate">{user.username}</div>
            <div className="text-xs text-slate-500 capitalize">{user.role}</div>
          </div>
        </div>
        <button onClick={onLogout} className="nav-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );
}
