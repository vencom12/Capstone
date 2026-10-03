'use client';

import { useState, useEffect, useId } from 'react';

interface AddressSelectProps {
  value: string;
  onChange: (fullAddress: string) => void;
  className?: string;
  required?: boolean;
}

// Popular quick-fill suggestions for fast autofill across Quezon and major PH hubs
const COMMON_PH_LOCATIONS = [
  'Brgy. Cotta, Lucena City, Quezon',
  'Brgy. Gulang-Gulang, Lucena City, Quezon',
  'Brgy. Isabang, Lucena City, Quezon',
  'Brgy. Ibabang Dupay, Lucena City, Quezon',
  'Brgy. Dalahican, Lucena City, Quezon',
  'Brgy. Market View, Lucena City, Quezon',
  'Brgy. Poblacion, Lucena City, Quezon',
  'Brgy. San Roque, Sariaya, Quezon',
  'Brgy. Poblacion, Candelaria, Quezon',
  'Brgy. San Diego, Tayabas City, Quezon',
  'Brgy. Bukal Sur, Candelaria, Quezon',
  'Brgy. Poblacion, Pagbilao, Quezon',
  'Brgy. Bel-Air, Makati City, Metro Manila',
  'Brgy. Fort Bonifacio (BGC), Taguig City, Metro Manila',
  'Brgy. South Triangle, Quezon City, Metro Manila',
  'Brgy. San Antonio, Pasig City, Metro Manila',
  'Brgy. Lahug, Cebu City, Cebu',
  'Brgy. Buhangin, Davao City, Davao del Sur'
];

/**
 * Intelligent parser to split an existing combined address into:
 * [1] Street / House / Landmark
 * [2] Barangay, City, Province
 */
function parseAddressString(full: string): { street: string; area: string } {
  if (!full || !full.trim()) return { street: '', area: '' };

  const trimmed = full.trim();

  // Pattern 1: Look for Brgy. / Barangay indicator as the split point
  const brgyRegex = /^(.*?),\s*(Brgy\.?.*|Barangay.*)$/i;
  const matchBrgy = trimmed.match(brgyRegex);
  if (matchBrgy) {
    return { street: matchBrgy[1].trim(), area: matchBrgy[2].trim() };
  }

  // Pattern 2: Comma separated - first part is street/house, rest is area
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      street: parts[0],
      area: parts.slice(1).join(', ')
    };
  }

  // Fallback: If only 1 part exists, assign to street
  return { street: trimmed, area: '' };
}

export default function AddressSelect({
  value,
  onChange,
  className = '',
  required = false
}: AddressSelectProps) {
  const datalistId = useId();

  // Local state for the two fields
  const [street, setStreet] = useState('');
  const [area, setArea] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  // Sync internal state with incoming value on mount or external reset
  useEffect(() => {
    const parsed = parseAddressString(value || '');
    setStreet(parsed.street);
    setArea(parsed.area);
    setIsInitialized(true);
  }, [value]);

  const updateCombinedAddress = (newStreet: string, newArea: string) => {
    setStreet(newStreet);
    setArea(newArea);

    const s = newStreet.trim();
    const a = newArea.trim();

    if (s && a) {
      // Prevent accidental repetition if user typed area into street
      if (s.toLowerCase().includes(a.toLowerCase())) {
        onChange(s);
      } else {
        onChange(`${s}, ${a}`);
      }
    } else {
      onChange(s || a);
    }
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Field 1: Detailed Street / House / Unit / Landmark */}
      <div className="flex flex-col gap-1">
        <label className="text-[0.72rem] font-bold text-text-dim flex items-center justify-between">
          <span>Street Address & House / Unit No.</span>
          <span className="text-[0.65rem] text-primary/70 font-normal">e.g. House No., Street, Landmark</span>
        </label>
        <input
          type="text"
          required={required}
          placeholder="e.g. Purok Matahimik or 142 Quezon Ave, near Lucena Grand Central"
          value={street}
          onChange={(e) => updateCombinedAddress(e.target.value, area)}
          className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all placeholder:text-text-dim/40"
        />
      </div>

      {/* Field 2: Barangay, City & Province */}
      <div className="flex flex-col gap-1">
        <label className="text-[0.72rem] font-bold text-text-dim flex items-center justify-between">
          <span>Barangay, City & Province</span>
          <span className="text-[0.65rem] text-text-dim/60 font-normal">Type or pick from suggestions</span>
        </label>
        <input
          type="text"
          required={required}
          list={datalistId}
          placeholder="e.g. Brgy. Cotta, Lucena City, Quezon"
          value={area}
          onChange={(e) => updateCombinedAddress(street, e.target.value)}
          className="w-full bg-bg-surface border border-border-glass px-3.5 py-2.5 rounded-xl text-text-main text-xs outline-none focus:border-primary focus:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all placeholder:text-text-dim/40"
        />
        <datalist id={datalistId}>
          {COMMON_PH_LOCATIONS.map((loc) => (
            <option key={loc} value={loc} />
          ))}
        </datalist>
      </div>

      {/* Clean Full Address Confirmation Pill (Clean single line without duplicates) */}
      {value && value.trim() && (
        <div className="px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl text-[0.72rem] flex items-start gap-2">
          <span className="text-primary font-bold shrink-0">📍 Delivery To:</span>
          <span className="text-text-main font-medium leading-relaxed break-words">
            {value}
          </span>
        </div>
      )}
    </div>
  );
}
