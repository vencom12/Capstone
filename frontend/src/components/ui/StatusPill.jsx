const STATUS_STYLES = {
  'In Queue': { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', border: '#fbbf24' },
  'Preparing Order': { bg: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', border: '#818cf8' },
  'In Transit': { bg: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '#60a5fa' },
  'Ready For Pick Up': { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '#22c55e' },
  'Order Delivered': { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '#22c55e' },
  'Completed': { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '#22c55e' },
  'Order Canceled': { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '#ef4444' },
};

export default function StatusPill({ status }) {
  const style = STATUS_STYLES[status] || { bg: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: 'rgba(255,255,255,0.1)' };

  return (
    <span
      className="status-pill"
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
    >
      {status}
    </span>
  );
}
