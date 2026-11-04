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

// High-resolution master (3840px). The 1376px day photo is only used as a colour
// grade layered over it, so detail always comes from the 4K source.
const HIRES_SRC = '/landing/atelier-shelf-panoramic-4k.webp';
const DAY_GRADE_SRC = '/landing/atelier-shelf-panoramic-day.jpg';

// Easing speeds (per second). Frame-rate independent: identical feel on 60Hz and 120Hz.
const CAMERA_SPEED = 7;
const THEME_SPEED = 4;
const MAX_DPR = 2;

// Smootherstep easing between keyframes for a cinematic camera dolly
function interpolateCamera(p: number): { x: number; y: number; zoom: number } {
  const clamped = Math.max(0, Math.min(1, p));
  let i = 0;
  while (i < KEYFRAMES.length - 1 && KEYFRAMES[i + 1].p < clamped) {
    i++;
  }
  const k1 = KEYFRAMES[i];
  const k2 = KEYFRAMES[Math.min(i + 1, KEYFRAMES.length - 1)];

  if (k1.p === k2.p) return { x: k1.x, y: k1.y, zoom: k1.zoom };

  const t = (clamped - k1.p) / (k2.p - k1.p);
  const ease = t * t * t * (t * (t * 6 - 15) + 10);

  return {
    x: k1.x + (k2.x - k1.x) * ease,
    y: k1.y + (k2.y - k1.y) * ease,
    zoom: k1.zoom + (k2.zoom - k1.zoom) * ease,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.decoding = 'async';
    img.onload = () => {
      // Decode off the main thread before first draw to avoid a hitch.
      (img.decode ? img.decode() : Promise.resolve()).then(() => resolve(img), () => resolve(img));
    };
    img.onerror = reject;
    img.src = src;
  });
}

// Shared chapter caption transition: compositor-only (opacity + transform).
const captionBase =
  'absolute bottom-2 sm:bottom-6 md:bottom-8 inset-x-4 max-w-3xl mx-auto ' +
  'transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform]';
const captionShown = 'opacity-100 translate-y-0';
const captionHidden = 'opacity-0 translate-y-5 pointer-events-none';
const headingShadow = '[text-shadow:0_6px_28px_rgba(0,0,0,0.85)]';
const bodyShadow = '[text-shadow:0_2px_12px_rgba(0,0,0,0.8)]';

