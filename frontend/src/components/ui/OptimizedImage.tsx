'use client';

import { useState } from 'react';
import { getOptimizedImageUrl } from '@/lib/imageOptimizer';

interface OptimizedImageProps {
  src?: string | null;
  alt: string;
  width?: number;
  quality?: number;
  className?: string;
  fallbackText?: string;
}

export default function OptimizedImage({
  src,
  alt,
  width = 600,
  quality = 80,
  className = '',
  fallbackText = 'STITCH PREVIEW'
}: OptimizedImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  if (!src || hasError) {
    return (
      <div className={`flex items-center justify-center bg-bg-surface text-text-dim text-xs font-semibold tracking-wider ${className}`}>
        <span>{fallbackText}</span>
      </div>
    );
  }

  const optimizedSrc = getOptimizedImageUrl(src, width, quality);
  const fallbackSrc = src;

  return (
    <picture className="w-full h-full block relative overflow-hidden">
      {/* Modern WebP CDN Source */}
      <source type="image/webp" srcSet={optimizedSrc} />
      
      {/* Standard Image Fallback */}
      <img
        src={fallbackSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={`${className} transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-90'}`}
      />
    </picture>
  );
}
