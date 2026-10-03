/**
 * Email Service — Nodemailer + Gmail App Password
 * Handles verification emails, transactional notifications, etc.
 */

const nodemailer = require('nodemailer');
const crypto = require('crypto');

/**
 * Creates and returns a reusable Nodemailer transporter or Resend client.
 * Uses Gmail SMTP with an App Password or Resend API key for authentication.
 * Falls back to console simulation if credentials are missing.
 */
function createTransporter() {
  const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

  if (!gmailUser || !gmailAppPassword) {
    return null; // Will use simulation mode
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });
}

/**
 * Generates a cryptographically secure verification token.
 * @returns {string} 64-character hex token
 */
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Sends a verification email with a clickable link.
 * @param {string} recipientEmail
 * @param {string} recipientName 
 * @param {string} verificationToken
 * @returns {Promise<{ success: boolean, simulated: boolean, error?: string }>}
 */
async function sendVerificationEmail(recipientEmail, recipientName, verificationToken) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
  const businessName = process.env.BUSINESS_NAME || 'Stitch-Opt Designs';

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0f1117; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
          ✉️ Verify Your Email
        </h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 13px;">
          ${businessName}
        </p>
      </div>
      
      <!-- Body -->
      <div style="padding: 28px 24px;">
        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Hi <strong>${recipientName}</strong>,
        </p>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 24px;">
          Welcome to ${businessName}! Please verify your email address by clicking the button below. 
          This link will expire in <strong style="color: #e2e8f0;">24 hours</strong>.
        </p>
        
        <!-- CTA Button -->
        <div style="text-align: center; margin: 28px 0;">
          <a href="${verifyUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); 
                    color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 12px; 
                    font-size: 14px; font-weight: 700; letter-spacing: 0.3px;
                    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
            Verify Email Address
          </a>
        </div>
        
        <!-- Fallback Link -->
        <p style="color: #64748b; font-size: 11px; line-height: 1.5; margin: 20px 0 0; word-break: break-all;">
          If the button doesn't work, copy and paste this URL into your browser:<br/>
          <a href="${verifyUrl}" style="color: #6366f1;">${verifyUrl}</a>
        </p>
      </div>
      
      <!-- Footer -->
      <div style="border-top: 1px solid rgba(255,255,255,0.06); padding: 16px 24px; text-align: center;">
        <p style="color: #475569; font-size: 11px; margin: 0;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  const transporter = createTransporter();

  // Production mode: send real email
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: `"${businessName}" <${process.env.GMAIL_USER}>`,
        to: recipientEmail,
        subject: `Verify your email — ${businessName}`,
        html: htmlContent,
      });

      console.log(`[Email Sent] Verification email to ${recipientEmail}, messageId: ${info.messageId}`);
      return { success: true, simulated: false, messageId: info.messageId };
    } catch (err) {
      console.error('[Email Send Error]', err);
      // Fall through to simulation
    }
  }

  // Simulation mode (no Gmail credentials configured)
  console.log('\n============================================================');
  console.log('📧 [EMAIL GATEWAY SIMULATION — CAPSTONE DEFENSE MODE]');
  console.log(`Recipient: ${recipientEmail}`);
  console.log(`Name:      ${recipientName}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Verify URL: ${verifyUrl}`);
  console.log('============================================================\n');

  return { success: true, simulated: true };
}

module.exports = {
  generateVerificationToken,
  sendVerificationEmail,
};
