'use client';

import Button from '@/components/ui/Button';

export default function HeroBanner() {
  return (
    <section className="relative overflow-hidden rounded-3xl mb-12">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-hero-gradient">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_30%,rgba(99,102,241,0.15)_0%,transparent_50%)]"></div>
        <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_80%_70%,rgba(236,72,153,0.1)_0%,transparent_50%)]"></div>
      </div>

      <div className="relative px-8 py-16 md:py-24 text-center md:text-left flex flex-col md:flex-row items-center gap-12 max-w-6xl mx-auto">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-xs font-bold tracking-widest uppercase">
            <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse"></span>
            Premium Embroidery Services
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white leading-[1.1] tracking-tight">
            Precision <span className="gradient-text">Stitching</span> for Modern Brands
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto md:mx-0">
            High-quality custom embroidery, digitizing, and apparel production. Track your orders in real-time with our advanced dashboard.
          </p>
          <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-4">
            <Button size="lg" onClick={() => document.getElementById('shop-section')?.scrollIntoView()}>
              Shop Now
            </Button>
            <Button variant="ghost" size="lg">
              Our Portfolio
            </Button>
          </div>
        </div>

        {/* Visual Element */}
        <div className="hidden md:block flex-1 relative">
          <div className="w-[400px] h-[400px] rounded-full bg-indigo-600/10 border border-indigo-500/20 animate-pulse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
          <div className="relative glass-card p-4 rotate-3 hover:rotate-0 transition-transform duration-700">
             <div className="aspect-[4/5] rounded-xl bg-white/5 flex items-center justify-center text-8xl">
                ✨
             </div>
             <div className="absolute -bottom-4 -left-4 glass-card p-4 border-indigo-500/50">
                <div className="text-xs text-slate-400">Monthly Orders</div>
                <div className="text-2xl font-bold text-white">1,284+</div>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}
