import type { Product } from '@/lib/types';

/**
 * Normalizes English words to their base stem (handling common plurals, e.g. "fans" -> "fan", "towels" -> "towel").
 */
export function stemWord(word: string): string {
  const w = word.toLowerCase().trim();
  if (w.length <= 2) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('xes')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

/**
 * Cleans punctuation and normalizes whitespace for fast substring/token search.
 */
export function normalizeSearchString(text?: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * High-precision e-commerce product search matcher supporting:
 * - Plural and singular stemming ("fans" <-> "fan", "towels" <-> "towel", "caps" <-> "cap")
 * - Multi-attribute matching (Name, Category/Tag, Description)
 * - Multi-word out-of-order queries ("small fan", "fan small", "chinese fans")
 * - Punctuation tolerance (e.g. "Regular Fan (Small)" matches "regular fan small")
 */
export function matchesProductSearch(product: Product, query?: string): boolean {
  if (!query || !query.trim()) return true;

  const cleanQuery = normalizeSearchString(query);
  if (!cleanQuery) return true;

  const queryWords = cleanQuery.split(' ').filter(Boolean);
  if (queryWords.length === 0) return true;

  const pName = normalizeSearchString(product.name);
  const pTag = normalizeSearchString(product.tag);
  const pDesc = normalizeSearchString(product.description);
  const combined = `${pName} ${pTag} ${pDesc}`;
  const productWords = combined.split(' ').filter(Boolean);
  const productStems = productWords.map(stemWord);

  // Every token in the user's search query must match somewhere in the product's corpus
  return queryWords.every((qWord) => {
    const qStem = stemWord(qWord);
    return (
      productWords.some((pw) => pw.includes(qWord) || pw.includes(qStem)) ||
      productStems.some((ps) => ps.includes(qStem) || ps.includes(qWord))
    );
  });
}

/**
 * Detects if a query is a conversational question intended for AI rather than a standard product search query.
 * Keywords like "fan", "towels", "blue cap", "regular fan" are product searches (0 tokens, 0 AI calls).
 * Sentences like "how much is a cap?", "can you stitch names?", "what do you think?", "where are you located?" are questions.
 */
export function isConversationalQuestion(text?: string): boolean {
  if (!text || !text.trim()) return false;

  const trimmed = text.trim();
  // 1. Explicit question mark
  if (trimmed.includes('?')) return true;

  const lower = trimmed.toLowerCase();

  // 2. Starts with standard English or Tagalog question words
  const questionStarters = [
    'how', 'what', 'where', 'when', 'why', 'who', 'which',
    'can', 'could', 'would', 'will', 'do', 'does', 'did', 'is', 'are', 'was', 'were',
    'paano', 'ano', 'anong', 'saan', 'kailan', 'kelan', 'bakit', 'sino', 'alin',
    'magkano', 'meron ba', 'mayroon ba', 'pwede ba', 'puwede ba', 'kaya ba'
  ];
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  const firstWord = words[0];
  const firstTwoWords = words.slice(0, 2).join(' ');

  if (questionStarters.includes(firstWord) || questionStarters.includes(firstTwoWords)) {
    return true;
  }

  // 3. Conversational intent phrases
  const conversationalPhrases = [
    'what do you think',
    'recommend me',
    'suggest something',
    'gift idea',
    'store hours',
    'opening hours',
    'business hours',
    'pacific mall',
    'turnaround time',
    'how long',
    'custom embroidery',
    'embroider my own',
    'bring my own',
    'magkano magpaburda',
    'paburda'
  ];

  if (conversationalPhrases.some((phrase) => lower.includes(phrase))) {
    return true;
  }

  return false;
}

