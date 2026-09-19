'use client';

import { useState, useEffect } from 'react';

interface AddressSelectProps {
  value: string;
  onChange: (fullAddress: string) => void;
  className?: string;
  required?: boolean;
}

const PROVINCES = [
  'Quezon',
  'Metro Manila',
  'Batangas',
  'Cavite',
  'Laguna',
  'Rizal',
  'Bulacan',
  'Pampanga',
  'Other'
];

const CITIES_QUEZON = [
  'Lucena City',
  'Tayabas City',
  'Sariaya',
  'Candelaria',
  'Pagbilao',
  'Tiaong',
  'Lucban',
  'Atimonan',
  'Other'
];

const BARANGAYS_LUCENA = [
  'Cotta',
  'Gulang-Gulang',
  'Market View',
  'Ibabang Dupay',
  'Dalahican',
  'Mayao Crossing',
  'Ibabang Iyam',
  'Isabang',
  'Red V',
  'Silangang Mayao',
  'Barangay 1 (Poblacion)',
  'Barangay 2 (Poblacion)',
  'Barangay 3 (Poblacion)',
  'Barangay 4 (Poblacion)',
  'Other'
];

export default function AddressSelect({ value, onChange, className = '', required = false }: AddressSelectProps) {
  const [province, setProvince] = useState('Quezon');
  const [city, setCity] = useState('Lucena City');
  const [barangay, setBarangay] = useState('Cotta');
  const [streetDetails, setStreetDetails] = useState('');
  const [isManual, setIsManual] = useState(false);

  // Sync initial value if provided as raw string
  useEffect(() => {
    if (value && !streetDetails && !isManual) {
      setStreetDetails(value);
    }
  }, [value]);

  const updateAddress = (p: string, c: string, b: string, s: string) => {
    if (isManual) {
      onChange(s);
    } else {
      const parts = [];
      if (s) parts.push(s);
      if (b) parts.push(`Brgy. ${b}`);
      if (c) parts.push(c);
      if (p) parts.push(p);
      onChange(parts.join(', '));
    }
  };

  const handleProvinceChange = (p: string) => {
    setProvince(p);
    const newCity = p === 'Quezon' ? 'Lucena City' : 'Other';
    const newBarangay = newCity === 'Lucena City' ? 'Cotta' : 'Other';
    setCity(newCity);
    setBarangay(newBarangay);
    updateAddress(p, newCity, newBarangay, streetDetails);
  };

  const handleCityChange = (c: string) => {
    setCity(c);
    const newBarangay = c === 'Lucena City' ? 'Cotta' : 'Other';
    setBarangay(newBarangay);
    updateAddress(province, c, newBarangay, streetDetails);
  };

  const handleBarangayChange = (b: string) => {
    setBarangay(b);
    updateAddress(province, city, b, streetDetails);
  };

  const handleStreetChange = (s: string) => {
    setStreetDetails(s);
    updateAddress(province, city, barangay, s);
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex justify-between items-center text-[0.75rem] text-text-dim mb-0.5">
        <span>Address Selection Mode:</span>
        <button
          type="button"
          onClick={() => {
            setIsManual(!isManual);
            if (!isManual) {
              onChange(streetDetails);
            } else {
              updateAddress(province, city, barangay, streetDetails);
            }
          }}
          className="text-primary hover:text-white underline bg-transparent border-none cursor-pointer font-semibold text-[0.7rem]"
        >
          {isManual ? '📍 Switch to Dropdowns' : '✍️ Switch to Custom Text'}
        </button>
      </div>

      {isManual ? (
        <textarea
          required={required}
          placeholder="Enter full custom delivery address..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-xl text-text-main text-sm outline-none focus:border-primary resize-none"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Dropdown Selectors */}
          <div className="grid grid-cols-3 gap-2 max-[650px]:grid-cols-1">
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] text-text-dim uppercase font-bold tracking-wider">Province</label>
              <select
                value={province}
                onChange={(e) => handleProvinceChange(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-lg text-text-main text-xs outline-none focus:border-primary cursor-pointer"
              >
                {PROVINCES.map((p) => (
                  <option key={p} value={p} className="bg-bg-dark text-white">{p}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] text-text-dim uppercase font-bold tracking-wider">City / Town</label>
              <select
                value={city}
                onChange={(e) => handleCityChange(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-lg text-text-main text-xs outline-none focus:border-primary cursor-pointer"
              >
                {province === 'Quezon' ? (
                  CITIES_QUEZON.map((c) => (
                    <option key={c} value={c} className="bg-bg-dark text-white">{c}</option>
                  ))
                ) : (
                  <option value="Other" className="bg-bg-dark text-white">Other City</option>
                )}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] text-text-dim uppercase font-bold tracking-wider">Barangay</label>
              <select
                value={barangay}
                onChange={(e) => handleBarangayChange(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-2.5 py-1.5 rounded-lg text-text-main text-xs outline-none focus:border-primary cursor-pointer"
              >
                {city === 'Lucena City' ? (
                  BARANGAYS_LUCENA.map((b) => (
                    <option key={b} value={b} className="bg-bg-dark text-white">{b}</option>
                  ))
                ) : (
                  <option value="Other" className="bg-bg-dark text-white">Other Barangay</option>
                )}
              </select>
            </div>
          </div>

          {/* House / Street / Landmark Line */}
          <input
            type="text"
            required={required}
            placeholder="House / Building No., Street, Landmark (e.g. Near Market)"
            value={streetDetails}
            onChange={(e) => handleStreetChange(e.target.value)}
            className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-xl text-text-main text-xs outline-none focus:border-primary transition-all"
          />

          {value && (
            <div className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-[0.75rem] text-primary font-medium flex items-center gap-1.5">
              <span>📍 Address Preview:</span>
              <span className="font-bold text-white truncate">{value}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
