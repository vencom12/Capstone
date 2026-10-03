'use client';

import { useState, useEffect } from 'react';

interface AddressSelectProps {
  value: string;
  onChange: (fullAddress: string) => void;
  className?: string;
  required?: boolean;
}

/**
 * Intelligent parser to split an existing combined address into:
 * [1] Street / House No.
 * [2] Barangay, City, Province
 * [3] Landmark (if present)
 */
function parseAddressString(full: string): { street: string; area: string; landmark: string } {
  if (!full || !full.trim()) return { street: '', area: '', landmark: '' };

  let trimmed = full.trim();
  let landmark = '';

  // Extract (Landmark: ...) or (Near ...) if previously formatted
  const landmarkMatch = trimmed.match(/\s*\((?:Landmark|Near):\s*(.*?)\)\s*$/i);
  if (landmarkMatch) {
    landmark = landmarkMatch[1].trim();
    trimmed = trimmed.replace(landmarkMatch[0], '').trim();
  }

  // Pattern 1: Look for Brgy. / Barangay indicator as the split point
  const brgyRegex = /^(.*?),\s*(Brgy\.?.*|Barangay.*)$/i;
  const matchBrgy = trimmed.match(brgyRegex);
  if (matchBrgy) {
    return { street: matchBrgy[1].trim(), area: matchBrgy[2].trim(), landmark };
  }

  // Pattern 2: Comma separated - first part is street/house, rest is area
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      street: parts[0],
      area: parts.slice(1).join(', '),
      landmark
    };
  }

  // Fallback: If only 1 part exists, assign to street
  return { street: trimmed, area: '', landmark };
}

