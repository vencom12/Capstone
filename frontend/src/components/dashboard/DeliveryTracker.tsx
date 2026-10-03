'use client';

import { useState, useEffect } from 'react';
import type { Order } from '@/lib/types';

interface DeliveryTrackerProps {
  order: Order;
  onClose?: () => void;
}

export default function DeliveryTracker({ order }: DeliveryTrackerProps) {
  const [riderProgress, setRiderProgress] = useState(
    order.status === 'Completed' ? 100 : Math.max(20, Math.min(order.progress || 65, 85))
  );
  const [lastPing, setLastPing] = useState('Just now');
  const [mapMode, setMapMode] = useState<'radar' | 'satellite'>('radar');

  // Derive estimated coordinates based on address keywords (Mindanao, Visayas, Luzon, Lucena, Manila)
  const addressText = (order.address || '').toLowerCase();
  
  const getDestinationCoordinates = () => {
    if (addressText.includes('davao')) return { lat: 7.0731, lng: 125.6128, region: 'Davao Region (Mindanao)' };
    if (addressText.includes('zamboanga')) return { lat: 6.9214, lng: 122.0790, region: 'Zamboanga Peninsula (Mindanao)' };
    if (addressText.includes('cagayan de oro') || addressText.includes('cdo')) return { lat: 8.4542, lng: 124.6319, region: 'Northern Mindanao' };
    if (addressText.includes('general santos') || addressText.includes('gensan')) return { lat: 6.1164, lng: 125.1716, region: 'SOCCSKSARGEN (Mindanao)' };
    if (addressText.includes('cebu')) return { lat: 10.3157, lng: 123.8854, region: 'Central Visayas' };
    if (addressText.includes('iloilo')) return { lat: 10.7202, lng: 122.5621, region: 'Western Visayas' };
    if (addressText.includes('manila') || addressText.includes('makati') || addressText.includes('quezon city')) {
      return { lat: 14.5995, lng: 120.9842, region: 'Metro Manila' };
    }
    // Default Lucena / Calabarzon
    return { lat: 13.9373, lng: 121.6174, region: 'CALABARZON (Luzon)' };
  };

  const destCoords = getDestinationCoordinates();

  // Rider coordinates interpolate between Hub and Destination based on progress
  const hubCoords = { lat: 13.9314, lng: 121.6133 };
  const currentRiderLat = hubCoords.lat + (destCoords.lat - hubCoords.lat) * (riderProgress / 100);
  const currentRiderLng = hubCoords.lng + (destCoords.lng - hubCoords.lng) * (riderProgress / 100);

  // Periodic heartbeat animation to simulate active GPS ping
  useEffect(() => {
    const timer = setInterval(() => {
      setLastPing(`${Math.floor(Math.random() * 5) + 1}s ago`);
      if (order.status !== 'Completed') {
        setRiderProgress(prev => (prev < 95 ? prev + 1 : prev));
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [order.status]);

  const stages = [
    { title: 'Order Confirmed', desc: 'Payment verified & job order logged', done: true, time: 'Day 1' },
    { title: 'Embroidery & Quality Check', desc: 'Precision machine stitching & QA inspection', done: order.progress >= 40, time: 'Day 2' },
    { title: 'Dispatched to Courier Hub', desc: 'Handed over for regional dispatch', done: order.progress >= 70, time: 'Day 3' },
    { title: 'Out for Delivery (Live GPS)', desc: 'Rider en route to delivery address', done: order.progress >= 85 || order.status === 'Completed', active: order.status !== 'Completed' && order.progress >= 70, time: 'Today' },
    { title: 'Package Delivered', desc: 'Delivered & signed by recipient', done: order.status === 'Completed', time: order.status === 'Completed' ? 'Delivered' : 'Estimated soon' },
  ];

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address || `${destCoords.lat},${destCoords.lng}`)}`;

  return (
    <div className="flex flex-col gap-4 font-sans text-left">
      {/* Telemetry Header */}
      <div className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xl">
            🚚
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-text-main">
                Stitch-Opt Dispatch Express
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/15 text-success border border-success/30">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping"></span>
                LIVE GPS
              </span>
            </div>
            <p className="text-[0.72rem] text-text-dim mt-0.5 m-0">
              Tracking ID: <span className="font-mono text-text-main font-bold">STITCH-TRK-{order.orderId}</span> • Ping: {lastPing}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer no-underline"
          >
            <span>Open in Google Maps</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </div>
      </div>

      {/* Visual GPS Radar & Route Map */}
      <div className="relative w-full h-[220px] rounded-2xl overflow-hidden border border-border-glass bg-[#0c101d] flex flex-col justify-between p-4 shadow-inner">
        {/* Map Background Grid / Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px] opacity-15 pointer-events-none"></div>

        {/* Top Overlay Stats */}
        <div className="relative z-10 flex justify-between items-center">
          <div className="bg-bg-dark/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl text-[0.7rem] flex items-center gap-2">
            <span className="text-text-dim">Current Courier Coordinates:</span>
            <span className="font-mono font-bold text-primary">
              {currentRiderLat.toFixed(4)}°N, {currentRiderLng.toFixed(4)}°E
            </span>
          </div>

          <div className="bg-bg-dark/80 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-xl text-[0.68rem] text-text-dim flex items-center gap-1.5">
            <span>Destination:</span>
            <span className="font-bold text-text-main">{destCoords.region}</span>
          </div>
        </div>

        {/* Visual Route Graphic */}
        <div className="relative z-10 my-auto py-2">
          {/* Animated Connecting Line */}
          <div className="relative w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-1000"
              style={{ width: `${riderProgress}%` }}
            ></div>
          </div>

          {/* Node Pins across the route */}
          <div className="flex justify-between items-center relative -top-3 px-1">
            {/* Origin Pin */}
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-xs shadow-sm">
                🏭
              </div>
              <span className="text-[0.65rem] font-bold text-text-main mt-1">Stitch Hub</span>
              <span className="text-[0.6rem] text-text-dim">Lucena Main</span>
            </div>

            {/* Courier Midpoint Pin */}
            <div 
              className="flex flex-col items-center transition-all duration-1000 absolute"
              style={{ left: `calc(${riderProgress}% - 14px)` }}
            >
              <div className="w-8 h-8 rounded-full bg-secondary/30 border-2 border-secondary flex items-center justify-center text-sm shadow-sm">
                🚚
              </div>
              <span className="text-[0.65rem] font-extrabold text-secondary mt-1 whitespace-nowrap bg-bg-dark/90 px-1.5 py-0.5 rounded border border-secondary/30">
                Courier En Route
              </span>
            </div>

            {/* Destination Pin */}
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 rounded-full bg-success/20 border-2 border-success flex items-center justify-center text-success shadow-sm">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
              <span className="text-[0.65rem] font-bold text-text-main mt-1">Delivery</span>
              <span className="text-[0.6rem] text-text-dim max-w-[90px] truncate">{order.address || 'Customer'}</span>
            </div>
          </div>
        </div>

        {/* Bottom Banner */}
        <div className="relative z-10 flex justify-between items-center text-[0.7rem] bg-bg-dark/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-text-dim">Assigned Rider:</span>
            <span className="font-bold text-text-main">Mark Anthony R. (Honda Click 125)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-dim">Est. Arrival:</span>
            <span className="font-bold text-success">
              {order.status === 'Completed' ? 'Delivered' : 'Today (Before 5:00 PM)'}
            </span>
          </div>
        </div>
      </div>

      {/* Real-time Milestone Progress Tracker */}
      <div className="bg-bg-surface border border-border-glass rounded-2xl p-4 flex flex-col gap-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-dim m-0">
          Delivery Milestones & Geolocation Status
        </h4>

        <div className="flex flex-col gap-3">
          {stages.map((stage, idx) => (
            <div key={idx} className="flex items-start gap-3 relative">
              {/* Connector line between steps */}
              {idx < stages.length - 1 && (
                <div 
                  className={`absolute left-3.5 top-6 bottom-0 w-0.5 -mb-2 ${
                    stage.done ? 'bg-primary' : 'bg-white/10'
                  }`}
                />
              )}

              {/* Status Dot */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 font-bold ${
                stage.done 
                  ? 'bg-primary text-white shadow-sm' 
                  : stage.active 
                    ? 'bg-secondary text-white animate-pulse' 
                    : 'bg-white/10 text-text-dim'
              }`}>
                {stage.done ? '✓' : idx + 1}
              </div>

              {/* Details */}
              <div className="flex-1 flex justify-between items-start">
                <div>
                  <h5 className={`text-xs font-bold m-0 ${stage.done ? 'text-text-main' : 'text-text-dim'}`}>
                    {stage.title}
                  </h5>
                  <p className="text-[0.7rem] text-text-dim/80 m-0 mt-0.5 leading-snug">
                    {stage.desc}
                  </p>
                </div>
                <span className="text-[0.65rem] text-text-dim font-medium ml-2 shrink-0">
                  {stage.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Destination Confirmation Card */}
      <div className="bg-bg-surface border border-border-glass rounded-2xl p-3.5 flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
          <div className="text-xs leading-relaxed flex-1">
            <span className="font-bold text-text-main block">Recipient Delivery Address:</span>
            <span className="text-text-dim">{order.address?.split('(Landmark:')[0]?.trim() || order.address || 'No specific delivery address recorded on file.'}</span>
          </div>
        </div>
        {order.address && order.address.includes('(Landmark:') && (
          <div className="ml-8 px-3 py-1.5 bg-secondary/10 border border-secondary/20 rounded-xl text-[0.72rem] text-secondary flex items-center gap-2">
            <span className="font-bold shrink-0">Rider Guide:</span>
            <span className="italic">{order.address.split('(Landmark:')[1]?.replace(')', '')?.trim()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
