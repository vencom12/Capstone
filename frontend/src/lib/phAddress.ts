/**
 * Philippine Standard Geographic Code (PSGC) Location Service
 * Provides complete hierarchical address data (Region -> Province -> City/Municipality -> Barangay)
 * Features dynamic fetching from the public PSGC CDN with offline fallback and memory caching.
 */

export interface GeoItem {
  code: string;
  name: string;
  regionCode?: string;
  provinceCode?: string;
}

// 1. All 17 Official Philippine Regions
export const REGIONS: GeoItem[] = [
  { code: '040000000', name: 'Region IV-A (CALABARZON)' },
  { code: '130000000', name: 'National Capital Region (NCR)' },
  { code: '030000000', name: 'Region III (Central Luzon)' },
  { code: '010000000', name: 'Region I (Ilocos Region)' },
  { code: '020000000', name: 'Region II (Cagayan Valley)' },
  { code: '170000000', name: 'MIMAROPA Region' },
  { code: '050000000', name: 'Region V (Bicol Region)' },
  { code: '060000000', name: 'Region VI (Western Visayas)' },
  { code: '070000000', name: 'Region VII (Central Visayas)' },
  { code: '080000000', name: 'Region VIII (Eastern Visayas)' },
  { code: '090000000', name: 'Region IX (Zamboanga Peninsula)' },
  { code: '100000000', name: 'Region X (Northern Mindanao)' },
  { code: '110000000', name: 'Region XI (Davao Region)' },
  { code: '120000000', name: 'Region XII (SOCCSKSARGEN)' },
  { code: '140000000', name: 'CAR (Cordillera Administrative Region)' },
  { code: '160000000', name: 'Region XIII (Caraga)' },
  { code: '150000000', name: 'BARMM (Bangsamoro)' }
];

// Offline pre-bundled provinces for instant loading and offline capability
export const BUNDLED_PROVINCES: Record<string, GeoItem[]> = {
  // Region IV-A (CALABARZON)
  '040000000': [
    { code: '045600000', name: 'Quezon' },
    { code: '041000000', name: 'Batangas' },
    { code: '042100000', name: 'Cavite' },
    { code: '043400000', name: 'Laguna' },
    { code: '045800000', name: 'Rizal' }
  ],
  // NCR (Single metropolitan district)
  '130000000': [
    { code: '130000000', name: 'Metro Manila' }
  ],
  // Region III (Central Luzon)
  '030000000': [
    { code: '031400000', name: 'Bulacan' },
    { code: '035400000', name: 'Pampanga' },
    { code: '030800000', name: 'Bataan' },
    { code: '034900000', name: 'Nueva Ecija' },
    { code: '036900000', name: 'Tarlac' },
    { code: '037100000', name: 'Zambales' },
    { code: '037700000', name: 'Aurora' }
  ],
  // Region VII (Central Visayas)
  '070000000': [
    { code: '072200000', name: 'Cebu' },
    { code: '071200000', name: 'Bohol' },
    { code: '074600000', name: 'Negros Oriental' },
    { code: '076100000', name: 'Siquijor' }
  ],
  // Region XI (Davao Region)
  '110000000': [
    { code: '112400000', name: 'Davao del Sur' },
    { code: '112300000', name: 'Davao del Norte' },
    { code: '112500000', name: 'Davao Oriental' },
    { code: '118200000', name: 'Davao de Oro' },
    { code: '118600000', name: 'Davao Occidental' }
  ]
};

