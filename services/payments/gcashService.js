const fetch = global.fetch || require('node-fetch');

/**
 * GCash Payment Service
 * Encapsulates GCash direct API payments (e.g. PayMongo) and screenshot verification validation rules.
 */
class GcashService {
  constructor() {
    this.secretKey = process.env.PAYMONGO_SECRET_KEY || '';
    this.publicKey = process.env.PAYMONGO_PUBLIC_KEY || '';
  }

  /**
   * Generates a direct checkout link for GCash via PayMongo/Xendit
   * @param {number} amount - Total amount in USD/PHP
   * @param {string} orderId - System order ID
   * @returns {Promise<{ checkoutUrl: string, transactionId: string }>}
   */
  async createCheckoutLink(amount, orderId) {
    if (!this.secretKey) {
      console.warn('[GCash Service] Missing PAYMONGO_SECRET_KEY. Using mock link generation.');
      return {
        checkoutUrl: `https://mock.paymentgateway.com/gcash/checkout?order=${orderId}&amount=${amount}`,
        transactionId: `GCASH-MOCK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
      };
    }

    try {
      // PayMongo Source / Checkout Link creation API endpoint
      const response = await fetch('https://api.paymongo.com/v1/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`
        },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: Math.round(amount * 100), // In cents
              description: `Stitch-Opt Order #${orderId}`,
              remarks: orderId,
              payment_method_allowed: ['gcash']
            }
          }
        })
      });

      const data = await response.json();
      if (!response.ok || !data.data) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to create PayMongo checkout link');
      }

      return {
        checkoutUrl: data.data.attributes.checkout_url,
        transactionId: data.data.id
      };
    } catch (err) {
      console.error('[GCash Service] Error creating GCash checkout link:', err);
      throw err;
    }
  }

  /**
   * Dynamically derives expected recipient tokens, GCash masked-name patterns,
   * and phone number suffixes strictly from Admin-configured SystemSettings.
   * Zero hardcoded names or phone numbers.
   * @param {Object|null} storeSettings
   * @returns {{ tokens: string[], maskedRegexes: RegExp[] }}
   */
  buildDynamicRecipientMatchers(storeSettings = null) {
    const tokens = new Set();
    const maskedRegexes = [];

    if (!storeSettings || typeof storeSettings !== 'object') {
      return { tokens: [], maskedRegexes: [] };
    }

    const candidateNames = [
      storeSettings.gcashAccountName,
      storeSettings.businessName
    ].filter(v => typeof v === 'string' && v.trim().length > 0);

    for (const rawName of candidateNames) {
      const normalizedFull = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedFull.length >= 3) {
        tokens.add(normalizedFull);
      }

      const words = rawName
        .trim()
        .split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
        .filter(Boolean);

      for (const w of words) {
        if (w.length >= 4) {
          tokens.add(w.toLowerCase());
        }
      }

      // Derive GCash Express Send masked patterns algorithmically from any configured full name
      // GCash masks first word as <First2>•••<Last1>, middle words as <First1>••, last word as <First1>.
      if (words.length >= 2 && words[0].length >= 2) {
        const firstTwo = words[0].slice(0, 2).toLowerCase();
        const firstLast = words[0].length >= 3 ? words[0].slice(-1).toLowerCase() : '';
        const middleInitials = words.slice(1, -1).map(w => w[0].toLowerCase()).join('');
        const lastInitial = words[words.length - 1].slice(0, 1).toLowerCase();

        const exactMaskedLetters = `${firstTwo}${firstLast}${middleInitials}${lastInitial}`;
        if (exactMaskedLetters.length >= 3) {
          tokens.add(exactMaskedLetters);
        }
        maskedRegexes.push(new RegExp(`^${firstTwo}[a-z*•.\\s]*${lastInitial}\\.?$`, 'i'));
      }
    }

    const candidatePhones = [
      storeSettings.gcashAccountNumber,
      storeSettings.businessContact
    ].filter(v => typeof v === 'string' && v.trim().length > 0);

    for (const rawPhone of candidatePhones) {
      const digits = rawPhone.replace(/\D/g, '');
      if (digits.length >= 4) {
        tokens.add(digits.slice(-4));
        tokens.add(digits.slice(-3));
      }
    }

    return {
      tokens: Array.from(tokens),
      maskedRegexes
    };
  }

  /**
   * Calculates Levenshtein distance between two strings to detect single/double digit modifications.
   */
  calculateLevenshteinDistance(a, b) {
    if (!a || !b) return Math.max(a ? a.length : 0, b ? b.length : 0);
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1) // insertion / deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Validates GCash-specific OCR details extracted by AI Vision / Local OCR
   * @param {Object} aiResult - The result object from OCR/AI Vision
   * @param {Object} [storeSettings] - Optional store system settings
   * @returns {{ isValid: boolean, error?: string, warning?: string }}
   */
  validateReceiptData(aiResult, storeSettings = null) {
    const { referenceId, paymentPlatform, recipientName, recipientPhone, rawText } = aiResult;

    // 1. Platform validation
    if (paymentPlatform && !/gcash|instapay|maya|paymaya|e-wallet|express\s*send/i.test(paymentPlatform)) {
      return {
        isValid: false,
        error: `Please upload a GCash receipt. We noticed this screenshot might be from a different app.`
      };
    }

    // 2. Reference ID algorithmic & structural sanity
    if (referenceId) {
      const sanitizedRef = String(referenceId).replace(/\s+/g, '');
      const isDigitsOnly = /^\d+$/.test(sanitizedRef);
      
      if (!isDigitsOnly || sanitizedRef.length < 10 || sanitizedRef.length > 16) {
        return {
          isValid: false,
          error: `Please make sure your GCash Reference Number is clear and visible on the screenshot.`
        };
      }

      // Check for obvious synthetic or sequential dummy reference numbers
      const isRepeatedChar = /^(\d)\1{9,}$/.test(sanitizedRef); // e.g. 1111111111111
      const isSequentialAscending = '01234567890123456789'.includes(sanitizedRef);
      if (isRepeatedChar || isSequentialAscending) {
        return {
          isValid: false,
          error: `Please upload your official GCash receipt screenshot for this payment.`
        };
      }
    }

    // 3. Dynamic Recipient Identity Check (derived strictly from SystemSettings — zero hardcoded aliases)
    if (recipientName && typeof recipientName === 'string' && storeSettings) {
      const cleanedRecipient = recipientName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanedPhone = recipientPhone ? String(recipientPhone).replace(/\D/g, '') : '';
      const { tokens, maskedRegexes } = this.buildDynamicRecipientMatchers(storeSettings);

      if (tokens.length > 0 || maskedRegexes.length > 0) {
        const isMaskedNameMatch = maskedRegexes.some(rx => rx.test(recipientName.trim()));
        const isTokenMatch = tokens.some(token =>
          cleanedRecipient.includes(token) ||
          (cleanedRecipient.length >= 4 && token.includes(cleanedRecipient)) ||
          (cleanedPhone.length >= 3 && token.length >= 3 && /^\d+$/.test(token) && cleanedPhone.endsWith(token))
        );
        const cleanedRawText = rawText ? rawText.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const textHasRecipient = cleanedRawText
          ? tokens.some(token => cleanedRawText.includes(token))
          : false;

        if (!isMaskedNameMatch && !isTokenMatch && !textHasRecipient && cleanedRecipient.length >= 4) {
          if (storeSettings.hasExplicitGcashRecipient) {
            const displayStoreName = storeSettings.businessName || storeSettings.gcashAccountName || 'our official store GCash account';
            return {
              isValid: false,
              error: `This receipt shows payment was sent to "${recipientName}". Please send your payment to our official store GCash account (${displayStoreName}) and upload the receipt here.`
            };
          }
          console.warn(`[GCash Service] Recipient "${recipientName}" noted for staff review (no explicit GCash recipient name configured in SystemSettings yet).`);
        }
      }
    }

    return { isValid: true };
  }
}

module.exports = new GcashService();
