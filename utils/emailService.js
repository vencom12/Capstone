/**
 * Email Service — Resend HTTP API (Primary / Render-safe) + Nodemailer Gmail SMTP (Fallback)
 * Handles verification emails, password reset links, transactional notifications, etc.
 */

const nodemailer = require('nodemailer');
const crypto = require('crypto');

let resendClient = null;

/**
 * Returns the Resend client if RESEND_API_KEY is configured.
 * Resend sends over standard HTTPS (Port 443), bypassing Render's SMTP port blocks.
 */
function getResendClient() {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;
  if (!resendClient) {
    try {
      const { Resend } = require('resend');
      resendClient = new Resend(apiKey);
    } catch (err) {
      console.error('[EmailService] Failed to initialize Resend SDK:', err);
      return null;
    }
  }
  return resendClient;
}

/**
 * Creates and returns a reusable Nodemailer transporter.
 * Uses Gmail SMTP with an App Password. Includes strict connection timeouts
 * so requests never hang for 30 seconds if an outbound SMTP port is blocked.
 */
function createTransporter() {
  const gmailUser = (process.env.GMAIL_USER || process.env.EMAIL_USER || '').trim();
  const rawPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS || '';
  const gmailAppPassword = rawPass.replace(/\s+/g, '');

  if (!gmailUser || !gmailAppPassword) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
    connectionTimeout: 5000, // 5s connection timeout
    greetingTimeout: 5000,
    socketTimeout: 8000,
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
 * Internal unified email dispatcher:
 * 1. Attempts Resend (HTTP Port 443 — 100% works on Render & Cloud)
 * 2. Attempts Gmail SMTP (Nodemailer with 5s timeout)
 * 3. Falls back to Console Simulation Mode
 */
async function dispatchEmail({ to, subject, html, simulationInfo }) {
  const businessName = process.env.BUSINESS_NAME || 'Stitch-Opt Designs';

  // 1. Try Resend HTTP API (Ideal for Render / Production)
  const resend = getResendClient();
  if (resend) {
    try {
      const fromAddress = process.env.RESEND_FROM || 'Stitch-Opt <onboarding@resend.dev>';
      const result = await resend.emails.send({
        from: fromAddress,
        to: [to],
        subject,
        html,
      });

      if (result.error) {
        console.error('[Resend Error]', result.error);
      } else {
        console.log(`[Email Sent via Resend] To: ${to}, ID: ${result.data?.id}`);
        return { success: true, provider: 'resend', id: result.data?.id };
      }
    } catch (err) {
      console.error('[Resend Exception]', err.message || err);
    }
  }

  // 2. Try Nodemailer Gmail SMTP (Fallback for local dev or unblocked environments)
  const transporter = createTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: `"${businessName}" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        html,
      });

      console.log(`[Email Sent via Nodemailer] To: ${to}, ID: ${info.messageId}`);
      return { success: true, provider: 'nodemailer', id: info.messageId };
    } catch (err) {
      console.error('[Nodemailer Error]', err.message || err);
    }
  }

  // 3. Fallback: Simulation Mode
  console.log('\n============================================================');
  console.log(`📧 [EMAIL GATEWAY SIMULATION — ${simulationInfo?.tag || 'STITCH-OPT'}]`);
  console.log(`Recipient: ${to}`);
  if (simulationInfo?.url) {
    console.log(`Action Link: ${simulationInfo.url}`);
  }
  console.log('Notice: Configure RESEND_API_KEY or GMAIL_APP_PASSWORD for live delivery.');
  console.log('============================================================\n');

  return { success: true, simulated: true };
}

/**
 * Sends a verification email with a clickable link.
 * @param {string} recipientEmail
 * @param {string} recipientName 
 * @param {string} verificationToken
 * @returns {Promise<{ success: boolean, simulated?: boolean, provider?: string }>}
 */
async function sendVerificationEmail(recipientEmail, recipientName, verificationToken) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
  const businessName = process.env.BUSINESS_NAME || 'Stitch-Opt Designs';

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0f1117; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
          ✉️ Verify Your Email
        </h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 13px;">
          ${businessName}
        </p>
      </div>
      <div style="padding: 28px 24px;">
        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Hi <strong>${recipientName}</strong>,
        </p>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 24px;">
          Welcome to ${businessName}! Please verify your email address by clicking the button below. 
          This link will expire in <strong style="color: #e2e8f0;">24 hours</strong>.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${verifyUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); 
                    color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 12px; 
                    font-size: 14px; font-weight: 700; letter-spacing: 0.3px;
                    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
            Verify Email Address
          </a>
        </div>
        <p style="color: #64748b; font-size: 11px; line-height: 1.5; margin: 20px 0 0; word-break: break-all;">
          If the button doesn't work, copy and paste this URL into your browser:<br/>
          <a href="${verifyUrl}" style="color: #6366f1;">${verifyUrl}</a>
        </p>
      </div>
      <div style="border-top: 1px solid rgba(255,255,255,0.06); padding: 16px 24px; text-align: center;">
        <p style="color: #475569; font-size: 11px; margin: 0;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  return dispatchEmail({
    to: recipientEmail,
    subject: `Verify your email — ${businessName}`,
    html: htmlContent,
    simulationInfo: { tag: 'EMAIL VERIFICATION', url: verifyUrl },
  });
}

/**
 * Sends a password reset email with a one-hour link.
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @param {string} resetToken
 * @returns {Promise<{ success: boolean, simulated?: boolean, provider?: string }>}
 */
async function sendPasswordResetEmail(recipientEmail, recipientName, resetToken) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  const businessName = process.env.BUSINESS_NAME || 'Stitch-Opt Designs';

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0f1117; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800;">🔑 Reset Your Password</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 13px;">${businessName}</p>
      </div>
      <div style="padding: 28px 24px;">
        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 24px;">
          We received a request to reset your password. Click the button below to choose a new one.
          This link expires in <strong style="color: #e2e8f0;">1 hour</strong>.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 11px; line-height: 1.5; margin: 20px 0 0; word-break: break-all;">
          If the button doesn't work, copy this URL into your browser:<br/>
          <a href="${resetUrl}" style="color: #6366f1;">${resetUrl}</a>
        </p>
      </div>
      <div style="border-top: 1px solid rgba(255,255,255,0.06); padding: 16px 24px; text-align: center;">
        <p style="color: #475569; font-size: 11px; margin: 0;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    </div>
  `;

  return dispatchEmail({
    to: recipientEmail,
    subject: `Reset your password — ${businessName}`,
    html: htmlContent,
    simulationInfo: { tag: 'PASSWORD RESET', url: resetUrl },
  });
}

module.exports = {
  generateVerificationToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
