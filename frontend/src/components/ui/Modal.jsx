export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass animate-fade w-[90%] max-w-[500px] p-10 relative">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} className="text-text-dim hover:text-white text-xl cursor-pointer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
