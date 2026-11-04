'use client';

import { usePWAStore } from '@/stores/usePWAStore';

interface InstallAppButtonProps {
  variant?: 'icon' | 'pill' | 'menu-item' | 'header';
  className?: string;
  onAfterClick?: () => void;
}

export default function InstallAppButton({
  variant = 'pill',
  className = '',
  onAfterClick,
}: InstallAppButtonProps) {
  const { isInstalled, promptInstall } = usePWAStore();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    promptInstall();
    onAfterClick?.();
  };

  // If already running in standalone installed app, don't show the install CTA in header
  if (isInstalled && variant !== 'menu-item') {
    return null;
  }

  if (variant === 'menu-item') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-main hover:bg-white/10 no-underline transition-all cursor-pointer border-none bg-transparent text-left ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary shrink-0"
          >
            <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
            <path d="M12 18h.01" />
          </svg>
          <span className="truncate">
            {isInstalled ? 'App Installed' : 'Install App'}
          </span>
        </div>
        {!isInstalled && (
          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">
            PWA
          </span>
        )}
      </button>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`w-9 h-9 rounded-lg text-text-dim hover:text-text-main hover:bg-white/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0 border-none bg-transparent relative group ${className}`}
        title="Install App"
        aria-label="Install App"
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="group-hover:text-primary transition-colors"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
      </button>
    );
  }

  if (variant === 'header') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0 shadow-sm ${className}`}
        title="Install as App"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>Install App</span>
      </button>
    );
  }

  // Default pill variant
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/25 hover:bg-primary/90 active:scale-95 transition-all cursor-pointer ${className}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span>Install App</span>
    </button>
  );
}