// Bundled key cities for instantaneous offline defense presentations
export const BUNDLED_CITIES: Record<string, GeoItem[]> = {
  // Quezon Province Cities & Towns
  '045600000': [
    { code: '045624000', name: 'Lucena City' },
    { code: '045643000', name: 'Tayabas City' },
    { code: '045638000', name: 'Sariaya' },
    { code: '045608000', name: 'Candelaria' },
    { code: '045628000', name: 'Pagbilao' },
    { code: '045644000', name: 'Tiaong' },
    { code: '045623000', name: 'Lucban' },
    { code: '045603000', name: 'Atimonan' },
    { code: '045617000', name: 'Gumaca' },
    { code: '045625000', name: 'Mauban' },
    { code: '045622000', name: 'Lopez' },
    { code: '045610000', name: 'Dolores' },
    { code: '045635000', name: 'San Antonio' },
    { code: '045633000', name: 'Real' },
    { code: '045619000', name: 'Infanta' }
  ],
  // Metro Manila (NCR)
  '130000000': [
    { code: '133900000', name: 'City of Manila' },
    { code: '137404000', name: 'Quezon City' },
    { code: '137602000', name: 'Makati City' },
    { code: '137607000', name: 'Taguig City' },
    { code: '137403000', name: 'Pasig City' },
    { code: '137401000', name: 'Mandaluyong City' },
    { code: '137402000', name: 'Marikina City' },
    { code: '137604000', name: 'Parañaque City' },
    { code: '137605000', name: 'Pasay City' },
    { code: '137603000', name: 'Muntinlupa City' },
    { code: '137501000', name: 'Caloocan City' },
    { code: '137503000', name: 'Valenzuela City' },
    { code: '137601000', name: 'Las Piñas City' }
  ],
  // Batangas
  '041000000': [
    { code: '041005000', name: 'Batangas City' },
    { code: '041014000', name: 'Lipa City' },
    { code: '041029000', name: 'Tanauan City' },
    { code: '041028000', name: 'Santo Tomas City' }
  ],
  // Cavite
  '042100000': [
    { code: '042106000', name: 'Dasmariñas City' },
    { code: '042103000', name: 'Bacoor City' },
    { code: '042108000', name: 'Imus City' },
    { code: '042107000', name: 'General Trias City' },
    { code: '042119000', name: 'Tagaytay City' }
  ],
  // Laguna
  '043400000': [
    { code: '043405000', name: 'Calamba City' },
    { code: '043428000', name: 'Santa Rosa City' },
    { code: '043404000', name: 'Biñan City' },
    { code: '043425000', name: 'San Pedro City' },
    { code: '043411000', name: 'Los Baños' }
  ]
};

// Bundled barangays for Lucena City (primary capstone location)
export const BUNDLED_BARANGAYS: Record<string, GeoItem[]> = {
  // Lucena City (33 official barangays)
  '045624000': [
    { code: '045624001', name: 'Barangay 1 (Poblacion)' },
    { code: '045624002', name: 'Barangay 2 (Poblacion)' },
    { code: '045624003', name: 'Barangay 3 (Poblacion)' },
    { code: '045624004', name: 'Barangay 4 (Poblacion)' },
    { code: '045624005', name: 'Barangay 5 (Poblacion)' },
    { code: '045624006', name: 'Barangay 6 (Poblacion)' },
    { code: '045624007', name: 'Barangay 7 (Poblacion)' },
    { code: '045624008', name: 'Barangay 8 (Poblacion)' },
    { code: '045624009', name: 'Barangay 9 (Poblacion)' },
    { code: '045624010', name: 'Barangay 10 (Poblacion)' },
    { code: '045624011', name: 'Barangay 11 (Poblacion)' },
    { code: '045624012', name: 'Barangay Cotta' },
    { code: '045624013', name: 'Barangay Dalahican' },
    { code: '045624014', name: 'Barangay Domoit' },
    { code: '045624015', name: 'Barangay Gulang-Gulang' },
    { code: '045624016', name: 'Barangay Ibabang Dupay' },
    { code: '045624017', name: 'Barangay Ibabang Iyam' },
    { code: '045624018', name: 'Barangay Ibabang Talim' },
    { code: '045624019', name: 'Barangay Ilayang Dupay' },
    { code: '045624020', name: 'Barangay Ilayang Iyam' },
    { code: '045624021', name: 'Barangay Ilayang Talim' },
    { code: '045624022', name: 'Barangay Isabang' },
    { code: '045624023', name: 'Barangay Market View' },
    { code: '045624024', name: 'Barangay Mayao Castillo' },
    { code: '045624025', name: 'Barangay Mayao Crossing' },
    { code: '045624026', name: 'Barangay Mayao Ibaba' },
    { code: '045624027', name: 'Barangay Mayao Kanluran' },
    { code: '045624028', name: 'Barangay Mayao Parada' },
    { code: '045624029', name: 'Barangay Mayao Silangan' },
    { code: '045624030', name: 'Barangay Ransohan' },
    { code: '045624031', name: 'Barangay Salinas' },
    { code: '045624032', name: 'Barangay Talao-Talao' },
    { code: '045624033', name: 'Barangay Bocohan' }
  ]
};

