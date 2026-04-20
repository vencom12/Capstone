export default function BasketDrawer({ isOpen, onClose, items, total, onUpdateQuantity, onRemove, onCheckout, isAuthenticated }) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/50" onClick={onClose} />
      )}

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-screen z-[10000] flex flex-col transition-transform duration-400"
        style={{
          width: '380px',
          maxWidth: '90vw',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(30px)',
          borderLeft: '1px solid var(--color-border-glass)',
          boxShadow: '-20px 0 50px rgba(0,0,0,0.5)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-8 border-b" style={{ borderColor: 'var(--color-border-glass)' }}>
          <h3 className="text-lg font-bold">Your Basket</h3>
          <button onClick={onClose} className="text-2xl cursor-pointer bg-transparent border-none text-text-dim hover:text-white">✕</button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-8">
          {items.length === 0 ? (
            <div className="text-center text-text-dim py-12">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-50">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              <p>Basket is empty</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div key={item.id} className="pb-3 mb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex justify-between text-left mb-2">
                    <span className="font-medium">{item.name}</span>
                    <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                      ${(parseFloat(item.price) * (item.quantity || 1)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex gap-1 items-center">
                      <button onClick={() => onUpdateQuantity(item.id, -1)}
                        className="px-2 py-1 rounded text-white text-sm cursor-pointer border"
                        style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'var(--color-border-glass)' }}>−</button>
                      <span className="min-w-[20px] text-center">{item.quantity || 1}</span>
                      <button onClick={() => onUpdateQuantity(item.id, 1)}
                        className="px-2 py-1 rounded text-white text-sm cursor-pointer border"
                        style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'var(--color-border-glass)' }}>+</button>
                    </div>
                    <button onClick={() => onRemove(item.id)}
                      className="text-sm bg-transparent border-none cursor-pointer underline"
                      style={{ color: '#ef4444' }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 pt-0">
          <div className="pt-6 border-t" style={{ borderColor: 'var(--color-border-glass)' }}>
            <div className="flex justify-between text-xl font-bold mb-5">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <button
              onClick={isAuthenticated ? onCheckout : undefined}
              className="btn-primary w-full !py-4 text-center"
              style={{
                opacity: !isAuthenticated || items.length === 0 ? 0.5 : 1,
                pointerEvents: !isAuthenticated || items.length === 0 ? 'none' : 'auto',
              }}
            >
              {isAuthenticated ? 'Checkout Now' : 'Login to Checkout'}
            </button>
            {!isAuthenticated && (
              <p className="text-center text-sm mt-3" style={{ color: 'var(--color-accent)' }}>
                Login required to place orders.
              </p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
