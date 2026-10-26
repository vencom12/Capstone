/**
 * Lettering Pricing Utility for Eds Towels & Caps
 * 
 * Business rule:
 * - The first word/name is included in the base embroidery / product price.
 * - Any lettering requested after a space is charged per letter:
 *   - ₱7 / letter for small garments (caps, small towels, fans, etc.)
 *   - ₱10 / letter for big garments (t-shirts, jackets, umbrellas, bath towels, etc.)
 */

export interface LetteringCostBreakdown {
  isPersonalized: boolean;
  isBigGarment: boolean;
  isByog?: boolean;
  baseText: string;
  extraText: string;
  extraLettersCount: number;
  ratePerLetter: number;
  extraCost: number;
  explanation: string;
}

export function isBigGarment(category?: string, name?: string): boolean {
  const text = `${category || ''} ${name || ''}`.toLowerCase();

  // Explicit Big Garments: Bath towels, Shirts, Polos, Jackets, Hoodies, Umbrellas, Robes
  if (
    text.includes('bath') ||
    text.includes('shirt') ||
    text.includes('tshirt') ||
    text.includes('t-shirt') ||
    text.includes('polo') ||
    text.includes('jacket') ||
    text.includes('hoodie') ||
    text.includes('umbrella') ||
    text.includes('robe') ||
    text.includes('blanket')
  ) {
    return true;
  }

  // Small Garments: Caps, Hats, Hand Towels, Face Towels, Fans, Pouches, Handkerchiefs
  return false;
}

export function calculateLetteringCost(
  rawText: string,
  isBig: boolean,
  rates: { smallRate?: number; bigRate?: number } = {},
  isByog: boolean = false
): LetteringCostBreakdown {
  const smallRate = rates.smallRate ?? 7;
  const bigRate = rates.bigRate ?? 10;
  const ratePerLetter = isBig ? bigRate : smallRate;

  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return {
      isPersonalized: false,
      isBigGarment: isBig,
      isByog,
      baseText: '',
      extraText: '',
      extraLettersCount: 0,
      ratePerLetter,
      extraCost: 0,
      explanation: isByog
        ? `BYOG lettering: ₱${ratePerLetter}/letter (${isBig ? 'Big Garment' : 'Small Garment'}). Every letter is charged.`
        : 'First name is included in base price.',
    };
  }

  // BYOG (Bring Your Own Garment):
  // Customer provides their own garment (no blank purchased from shop).
  // There is NO free first word. Every single letter has a fee (₱7 small, ₱10 big).
  if (isByog) {
    const lettersOnly = trimmed.replace(/\s+/g, '');
    const totalLetters = lettersOnly.length;
    const totalCost = totalLetters * ratePerLetter;

    return {
      isPersonalized: totalLetters > 0,
      isBigGarment: isBig,
      isByog: true,
      baseText: '',
      extraText: trimmed,
      extraLettersCount: totalLetters,
      ratePerLetter,
      extraCost: totalCost,
      explanation: totalLetters > 0
        ? `₱${totalCost} (${totalLetters} letters × ₱${ratePerLetter} for BYOG ${isBig ? 'big garment' : 'small garment'} — every letter is charged)`
        : 'BYOG lettering fee: ₱7/letter (small) or ₱10/letter (big)',
    };
  }

  // STANDARD STORE PRODUCT:
  // First word is included in the base product price.
  // Any lettering requested after a space is charged per letter.
  const firstSpaceIndex = trimmed.indexOf(' ');
  if (firstSpaceIndex === -1) {
    // Only one word: included in base price!
    return {
      isPersonalized: true,
      isBigGarment: isBig,
      isByog: false,
      baseText: trimmed,
      extraText: '',
      extraLettersCount: 0,
      ratePerLetter,
      extraCost: 0,
      explanation: 'First name is included in base price (₱0 extra).',
    };
  }

  const baseText = trimmed.substring(0, firstSpaceIndex);
  const extraText = trimmed.substring(firstSpaceIndex + 1);
  // Count only non-space letters
  const lettersOnly = extraText.replace(/\s+/g, '');
  const extraLettersCount = lettersOnly.length;
  const extraCost = extraLettersCount * ratePerLetter;

  const explanation =
    extraLettersCount > 0
      ? `+₱${extraCost} (${extraLettersCount} extra letters × ₱${ratePerLetter} for ${isBig ? 'big garment' : 'small garment'})`
      : 'First name is included in base price (₱0 extra).';

  return {
    isPersonalized: true,
    isBigGarment: isBig,
    isByog: false,
    baseText,
    extraText,
    extraLettersCount,
    ratePerLetter,
    extraCost,
    explanation,
  };
}
