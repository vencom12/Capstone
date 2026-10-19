'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import Link from 'next/link';

interface EmployeeSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onMobileToggle?: () => void;
}

export default function EmployeeSidebar({ activeTab, setActiveTab, onMobileToggle }: EmployeeSidebarProps) {
  const { user, logout } = useAuthStore();
  const { isSidebarOpen, setSidebarOpen } = useUIStore();
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [businessLogoUrl, setBusinessLogoUrl] = useState('');

  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get<any>('/api/customer/settings').then(res => {
        if (res && res.businessLogoUrl) setBusinessLogoUrl(res.businessLogoUrl);
      }).catch(() => {});
    });
  }, []);

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
    if (isLeftSwipe && window.innerWidth <= 650) {
      // For employee sidebar, it relies on local state in page.tsx if isMobilePanelOpen is used, 
      // but if we are standardizing, let's trigger the onMobileToggle callback if passed
      if (onMobileToggle) onMobileToggle();
      setSidebarOpen(false);
    }
  };

  const navItems = [
    {
      id: 'workbench', label: 'My Workbench', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
      )
    },
    {
      id: 'orders', label: 'Order Queue', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      )
    },
    {
      id: 'history', label: 'Order History', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M18 9l-5 5-4-4-4 4" /></svg>
      )
    },
    {
      id: 'support', label: 'Workshop Quality (QA)', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
      )
    },
    {
      id: 'settings', label: 'Settings', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      )
    }
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1999] hidden max-[650px]:block backdrop-blur-sm transition-opacity"
          onClick={() => {
            if (onMobileToggle) onMobileToggle();
            setSidebarOpen(false);
          }}
        />
      )}
      <aside
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="w-[260px] h-full bg-bg-sidebar backdrop-blur-[12px] border-r border-border-glass flex flex-col transition-all duration-300 max-[1100px]:w-[80px] max-[650px]:w-[280px] shrink-0 group z-[2000] overflow-y-auto"
      >
        {/* Header / Logo */}
        <div className="p-4 pt-5 pb-3 border-b border-border-glass/40 flex items-center justify-between shrink-0">
          <Link href="/employee" className="flex items-center gap-2.5 no-underline cursor-pointer min-w-0 min-[1101px]:group-hover:justify-start max-[1100px]:justify-center max-[650px]:justify-start">
            {businessLogoUrl ? (
              <img src={businessLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/10 shrink-0" />
            ) : (
              <div className="bg-primary w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 font-bold shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
            )}
            <span className="font-black text-[1.1rem] text-text-main tracking-tight max-[1100px]:hidden min-[1101px]:group-hover:block max-[650px]:!block truncate">
              Eds Towels &amp; Caps
            </span>
          </Link>

          {/* Close button for mobile drawer */}
          <button
            suppressHydrationWarning
            onClick={() => {
              if (onMobileToggle) onMobileToggle();
              setSidebarOpen(false);
            }}
            className="w-8 h-8 rounded-full bg-white/5 border border-border-glass text-text-dim hover:text-text-main hover:bg-white/10 hidden max-[650px]:flex items-center justify-center cursor-pointer transition-all shrink-0"
            aria-label="Close navigation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Navigation */}
        <ul className="list-none p-0 m-0 mt-4 flex flex-col px-3 gap-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setActiveTab(item.id)}
                className={`
                w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer
                transition-all duration-300 border font-medium text-[0.95rem]
                max-[1100px]:justify-center max-[1100px]:px-0 min-[1101px]:group-hover:justify-start min-[1101px]:group-hover:px-3 max-[650px]:justify-start max-[650px]:px-3
                ${activeTab === item.id
                    ? 'bg-primary text-white border-primary/40 font-semibold shadow-sm'
                    : 'bg-transparent text-text-dim border-transparent hover:bg-white/5 hover:text-text-main'}
              `}
              >
                <div className="shrink-0">{item.icon}</div>
                <span className="max-[1100px]:hidden min-[1101px]:group-hover:block max-[650px]:!block whitespace-nowrap">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* User Actions */}
        <div className="mt-auto p-3 pb-8 border-t border-border-glass flex flex-col gap-1">


          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-danger hover:bg-danger/10 transition-all duration-200 cursor-pointer max-[1100px]:justify-center min-[1101px]:group-hover:justify-start max-[650px]:justify-start"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            <span className="max-[1100px]:hidden min-[1101px]:group-hover:block max-[650px]:!block whitespace-nowrap text-[0.9rem] font-medium">Logout</span>
          </button>
        </div>
      </aside>

    </>
  );
}
