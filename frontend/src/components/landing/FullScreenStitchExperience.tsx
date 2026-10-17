'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface CameraKeyframe {
  p: number;
  x: number;
  y: number;
  zoom: number;
}

// Shelf Camera Trajectory (Enters from corner orbit -> Towels -> Fans -> Caps -> Wide Shelf Overview)
const SHELF_KEYFRAMES: CameraKeyframe[] = [
  // Emerging from orbit around the corner post onto Towels
  { p: 0.16, x: 0.380, y: 0.50, zoom: 2.50 },
  { p: 0.26, x: 0.285, y: 0.50, zoom: 2.15 },
  // Chapter 2: Towels
  { p: 0.44, x: 0.285, y: 0.50, zoom: 2.15 },

  // Pan to Fans
  { p: 0.50, x: 0.500, y: 0.50, zoom: 2.10 },
  // Chapter 3: Fans
  { p: 0.66, x: 0.500, y: 0.50, zoom: 2.10 },

  // Pan to Caps
  { p: 0.72, x: 0.715, y: 0.50, zoom: 2.15 },
  // Chapter 4: Caps
  { p: 0.86, x: 0.715, y: 0.50, zoom: 2.15 },

  // Zoom out to reveal whole shelf
  { p: 0.92, x: 0.500, y: 0.50, zoom: 1.00 },
  // Chapter 5: Full panoramic shelf overview
  { p: 1.00, x: 0.500, y: 0.50, zoom: 1.00 },
];

// Bench Camera Trajectory (Chapter 1: The sewing workbench behind the shelf)
const BENCH_KEYFRAMES: CameraKeyframe[] = [
  // Chapter 1: Initial landing view - warm sewing machine bench framed from behind the shelf
  { p: 0.00, x: 0.520, y: 0.50, zoom: 1.18 },
  { p: 0.14, x: 0.480, y: 0.50, zoom: 1.25 },
  // Dolly toward the shelf corner post to orbit to the front
  { p: 0.22, x: 0.380, y: 0.52, zoom: 1.45 },
  { p: 0.28, x: 0.320, y: 0.52, zoom: 1.60 },
];