// In-memory cache for dynamic queries to avoid duplicate network calls
const cache: Record<string, GeoItem[]> = {};

/**
 * Fetch all provinces for a selected region.
 * Uses public PSGC CDN with local fallback.
 */
export async function getProvincesForRegion(regionCode: string): Promise<GeoItem[]> {
  if (!regionCode) return [];

  // Special case: NCR has no provinces, it treats the metro area as a single unit
  if (regionCode === '130000000') {
    return BUNDLED_PROVINCES['130000000'] || [{ code: '130000000', name: 'Metro Manila' }];
  }

  const cacheKey = `provinces_${regionCode}`;
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    const res = await fetch(`https://psgc.gitlab.io/api/regions/${regionCode}/provinces.json`);
    if (res.ok) {
      const data: any[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const sorted = data.map(item => ({ code: item.code, name: item.name })).sort((a, b) => a.name.localeCompare(b.name));
        cache[cacheKey] = sorted;
        return sorted;
      }
    }
  } catch {
    // Silently fall back to bundled data
  }

  return BUNDLED_PROVINCES[regionCode] || [];
}

/**
 * Fetch all cities and municipalities for a given province (or NCR region).
 */
export async function getCitiesForProvince(regionCode: string, provinceCode: string): Promise<GeoItem[]> {
  if (!regionCode && !provinceCode) return [];

  // If NCR, fetch cities directly by region code
  if (regionCode === '130000000' || provinceCode === '130000000') {
    const cacheKey = 'cities_130000000';
    if (cache[cacheKey]) return cache[cacheKey];

    try {
      const res = await fetch('https://psgc.gitlab.io/api/regions/130000000/cities-municipalities.json');
      if (res.ok) {
        const data: any[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const sorted = data.map(item => ({ code: item.code, name: item.name })).sort((a, b) => a.name.localeCompare(b.name));
          cache[cacheKey] = sorted;
          return sorted;
        }
      }
    } catch {
      // Fallback
    }

    return BUNDLED_CITIES['130000000'] || [];
  }

  const cacheKey = `cities_${provinceCode}`;
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    const res = await fetch(`https://psgc.gitlab.io/api/provinces/${provinceCode}/cities-municipalities.json`);
    if (res.ok) {
      const data: any[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const sorted = data.map(item => ({ code: item.code, name: item.name })).sort((a, b) => a.name.localeCompare(b.name));
        cache[cacheKey] = sorted;
        return sorted;
      }
    }
  } catch {
    // Silently fall back
  }

  return BUNDLED_CITIES[provinceCode] || [];
}

/**
 * Fetch all barangays for a given city or municipality.
 */
export async function getBarangaysForCity(cityCode: string): Promise<GeoItem[]> {
  if (!cityCode) return [];

  const cacheKey = `barangays_${cityCode}`;
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    const res = await fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityCode}/barangays.json`);
    if (res.ok) {
      const data: any[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const sorted = data.map(item => ({ code: item.code, name: item.name })).sort((a, b) => a.name.localeCompare(b.name));
        cache[cacheKey] = sorted;
        return sorted;
      }
    }
  } catch {
    // Silently fall back
  }

  return BUNDLED_BARANGAYS[cityCode] || [];
}