export default function FullScreenStitchExperience() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Discrete active chapter: 0 = Towels, 1 = Fans, 2 = Caps, 3 = CTA, 4 = Products
  const [activeChapter, setActiveChapter] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const topRef = useRef(0);
  const totalScrollableRef = useRef(1);

  const targetProgressRef = useRef(0);
  const currentProgressRef = useRef(0);
  const targetBlendRef = useRef(0); // 0 = day, 1 = night
  const currentBlendRef = useRef(0);
  const lastChapterRef = useRef(0);

  // Wakes the render loop. The loop sleeps whenever the scene is settled, so an
  // idle page costs zero GPU/CPU (main fix for mobile lag and battery drain).
  const kickRef = useRef<() => void>(() => {});

  // Theme sync
  useEffect(() => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || getStoredTheme() === 'dark';
    targetBlendRef.current = isDark ? 1 : 0;
    currentBlendRef.current = targetBlendRef.current;

    const onThemeChange = (e: any) => {
      const theme = e?.detail?.theme || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
      targetBlendRef.current = theme === 'dark' ? 1 : 0;
      kickRef.current();
    };

    window.addEventListener('themechange', onThemeChange);
    return () => window.removeEventListener('themechange', onThemeChange);
  }, []);

  // Render loop + layout/scroll observers
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let nightLayer: CanvasImageSource | null = null;
    let dayLayer: CanvasImageSource | null = null;
    let srcW = 3840;
    let srcH = 2144;

    let rafId = 0;
    let running = false;
    let lastTime = 0;
    let needsDraw = true;
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let disposed = false;

    const updateChapter = (p: number) => {
      let next = 0;
      if (p < 0.28) next = 0;
      else if (p < 0.60) next = 1;
      else if (p < 0.85) next = 2;
      else if (p < 0.96) next = 3;
      else next = 4;
      if (next !== lastChapterRef.current) {
        lastChapterRef.current = next;
        setActiveChapter(next);
      }
    };

    const draw = () => {
      if (!cssW || !cssH) return;
      const p = currentProgressRef.current;
      const blend = Math.max(0, Math.min(1, currentBlendRef.current));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!nightLayer) {
        ctx.fillStyle = '#060910';
        ctx.fillRect(0, 0, cssW, cssH);
        return;
      }

      const { x: camX, y: camY, zoom } = interpolateCamera(p);
      const imgAspect = srcW / srcH;
      let baseW = cssW;
      let baseH = cssH;
      if (cssW / cssH > imgAspect) baseH = cssW / imgAspect;
      else baseW = cssH * imgAspect;

      const drawW = baseW * zoom;
      const drawH = baseH * zoom;
      const drawX = cssW / 2 - camX * drawW;
      const drawY = cssH / 2 - camY * drawH;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const day = dayLayer || nightLayer;
      if (blend <= 0.001) {
        ctx.globalAlpha = 1;
        ctx.drawImage(day, drawX, drawY, drawW, drawH);
      } else if (blend >= 0.999) {
        ctx.globalAlpha = 1;
        ctx.drawImage(nightLayer, drawX, drawY, drawW, drawH);
      } else {
        ctx.globalAlpha = 1;
        ctx.drawImage(day, drawX, drawY, drawW, drawH);
        ctx.globalAlpha = blend;
        ctx.drawImage(nightLayer, drawX, drawY, drawW, drawH);
        ctx.globalAlpha = 1;
      }
    };

    const frame = (time: number) => {
      if (disposed) return;
      const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 1 / 60;
      lastTime = time;

      const camK = 1 - Math.exp(-CAMERA_SPEED * dt);
      const themeK = 1 - Math.exp(-THEME_SPEED * dt);

      const pDiff = targetProgressRef.current - currentProgressRef.current;
      const bDiff = targetBlendRef.current - currentBlendRef.current;

      const camMoving = Math.abs(pDiff) > 0.00005;
      const themeMoving = Math.abs(bDiff) > 0.001;

      currentProgressRef.current = camMoving ? currentProgressRef.current + pDiff * camK : targetProgressRef.current;
      currentBlendRef.current = themeMoving ? currentBlendRef.current + bDiff * themeK : targetBlendRef.current;

      updateChapter(currentProgressRef.current);

      // Skip drawing once the camera has fully left the shelf (products section covers it).
      const offStage = currentProgressRef.current > 1.02 && targetProgressRef.current > 1.02;
      if ((camMoving || themeMoving || needsDraw) && !offStage) {
        draw();
        needsDraw = false;
      }

      if (camMoving || themeMoving || needsDraw) {
        rafId = requestAnimationFrame(frame);
      } else {
        running = false;
        lastTime = 0;
      }
    };

    const kick = () => {
      if (running || disposed) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    };
    kickRef.current = kick;

    const measure = () => {
      topRef.current = container.getBoundingClientRect().top + window.scrollY;
      totalScrollableRef.current = Math.max(1, container.offsetHeight - window.innerHeight);
    };

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      // Only reallocate the backing store when dimensions truly change; mobile URL-bar
      // show/hide fires resize constantly and reallocation was a big source of jank.
      if (nextW === cssW && nextH === cssH && nextDpr === dpr) return;
      cssW = nextW;
      cssH = nextH;
      dpr = nextDpr;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      needsDraw = true;
    };

    const onScroll = () => {
      const raw = (window.scrollY - topRef.current) / totalScrollableRef.current;
      targetProgressRef.current = Math.max(0, raw);
      kick();
    };

    const resizeObserver = new ResizeObserver(() => {
      measure();
      resizeCanvas();
      onScroll();
      needsDraw = true;
      kick();
    });
    resizeObserver.observe(canvas);
    resizeObserver.observe(container);

    measure();
    resizeCanvas();
    onScroll();
    currentProgressRef.current = targetProgressRef.current;
    kick();

    window.addEventListener('scroll', onScroll, { passive: true });

    // Load the 4K master, then build the day layer: 4K detail + day colour grade
    // composited once offscreen, so each frame is still a single drawImage.
    loadImage(HIRES_SRC)
      .then(async (hires) => {
        if (disposed) return;
        srcW = hires.naturalWidth;
        srcH = hires.naturalHeight;
        nightLayer = hires;
        setIsReady(true);
        needsDraw = true;
        kick();

        try {
          const dayImg = await loadImage(DAY_GRADE_SRC);
          if (disposed) return;
          const off = document.createElement('canvas');
          off.width = srcW;
          off.height = srcH;
          const octx = off.getContext('2d');
          if (!octx) return;
          octx.drawImage(hires, 0, 0, srcW, srcH);
          // Lift the 4K into daylight with the day photo's colours. 'color' keeps the
          // sharp luminance of the 4K, 'screen' brings in the daylight brightness.
          octx.imageSmoothingQuality = 'high';
          octx.globalCompositeOperation = 'screen';
          octx.globalAlpha = 0.55;
          octx.drawImage(dayImg, 0, 0, srcW, srcH);
          octx.globalCompositeOperation = 'color';
          octx.globalAlpha = 0.5;
          octx.drawImage(dayImg, 0, 0, srcW, srcH);
          dayLayer = off;
          needsDraw = true;
          kick();
        } catch {
          /* day grade optional */
        }
      })
      .catch(() => {
        // 4K unavailable: fall back to the original day photo.
        loadImage(DAY_GRADE_SRC).then((img) => {
          if (disposed) return;
          srcW = img.naturalWidth;
          srcH = img.naturalHeight;
          nightLayer = img;
          setIsReady(true);
          needsDraw = true;
          kick();
        }).catch(() => {});
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
      kickRef.current = () => {};
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
      {/* Fixed full-screen viewport, pinned while scrolling the shelf runway */}
      <div className="fixed top-[var(--header-height)] inset-x-0 bottom-0 overflow-hidden flex flex-col justify-between pointer-events-none z-10">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full z-0 pointer-events-none transition-opacity duration-700 ease-out ${
            isReady ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Static cinematic vignette (CSS, painted once instead of every frame) */}
        <div
          className="absolute inset-0 pointer-events-none z-[3]"
          style={{
            background:
              'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(6,9,16,0.10) 0%, rgba(6,9,16,0.55) 70%, rgba(6,9,16,0.92) 100%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-[4]" />

        <div className="w-full h-16 pointer-events-none" />

        {/* Floating chapter captions */}
        <div className="relative z-10 w-full px-4 sm:px-6 flex-1 flex flex-col items-center justify-end text-center max-w-4xl mx-auto pointer-events-none pb-4 sm:pb-8">
          <div className={`${captionBase} ${activeChapter === 0 ? captionShown : 'opacity-0 -translate-y-5 pointer-events-none'}`}>
            <h1 className={`text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] text-white ${headingShadow}`}>
              Precision In{' '}
              <span className="bg-gradient-to-r from-amber-400 via-rose-300 to-amber-200 bg-clip-text text-transparent [text-shadow:none]">
                Every Thread.
              </span>
            </h1>
            <p className={`mt-2.5 sm:mt-3 text-xs sm:text-base text-slate-200 max-w-lg mx-auto font-medium ${bodyShadow}`}>
              Dense double-loop Turkish cotton terry engineered to anchor high-tensile rayon embroidery with heirloom durability.
            </p>
          </div>

          <div className={`${captionBase} ${activeChapter === 1 ? captionShown : captionHidden}`}>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white ${headingShadow}`}>
              Micro-Gauge Silk Weaving.
            </h2>
            <p className={`mt-2 sm:mt-2.5 text-xs sm:text-base text-slate-200 max-w-lg mx-auto font-medium ${bodyShadow}`}>
              Delicate cherry blossom branches traced across natural habotai silk without warping curved bamboo ribs.
            </p>
          </div>

          <div className={`${captionBase} ${activeChapter === 2 ? captionShown : captionHidden}`}>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white ${headingShadow}`}>
              3D Architectural Relief.
            </h2>
            <p className={`mt-2 sm:mt-2.5 text-xs sm:text-base text-slate-200 max-w-lg mx-auto font-medium ${bodyShadow}`}>
              Laser-cut 3mm high-density EVA foam beneath double-pass satin stitching for proud crown dimension.
            </p>
          </div>

          <div className={`${captionBase} ${activeChapter === 3 ? `${captionShown} pointer-events-auto` : captionHidden}`}>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white ${headingShadow}`}>
              Ready For Your Custom Piece.
            </h2>
            <p className={`mt-2 text-xs sm:text-base text-slate-200 max-w-md mx-auto mb-4 sm:mb-5 font-medium ${bodyShadow}`}>
              Explore our ready-to-stitch products below or order custom personalized monogramming.
            </p>
            <button
              suppressHydrationWarning
              onClick={scrollToProducts}
              className="px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-black text-xs sm:text-sm tracking-wide shadow-[0_0_35px_rgba(220,38,38,0.6)] hover:shadow-[0_0_50px_rgba(220,38,38,0.8)] active:scale-95 transition-[transform,box-shadow] duration-200 cursor-pointer flex items-center gap-2 mx-auto"
            >
              <span>Explore Products Below</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="animate-bounce"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
            </button>
          </div>
        </div>

        {/* Bottom scroll ticker */}
        <div
          className={`relative z-10 w-full px-6 py-6 flex items-center justify-between max-w-7xl mx-auto pointer-events-auto transition-opacity duration-500 ${
            activeChapter < 4 ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div />
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
