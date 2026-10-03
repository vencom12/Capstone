'use client';

import { useState, useEffect } from 'react';
import type { Order } from '@/lib/types';
import Link from 'next/link';

interface DeliveryTrackerProps {
  order: Order;
  onClose?: () => void;
}

// Haversine formula to compute distance in kilometers between two GPS coordinates
function computeDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function DeliveryTracker({ order }: DeliveryTrackerProps) {
  // Lucena Main Production Hub Coordinates
  const HUB_COORDS = { lat: 13.9314, lng: 121.6133, name: 'Stitch-Opt Hub (Lucena Main)' };

  // Determine true delivery lifecycle stage
  const rawStatus = (order.status || '').toLowerCase();
  const isDelivered = rawStatus === 'completed' || rawStatus === 'order delivered' || order.progress >= 100;
  const isOriginallyDispatched = rawStatus === 'out for delivery' || rawStatus === 'in transit' || (order.progress >= 75 && !isDelivered);

  // Demo toggle: allows students/panelists to test both the Workshop Phase and the Live GPS Dispatch phase
  const [demoDispatched, setDemoDispatched] = useState(false);
  const isDispatched = isOriginallyDispatched || demoDispatched;

  // Derive Destination Coordinates based on address
  const addressText = (order.address || '').toLowerCase();
  const getDestination = () => {
    if (addressText.includes('davao')) return { lat: 7.0731, lng: 125.6128, region: 'Davao Region (Mindanao)' };
    if (addressText.includes('cebu')) return { lat: 10.3157, lng: 123.8854, region: 'Central Visayas' };
    if (addressText.includes('manila') || addressText.includes('quezon city') || addressText.includes('makati')) {
      return { lat: 14.5995, lng: 120.9842, region: 'Metro Manila' };
    }
    // Default Lucena / CALABARZON local destination
    return { lat: 13.9425, lng: 121.6210, region: 'CALABARZON (Lucena Local)' };
  };

  const destCoords = getDestination();

  // Courier state (synced with real rider transmitter if active)
  const [courierLocation, setCourierLocation] = useState<{ lat: number; lng: number }>({
    lat: HUB_COORDS.lat + 0.004,
    lng: HUB_COORDS.lng + 0.003
  });
  const [courierSpeed, setCourierSpeed] = useState<number>(32);
  const [lastPingTime, setLastPingTime] = useState<string>('Just now');
  const [courierInfo] = useState({
    name: 'Mark Anthony R.',
    vehicle: 'Honda Click 125 (Plate: 429-QZ)',
    phone: '0917 882 1490',
    trackingNumber: `STITCH-TRK-${order.orderId}`
  });

  // Listen for real GPS updates from Rider Transmitter page via storage events
  useEffect(() => {
    const handleStorage = () => {
      try {
        const stored = localStorage.getItem(`stitch-rider-gps-${order.orderId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.lat && parsed.lng) {
            setCourierLocation({ lat: parsed.lat, lng: parsed.lng });
            setCourierSpeed(parsed.speed ? Math.round(parsed.speed * 3.6) : 28);
            setLastPingTime('Just now (Rider Phone Lock)');
            setDemoDispatched(true);
          }
        }
      } catch {}
    };

    handleStorage();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [order.orderId]);

  // Compute real distance in km between current rider and destination
  const distanceKm = computeDistanceKm(
    courierLocation.lat,
    courierLocation.lng,
    destCoords.lat,
    destCoords.lng
  );
  const estimatedMins = Math.max(5, Math.round(distanceKm * 2.5));

  const mapsNavigationUrl = `https://www.google.com/maps/dir/?api=1&origin=${HUB_COORDS.lat},${HUB_COORDS.lng}&destination=${encodeURIComponent(
    order.address || `${destCoords.lat},${destCoords.lng}`
  )}`;

  return (
    <div className="flex flex-col gap-4 font-sans text-left animate-[fadeIn_0.2s_ease-out]">
      {/* ========================================================================= */}
      {/* CASE 1: WORKSHOP PRODUCTION PHASE (Day 1-2 / In Queue / Stitching)        */}
      {/* ========================================================================= */}
      {!isDispatched && !isDelivered && (
        <div className="flex flex-col gap-4">
          {/* Workshop Header */}
          <div className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 text-xl font-bold">
                🏭
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-text-main">
                    Stitch-Opt Manufacturing Line
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    IN WORKSHOP QUEUE
                  </span>
                </div>
                <p className="text-[0.72rem] text-text-dim mt-0.5 m-0">
                  Facility: <span className="font-bold text-text-main">Lucena Main Studio</span> • Job Order #{order.orderId}
                </p>
              </div>
            </div>

            {/* Defense Demo Switcher */}
            <button
              onClick={() => setDemoDispatched(true)}
              className="text-[0.72rem] font-bold px-3 py-1.5 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 transition-all cursor-pointer shadow-sm"
              title="Click to simulate courier dispatch for capstone defense demonstration"
            >
              Simulate Courier Dispatch (Demo) →
            </button>
          </div>

          {/* Authentic Workshop Status Notice */}
          <div className="bg-bg-card border border-border-glass rounded-2xl p-4 flex items-start gap-3">
            <div className="text-xl shrink-0 mt-0.5">ℹ️</div>
            <div className="text-xs leading-relaxed text-text-dim">
              <p className="font-bold text-text-main m-0 mb-1">
                Order Currently in Artisanal Embroidery Production
              </p>
              Your design is undergoing vector digitization and machine stitching at our Lucena facility. 
              <span className="text-text-main font-semibold"> Live Courier Geolocation Tracking</span> activates automatically once the garment passes quality control inspection and is handed to the dispatch rider.
            </div>
          </div>

          {/* Workshop Milestone Timeline */}
          <div className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-col gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-dim m-0">
              Manufacturing & Preparation Milestones
            </h4>

            <div className="flex flex-col gap-3">
              {[
                { title: 'Payment Verified & Job Order Logged', desc: 'GCash / Electronic receipt audited & scheduled', done: true, time: 'Step 1' },
                { title: 'Vector Digitization & Thread Mapping', desc: 'Embroidery stitch density calculation & color hooping', done: (order.progress || 0) >= 20, active: (order.progress || 0) < 40, time: 'Step 2' },
                { title: 'Automated Computerized Embroidery', desc: 'Brother/Barudan multi-needle high-speed stitching run', done: (order.progress || 0) >= 50, active: (order.progress || 0) >= 40 && (order.progress || 0) < 70, time: 'Step 3' },
                { title: 'QA Inspection & Thread Trimming', desc: 'Manual tension check, backing removal, and defect audit', done: (order.progress || 0) >= 80, time: 'Step 4' },
                { title: 'Courier Packaging & Waybill Assignment', desc: 'Handover to delivery courier for transit', done: false, time: 'Step 5' },
              ].map((m, idx) => (
                <div key={idx} className="flex items-start gap-3 relative">
                  {idx < 4 && (
                    <div className={`absolute left-3.5 top-6 bottom-0 w-0.5 -mb-2 ${m.done ? 'bg-primary' : 'bg-white/10'}`} />
                  )}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 font-bold ${
                    m.done 
                      ? 'bg-primary text-white shadow-sm' 
                      : m.active 
                        ? 'bg-amber-500 text-white animate-pulse' 
                        : 'bg-white/10 text-text-dim'
                  }`}>
                    {m.done ? '✓' : idx + 1}
                  </div>
                  <div className="flex-1 flex justify-between items-start">
                    <div>
                      <h5 className={`text-xs font-bold m-0 ${m.done ? 'text-text-main' : 'text-text-dim'}`}>{m.title}</h5>
                      <p className="text-[0.7rem] text-text-dim/80 m-0 mt-0.5 leading-snug">{m.desc}</p>
                    </div>
                    <span className="text-[0.65rem] text-text-dim font-medium ml-2 shrink-0">{m.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASE 2: ACTIVE COURIER DISPATCH PHASE (Out for Delivery / Live GPS)       */}
      {/* ========================================================================= */}
      {isDispatched && !isDelivered && (
        <div className="flex flex-col gap-4">
          {/* Telemetry Header */}
          <div className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/20 border border-success/30 flex items-center justify-center text-success text-xl font-bold">
                🚚
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-text-main">
                    Stitch-Opt Dispatch Express
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/15 text-success border border-success/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping" />
                    LIVE COURIER GPS
                  </span>
                </div>
                <p className="text-[0.72rem] text-text-dim mt-0.5 m-0">
                  Tracking ID: <span className="font-mono text-text-main font-bold">{courierInfo.trackingNumber}</span> • Telemetry: {lastPingTime}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={mapsNavigationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer no-underline"
              >
                <span>Google Maps Route</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>

              <Link
                href={`/rider-track?orderId=${order.orderId}`}
                target="_blank"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim text-xs font-semibold border border-border-glass no-underline"
                title="Open mobile transmitter on rider smartphone"
              >
                📱 Rider Link
              </Link>
            </div>
          </div>

          {/* Real Route Graphic & Courier Coordinates Card */}
          <div className="relative w-full rounded-2xl overflow-hidden border border-border-glass bg-[#0c101d] p-4 flex flex-col gap-3 shadow-inner">
            {/* Top Telemetry Bar */}
            <div className="flex justify-between items-center text-xs flex-wrap gap-2">
              <div className="bg-bg-dark/80 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-xl text-[0.7rem] flex items-center gap-2">
                <span className="text-text-dim">Courier GPS:</span>
                <span className="font-mono font-bold text-primary">
                  {courierLocation.lat.toFixed(4)}°N, {courierLocation.lng.toFixed(4)}°E
                </span>
                <span className="text-text-dim">({courierSpeed} km/h)</span>
              </div>

              <div className="bg-bg-dark/80 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-xl text-[0.7rem] text-text-dim flex items-center gap-1.5">
                <span>Destination:</span>
                <span className="font-bold text-text-main">{destCoords.region}</span>
              </div>
            </div>

            {/* Visual Route Track */}
            <div className="my-3 py-2 relative">
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: '65%' }} />
              </div>

              <div className="flex justify-between items-center relative -top-3 px-1">
                {/* Origin */}
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-xs shadow-sm">
                    🏭
                  </div>
                  <span className="text-[0.65rem] font-bold text-text-main mt-1">Lucena Hub</span>
                </div>

                {/* Courier Pin */}
                <div className="flex flex-col items-center absolute" style={{ left: '62%' }}>
                  <div className="w-8 h-8 rounded-full bg-secondary/30 border-2 border-secondary flex items-center justify-center text-sm shadow-sm animate-pulse">
                    🛵
                  </div>
                  <span className="text-[0.62rem] font-extrabold text-secondary mt-1 whitespace-nowrap bg-bg-dark/90 px-1.5 py-0.5 rounded border border-secondary/30">
                    Rider En Route
                  </span>
                </div>

                {/* Destination */}
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-success/20 border-2 border-success flex items-center justify-center text-success shadow-sm">
                    📍
                  </div>
                  <span className="text-[0.65rem] font-bold text-text-main mt-1">Drop-off</span>
                </div>
              </div>
            </div>

            {/* Courier Details & Estimated Distance */}
            <div className="flex justify-between items-center text-[0.72rem] bg-bg-dark/80 backdrop-blur-md border border-white/10 p-2.5 rounded-xl flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-text-dim">Assigned Courier:</span>
                <span className="font-bold text-text-main">{courierInfo.name}</span>
                <span className="text-text-dim text-[0.68rem]">({courierInfo.vehicle})</span>
                <a
                  href={`tel:${courierInfo.phone}`}
                  className="px-2 py-0.5 rounded bg-white/10 text-primary font-bold text-[0.68rem] no-underline hover:bg-white/20 transition-all ml-1"
                >
                  📞 Call
                </a>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-text-dim">Distance:</span>
                <span className="font-bold text-primary">{distanceKm.toFixed(1)} km</span>
                <span className="text-text-dim">• Est. Arrival:</span>
                <span className="font-bold text-success">~{estimatedMins} mins</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASE 3: COMPLETED / DELIVERED STATE                                       */}
      {/* ========================================================================= */}
      {isDelivered && (
        <div className="bg-success/10 border border-success/30 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-success text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-sm">
            ✓
          </div>
          <div>
            <h4 className="text-sm font-bold text-success m-0">Package Successfully Delivered & Received</h4>
            <p className="text-xs text-text-dim m-0 mt-0.5">
              Handed to recipient at {order.address || 'Delivery Address'} • Verified & Completed.
            </p>
          </div>
        </div>
      )}

      {/* Destination Confirmation Card */}
      <div className="bg-bg-surface border border-border-glass rounded-2xl p-3.5 flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="text-xs leading-relaxed flex-1">
            <span className="font-bold text-text-main block">Recipient Delivery Address:</span>
            <span className="text-text-dim">
              {order.address?.split('(Landmark:')[0]?.trim() || order.address || 'No specific delivery address recorded on file.'}
            </span>
          </div>
        </div>
        {order.address && order.address.includes('(Landmark:') && (
          <div className="ml-8 px-3 py-1.5 bg-secondary/10 border border-secondary/20 rounded-xl text-[0.72rem] text-secondary flex items-center gap-2">
            <span className="font-bold shrink-0">Rider Landmark Guide:</span>
            <span className="italic">{order.address.split('(Landmark:')[1]?.replace(')', '')?.trim()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
