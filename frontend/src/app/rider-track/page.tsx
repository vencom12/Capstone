'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/Toast';
import Link from 'next/link';

function RiderTrackContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || 'ORD-F29AD4DA';

  const [order, setOrder] = useState<any | null>(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [lastPingTime, setLastPingTime] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<string>('Out for Delivery');

  const watchIdRef = useRef<number | null>(null);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Order info
  useEffect(() => {
    api.get<any>('/api/customer/dashboard-state')
      .then((data) => {
        if (data && data.orders) {
          const found = data.orders.find((o: any) => o.orderId === orderId || o.id === orderId);
          if (found) {
            setOrder(found);
            setDeliveryStatus(found.status || 'Out for Delivery');
          }
        }
      })
      .catch(() => {});
  }, [orderId]);

  // Clean up watchers on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
      }
    };
  }, []);

  const sendLocationUpdate = async (lat: number, lng: number, currentSpeed?: number | null) => {
    try {
      // Store in localStorage for instant same-browser customer view synchronization
      const payload = {
        orderId,
        lat,
        lng,
        speed: currentSpeed || 0,
        timestamp: new Date().toISOString(),
        courierName: 'Mark Anthony R.',
        vehicle: 'Honda Click 125',
        phone: '0917 882 1490',
        status: 'Out for Delivery'
      };
      localStorage.setItem(`stitch-rider-gps-${orderId}`, JSON.stringify(payload));
      window.dispatchEvent(new Event('storage'));

      // Also send to backend
      await api.patch(`/api/orders/${orderId}/location`, payload).catch(() => {});

      setCurrentCoords({ lat, lng });
      setLastPingTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to dispatch coordinates:', err);
    }
  };

  // Toggle Real Native Geolocation (HTML5 API)
  const toggleRealGps = () => {
    if (isTransmitting) {
      // Stop
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTransmitting(false);
      showToast('Live GPS Broadcast paused', 'info');
      return;
    }

    if (!('geolocation' in navigator)) {
      showToast('Geolocation is not supported by your browser.', 'error');
      return;
    }

    showToast('Requesting GPS lock from mobile device...', 'info');

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy: acc, speed: spd } = position.coords;
        setAccuracy(Math.round(acc));
        setSpeed(spd ? Math.round(spd * 3.6) : 0); // Convert m/s to km/h
        setIsTransmitting(true);
        sendLocationUpdate(latitude, longitude, spd);
      },
      (error) => {
        console.warn('GPS Error:', error.message);
        showToast(`GPS Error: ${error.message}. You can use "Simulate Drive" instead.`, 'error');
        setIsTransmitting(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    );

    watchIdRef.current = id;
  };

  // Simulation fallback for presentations indoors / without motorbike
  const toggleSimulation = () => {
    if (isSimulating) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      setIsSimulating(false);
      showToast('Route simulation paused', 'info');
      return;
    }

    // Lucena Main Hub to Customer Route points
    const hub = { lat: 13.9314, lng: 121.6133 };
    const dest = { lat: 13.9420, lng: 121.6240 };
    let step = 0;
    const totalSteps = 25;

    setIsSimulating(true);
    showToast('Started realistic route simulation (35 km/h)', 'success');

    simIntervalRef.current = setInterval(() => {
      step = (step + 1) % totalSteps;
      const progressRatio = step / totalSteps;
      const currentLat = hub.lat + (dest.lat - hub.lat) * progressRatio;
      const currentLng = hub.lng + (dest.lng - hub.lng) * progressRatio;

      setAccuracy(4); // 4 meters
      setSpeed(36); // 36 km/h
      sendLocationUpdate(currentLat, currentLng, 10);
    }, 2500);
  };

  const handleMarkDelivered = async () => {
    if (!confirm('Mark this package as delivered to the recipient?')) return;
    try {
      await api.patch(`/api/orders/${orderId}/location`, {
        status: 'Completed',
        progress: 100
      }).catch(() => {});

      setDeliveryStatus('Completed');
      localStorage.setItem(`stitch-rider-status-${orderId}`, 'Completed');
      showToast('Order marked as Completed & Delivered!', 'success');
    } catch {
      showToast('Status updated locally.', 'info');
      setDeliveryStatus('Completed');
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col p-4 max-w-md mx-auto font-sans">
      {/* Top Header */}
      <div className="flex justify-between items-center pb-3 border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center font-bold text-sm shadow-sm">
            🚚
          </div>
          <div>
            <h1 className="text-sm font-extrabold m-0 leading-tight">Rider Dispatch Portal</h1>
            <p className="text-[0.7rem] text-white/50 m-0">Live Courier GPS Transmitter</p>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="text-xs text-primary font-bold px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 no-underline hover:bg-white/10 transition-all"
        >
          Customer View ↗
        </Link>
      </div>

      {/* Assigned Delivery Card */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 mb-4 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[0.68rem] uppercase font-bold text-white/40 tracking-wider">
              Assigned Package
            </span>
            <h2 className="text-base font-extrabold text-primary m-0 mt-0.5">{orderId}</h2>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wider ${
              deliveryStatus === 'Completed'
                ? 'bg-success/20 text-success border border-success/30'
                : 'bg-primary/20 text-primary border border-primary/30'
            }`}
          >
            {deliveryStatus}
          </span>
        </div>

        {/* Customer & Address Details */}
        <div className="bg-black/20 rounded-xl p-3 flex flex-col gap-2 text-xs">
          <div>
            <span className="text-white/40 block text-[0.68rem] font-semibold uppercase">Recipient</span>
            <span className="font-bold text-white">{order?.client || 'Customer Recipient'}</span>
          </div>

          <div>
            <span className="text-white/40 block text-[0.68rem] font-semibold uppercase">Drop-off Destination</span>
            <span className="text-white/90 leading-relaxed block">
              {order?.address || 'Purok Matahimik, Lucena City, Quezon'}
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 pt-1 border-t border-white/10 mt-1">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                order?.address || 'Lucena City, Quezon'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs no-underline transition-all"
            >
              📍 Google Maps Navigation
            </a>
            <a
              href="tel:09171234567"
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs no-underline transition-all flex items-center justify-center"
              title="Call Customer"
            >
              📞
            </a>
          </div>
        </div>
      </div>

      {/* Live Telemetry Status Box */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">
            GPS Telemetry Stream
          </span>
          {(isTransmitting || isSimulating) && (
            <span className="flex items-center gap-1.5 text-xs text-success font-bold">
              <span className="w-2 h-2 rounded-full bg-success animate-ping" />
              BROADCASTING
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-white/40 text-[0.65rem] block">Coordinates</span>
            <span className="font-mono font-bold text-primary text-[0.8rem]">
              {currentCoords
                ? `${currentCoords.lat.toFixed(4)}°, ${currentCoords.lng.toFixed(4)}°`
                : '13.9314°, 121.6133°'}
            </span>
          </div>

          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-white/40 text-[0.65rem] block">Current Speed</span>
            <span className="font-mono font-bold text-white text-[0.8rem]">
              {speed !== null ? `${speed} km/h` : '0 km/h'}
            </span>
          </div>

          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-white/40 text-[0.65rem] block">Satellite Accuracy</span>
            <span className="font-mono font-bold text-white text-[0.8rem]">
              {accuracy !== null ? `±${accuracy} meters` : 'High Accuracy'}
            </span>
          </div>

          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
            <span className="text-white/40 text-[0.65rem] block">Last Hub Ping</span>
            <span className="font-mono font-bold text-white text-[0.8rem]">
              {lastPingTime || 'Standby'}
            </span>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-col gap-3 mt-auto pt-2">
        {/* Toggle Real Phone GPS */}
        <button
          onClick={toggleRealGps}
          disabled={isSimulating}
          className={`w-full py-3.5 rounded-xl font-bold text-sm cursor-pointer border-none shadow-md transition-all flex items-center justify-center gap-2 ${
            isTransmitting
              ? 'bg-danger text-white hover:bg-danger/90'
              : 'bg-primary text-white hover:bg-primary/90'
          }`}
        >
          <span>{isTransmitting ? '⏹ Stop Real Phone GPS' : '📡 Broadcast Real Phone GPS (HTML5)'}</span>
        </button>

        {/* Demo Route Simulation (For presentations indoors where GPS can fail) */}
        <button
          onClick={toggleSimulation}
          disabled={isTransmitting}
          className={`w-full py-3 rounded-xl font-bold text-xs cursor-pointer border transition-all flex items-center justify-center gap-2 ${
            isSimulating
              ? 'bg-amber-600 text-white border-amber-500'
              : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
          }`}
        >
          <span>{isSimulating ? '⏸ Pause Route Demo' : '🚗 Run Presentation Route Demo (35 km/h)'}</span>
        </button>

        {/* Mark as Delivered */}
        {deliveryStatus !== 'Completed' && (
          <button
            onClick={handleMarkDelivered}
            className="w-full py-3 rounded-xl bg-success text-white font-bold text-xs cursor-pointer border-none shadow-sm hover:bg-success/90 transition-all mt-1"
          >
            ✓ Mark Package as Delivered & Signed
          </button>
        )}
      </div>
    </div>
  );
}

export default function RiderTrackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d1117] text-white flex items-center justify-center text-xs">
          Loading Rider Telemetry...
        </div>
      }
    >
      <RiderTrackContent />
    </Suspense>
  );
}
