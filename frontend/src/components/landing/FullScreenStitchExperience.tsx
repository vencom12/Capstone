'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getStoredTheme } from '@/lib/theme';

interface ShelfKeyframe {
  p: number;
  x: number;
  y: number;
  zoom: number;
}

const KEYFRAMES: ShelfKeyframe[] = [
  { p: 0.00, x: 0.285, y: 0.50, zoom: 2.15 }, // Compartment 01: Towels
  { p: 0.20, x: 0.285, y: 0.50, zoom: 2.15 }, // Towels linger
  { p: 0.38, x: 0.500, y: 0.50, zoom: 2.10 }, // Compartment 02: Fans
  { p: 0.52, x: 0.500, y: 0.50, zoom: 2.10 }, // Fans linger
  { p: 0.68, x: 0.715, y: 0.50, zoom: 2.15 }, // Compartment 03: Caps
  { p: 0.80, x: 0.715, y: 0.50, zoom: 2.15 }, // Caps linger
  { p: 0.88, x: 0.500, y: 0.54, zoom: 1.25 }, // Pull back smoothly to reveal full shelf wall
  { p: 1.00, x: 0.500, y: 0.54, zoom: 1.25 }, // Full shelf wall linger
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

  // Discrete active chapter: 0 = Towels, 1 = Fans, 2 = Caps, 3 = CTA, 4 = Products
  // React ONLY renders 4 times during the entire scroll runway, completely eliminating scroll jank
  const [activeChapter, setActiveChapter] = useState(0);

  // Cached layout metrics to eliminate forced synchronous layout (layout thrashing) on scroll
  const topRef = useRef(0);
  const totalScrollableRef = useRef(1);

  // Day & Night Ambient Blend refs (0 = Day, 1 = Night)
  const targetAmbientBlendRef = useRef<number>(0);
  const currentAmbientBlendRef = useRef<number>(0);

  // Camera progress refs
  const currentProgressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const lastChapterRef = useRef(0);

  // Synchronize Atelier Day/Night background with global theme preference
  useEffect(() => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || getStoredTheme() === 'dark';
    targetAmbientBlendRef.current = isDark ? 1.0 : 0.0;
    currentAmbientBlendRef.current = targetAmbientBlendRef.current;

    const onThemeChange = (e: any) => {
      const theme = e?.detail?.theme || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
      targetAmbientBlendRef.current = theme === 'dark' ? 1.0 : 0.0;
    };

    window.addEventListener('themechange', onThemeChange);
    return () => {
      window.removeEventListener('themechange', onThemeChange);
    };
  }, []);

  // 60FPS / 120FPS Hardware-accelerated RAF Loop for Cinematic Shelf Dolly & Day/Night Crossfade
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load both Day & Night panoramic atelier shelf walls (with universal fallback)
    let isDayLoaded = false;
    const dayImg = new window.Image();
    dayImg.onload = () => { isDayLoaded = true; };
    dayImg.src = '/landing/atelier-shelf-panoramic-day.jpg';
    if (dayImg.complete && dayImg.naturalWidth > 0) isDayLoaded = true;

    let isNightLoaded = false;
    const nightImg = new window.Image();
    nightImg.onload = () => { isNightLoaded = true; };
    nightImg.src = '/landing/atelier-shelf-panoramic-night.jpg';
    if (nightImg.complete && nightImg.naturalWidth > 0) isNightLoaded = true;

    let isFallbackLoaded = false;
    const fallbackImg = new window.Image();
    fallbackImg.onload = () => { isFallbackLoaded = true; };
    fallbackImg.src = '/landing/atelier-shelf-panoramic.jpg';
    if (fallbackImg.complete && fallbackImg.naturalWidth > 0) isFallbackLoaded = true;

    const render = () => {
      // Snappy, silky-smooth spring lerp (0.15 damping factor for immediate response)
      const diff = targetProgressRef.current - currentProgressRef.current;
      currentProgressRef.current += diff * 0.15;
      const p = currentProgressRef.current;

      // Smooth Day <-> Night time-lapse crossfade
      const blendDiff = targetAmbientBlendRef.current - currentAmbientBlendRef.current;
      currentAmbientBlendRef.current += blendDiff * 0.10;
      const blend = Math.max(0, Math.min(1, currentAmbientBlendRef.current));

      // Synchronize active chapter ONLY when crossing key milestones (never re-renders React in-between!)
      let nextChapter = 0;
      if (p < 0.28) nextChapter = 0;
      else if (p < 0.60) nextChapter = 1;
      else if (p < 0.85) nextChapter = 2; // Caps chapter
      else if (p < 0.96) nextChapter = 3; // "Ready For Your Custom Piece" CTA over full shelf
      else nextChapter = 4;               // Fades out completely before products enter!

      if (nextChapter !== lastChapterRef.current) {
        lastChapterRef.current = nextChapter;
        setActiveChapter(nextChapter);
      }

      {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;

        if (w > 0 && h > 0) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium'; // Fast hardware bilinear filtering

          const hasAnyImage = isDayLoaded || isNightLoaded || isFallbackLoaded;

          if (hasAnyImage) {
            const { x: camX, y: camY, zoom } = interpolateCamera(p);

            // Reference image for aspect ratio
            const refImg = isDayLoaded ? dayImg : (isNightLoaded ? nightImg : fallbackImg);
            const imgW = refImg.naturalWidth || 1376;
            const imgH = refImg.naturalHeight || 768;
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

            // Determine base image according to current theme/blend
            const baseImg = (blend < 0.5)
              ? (isDayLoaded ? dayImg : (isFallbackLoaded ? fallbackImg : nightImg))
              : (isNightLoaded ? nightImg : (isFallbackLoaded ? fallbackImg : dayImg));

            ctx.globalAlpha = 1;
            ctx.drawImage(baseImg, drawX, drawY, drawW, drawH);

            // Crossfade companion image if both are available
            if (isDayLoaded && isNightLoaded) {
              if (blend > 0 && baseImg === dayImg) {
                ctx.globalAlpha = blend;
                ctx.drawImage(nightImg, drawX, drawY, drawW, drawH);
              } else if (blend < 1 && baseImg === nightImg) {
                ctx.globalAlpha = 1 - blend;
                ctx.drawImage(dayImg, drawX, drawY, drawW, drawH);
              }
            }
            ctx.globalAlpha = 1;
          } else {
            // Placeholder gradient while images load
            ctx.fillStyle = '#090d16';
            ctx.fillRect(0, 0, w, h);
          }

          // Subtle cinematic vignette
          const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.22, w / 2, h / 2, w * 0.75);
          vignette.addColorStop(0, 'rgba(6, 9, 16, 0.15)');
          vignette.addColorStop(0.7, 'rgba(6, 9, 16, 0.65)');
          vignette.addColorStop(1, '#060910');
          ctx.fillStyle = vignette;
          ctx.fillRect(0, 0, w, h);

          ctx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Window resize & zero-reflow scroll observer
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      if (container) {
        topRef.current = container.offsetTop;
        totalScrollableRef.current = Math.max(1, container.offsetHeight - window.innerHeight);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });

    // Passive scroll listener (reads window.scrollY directly without forced layout)
    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const rawProgress = (scrollY - topRef.current) / totalScrollableRef.current;
      targetProgressRef.current = Math.max(0, rawProgress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToProducts = useCallback(() => {
    const el = document.getElementById('products-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[400vh] bg-[#060910] text-white selection:bg-red-500/30"
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
          className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/50 to-transparent pointer-events-none z-[4]"
        />

        {/* Top spacer to ensure clear headroom beneath fixed StorefrontHeader */}
        <div className="w-full h-16 pointer-events-none" />

        {/* =========================================================================
            DYNAMIC FLOATING LUXURY TYPOGRAPHY (Transitions As Camera Dollies Across Shelves)
            ========================================================================= */}
        <div className="relative z-10 w-full px-4 sm:px-6 flex-1 flex flex-col items-center justify-end text-center max-w-4xl mx-auto pointer-events-none pb-4 sm:pb-8">
          {/* Compartment 01: Turkish Terry Towels */}
          <div
            className={`transition-all duration-700 absolute bottom-2 sm:bottom-6 md:bottom-8 inset-x-4 max-w-3xl mx-auto ${
              activeChapter === 0
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 -translate-y-6 scale-95 pointer-events-none'
            }`}
          >
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Precision In{' '}
              <span className="bg-gradient-to-r from-amber-400 via-rose-300 to-amber-200 bg-clip-text text-transparent">
                Every Thread.
              </span>
            </h1>
            <p className="mt-2.5 sm:mt-3 text-xs sm:text-base text-slate-200 max-w-lg mx-auto font-medium drop-shadow-lg">
              Dense double-loop Turkish cotton terry engineered to anchor high-tensile Madeira rayon embroidery with heirloom durability.
            </p>
          </div>

          {/* Compartment 02: Pleated Silk Fans */}
          <div
            className={`transition-all duration-700 absolute bottom-2 sm:bottom-6 md:bottom-8 inset-x-4 max-w-3xl mx-auto ${
              activeChapter === 1
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-6 scale-95 pointer-events-none'
            }`}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Micro-Gauge Silk Weaving.
            </h2>
            <p className="mt-2 sm:mt-2.5 text-xs sm:text-base text-slate-200 max-w-lg mx-auto font-medium drop-shadow-lg">
              Delicate cherry blossom branches traced across natural habotai silk without warping curved bamboo ribs.
            </p>
          </div>

          {/* Compartment 03: 3D High-Density Puff Caps */}
          <div
            className={`transition-all duration-700 absolute bottom-2 sm:bottom-6 md:bottom-8 inset-x-4 max-w-3xl mx-auto ${
              activeChapter === 2
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-6 scale-95 pointer-events-none'
            }`}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              3D Architectural Relief.
            </h2>
            <p className="mt-2 sm:mt-2.5 text-xs sm:text-base text-slate-200 max-w-lg mx-auto font-medium drop-shadow-lg">
              Laser-cut 3mm high-density EVA foam beneath double-pass satin stitching for proud crown dimension.
            </p>
          </div>

          {/* Arrival & Direct Call to Action */}
          <div
            className={`transition-all duration-300 absolute bottom-2 sm:bottom-6 md:bottom-8 inset-x-4 max-w-3xl mx-auto pointer-events-auto ${
              activeChapter === 3
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 translate-y-6 scale-95 pointer-events-none'
            }`}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Ready For Your Custom Piece.
            </h2>
            <p className="mt-2 text-xs sm:text-base text-slate-200 max-w-md mx-auto mb-4 sm:mb-5 font-medium drop-shadow-lg">
              Explore our ready-to-stitch products below or order custom personalized monogramming.
            </p>
            <button
              suppressHydrationWarning
              onClick={scrollToProducts}
              className="px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs sm:text-sm tracking-wide shadow-[0_0_35px_rgba(220,38,38,0.6)] hover:shadow-[0_0_50px_rgba(220,38,38,0.8)] active:scale-95 transition-all cursor-pointer flex items-center gap-2 mx-auto"
            >
              <span>Explore Products Below</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="animate-bounce"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
            </button>
          </div>
        </div>

        {/* =========================================================================
            BOTTOM PROGRESS BAR & SCROLL TICKER
            ========================================================================= */}
        <div
          className={`relative z-10 w-full px-6 py-6 flex items-center justify-between max-w-7xl mx-auto pointer-events-auto transition-opacity duration-500 ${
            activeChapter < 4 ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div />

          {/* Minimalist Scroll Prompt / Direction Indicator */}
          <div className="flex items-center gap-2 text-slate-300 text-xs font-bold uppercase tracking-widest">
            {activeChapter < 3 ? (
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
