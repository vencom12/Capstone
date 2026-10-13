/**
 * imageOptimizer.ts
 * Enterprise Image Optimization Utility for Supabase CDN and static export architecture.
 * Transforms raw camera photos into responsive, compressed WebP payloads on the fly.
 */

export function getOptimizedImageUrl(
  url: string | null | undefined,
  width = 600,
  quality = 80
): string {
  if (!url) return '';

  const cleanUrl = url.trim();
  if (!cleanUrl) return '';

  // Supabase Storage CDN Image Transformation
  // Supabase supports image transformation by replacing /object/public/ with /render/image/public/
  // or by passing query parameters width, quality, and format=webp.
  if (cleanUrl.includes('supabase.co/storage/v1/object/public/')) {
    const separator = cleanUrl.includes('?') ? '&' : '?';
    // Use render endpoint if supported or standard transform query params
    const transformed = cleanUrl.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/'
    );
    return `${transformed}${separator}width=${width}&quality=${quality}&format=webp`;
  }

  // If local or external URL, return as-is
  return cleanUrl;
}

export function getFallbackImageUrl(
  url: string | null | undefined
): string {
  if (!url) return '';
  return url.trim();
}
