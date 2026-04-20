export default function SyncIndicator({ syncing }) {
  return (
    <div
      className={`fixed top-5 right-5 z-[1000] w-11 h-11 rounded-full flex items-center justify-center transition-all duration-500 pointer-events-none ${
        syncing ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
      }`}
      style={{
        background: 'rgba(30, 41, 59, 0.6)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--color-border-glass)',
        boxShadow: '0 0 20px rgba(0,0,0,0.3)',
        animation: syncing ? 'pulse-sync 2s infinite ease-in-out' : 'none',
        color: 'var(--color-primary)',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.5 19c2.5 0 4.5-2 4.5-4.5 0-2.3-1.7-4.2-4-4.5C17.1 6.5 14 4 10.5 4a7 7 0 0 0-6.8 5.4C2 10.1 1 12.2 1 14.5c0 3 2.5 5.5 5.5 5.5" />
      </svg>
    </div>
  );
}
