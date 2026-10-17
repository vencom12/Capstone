'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface ShelfKeyframe {
  p: number;
  x: number;
  y: number;
  zoom: number;
}

const KEYFRAMES: ShelfKeyframe[] = [
  // Chapter 1: Towels
  { p: 0.00, x: 0.285, y: 0.50, zoom: 2.15 },
  { p: 0.20, x: 0.285, y: 0.50, zoom: 2.15 },

  // Pan to Fans
  { p: 0.28, x: 0.500, y: 0.50, zoom: 2.10 },
  // Chapter 2: Fans
  { p: 0.48, x: 0.500, y: 0.50, zoom: 2.10 },

  // Pan to Caps
  { p: 0.56, x: 0.715, y: 0.50, zoom: 2.15 },
  // Chapter 3: Caps
  { p: 0.70, x: 0.715, y: 0.50, zoom: 2.15 },

  // Zoom out to reveal whole shelf
  { p: 0.82, x: 0.500, y: 0.50, zoom: 1.00 },
  // Chapter 4: Fully zoomed out of those products
  { p: 1.00, x: 0.500, y: 0.50, zoom: 1.00 },
];

// Smooth Hermite / Catmull-Rom interpolation for cinematic camera dolly
function interpolateCamera(p: number): { x: number; y: number; zoom: number } {
  const clamped = Math.max(0, Math.min(1, p));
  let i = 0;
  while (i < KEYFRAMES.length - 1 && KEYFRAMES[i + 1].p < clamped) {
    i++;
  }
  const k1 = KEYFRAMES[i];
  const k2 = KEYFRAMES[Math.min(i + 1, KEYFRAMES.length - 1)];

  if (k1.p === k2.p) return { x: k1.x, y: k1.y, zoom: k1.zoom };

  const segT = (clamped - k1.p) / (k2.p - k1.p);
  // Smooth cubic ease-in-out
  const ease = segT * segT * (3 - 2 * segT);

  return {
    x: k1.x + (k2.x - k1.x) * ease,
    y: k1.y + (k2.y - k1.y) * ease,
    zoom: k1.zoom + (k2.zoom - k1.zoom) * ease,
  };
}

