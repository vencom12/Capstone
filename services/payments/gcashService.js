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
   * Validates GCash-specific OCR details extracted by AI Vision
   * @param {Object} aiResult - The result object from AI Vision
   * @returns {{ isValid: boolean, error?: string }}
   */
  validateReceiptData(aiResult) {
    const { referenceId, paymentPlatform } = aiResult;

    // Platform validation
    if (paymentPlatform && !/gcash/i.test(paymentPlatform)) {
      return {
        isValid: false,
        error: `Receipt platform mismatch: expected GCash, got ${paymentPlatform}`
      };
    }

    // GCash reference numbers are typically 13 digits (starts with 5 or 9 or is a 13-digit sequence)
    if (referenceId) {
      const sanitizedRef = referenceId.replace(/\s+/g, '');
      const isDigitsOnly = /^\d+$/.test(sanitizedRef);
      
      if (!isDigitsOnly || sanitizedRef.length < 10 || sanitizedRef.length > 16) {
        return {
          isValid: false,
          error: `Suspicious GCash reference ID format: "${referenceId}". Standard GCash reference numbers are 13-digit numbers.`
        };
      }
    }

    return { isValid: true };
  }
}

module.exports = new GcashService();
