/**
 * Smart automatic color detector for embroidery threads, apparel, and custom products.
 * Recognizes standard CSS colors, compound color phrases (e.g., "navy blue", "emerald green", "rose gold"),
 * and returns the appropriate hex code.
 */
export const COLOR_DICTIONARY: Record<string, string> = {
  // Primary & Core Colors
  blue: '#2563eb',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#eab308',
  black: '#0f172a',
  white: '#ffffff',
  orange: '#ea580c',
  purple: '#9333ea',
  pink: '#ec4899',
  brown: '#78350f',
  gray: '#64748b',
  grey: '#64748b',

  // Blues & Aquas
  'navy blue': '#000080',
  navy: '#000080',
  'royal blue': '#4169e1',
  'sky blue': '#38bdf8',
  'baby blue': '#89cff0',
  'light blue': '#7dd3fc',
  'dark blue': '#1e3a8a',
  'midnight blue': '#191970',
  cyan: '#06b6d4',
  turquoise: '#14b8a6',
  teal: '#0d9488',
  indigo: '#4f46e5',
  azure: '#007fff',
  cobalt: '#0047ab',

  // Greens
  'forest green': '#228b22',
  'emerald green': '#10b981',
  emerald: '#10b981',
  'army green': '#4b5320',
  'olive green': '#556b2f',
  olive: '#808000',
  'mint green': '#86efac',
  mint: '#86efac',
  lime: '#84cc16',
  sage: '#9cb071',
  'sea green': '#2e8b57',
  jade: '#00a86b',

  // Reds, Pinks & Purples
  maroon: '#800000',
  burgundy: '#800020',
  crimson: '#dc143c',
  scarlet: '#ff2400',
  'wine red': '#722f37',
  wine: '#722f37',
  ruby: '#e0115f',
  coral: '#f87171',
  salmon: '#fa8072',
  'hot pink': '#ff1493',
  'baby pink': '#fbcfe8',
  'rose gold': '#b76e79',
  rose: '#f43f5e',
  magenta: '#d946ef',
  fuchsia: '#c026d3',
  violet: '#7c3aed',
  lavender: '#c084fc',
  plum: '#8b5cf6',
  lilac: '#c8a2c8',

  // Yellows, Oranges & Earth tones
  gold: '#fbbf24',
  golden: '#f59e0b',
  mustard: '#d97706',
  amber: '#d97706',
  peach: '#fed7aa',
  rust: '#b45309',
  terracotta: '#e07a5f',
  beige: '#f5f5dc',
  tan: '#d2b48c',
  khaki: '#c3b091',
  cream: '#fffdd0',
  ivory: '#fffff0',
  chocolate: '#451a03',
  coffee: '#6f4e37',
  caramel: '#c68b59',

  // Grays & Neutrals
  charcoal: '#334155',
  'dark gray': '#334155',
  'dark grey': '#334155',
  'light gray': '#cbd5e1',
  'light grey': '#cbd5e1',
  silver: '#94a3b8',
  slate: '#475569',
  ash: '#b2beb5',
  pewter: '#899499'
};

/**
 * Given user input string, detect if a recognized color is present.
 * Evaluates compound multi-word colors first (e.g. "royal blue" before "blue").
 */
export function detectColorFromName(input: string): { colorName: string; hex: string } | null {
  if (!input) return null;
  const normalized = input.toLowerCase().trim();

  // Multi-word first by length
  const sortedColorKeys = Object.keys(COLOR_DICTIONARY).sort((a, b) => b.length - a.length);

  for (const key of sortedColorKeys) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(normalized)) {
      const words = key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return {
        colorName: words,
        hex: COLOR_DICTIONARY[key]
      };
    }
  }

  return null;
}
