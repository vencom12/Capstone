'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBasketStore } from '@/stores/useBasketStore';
import { useUIStore } from '@/stores/useUIStore';
import Link from 'next/link';
import TermsAndPoliciesModal from '@/components/ui/TermsAndPoliciesModal';
import CustomerHelpModal from '@/components/dashboard/CustomerHelpModal';
import { getNotificationPermission, requestNotificationPermission } from '@/lib/pushNotifications';
import { showToast } from '@/components/ui/Toast';
import { applyTheme, getStoredTheme } from '@/lib/theme';

interface DashboardSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onMobileToggle?: () => void;
}

export default function DashboardSidebar({ 
  activeTab, 
  setActiveTab, 
  onMobileToggle
}: DashboardSidebarProps) {
  const { user, logout } = useAuthStore();
  const { isSidebarOpen, setSidebarOpen, isHelpOpen, setHelpOpen, isTermsOpen, setTermsOpen } = useUIStore();
  const basketCount = useBasketStore((s) => s.getCount());
  const [mounted, setMounted] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');
  const [pushStatus, setPushStatus] = useState<NotificationPermission>('default');

  useEffect(() => {
    setMounted(true);
    setPushStatus(getNotificationPermission());
    if (typeof document !== 'undefined') {
      const theme = getStoredTheme();
      setCurrentTheme(theme);
    }
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res && res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
      }).catch(() => {});
    });
  }, []);

  const handleTogglePush = async () => {
    const res = await requestNotificationPermission();
    setPushStatus(res);
    if (res === 'granted') {
      showToast('Push alerts enabled! You will receive instant order milestone notifications.', 'success');
    } else if (res === 'denied') {
      showToast('Notifications are blocked by your browser settings.', 'info');
    }
  };

  const toggleTheme = () => {
    if (typeof document === 'undefined') return;
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    setCurrentTheme(nextTheme);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    if (isLeftSwipe && window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  const closeMobileDrawer = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  // Primary desktop / wide screen nav items (Orders hub includes active tracking & past receipts)
  const desktopNavItems = [
    {
      id: 'basket', label: 'My Basket', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
      )
    },
    {
      id: 'tracking', label: 'My Orders', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
      )
    },
    {
      id: 'favs', label: 'My Favorites', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
      )
    }
  ];

  return (
    <>
      <aside
        className="hidden md:flex flex-col h-full bg-bg-sidebar backdrop-blur-[12px] border-r border-border-glass transition-all duration-300 shrink-0 z-[2000] w-[260px] max-[1100px]:w-[80px]"
      >
        {/* Header / Logo */}
        <div className="p-4 pt-5 pb-3 border-b border-border-glass/40 flex items-center justify-between shrink-0">
          <Link href="/" className="flex items-center gap-2.5 no-underline cursor-pointer min-w-0 max-[1100px]:justify-center">
            {businessLogoUrl ? (
              <img src={businessLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/10 shrink-0" />
            ) : (
              <div className="bg-primary w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 font-bold shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
            )}
            <span className="font-black text-[1.1rem] text-text-main tracking-tight max-[1100px]:hidden truncate">
              Stitch-Opt
            </span>
          </Link>
        </div>

        <div className="flex flex-col flex-1">
          {/* Return to Products Shop Button */}
          <div className="px-3 pt-3">
            <Link
              href="/#products-section"
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/25 hover:bg-primary hover:text-white text-primary font-bold text-xs transition-all no-underline cursor-pointer group max-[1100px]:justify-center max-[1100px]:px-0 shadow-sm"
              title="Browse Products"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-hover:-translate-x-0.5 shrink-0">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span className="max-[1100px]:hidden whitespace-nowrap">Products</span>
            </Link>
          </div>

          <ul className="list-none p-0 m-0 mt-3 flex flex-col px-3 gap-1">
            {desktopNavItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer
                  transition-all duration-300 border font-medium text-[0.95rem]
                  max-[1100px]:justify-center max-[1100px]:px-0
                  ${activeTab === item.id
                      ? 'bg-primary text-white border-primary/40 font-semibold shadow-sm'
                      : 'bg-transparent text-text-dim border-transparent hover:bg-white/5 hover:text-text-main'}
                `}
                >
                  <div className="shrink-0 relative">
                    {item.icon}
                    {item.id === 'basket' && mounted && basketCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-primary text-[0.6rem] text-white w-4 h-4 rounded-full flex items-center justify-center font-bold border border-bg-sidebar shadow-sm max-[1100px]:flex hidden">
                        {basketCount}
                      </span>
                    )}
                  </div>
                  <span className="max-[1100px]:hidden whitespace-nowrap flex-1 text-left">{item.label}</span>
                  {item.id === 'basket' && mounted && basketCount > 0 && (
                    <span className={`max-[1100px]:hidden text-[0.7rem] px-2 py-0.5 rounded-full font-bold ${
                      activeTab === 'basket' ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary border border-primary/30'
                    }`}>
                      {basketCount}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Desktop User Profile Footer */}
          <div className="mt-auto p-3 pb-8 border-t border-border-glass">
            <button
              onClick={() => setActiveTab('settings')}
              className={`
                w-full flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition-all duration-300
                max-[1100px]:justify-center
                ${activeTab === 'settings'
                  ? 'bg-primary/20 border-primary shadow-sm'
                  : 'bg-white/5 border-border-glass hover:bg-white/10'}
              `}
              title="Account Settings"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold shrink-0 relative">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-bg-sidebar border-2 border-bg-sidebar flex items-center justify-center">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </div>
              </div>
              <div className="flex flex-col overflow-hidden max-[1100px]:hidden">
                <span className="text-[0.9rem] font-bold text-text-main whitespace-nowrap truncate text-left">{user?.username || 'User'}</span>
                <span className="text-[0.7rem] text-text-dim text-left">Account Settings</span>
              </div>
            </button>

            <button
              onClick={() => setHelpOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 mt-2 rounded-xl text-text-dim hover:text-text-main hover:bg-white/5 transition-all duration-200 cursor-pointer max-[1100px]:justify-center"
              title="Help & FAQs"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary/80">
                <circle cx="12" cy="12" r="10"/><path d="9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span className="max-[1100px]:hidden whitespace-nowrap text-[0.82rem] font-medium">Help & FAQs</span>
            </button>

            <button
              onClick={() => setTermsOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-text-dim hover:text-text-main hover:bg-white/5 transition-all duration-200 cursor-pointer max-[1100px]:justify-center"
              title="Terms & Store Policies"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary/80">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="max-[1100px]:hidden whitespace-nowrap text-[0.82rem] font-medium">Terms & Policies</span>
            </button>


            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-danger hover:bg-danger/10 transition-all duration-200 cursor-pointer max-[1100px]:justify-center"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              <span className="max-[1100px]:hidden whitespace-nowrap text-[0.9rem] font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      <TermsAndPoliciesModal
        isOpen={isTermsOpen}
        onClose={() => setTermsOpen(false)}
      />

      <CustomerHelpModal
        isOpen={isHelpOpen}
        onClose={() => setHelpOpen(false)}
      />

    </>
  );
}
