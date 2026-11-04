'use client';

import { useState } from 'react';
import { getOptimizedImageUrl, isValidProductImage } from '@/lib/imageOptimizer';
import ProductImagePlaceholder from '@/components/ui/ProductImagePlaceholder';

interface OptimizedImageProps {
  src?: string | null;
  alt: string;
  width?: number;
  quality?: number;
  className?: string;
  fallbackText?: string;
  categoryTag?: string;
  size?: 'card' | 'modal' | 'thumb';
}

export default function OptimizedImage({
  src,
  alt,
  width = 600,
  quality = 80,
  className = '',
  categoryTag = '',
  size = 'card',
}: OptimizedImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  if (!isValidProductImage(src) || hasError) {
    return (
      <ProductImagePlaceholder
        name={alt}
        tag={categoryTag}
        size={size}
        className={className}
      />
    );
  }

  const optimizedSrc = getOptimizedImageUrl(src, width, quality);
  const fallbackSrc = src!;

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