export default function FullScreenStitchExperience() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Smooth spring inertia for 60fps camera dolly
  const currentProgressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const lastReportedPRef = useRef(0);

  // Track window scroll and map to exact progress [0, 1]
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalScrollable = rect.height - window.innerHeight;
      if (totalScrollable <= 0) return;

      const rawProgress = -rect.top / totalScrollable;
      const clamped = Math.max(0, Math.min(1, rawProgress));
      targetProgressRef.current = clamped;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 60FPS Hardware-accelerated RAF Loop for Cinematic Shelf Dolly
  useEffect(() => {
    let animId: number;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load panoramic atelier shelf wall (Pristine 2.7K master with cache-buster)
    const shelfImg = new window.Image();
    let isLoaded = false;
    shelfImg.src = '/landing/atelier-shelf-panoramic-v4.jpg?v=pristine-hd';
    shelfImg.onload = () => {
      isLoaded = true;
    };

    const render = () => {
      // Damped spring lerp (silky smooth Apple-grade camera inertia)
      const diff = targetProgressRef.current - currentProgressRef.current;
      currentProgressRef.current += diff * 0.08;
      const p = currentProgressRef.current;

      // Synchronize floating titles & shelf badges with the interpolated camera dolly
      if (
        Math.abs(p - lastReportedPRef.current) > 0.003 ||
        (p <= 0.002 && lastReportedPRef.current !== 0) ||
        (p >= 0.998 && lastReportedPRef.current !== 1)
      ) {
        lastReportedPRef.current = p;
        setScrollProgress(p);
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      if (w === 0 || h === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, w, h);

      if (isLoaded) {
        const { x: camX, y: camY, zoom } = interpolateCamera(p);

        const imgW = shelfImg.naturalWidth;
        const imgH = shelfImg.naturalHeight;
        const imgAspect = imgW / imgH;
        const canvasAspect = w / h;

        // Base cover dimensions
        let baseW = w;
        let baseH = h;
        if (canvasAspect > imgAspect) {
          baseH = w / imgAspect;
        } else {
          baseW = h * imgAspect;
        }

        // Apply dynamic camera zoom
        const drawW = baseW * zoom;
        const drawH = baseH * zoom;

        // Anchor camera focus on (camX, camY) of the image
        const targetPixelX = camX * drawW;
        const targetPixelY = camY * drawH;

        const drawX = w / 2 - targetPixelX;
        const drawY = h / 2 - targetPixelY;

        ctx.drawImage(shelfImg, drawX, drawY, drawW, drawH);
      } else {
        // Fallback dark gradient while image loads
        const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w);
        bgGrad.addColorStop(0, '#111827');
        bgGrad.addColorStop(1, '#06080e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // Subtle Edge Vignette (Keeps wood shelf vibrant & clean without banding)
      const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.85);
      vignette.addColorStop(0, 'transparent');
      vignette.addColorStop(0.7, 'rgba(6, 9, 16, 0.35)');
      vignette.addColorStop(1, '#060910');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      // Warm Overhead Spotlight Following Active Compartment or Soft Center Ambient for Wide View
      const spotX = p < 0.24 ? w * 0.45 : p < 0.52 ? w * 0.50 : p < 0.78 ? w * 0.55 : w * 0.50;
      const spotRadius = p >= 0.78 ? w * 0.75 : w * 0.45;
      const spotLight = ctx.createRadialGradient(spotX, h * 0.35, 20, spotX, h * 0.35, spotRadius);
      spotLight.addColorStop(0, 'rgba(234, 179, 8, 0.18)');
      spotLight.addColorStop(0.6, 'rgba(234, 179, 8, 0.04)');
      spotLight.addColorStop(1, 'transparent');
      ctx.fillStyle = spotLight;
      ctx.fillRect(0, 0, w, h);

      ctx.restore(); // Restore dpr scale
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Window resize observer for crisp Retina canvas matching exact DOM rect
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = rect.width || window.innerWidth;
      const h = rect.height || (window.innerHeight - 80);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToProducts = useCallback(() => {
    const el = document.getElementById('products-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[480vh] bg-[#060910] text-white selection:bg-red-500/30"
    >
      {/* =========================================================================
          FIXED FULL-SCREEN VIEWPORT (Pinned to Screen while scrolling shelf runway)
          ========================================================================= */}
      <div
        className="fixed top-[var(--header-height)] inset-x-0 bottom-0 overflow-hidden flex flex-col justify-between pointer-events-none z-10"
      >
        {/* Full-bleed HTML5 Canvas (Hardware-accelerated) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
        />

        {/* Ambient bottom shadow vignette */}
        <div
          className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/40 to-transparent pointer-events-none z-[5]"
        />

        {/* Top spacer to ensure clear headroom beneath fixed StorefrontHeader */}
        <div className="w-full h-8 pointer-events-none" />

        {/* =========================================================================
            DYNAMIC FLOATING LUXURY TYPOGRAPHY (Transitions Across 4 Chapters)
            ========================================================================= */}
        <div className="relative z-10 w-full px-6 flex-1 flex flex-col items-center justify-center text-center max-w-4xl mx-auto pointer-events-none">
          {/* Chapter 01: Turkish Terry Towels */}
          <div
            className={`transition-all duration-400 absolute ${
              scrollProgress < 0.20
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 -translate-y-8 scale-95 pointer-events-none'
            }`}
          >
            <span className="text-[0.72rem] tracking-[0.3em] uppercase font-bold text-amber-400 block mb-2 drop-shadow">
              Chapter 01 · Turkish Cotton Terry
            </span>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Precision In{' '}
              <span className="bg-gradient-to-r from-amber-400 via-rose-300 to-amber-200 bg-clip-text text-transparent">
                Every Thread.
              </span>
            </h1>
            <p className="mt-4 text-sm sm:text-lg text-slate-200 max-w-xl mx-auto font-medium drop-shadow-lg">
              Dense double-loop Turkish cotton terry engineered to anchor high-tensile Madeira rayon embroidery with heirloom durability.
            </p>
          </div>

          {/* Chapter 02: Pleated Silk Fans */}
          <div
            className={`transition-all duration-400 absolute ${
              scrollProgress >= 0.28 && scrollProgress < 0.48
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
            }`}
          >
            <span className="text-[0.72rem] tracking-[0.3em] uppercase font-bold text-rose-400 block mb-2 drop-shadow">
              Chapter 02 · Pleated Silk & Bamboo Fans
            </span>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Micro-Gauge Silk Weaving.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-200 max-w-lg mx-auto font-medium drop-shadow-lg">
              Delicate cherry blossom branches traced across natural habotai silk without warping curved bamboo ribs.
            </p>
          </div>

          {/* Chapter 03: 3D High-Density Puff Caps (Firmly on the Cap) */}
          <div
            className={`transition-all duration-400 absolute ${
              scrollProgress >= 0.56 && scrollProgress < 0.70
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
            }`}
          >
            <span className="text-[0.72rem] tracking-[0.3em] uppercase font-bold text-sky-400 block mb-2 drop-shadow">
              Chapter 03 · 3D Puff Headwear
            </span>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              3D Architectural Relief.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-200 max-w-lg mx-auto font-medium drop-shadow-lg">
              Laser-cut 3mm high-density EVA foam beneath double-pass satin stitching for proud crown dimension.
            </p>
          </div>

          {/* Chapter 04: The Atelier Collection (Firmly Zoomed Out of Those Products) */}
          <div
            className={`transition-all duration-500 absolute pointer-events-auto ${
              scrollProgress >= 0.82 && scrollProgress < 0.97
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
            }`}
          >
            <span className="text-[0.72rem] tracking-[0.3em] uppercase font-bold text-red-400 block mb-2 drop-shadow">
              Chapter 04 · The Atelier Collection
            </span>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Ready For Your Custom Piece.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-200 max-w-md mx-auto mb-6 font-medium drop-shadow-lg">
              Explore our ready-to-stitch products below or order custom personalized monogramming.
            </p>
            <button
              suppressHydrationWarning
              onClick={scrollToProducts}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-sm tracking-wide shadow-[0_0_35px_rgba(220,38,38,0.6)] hover:shadow-[0_0_50px_rgba(220,38,38,0.8)] active:scale-95 transition-all cursor-pointer flex items-center gap-2.5 mx-auto"
            >
              <span>Explore Products Below</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="animate-bounce"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
            </button>
          </div>
        </div>

        {/* =========================================================================
            BOTTOM PROGRESS BAR & SCROLL TICKER
            ========================================================================= */}
        <div
          className={`relative z-10 w-full px-6 py-6 flex items-center justify-end max-w-7xl mx-auto pointer-events-auto transition-opacity duration-500 ${
            scrollProgress < 0.97 ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >

          {/* Minimalist Scroll Prompt / Direction Indicator */}
          <div className="flex items-center gap-2 text-slate-300 text-xs font-bold uppercase tracking-widest">
            {scrollProgress < 0.82 ? (
              <span className="flex items-center gap-1.5">
                <span>Scroll Shelf Camera</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-bounce"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
              </span>
            ) : (
              <button
                suppressHydrationWarning
                onClick={scrollToProducts}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer border-none bg-transparent font-bold"
              >
                <span>Products Below</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
