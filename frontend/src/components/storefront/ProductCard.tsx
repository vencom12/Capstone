'use client';

import Image from 'next/image';
import type { Product } from '@/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  onToggleFavorite?: (id: string) => void;
  isFavorite?: boolean;
}

export default function ProductCard({ product, onAddToCart, onToggleFavorite, isFavorite }: ProductCardProps) {
  return (
    <Card hover className="flex flex-col gap-4 overflow-hidden h-full group">
      {/* Image / Icon */}
      <div className="relative aspect-square rounded-lg bg-white/5 flex items-center justify-center text-5xl overflow-hidden">
        {product.imageUrl ? (
          <Image 
            src={product.imageUrl} 
            alt={product.name} 
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <span className="transition-transform duration-500 group-hover:scale-110">🧵</span>
        )}
        
        {/* Favorite Button */}
        {onToggleFavorite && (
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(product._id); }}
            className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md border transition-all duration-300
              ${isFavorite 
                ? 'bg-pink-500/20 border-pink-500/50 text-pink-500' 
                : 'bg-black/20 border-white/10 text-white/50 hover:text-white hover:border-white/30'}`}
          >
            <svg className="w-5 h-5" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
            </svg>
          </button>
        )}

        {/* View Count Badge */}
        {product.views !== undefined && (
          <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-black/40 backdrop-blur-md border border-white/5 text-[10px] text-slate-300 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            {product.views}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-white leading-snug group-hover:text-primary transition-colors">{product.name}</h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            {product.tag}
          </span>
        </div>
        <p className="text-xs text-slate-500 line-clamp-2 mt-1">{product.description}</p>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="text-xl font-bold gradient-text">₱{product.price.toLocaleString()}</span>
          <Button 
            size="sm" 
            onClick={() => onAddToCart(product)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}