export default function AddressSelect({
  value,
  onChange,
  className = '',
  required = false
}: AddressSelectProps) {
  // Local state for the 3 fields (Street, Area, Landmark)
  const [street, setStreet] = useState('');
  const [area, setArea] = useState('');
  const [landmark, setLandmark] = useState('');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  // Sync internal state with incoming value on mount or external reset
  useEffect(() => {
    const parsed = parseAddressString(value || '');
    setStreet(parsed.street);
    setArea(parsed.area);
    setLandmark(parsed.landmark);
  }, [value]);

  const updateCombinedAddress = (newStreet: string, newArea: string, newLandmark: string) => {
    setStreet(newStreet);
    setArea(newArea);
    setLandmark(newLandmark);

    const s = newStreet.trim();
    const a = newArea.trim();
    const l = newLandmark.trim();

    let combined = '';
    if (s && a) {
      if (s.toLowerCase().includes(a.toLowerCase())) {
        combined = s;
      } else {
        combined = `${s}, ${a}`;
      }
    } else {
      combined = s || a;
    }

    if (l) {
      combined = combined ? `${combined} (Landmark: ${l})` : `(Landmark: ${l})`;
    }

    onChange(combined);
  };

  // Browser Geolocation API with Reverse Geocoding
  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation is not supported by your browser');
      return;
    }

    setIsDetectingLocation(true);
    setLocationStatus('Getting GPS coordinates...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLocationStatus(`GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} • Resolving address...`);

        try {
          // OpenStreetMap Nominatim Free Reverse Geocoding (Works globally across all PH regions)
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'en-PH,en' } }
          );

          if (!res.ok) throw new Error('Geocoding service unavailable');
          const data = await res.json();
          const addr = data.address || {};

          // Extract street / road details
          const streetParts = [
            addr.house_number,
            addr.road || addr.street || addr.neighbourhood,
            addr.suburb
          ].filter(Boolean);
          const detectedStreet = streetParts.join(', ') || `Near GPS (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

          // Extract barangay / city / province
          const barangay = addr.quarter || addr.suburb || addr.village || addr.hamlet;
          const city = addr.city || addr.town || addr.municipality;
          const province = addr.province || addr.state || addr.region;
          const postal = addr.postcode;

          const areaParts = [
            barangay ? (barangay.startsWith('Brgy') ? barangay : `Brgy. ${barangay}`) : null,
            city,
            province,
            postal
          ].filter(Boolean);

          const detectedArea = areaParts.join(', ') || 'Philippines';

          setStreet(detectedStreet);
          setArea(detectedArea);
          updateCombinedAddress(detectedStreet, detectedArea, landmark);
          setLocationStatus('Location detected! Please verify your house number & landmark below.');
          setTimeout(() => setLocationStatus(null), 5000);
        } catch {
          // Fallback to coordinates
          const gpsString = `GPS (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
          setStreet(street || gpsString);
          updateCombinedAddress(street || gpsString, area || 'Philippines', landmark);
          setLocationStatus(`Coordinates captured: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          setTimeout(() => setLocationStatus(null), 4000);
        } finally {
          setIsDetectingLocation(false);
        }
      },
      (error) => {
        setIsDetectingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('Permission denied. Please enter your address manually.');
        } else {
          setLocationStatus('Unable to retrieve GPS signal. Please type manually.');
        }
        setTimeout(() => setLocationStatus(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Geolocation Quick Trigger Header */}
      <div className="flex items-center justify-between">
        <span className="text-[0.72rem] font-bold text-text-dim uppercase tracking-wider">
          Delivery Address (Nationwide PH)
        </span>
        <button
          type="button"
          onClick={handleDetectGPS}
          disabled={isDetectingLocation}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[0.7rem] font-bold transition-all cursor-pointer disabled:opacity-50"
        >
          {isDetectingLocation ? (
            <>
              <svg className="animate-spin h-3 w-3 text-primary" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Detecting GPS...</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              </svg>
              <span>Auto-Detect GPS Location</span>
            </>
          )}
        </button>
      </div>

      {locationStatus && (
        <div className="text-[0.7rem] text-primary/90 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg animate-[fadeIn_0.2s_ease-out]">
          {locationStatus}
        </div>
      )}

      {/* Field 1: Detailed Street / House / Unit */}
      <div className="flex flex-col gap-1">
        <label className="text-[0.72rem] font-bold text-text-dim flex items-center justify-between">
          <span>House / Unit No., Building, Street Name *</span>
          <span className="text-[0.65rem] text-text-dim/60 font-normal">e.g. Block & Lot / Floor</span>
        </label>
        <input
          type="text"
          required={required}
          placeholder="e.g. House #142, Block 5 Lot 8, Purok Matahimik"
          value={street}
          onChange={(e) => updateCombinedAddress(e.target.value, area, landmark)}
          className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all placeholder:text-text-dim/40"
        />
      </div>

      {/* Field 2: Barangay, City & Province */}
      <div className="flex flex-col gap-1">
        <label className="text-[0.72rem] font-bold text-text-dim flex items-center justify-between">
          <span>Barangay, City / Municipality & Province *</span>
          <span className="text-[0.65rem] text-text-dim/60 font-normal">Mindanao, Visayas & Luzon</span>
        </label>
        <input
          type="text"
          required={required}
          placeholder="e.g. Brgy. Cotta, Lucena City, Quezon or Brgy. Buhangin, Davao City"
          value={area}
          onChange={(e) => updateCombinedAddress(street, e.target.value, landmark)}
          className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all placeholder:text-text-dim/40"
        />
      </div>

      {/* Field 3: Dedicated Landmark / House Description for Courier */}
      <div className="flex flex-col gap-1">
        <label className="text-[0.72rem] font-bold text-text-dim flex items-center justify-between">
          <span>Landmark / House Guide for Rider</span>
          <span className="text-[0.65rem] text-text-dim/60 font-normal">Optional (e.g. gate color, nearby store)</span>
        </label>
        <input
          type="text"
          placeholder="e.g. Tapat ng sari-sari store, kulay blue na gate, may pulang multicab sa tapat"
          value={landmark}
          onChange={(e) => updateCombinedAddress(street, area, e.target.value)}
          className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-xs outline-none focus:border-secondary focus:shadow-[0_0_12px_rgba(236,72,153,0.2)] transition-all placeholder:text-text-dim/40"
        />
      </div>
    </div>
  );
}
