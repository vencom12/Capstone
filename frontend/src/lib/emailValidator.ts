/**
 * Email validation utility adhering to RFC standards, TLD requirements,
 * and smart detection of common typos (e.g. gmail.c, gmail.co, gamil.com).
 */

export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
}

const COMMON_TYPOS: Record<string, string> = {
  'gmail.c': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'yahoo.c': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'hotmail.c': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'outlook.c': 'outlook.com',
  'outlook.co': 'outlook.com',
  'icloud.co': 'icloud.com',
};

export function validateEmail(rawEmail: string): EmailValidationResult {
  const email = (rawEmail || '').trim().toLowerCase();
  
  if (!email) {
    return { isValid: false, error: 'Email address is required.' };
  }

  // Must follow standard RFC email structure with a valid TLD of at least 2 characters (e.g. .com, .ph, .org)
  const rfcRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!rfcRegex.test(email)) {
    if (email.includes('@')) {
      const parts = email.split('@');
      const domain = parts[1] || '';
      
      if (!domain.includes('.')) {
        return { isValid: false, error: 'Domain is missing an extension.' };
      }
      
      const tld = domain.split('.').pop() || '';
      if (tld.length < 2) {
        return { 
          isValid: false, 
          error: `Invalid domain extension ".${tld}".` 
        };
      }
    }
    return { isValid: false, error: 'Please enter a valid email address.' };
  }

  const [localPart, domain] = email.split('@');

  // Detect common typos for major providers (gmail.c, gmail.co, etc.)
  if (COMMON_TYPOS[domain]) {
    const suggested = `${localPart}@${COMMON_TYPOS[domain]}`;
    return {
      isValid: false,
      error: `Did you mean ${suggested}?`,
      suggestion: suggested,
    };
  }

  return { isValid: true };
}