// Smooth Hermite / Catmull-Rom interpolation for cinematic camera dolly
function interpolateCamera(p: number, keyframes: CameraKeyframe[]): { x: number; y: number; zoom: number } {
  const clamped = Math.max(0, Math.min(1, p));
  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1].p < clamped) {
    i++;
  }
  const k1 = keyframes[i];
  const k2 = keyframes[Math.min(i + 1, keyframes.length - 1)];

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

    // Load panoramic atelier shelf wall (Pristine 2.7K master)
    const shelfImg = new window.Image();
    let isShelfLoaded = false;
    shelfImg.src = '/landing/atelier-shelf-panoramic-v4.jpg?v=pristine-hd';
    shelfImg.onload = () => {
      isShelfLoaded = true;
    };

    // Load artisan sewing machine bench scene (Framed from behind the shelf)
    const benchImg = new window.Image();
    let isBenchLoaded = false;
    benchImg.src = '/landing/atelier-sewing-bench.jpg?v=behind-shelf-v3';
    benchImg.onload = () => {
      isBenchLoaded = true;
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

      // Determine blend factor: Bench is 100% visible initially (Chapter 1), then smoothly orbits to the Shelf
      let benchOpacity = 1;
      if (p > 0.16) {
        if (p < 0.26) {
          const t = (p - 0.16) / 0.10;
          benchOpacity = 1 - t * t * (3 - 2 * t);
        } else {
          benchOpacity = 0;
        }
      }

      const canvasAspect = w / h;

      // 1. Draw Shelf Layer with 3D perspective turn when orbiting around from the back
      if (isShelfLoaded && benchOpacity < 1) {
        ctx.save();

        // 3D perspective foreshortening as camera swings around from behind the shelf (p: 0.16 -> 0.26)
        if (p >= 0.16 && p <= 0.26) {
          const tOrbit = (p - 0.16) / 0.10;
          const inAngle = (1 - tOrbit) * 0.42;
          ctx.translate(w * 0.85, h / 2);
          ctx.transform(Math.cos(inAngle), Math.sin(inAngle * 0.32), 0, 1, 0, 0);
          ctx.translate(-w * 0.85, -h / 2);
        }

        const shelfCam = interpolateCamera(p, SHELF_KEYFRAMES);
        const imgW = shelfImg.naturalWidth;
        const imgH = shelfImg.naturalHeight;
        const imgAspect = imgW / imgH;

        let baseW = w;
        let baseH = h;
        if (canvasAspect > imgAspect) {
          baseH = w / imgAspect;
        } else {
          baseW = h * imgAspect;
        }

        const drawW = baseW * shelfCam.zoom;
        const drawH = baseH * shelfCam.zoom;
        const drawX = w / 2 - shelfCam.x * drawW;
        const drawY = h / 2 - shelfCam.y * drawH;

        ctx.drawImage(shelfImg, drawX, drawY, drawW, drawH);
        ctx.restore();
      } else if (!isShelfLoaded && !isBenchLoaded) {
        // Fallback dark gradient while images load
        const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w);
        bgGrad.addColorStop(0, '#111827');
        bgGrad.addColorStop(1, '#06080e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // 2. Draw Workshop Bench Sewing Machine Layer (Chapter 1: Framed from behind the shelf)
      if (isBenchLoaded && benchOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = benchOpacity;

        // Counter-perspective turn swinging out toward the front shelf
        if (p >= 0.16 && p <= 0.26) {
          const tOrbit = (p - 0.16) / 0.10;
          const outAngle = tOrbit * 0.35;
          ctx.translate(w * 0.15, h / 2);
          ctx.transform(Math.cos(outAngle), -Math.sin(outAngle * 0.28), 0, 1, 0, 0);
          ctx.translate(-w * 0.15, -h / 2);
        }

        const benchCam = interpolateCamera(p, BENCH_KEYFRAMES);
        const bW = benchImg.naturalWidth;
        const bH = benchImg.naturalHeight;
        const bAspect = bW / bH;

        let baseBW = w;
        let baseBH = h;
        if (canvasAspect > bAspect) {
          baseBH = w / bAspect;
        } else {
          baseBW = h * bAspect;
        }

        const bDrawW = baseBW * benchCam.zoom;
        const bDrawH = baseBH * benchCam.zoom;
        const bDrawX = w / 2 - benchCam.x * bDrawW;
        const bDrawY = h / 2 - benchCam.y * bDrawH;

        ctx.drawImage(benchImg, bDrawX, bDrawY, bDrawW, bDrawH);

        // Subtle foreground parallax depth on the left rear shelf upright
        if (p < 0.26) {
          const shelfParallaxX = p * w * 0.12;
          const timberGrad = ctx.createLinearGradient(shelfParallaxX, 0, shelfParallaxX + w * 0.16, 0);
          timberGrad.addColorStop(0, 'rgba(6, 4, 3, 0.40)');
          timberGrad.addColorStop(0.7, 'rgba(12, 8, 6, 0.12)');
          timberGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = timberGrad;
          ctx.fillRect(0, 0, w * 0.22, h);
        }

        ctx.restore();
      }

      // 3. Cinematic Shelf Corner Post Sweep: Orbiting from behind the shelf to the front
      if (p >= 0.16 && p <= 0.26) {
        const tPass = (p - 0.16) / 0.10;
        ctx.save();
        const postWidth = w * 0.55;
        // The corner post sweeps across the lens as the camera orbits to the front
        const postX = (1 - tPass) * (w + postWidth) - postWidth;
        const postGrad = ctx.createLinearGradient(postX, 0, postX + postWidth, 0);
        postGrad.addColorStop(0, 'rgba(6, 9, 16, 0)');
        postGrad.addColorStop(0.30, 'rgba(18, 12, 8, 0.85)');
        postGrad.addColorStop(0.50, 'rgba(8, 5, 4, 0.97)');
        postGrad.addColorStop(0.70, 'rgba(18, 12, 8, 0.85)');
        postGrad.addColorStop(1, 'rgba(6, 9, 16, 0)');
        ctx.fillStyle = postGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // 4. Subtle Edge Vignette (Keeps wood textures vibrant & clean without banding)
      const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.85);
      vignette.addColorStop(0, 'transparent');
      vignette.addColorStop(0.7, 'rgba(6, 9, 16, 0.35)');
      vignette.addColorStop(1, '#060910');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      // 5. Dynamic Warm Spotlight Following Active Scene
      let spotX = w * 0.50;
      let spotY = h * 0.35;
      let spotRadius = w * 0.45;
      let spotColor = 'rgba(234, 179, 8, 0.18)';

      if (p < 0.22) {
        // Chapter 1: Behind the Shelf at the Sewing Bench (warm glowing Edison filament illumination)
        spotX = w * 0.58;
        spotY = h * 0.40;
        spotRadius = w * 0.60;
        spotColor = 'rgba(245, 158, 11, 0.26)';
      } else if (p < 0.46) {
        // Chapter 2: Towel compartment
        spotX = w * 0.45;
        spotY = h * 0.35;
        spotRadius = w * 0.45;
      } else if (p < 0.68) {
        // Chapter 3: Fan compartment
        spotX = w * 0.50;
        spotY = h * 0.35;
        spotRadius = w * 0.45;
      } else if (p < 0.88) {
        // Chapter 4: Cap compartment
        spotX = w * 0.55;
        spotY = h * 0.35;
        spotRadius = w * 0.45;
      } else {
        // Chapter 5: Wide Shelf Panoramic View
        spotX = w * 0.50;
        spotY = h * 0.38;
        spotRadius = w * 0.80;
        spotColor = 'rgba(234, 179, 8, 0.15)';
      }

      const spotLight = ctx.createRadialGradient(spotX, spotY, 20, spotX, spotY, spotRadius);
      spotLight.addColorStop(0, spotColor);
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
      className="relative w-full h-[600vh] bg-[#060910] text-white selection:bg-red-500/30"
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
            DYNAMIC FLOATING LUXURY TYPOGRAPHY (Transitions Across 5 Chapters)
            ========================================================================= */}
        <div className="relative z-10 w-full px-6 flex-1 flex flex-col items-center justify-center text-center max-w-4xl mx-auto pointer-events-none">
          {/* Chapter 01: The Artisan Sewing Bench (Hero Workbench) */}
          <div
            className={`transition-all duration-500 absolute max-w-xl mx-auto ${
              scrollProgress < 0.18
                ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                : 'opacity-0 -translate-y-8 scale-95 pointer-events-none'
            }`}
          >
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 mb-3 backdrop-blur-md">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="text-[0.72rem] tracking-[0.25em] uppercase font-bold text-amber-300">
                Eds Towels & Caps · The Workshop Bench
              </span>
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Crafted With Heart,{' '}
              <span className="bg-gradient-to-r from-amber-300 via-amber-200 to-yellow-400 bg-clip-text text-transparent">
                Stitched For You.
              </span>
            </h1>
            <p className="mt-4 text-sm sm:text-lg text-slate-200 max-w-xl mx-auto font-medium drop-shadow-lg leading-relaxed">
              Welcome to Eds Towels & Caps. From bespoke monograms to custom gifts and event keepsakes, our small studio crafts every personalized piece with care, vibrant threads, and durable detail.
            </p>
          </div>

          {/* Chapter 02: Custom Monogrammed Towels */}
          <div
            className={`transition-all duration-500 absolute ${
              scrollProgress >= 0.26 && scrollProgress < 0.44
                ? 'opacity-100 translate-y-0 scale-100'
                : scrollProgress < 0.26
                ? 'opacity-0 translate-y-8 scale-95 pointer-events-none'
                : 'opacity-0 -translate-y-8 scale-95 pointer-events-none'
            }`}
          >
            <span className="text-[0.72rem] tracking-[0.3em] uppercase font-bold text-amber-400 block mb-2 drop-shadow">
              Chapter 02 · Custom Monogrammed Towels
            </span>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Soft Towels, Timeless Names.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-200 max-w-lg mx-auto font-medium drop-shadow-lg">
              Plush bath, hand, and face towels personalized with your name, family monogram, or wedding motifs. Soft on the skin, colorfast, and made to last for years of daily use.
            </p>
          </div>

          {/* Chapter 03: Custom Event & Souvenir Fans */}
          <div
            className={`transition-all duration-500 absolute ${
              scrollProgress >= 0.50 && scrollProgress < 0.66
                ? 'opacity-100 translate-y-0 scale-100'
                : scrollProgress < 0.50
                ? 'opacity-0 translate-y-8 scale-95 pointer-events-none'
                : 'opacity-0 -translate-y-8 scale-95 pointer-events-none'
            }`}
          >
            <span className="text-[0.72rem] tracking-[0.3em] uppercase font-bold text-rose-400 block mb-2 drop-shadow">
              Chapter 03 · Custom Event & Souvenir Fans
            </span>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Keepsakes For Your Special Days.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-200 max-w-lg mx-auto font-medium drop-shadow-lg">
              Handcrafted pleated silk and bamboo fans custom-stitched with commemorative dates, wedding couple names, birthdays, and debut giveaways that guests treasure forever.
            </p>
          </div>

          {/* Chapter 04: Custom 3D Puff Caps */}
          <div
            className={`transition-all duration-500 absolute ${
              scrollProgress >= 0.72 && scrollProgress < 0.86
                ? 'opacity-100 translate-y-0 scale-100'
                : scrollProgress < 0.72
                ? 'opacity-0 translate-y-8 scale-95 pointer-events-none'
                : 'opacity-0 -translate-y-8 scale-95 pointer-events-none'
            }`}
          >
            <span className="text-[0.72rem] tracking-[0.3em] uppercase font-bold text-sky-400 block mb-2 drop-shadow">
              Chapter 04 · Custom 3D Puff Caps
            </span>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Bold 3D Puff & Flat Stitching.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-200 max-w-lg mx-auto font-medium drop-shadow-lg">
              Standout high-density 3D puff embroidery and clean flat lettering on premium structured caps. Perfect for sports teams, streetwear, company branding, and personalized gifts.
            </p>
          </div>

          {/* Chapter 05: Eds Towels & Caps Collection */}
          <div
            className={`transition-all duration-500 absolute pointer-events-auto ${
              scrollProgress >= 0.90 && scrollProgress < 0.98
                ? 'opacity-100 translate-y-0 scale-100'
                : scrollProgress < 0.90
                ? 'opacity-0 translate-y-8 scale-95 pointer-events-none'
                : 'opacity-0 -translate-y-8 scale-95 pointer-events-none'
            }`}
          >
            <span className="text-[0.72rem] tracking-[0.3em] uppercase font-bold text-red-400 block mb-2 drop-shadow">
              Chapter 05 · Eds Towels & Caps Collection
            </span>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.95)]">
              Ready To Stitch Your Story?
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-200 max-w-md mx-auto mb-6 font-medium drop-shadow-lg">
              Browse our ready-to-order blank garments below or reach out to personalize your towels, caps, and event giveaways with custom embroidery.
            </p>
            <button
              suppressHydrationWarning
              onClick={scrollToProducts}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-sm tracking-wide shadow-[0_0_35px_rgba(220,38,38,0.6)] hover:shadow-[0_0_50px_rgba(220,38,38,0.8)] active:scale-95 transition-all cursor-pointer flex items-center gap-2.5 mx-auto"
            >
              <span>Browse Our Products Below</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="animate-bounce"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
            </button>
          </div>
        </div>

        {/* =========================================================================
            BOTTOM SCROLL TICKER / ACTION PROMPT
            ========================================================================= */}
        <div
          className={`relative z-10 w-full px-6 py-6 flex items-center justify-end max-w-7xl mx-auto pointer-events-auto transition-opacity duration-500 ${
            scrollProgress < 0.98 ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Minimalist Scroll Prompt / Direction Indicator */}
          <div className="flex items-center gap-2 text-slate-300 text-xs font-bold uppercase tracking-widest">
            {scrollProgress < 0.90 ? (
              <span className="flex items-center gap-1.5">
                <span>Scroll Workshop Showcase</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-bounce"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
              </span>
            ) : (
              <button
                suppressHydrationWarning
                onClick={scrollToProducts}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer border-none bg-transparent font-bold"
              >
                <span>Browse Products</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
