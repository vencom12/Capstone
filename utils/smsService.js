/**
 * SMS Gateway & Philippine Phone Normalization Utility
 * Supports Semaphore API (Philippines) + Dev/Defense Mode Simulation
 */

/**
 * Normalizes any Philippine phone number to both E.164 (+639...) and local (09...) formats.
 * @param {string} phone
 * @returns {{ valid: boolean, e164: string, local: string, error?: string }}
 */
function normalizePhilippinePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, e164: '', local: '', error: 'Phone number is required.' };
  }

  // Strip all non-digits except a leading '+'
  const cleaned = phone.trim().replace(/[^\d+]/g, '');

  let digits = cleaned;
  if (digits.startsWith('+')) {
    digits = digits.substring(1);
  }

  // Handle formats:
  // 1. 09XXXXXXXXX (11 digits)
  // 2. 639XXXXXXXXX (12 digits)
  // 3. 9XXXXXXXXX (10 digits)
  let e164 = '';
  let local = '';

  if (digits.startsWith('09') && digits.length === 11) {
    e164 = `+63${digits.substring(1)}`;
    local = digits;
  } else if (digits.startsWith('639') && digits.length === 12) {
    e164 = `+${digits}`;
    local = `0${digits.substring(2)}`;
  } else if (digits.startsWith('9') && digits.length === 10) {
    e164 = `+63${digits}`;
    local = `0${digits}`;
  } else {
    return {
      valid: false,
      e164: '',
      local: '',
      error: 'Invalid Philippine phone number. Please enter a valid 11-digit mobile number (e.g., 0917 123 4567).'
    };
  }

  return { valid: true, e164, local };
}

/**
 * Generates a cryptographically random numeric OTP.
 * @param {number} length 
 * @returns {string}
 */
function generateOtp(length = 6) {
  const crypto = require('crypto');
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return crypto.randomInt(min, max).toString();
}

/**
 * Sends an SMS message using Semaphore API or fallback simulation.
 * @param {string} recipientPhone Local format (e.g. 09171234567) or E.164
 * @param {string} message 
 * @returns {Promise<{ success: boolean, simulated: boolean, messageId?: string, error?: string }>}
 */
async function sendSms(recipientPhone, message) {
  const { valid, local, e164 } = normalizePhilippinePhone(recipientPhone);
  if (!valid) {
    return { success: false, simulated: false, error: 'Invalid recipient phone number.' };
  }

  const apiKey = process.env.SEMAPHORE_API_KEY;

  // If Semaphore API key is configured, dispatch real SMS
  if (apiKey) {
    try {
      const response = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: apiKey,
          number: local,
          message: message,
          sendername: process.env.SEMAPHORE_SENDER_NAME || undefined
        })
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('[Semaphore API Error]', data);
        return { success: false, simulated: false, error: data.message || 'Failed to dispatch SMS via gateway.' };
      }

      console.log(`[SMS Delivered] Sent to ${local} via Semaphore.`);
      return { success: true, simulated: false, messageId: Array.isArray(data) && data[0]?.message_id };
    } catch (err) {
      console.error('[Semaphore Dispatch Exception]', err);
      // Fallback to simulation if network or gateway fails
    }
  }

  // Development / Capstone Defense Simulation Mode
  console.log('\n============================================================');
  console.log('📱 [SMS GATEWAY SIMULATION — CAPSTONE DEFENSE MODE]');
  console.log(`Recipient: ${local} (${e164})`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Message:   ${message}`);
  console.log('============================================================\n');

  return { success: true, simulated: true };
}

module.exports = {
  normalizePhilippinePhone,
  generateOtp,
  sendSms
};
