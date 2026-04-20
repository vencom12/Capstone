export default function ProductCard({ product, isFavorite, onToggleFavorite, onAddToBasket, showQuantity = true }) {
  return (
    <div className="product-card glass animate-fade">
      {/* Image */}
      <div
        className="h-[180px] relative flex items-center justify-center"
        style={{
          backgroundImage: `url('${product.imageUrl}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          background: product.imageUrl && product.imageUrl !== 'https://via.placeholder.com/200'
            ? `url('${product.imageUrl}') center/cover`
            : 'rgba(255,255,255,0.05)',
        }}
      >
        {!product.imageUrl || product.imageUrl === 'https://via.placeholder.com/200' ? (
          <span className="text-text-dim text-xs tracking-widest font-semibold">STITCH PREVIEW</span>
        ) : null}

        {/* Favorite toggle */}
        {onToggleFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(product._id, isFavorite); }}
            className="absolute top-3 right-3 border-none p-2 rounded-full cursor-pointer transition-transform hover:scale-110"
            style={{
              background: 'rgba(0,0,0,0.3)',
              backdropFilter: 'blur(4px)',
              color: isFavorite ? '#ef4444' : 'white',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        )}
      </div>

      {/* Details */}
      <div className="p-6">
        <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-md mb-3"
          style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--color-primary)' }}>
          {product.tag}
        </span>
        <div className="flex justify-between items-baseline mb-2">
          <h3 className="font-semibold text-lg">{product.name}</h3>
          <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>
            ${parseFloat(product.price).toFixed(2)}
          </span>
        </div>
        <p className="text-text-dim text-sm leading-relaxed mb-5">
          {product.description || 'Professional embroidery design.'}
        </p>
        {onAddToBasket && (
          <div className="flex gap-2">
            {showQuantity && (
              <input
                type="number"
                min="1"
                defaultValue="1"
                className="input-field w-[60px] text-center !p-2 !rounded-lg"
                id={`qty-${product._id}`}
              />
            )}
            <button
              onClick={() => {
                const qtyEl = document.getElementById(`qty-${product._id}`);
                const qty = qtyEl ? parseInt(qtyEl.value) || 1 : 1;
                onAddToBasket(product, qty);
              }}
              className="btn-primary flex-1 !py-3 !text-sm !rounded-xl"
            >
              Add to Basket
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
