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
   * Recognized store recipient aliases for Eds Towels & Caps / Stitch-Opt.
   * Matches full names, store names, GCash masked formats (e.g., DA*****E** A.), and phone suffixes.
   */
  getRecognizedRecipientAliases() {
    return [
      'eds towels',
      'eds towels & caps',
      'eds towels and caps',
      'eds embroidery',
      'stitch-opt',
      'stitch opt',
      'stitch opt designs',
      'daniele a',
      'daniele',
      'daniel',
      'da*****e** a',
      'daceeseees a', // Tesseract OCR rendering of masked name
      'daceeseees',
      '766', // Phone ending digits for store account (+63 9****** 766)
      '3928'
    ];
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
    const { referenceId, paymentPlatform, recipientName, rawText } = aiResult;

    // 1. Platform validation
    if (paymentPlatform && !/gcash|instapay|e-wallet/i.test(paymentPlatform)) {
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

      // Standard GCash ref format (13 digits typically starting with 00, 10, 20, 50, 90)
      if (sanitizedRef.length === 13) {
        const validPrefix = /^(00|10|20|50|90)/.test(sanitizedRef);
        if (!validPrefix) {
          console.warn(`[GCash Service] Non-standard 13-digit prefix detected for ref: ${sanitizedRef}`);
        }
      }
    }

    // 3. Recipient Identity Validation (Anti-Friend Transfer Spoofing)
    // If the receipt contains recipient information, verify it belongs to this business
    if (recipientName && typeof recipientName === 'string') {
      const cleanedRecipient = recipientName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const storeAliases = this.getRecognizedRecipientAliases();
      
      if (storeSettings && storeSettings.businessName) {
        storeAliases.push(storeSettings.businessName.toLowerCase().replace(/[^a-z0-9]/g, ''));
      }

      const isMatch = storeAliases.some(alias => {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanedRecipient.includes(cleanAlias) || cleanAlias.includes(cleanedRecipient);
      });

      // Also check raw text if available for store phone ending or masked alias
      const textHasStoreRecipient = rawText ? storeAliases.some(alias => {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        return rawText.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanAlias);
      }) : false;

      if (!isMatch && !textHasStoreRecipient && cleanedRecipient.length >= 4) {
        return {
          isValid: false,
          error: `This receipt shows payment was sent to "${recipientName}". Please send your payment to our official store GCash account (Eds Towels & Caps) and upload the receipt here.`
        };
      }
    }

    return { isValid: true };
  }
}

module.exports = new GcashService();
