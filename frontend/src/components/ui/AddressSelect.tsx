'use client';

import { useState, useEffect, useRef } from 'react';
import {
  REGIONS,
  GeoItem,
  getProvincesForRegion,
  getCitiesForProvince,
  getBarangaysForCity
} from '@/lib/phAddress';

interface AddressSelectProps {
  value: string;
  onChange: (fullAddress: string) => void;
  className?: string;
  required?: boolean;
}

export default function AddressSelect({ value, onChange, className = '', required = false }: AddressSelectProps) {
  // Cascading Selection State
  // Default to Region IV-A (CALABARZON) -> Quezon -> Lucena City -> Barangay Cotta
  const [selectedRegion, setSelectedRegion] = useState<GeoItem>(REGIONS[0]); // CALABARZON
  const [provinces, setProvinces] = useState<GeoItem[]>([]);
  const [selectedProvince, setSelectedProvince] = useState<GeoItem | null>(null);

  const [cities, setCities] = useState<GeoItem[]>([]);
  const [selectedCity, setSelectedCity] = useState<GeoItem | null>(null);

  const [barangays, setBarangays] = useState<GeoItem[]>([]);
  const [selectedBarangay, setSelectedBarangay] = useState<GeoItem | null>(null);

  const [streetDetails, setStreetDetails] = useState('');
  const [isManual, setIsManual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isInitialMount = useRef(true);

  // 1. Initial Load: Load Provinces for default region (CALABARZON)
  useEffect(() => {
    let isMounted = true;

    async function initLocation() {
      setIsLoading(true);
      const provList = await getProvincesForRegion(selectedRegion.code);
      if (!isMounted) return;

      setProvinces(provList);

      // Default to Quezon if in CALABARZON, otherwise first province
      const defaultProv = provList.find(p => p.name.toLowerCase().includes('quezon')) || provList[0] || null;
      setSelectedProvince(defaultProv);

      if (defaultProv) {
        const cityList = await getCitiesForProvince(selectedRegion.code, defaultProv.code);
        if (!isMounted) return;

        setCities(cityList);
        const defaultCity = cityList.find(c => c.name.toLowerCase().includes('lucena')) || cityList[0] || null;
        setSelectedCity(defaultCity);

        if (defaultCity) {
          const brgyList = await getBarangaysForCity(defaultCity.code);
          if (!isMounted) return;

          setBarangays(brgyList);
          const defaultBrgy = brgyList.find(b => b.name.toLowerCase().includes('cotta')) || brgyList[0] || null;
          setSelectedBarangay(defaultBrgy);
        }
      }
      setIsLoading(false);
    }

    initLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Synchronize string address upwards
  const constructAddress = (
    street: string,
    brgy: GeoItem | null,
    city: GeoItem | null,
    prov: GeoItem | null,
    reg: GeoItem
  ) => {
    const parts: string[] = [];
    if (street && street.trim()) parts.push(street.trim());
    if (brgy && brgy.name) parts.push(brgy.name.startsWith('Barangay') || brgy.name.startsWith('Brgy.') ? brgy.name : `Brgy. ${brgy.name}`);
    if (city && city.name) parts.push(city.name);
    if (prov && prov.name && prov.name !== city?.name) parts.push(prov.name);
    if (reg && reg.name && !prov?.name.includes('Metro Manila')) {
      const shortRegion = reg.name.split('(')[0].trim();
      if (shortRegion) parts.push(shortRegion);
    }
    return parts.join(', ');
  };

  // Sync address changes to parent when sub-parts change
  const handleUpdate = (
    street = streetDetails,
    brgy = selectedBarangay,
    city = selectedCity,
    prov = selectedProvince,
    reg = selectedRegion
  ) => {
    if (isManual) return;
    const full = constructAddress(street, brgy, city, prov, reg);
    if (full) {
      onChange(full);
    }
  };

  // Region Changed -> fetch new Provinces
  const handleRegionChange = async (regionCode: string) => {
    const reg = REGIONS.find(r => r.code === regionCode) || REGIONS[0];
    setSelectedRegion(reg);
    setIsLoading(true);

    const provList = await getProvincesForRegion(reg.code);
    setProvinces(provList);
    const newProv = provList[0] || null;
    setSelectedProvince(newProv);

    if (newProv) {
      const cityList = await getCitiesForProvince(reg.code, newProv.code);
      setCities(cityList);
      const newCity = cityList[0] || null;
      setSelectedCity(newCity);

      if (newCity) {
        const brgyList = await getBarangaysForCity(newCity.code);
        setBarangays(brgyList);
        const newBrgy = brgyList[0] || null;
        setSelectedBarangay(newBrgy);
        handleUpdate(streetDetails, newBrgy, newCity, newProv, reg);
      } else {
        setBarangays([]);
        setSelectedBarangay(null);
        handleUpdate(streetDetails, null, newCity, newProv, reg);
      }
    } else {
      setCities([]);
      setSelectedCity(null);
      setBarangays([]);
      setSelectedBarangay(null);
      handleUpdate(streetDetails, null, null, null, reg);
    }
    setIsLoading(false);
  };

  // Province Changed -> fetch new Cities
  const handleProvinceChange = async (provinceCode: string) => {
    const prov = provinces.find(p => p.code === provinceCode) || provinces[0] || null;
    setSelectedProvince(prov);
    if (!prov) return;

    setIsLoading(true);
    const cityList = await getCitiesForProvince(selectedRegion.code, prov.code);
    setCities(cityList);
    const newCity = cityList[0] || null;
    setSelectedCity(newCity);

    if (newCity) {
      const brgyList = await getBarangaysForCity(newCity.code);
      setBarangays(brgyList);
      const newBrgy = brgyList[0] || null;
      setSelectedBarangay(newBrgy);
      handleUpdate(streetDetails, newBrgy, newCity, prov, selectedRegion);
    } else {
      setBarangays([]);
      setSelectedBarangay(null);
      handleUpdate(streetDetails, null, newCity, prov, selectedRegion);
    }
    setIsLoading(false);
  };

  // City Changed -> fetch new Barangays
  const handleCityChange = async (cityCode: string) => {
    const city = cities.find(c => c.code === cityCode) || cities[0] || null;
    setSelectedCity(city);
    if (!city) return;

    setIsLoading(true);
    const brgyList = await getBarangaysForCity(city.code);
    setBarangays(brgyList);
    const newBrgy = brgyList[0] || null;
    setSelectedBarangay(newBrgy);
    handleUpdate(streetDetails, newBrgy, city, selectedProvince, selectedRegion);
    setIsLoading(false);
  };

  // Barangay Changed
  const handleBarangayChange = (brgyCode: string) => {
    const brgy = barangays.find(b => b.code === brgyCode) || barangays[0] || null;
    setSelectedBarangay(brgy);
    handleUpdate(streetDetails, brgy, selectedCity, selectedProvince, selectedRegion);
  };

  // Street Details Changed
  const handleStreetChange = (s: string) => {
    setStreetDetails(s);
    handleUpdate(s, selectedBarangay, selectedCity, selectedProvince, selectedRegion);
  };

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {/* Header controls: Switch mode */}
      <div className="flex justify-between items-center text-[0.75rem] text-text-dim">
        <span className="flex items-center gap-1.5 font-medium">
          <span>📍</span>
          <span>Delivery Address (Philippines):</span>
          {isLoading && <span className="text-[0.65rem] text-primary animate-pulse">Updating...</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            const nextMode = !isManual;
            setIsManual(nextMode);
            if (nextMode) {
              onChange(value || streetDetails);
            } else {
              handleUpdate();
            }
          }}
          className="text-primary hover:text-white underline bg-transparent border-none cursor-pointer font-semibold text-[0.7rem] transition-colors"
        >
          {isManual ? '📍 Switch to Dropdowns' : '✍️ Custom Text'}
        </button>
      </div>

      {isManual ? (
        <textarea
          required={required}
          placeholder="Enter full specific delivery address..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-xl text-text-main text-xs outline-none focus:border-primary resize-none transition-all shadow-inner"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Dropdown Hierarchy: 2x2 Grid */}
          <div className="grid grid-cols-2 gap-2 max-[540px]:grid-cols-1">
            {/* 1. Region */}
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] text-text-dim uppercase font-bold tracking-wider">Region</label>
              <select
                value={selectedRegion.code}
                onChange={(e) => handleRegionChange(e.target.value)}
                className="w-full bg-bg-surface border border-border-glass px-2.5 py-2 rounded-lg text-text-main text-xs outline-none focus:border-primary cursor-pointer hover:border-primary/40 transition-colors"
              >
                {REGIONS.map((r) => (
                  <option key={r.code} value={r.code} className="bg-bg-dark text-white">
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Province */}
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] text-text-dim uppercase font-bold tracking-wider">Province</label>
              <select
                value={selectedProvince?.code || ''}
                onChange={(e) => handleProvinceChange(e.target.value)}
                disabled={provinces.length === 0}
                className="w-full bg-bg-surface border border-border-glass px-2.5 py-2 rounded-lg text-text-main text-xs outline-none focus:border-primary cursor-pointer hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                {provinces.map((p) => (
                  <option key={p.code} value={p.code} className="bg-bg-dark text-white">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. City / Municipality */}
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] text-text-dim uppercase font-bold tracking-wider">City / Municipality</label>
              <select
                value={selectedCity?.code || ''}
                onChange={(e) => handleCityChange(e.target.value)}
                disabled={cities.length === 0}
                className="w-full bg-bg-surface border border-border-glass px-2.5 py-2 rounded-lg text-text-main text-xs outline-none focus:border-primary cursor-pointer hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                {cities.map((c) => (
                  <option key={c.code} value={c.code} className="bg-bg-dark text-white">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Barangay */}
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] text-text-dim uppercase font-bold tracking-wider">Barangay</label>
              <select
                value={selectedBarangay?.code || ''}
                onChange={(e) => handleBarangayChange(e.target.value)}
                disabled={barangays.length === 0}
                className="w-full bg-bg-surface border border-border-glass px-2.5 py-2 rounded-lg text-text-main text-xs outline-none focus:border-primary cursor-pointer hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                {barangays.length > 0 ? (
                  barangays.map((b) => (
                    <option key={b.code} value={b.code} className="bg-bg-dark text-white">
                      {b.name}
                    </option>
                  ))
                ) : (
                  <option value="" className="bg-bg-dark text-white">Poblacion / General</option>
                )}
              </select>
            </div>
          </div>

          {/* 5. House / Street / Unit / Landmark */}
          <input
            type="text"
            required={required}
            placeholder="House / Unit No., Street Name, Landmark (e.g. 142 Quezon Ave, near Lucena Grand Central)"
            value={streetDetails}
            onChange={(e) => handleStreetChange(e.target.value)}
            className="w-full bg-bg-surface border border-border-glass px-3 py-2 rounded-xl text-text-main text-xs outline-none focus:border-primary transition-all shadow-inner"
          />

          {/* 6. Address Preview Pill */}
          {value && (
            <div className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-[0.72rem] text-primary flex items-start gap-1.5">
              <span className="font-semibold shrink-0">📍 Selected:</span>
              <span className="font-medium text-text-main break-words">{value}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
