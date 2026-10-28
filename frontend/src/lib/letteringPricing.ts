/**
 * Lettering Pricing & Bulk Multi-Line Utility for Eds Towels & Caps
 *
 * Business rules:
 * - Maximum 20 characters per line (including spaces) — strictly enforced.
 * - First word/name on each line is included in the base embroidery/product price.
 * - Any lettering requested after a space on that line is charged per letter:
 *   - Admin-configured Small Garment rate (default ₱7 / letter)
 *   - Admin-configured Big Garment rate (default ₱10 / letter)
 * - Small vs. Big Garment detection uses the Admin-configured product setting (`garmentSize` / `tags`),
 *   falling back to category/name only for legacy records without an explicit tag.
 */

export const MAX_CHARS_PER_LINE = 20;

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

export interface BulkLineItemBreakdown extends LetteringCostBreakdown {
  lineIndex: number;
  rawLine: string;
  sanitizedLine: string;
  charCount: number;
}

export interface BulkLetteringSummary {
  lines: BulkLineItemBreakdown[];
  lineCount: number;
  isBigGarment: boolean;
  ratePerLetter: number;
  totalExtraLetters: number;
  totalExtraCost: number;
  averageExtraCostPerUnit: number;
  sanitizedRawText: string;
  namesList: string[];
}

/**
 * Resolves the garment size tier ('small' | 'big') from the admin-configured product fields.
 */
export function resolveProductGarmentSize(product?: {
  garmentSize?: 'small' | 'big' | string;
  tags?: string[];
  tag?: string;
  category?: string;
  name?: string;
} | null): 'small' | 'big' {
  if (!product) return 'small';

  if (product.garmentSize === 'big' || product.garmentSize === 'small') {
    return product.garmentSize;
  }

  if (Array.isArray(product.tags)) {
    const sizeTag = product.tags.find((t) => typeof t === 'string' && t.startsWith('garment:'));
    if (sizeTag === 'garment:big') return 'big';
    if (sizeTag === 'garment:small') return 'small';
  }

  return isBigGarment(product.tag || product.category, product.name, product.garmentSize, product.tags)
    ? 'big'
    : 'small';
}

export function isBigGarment(
  category?: string,
  name?: string,
  garmentSize?: 'small' | 'big' | string,
  tags?: string[]
): boolean {
  if (garmentSize === 'big') return true;
  if (garmentSize === 'small') return false;

  if (Array.isArray(tags)) {
    if (tags.includes('garment:big')) return true;
    if (tags.includes('garment:small')) return false;
  }

  const text = `${category || ''} ${name || ''}`.toLowerCase();

  // Fallback for legacy products not yet tagged by admin
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
    text.includes('blanket') ||
    text.includes('large') ||
    text.includes('big')
  ) {
    return true;
  }

  return false;
}

/**
 * Strictly clamps a single line of text to MAX_CHARS_PER_LINE (20 characters including spaces).
 */
export function sanitizeSingleLineText(raw: string): string {
  if (!raw) return '';
  const withoutNewlines = raw.replace(/[\r\n]+/g, ' ');
  return withoutNewlines.slice(0, MAX_CHARS_PER_LINE);
}

/**
 * Strictly clamps every line in a multi-line string to MAX_CHARS_PER_LINE (20 characters including spaces).
 * Preserves newlines so the user can type/paste multiple lines in a textarea, while preventing any line
 * from exceeding 20 characters.
 */
export function sanitizeBulkMultilineText(raw: string): string {
  if (!raw) return '';
  return raw
    .split(/\r?\n/)
    .map((line) => line.slice(0, MAX_CHARS_PER_LINE))
    .join('\n');
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

  const clamped = sanitizeSingleLineText(rawText || '');
  const trimmed = clamped.trim();
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
  // Every single letter has a fee (₱7 small, ₱10 big by default).
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
        : `BYOG lettering fee: ₱${smallRate}/letter (small) or ₱${bigRate}/letter (big)`,
    };
  }

  // STANDARD STORE PRODUCT:
  // First word is included in the base product price.
  // Any lettering requested after a space is charged per letter.
  const firstSpaceIndex = trimmed.indexOf(' ');
  if (firstSpaceIndex === -1) {
    return {
      isPersonalized: true,
      isBigGarment: isBig,
      isByog: false,
      baseText: trimmed,
      extraText: '',
      extraLettersCount: 0,
      ratePerLetter,
      extraCost: 0,
      explanation: 'First word included in base price (₱0 extra).',
    };
  }

  const baseText = trimmed.substring(0, firstSpaceIndex);
  const extraText = trimmed.substring(firstSpaceIndex + 1);
  // Count only non-space characters after the first word
  const lettersOnly = extraText.replace(/\s+/g, '');
  const extraLettersCount = lettersOnly.length;
  const extraCost = extraLettersCount * ratePerLetter;

  const explanation =
    extraLettersCount > 0
      ? `+₱${extraCost} (${extraLettersCount} extra letter${extraLettersCount === 1 ? '' : 's'} × ₱${ratePerLetter} for ${isBig ? 'big garment' : 'small garment'})`
      : 'First word included in base price (₱0 extra).';

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

/**
 * Parses a multi-line bulk text block where each non-empty line represents 1 personalized garment/item.
 * Automatically clamps each line to 20 characters (including spaces) and calculates per-line and total fees.
 */
export function parseBulkLetteringLines(
  rawText: string,
  isBig: boolean,
  rates: { smallRate?: number; bigRate?: number } = {},
  isByog: boolean = false
): BulkLetteringSummary {
  const smallRate = rates.smallRate ?? 7;
  const bigRate = rates.bigRate ?? 10;
  const ratePerLetter = isBig ? bigRate : smallRate;

  const sanitizedRawText = sanitizeBulkMultilineText(rawText || '');
  const rawLines = sanitizedRawText.split(/\r?\n/);

  const lines: BulkLineItemBreakdown[] = [];
  let totalExtraLetters = 0;
  let totalExtraCost = 0;

  rawLines.forEach((rawLine) => {
    const sanitizedLine = rawLine.slice(0, MAX_CHARS_PER_LINE);
    const trimmed = sanitizedLine.trim();
    if (!trimmed) return;

    const costInfo = calculateLetteringCost(trimmed, isBig, rates, isByog);
    totalExtraLetters += costInfo.extraLettersCount;
    totalExtraCost += costInfo.extraCost;

    lines.push({
      ...costInfo,
      lineIndex: lines.length + 1,
      rawLine,
      sanitizedLine: trimmed,
      charCount: trimmed.length,
    });
  });

  const lineCount = lines.length;
  const averageExtraCostPerUnit = lineCount > 0 ? totalExtraCost / lineCount : 0;

  return {
    lines,
    lineCount,
    isBigGarment: isBig,
    ratePerLetter,
    totalExtraLetters,
    totalExtraCost,
    averageExtraCostPerUnit,
    sanitizedRawText,
    namesList: lines.map((l) => l.sanitizedLine),
  };
}

