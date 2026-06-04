const fetch = global.fetch || require('node-fetch');

/**
 * PayMaya (Maya) Payment Service
 * Encapsulates Maya Checkout API payments and screenshot verification validation rules.
 */
class PaymayaService {
  constructor() {
    this.secretKey = process.env.MAYA_SECRET_KEY || '';
    this.publicKey = process.env.MAYA_PUBLIC_KEY || '';
    this.apiUrl = process.env.MAYA_API_URL || 'https://pg-sandbox.paymaya.com'; // or https://pg.paymaya.com for production
  }

  /**
   * Generates a direct checkout link for PayMaya via Maya Checkout API
   * @param {number} amount - Total amount in USD/PHP
   * @param {string} orderId - System order ID
   * @returns {Promise<{ checkoutUrl: string, transactionId: string }>}
   */
  async createCheckoutLink(amount, orderId) {
    if (!this.secretKey) {
      console.warn('[PayMaya Service] Missing MAYA_SECRET_KEY. Using mock link generation.');
      return {
        checkoutUrl: `https://mock.paymentgateway.com/paymaya/checkout?order=${orderId}&amount=${amount}`,
        transactionId: `PAYMAYA-MOCK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
      };
    }

    try {
      // Maya Checkout API payload
      const response = await fetch(`${this.apiUrl}/checkout/v1/checkouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`
        },
        body: JSON.stringify({
          totalAmount: {
            value: amount,
            currency: 'PHP'
          },
          requestReferenceNumber: orderId,
          redirectUrl: {
            success: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?status=success`,
            failure: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?status=failed`,
            cancel: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?status=cancelled`
          }
        })
      });

      const data = await response.json();
      if (!response.ok || !data.redirectUrl) {
        throw new Error(data.message || 'Failed to create Maya checkout session');
      }

      return {
        checkoutUrl: data.redirectUrl,
        transactionId: data.checkoutId
      };
    } catch (err) {
      console.error('[PayMaya Service] Error creating Maya checkout link:', err);
      throw err;
    }
  }

  /**
   * Validates PayMaya-specific OCR details extracted by AI Vision
   * @param {Object} aiResult - The result object from AI Vision
   * @returns {{ isValid: boolean, error?: string }}
   */
  validateReceiptData(aiResult) {
    const { referenceId, paymentPlatform } = aiResult;

    // Platform validation
    if (paymentPlatform && !/(paymaya|maya)/i.test(paymentPlatform)) {
      return {
        isValid: false,
        error: `Receipt platform mismatch: expected PayMaya/Maya, got ${paymentPlatform}`
      };
    }

    // Maya reference numbers are usually alphanumeric/numeric (standard receipt ref ID)
    if (referenceId) {
      const sanitizedRef = referenceId.replace(/\s+/g, '');
      if (sanitizedRef.length < 6 || sanitizedRef.length > 24) {
        return {
          isValid: false,
          error: `Suspicious PayMaya/Maya reference ID format: "${referenceId}". Ref length should be between 6 and 24 characters.`
        };
      }
    }

    return { isValid: true };
  }
}

module.exports = new PaymayaService();
