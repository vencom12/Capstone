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
 * Sends an email via Brevo's HTTP API (v3).
 * Operates over standard HTTPS (Port 443), bypassing Render's SMTP port restrictions.
 * Free tier provides 300 emails/day to ANY recipient without requiring custom domain DNS.
 */
async function sendViaBrevo({ to, subject, html, businessName }) {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  if (!apiKey) return null;

  const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER || process.env.EMAIL_USER || '').trim();
  if (!senderEmail) {
    console.error('[Brevo Error] BREVO_SENDER_EMAIL or GMAIL_USER is required to send via Brevo.');
    return null;
  }

  try {
    const fetchFn = typeof fetch === 'function' ? fetch : require('node-fetch');
    const response = await fetchFn('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: businessName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[Brevo Error]', response.status, data);
      return null;
    }

    console.log(`[Email Sent via Brevo HTTP API] To: ${to}, Message ID: ${data.messageId}`);
    return { success: true, provider: 'brevo', id: data.messageId };
  } catch (err) {
    console.error('[Brevo Exception]', err.message || err);
    return null;
  }
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
 * 1. Attempts Brevo HTTP API (Port 443 — reliable on Render without domain setup)
 * 2. Attempts Resend HTTP API (Port 443 — reliable on Render with verified domain or test email)
 * 3. Attempts Gmail SMTP (Nodemailer — works locally, blocked by Render Free tier)
 * 4. Falls back to Console Simulation Mode
 */
async function dispatchEmail({ to, subject, html, simulationInfo }) {
  const businessName = process.env.BUSINESS_NAME || 'Stitch-Opt Designs';

  // 1. Try Brevo HTTP API (Port 443 — works out of the box on Render Free tier)
  const brevoResult = await sendViaBrevo({ to, subject, html, businessName });
  if (brevoResult?.success) {
    return brevoResult;
  }

  // 2. Try Resend HTTP API (Port 443 — Render-safe)
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

  // 3. Try Nodemailer Gmail SMTP (Works on localhost; blocked on Render Free)
  const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
  const transporter = createTransporter();
  if (transporter) {
    try {
      const senderEmail = (process.env.GMAIL_USER || process.env.EMAIL_USER || '').trim();
      const info = await transporter.sendMail({
        from: `"${businessName}" <${senderEmail}>`,
        to,
        subject,
        html,
      });

      console.log(`[Email Sent via Nodemailer] To: ${to}, ID: ${info.messageId}`);
      return { success: true, provider: 'nodemailer', id: info.messageId };
    } catch (err) {
      console.error('[Nodemailer Error]', err.message || err);
      if (isRender) {
        console.warn('[EmailService Warning] Render Free tier blocks standard SMTP ports (25, 465, 587). To send real emails from Render, set BREVO_API_KEY or RESEND_API_KEY in Render environment variables.');
      }
    }
  }

  // 4. Fallback: Simulation Mode
  console.log('\n============================================================');
  console.log(`[EMAIL GATEWAY SIMULATION — ${simulationInfo?.tag || 'STITCH-OPT'}]`);
  console.log(`Recipient: ${to}`);
  if (simulationInfo?.url) {
    console.log(`Action Link: ${simulationInfo.url}`);
  }
  if (isRender) {
    console.log('[Render Warning] Outbound SMTP (ports 25, 465, 587) is blocked by Render Free.');
    console.log('   Add BREVO_API_KEY or RESEND_API_KEY to Render Environment Variables for live delivery via HTTPS.');
  } else {
    console.log('Notice: Configure GMAIL_USER/GMAIL_APP_PASSWORD, BREVO_API_KEY, or RESEND_API_KEY for live delivery.');
  }
  console.log('============================================================\n');

  return { success: true, simulated: true, url: simulationInfo?.url };
}

/**
 * Clean monochrome vector icons for emails.
 * Uses inline SVGs in crisp translucent badge containers to ensure 
 * consistent, luxury studio rendering across all email clients and devices.
 */
function renderHeaderIconBadge(svgContent) {
  return `
    <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 50%; background: rgba(255, 255, 255, 0.12); margin-bottom: 12px; text-align: center; vertical-align: middle;">
      <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; height: 100%;">
        <tr>
          <td align="center" valign="middle">
            ${svgContent}
          </td>
        </tr>
      </table>
    </div>
  `;
}

const ICONS = {
  mail: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  key: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  shield: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
  orderBox: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  readyCheck: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
};

/**
 * Renders the shared email shell with the website's Grounded Obsidian (#090d16) canvas,
 * Deep Slate (#111827) card, 3px Artisan Crimson top accent bar, and studio footer.
 */
function renderEmailShell({ title, subtitle, statusBadge, contentHtml }) {
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title || businessName}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #f8fafc;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #090d16; min-height: 100vh; padding: 32px 12px;">
        <tr>
          <td align="center" valign="top">
            <!-- Main Email Container -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 580px; background-color: #0d121f; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
              
              <!-- Top Artisan Crimson Precision Gradient Bar -->
              <tr>
                <td style="height: 3px; background: linear-gradient(90deg, #b91c1c 0%, #dc2626 50%, #991b1b 100%); font-size: 0; line-height: 0;">&nbsp;</td>
              </tr>

              <!-- Studio Brand Header -->
              <tr>
                <td style="padding: 24px 28px; background-color: #0d121f; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="middle">
                        <table cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td valign="middle" style="padding-right: 14px;">
                              <!-- Artisan Brand Monogram Badge -->
                              <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.15); text-align: center; line-height: 40px; box-shadow: 0 4px 12px rgba(185, 28, 28, 0.35);">
                                <span style="font-size: 15px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">EDZ</span>
                              </div>
                            </td>
                            <td valign="middle">
                              <div style="font-size: 13.5px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; text-transform: uppercase;">
                                ${businessName}
                              </div>
                              <div style="font-size: 11px; font-weight: 500; color: #94a3b8; letter-spacing: 0.2px; margin-top: 1px;">
                                Artisan Embroidery Studio • Pacific Mall Lucena
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                      ${statusBadge ? `
                        <td align="right" valign="middle">
                          ${statusBadge}
                        </td>
                      ` : ''}
                    </tr>
                  </table>
                  ${title ? `
                    <div style="margin-top: 18px;">
                      <h1 style="color: #f8fafc; margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -0.4px;">
                        ${title}
                      </h1>
                      ${subtitle ? `
                        <p style="color: #94a3b8; margin: 4px 0 0; font-size: 12.5px; line-height: 1.5;">
                          ${subtitle}
                        </p>
                      ` : ''}
                    </div>
                  ` : ''}
                </td>
              </tr>

              <!-- Card Body Content -->
              <tr>
                <td style="padding: 24px 28px; background-color: #111827;">
                  ${contentHtml}
                </td>
              </tr>

              <!-- Brand Footer matching website -->
              <tr>
                <td style="border-top: 1px solid rgba(255, 255, 255, 0.06); padding: 18px 28px; text-align: center; background-color: #090d16; font-size: 11.5px; color: #64748b; line-height: 1.6;">
                  <div style="font-weight: 600; color: #94a3b8; margin-bottom: 2px;">
                    Eds Towels &amp; Caps • Ground Floor, Pacific Mall Lucena City
                  </div>
                  <div>
                    Operating Daily 10:00 AM – 8:00 PM • Counter Hotline: 0928 810 3928
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
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
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';

  const contentHtml = `
    <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Hi <strong style="color: #ffffff;">${recipientName || 'Valued Client'}</strong>,
    </p>
    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 24px;">
      Welcome to <strong>${businessName}</strong>! Please verify your email address to activate your account and start ordering personalized custom embroidery. This security link expires in <strong style="color: #e2e8f0;">24 hours</strong>.
    </p>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${verifyUrl}" 
         style="display: inline-block; background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); 
                color: #ffffff; text-decoration: none; padding: 13px 34px; border-radius: 8px; 
                font-size: 13.5px; font-weight: 700; letter-spacing: 0.3px;
                box-shadow: 0 4px 14px rgba(185, 28, 28, 0.4); border: 1px solid rgba(255, 255, 255, 0.1);">
        Verify Email Address &rarr;
      </a>
    </div>

    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 8px; padding: 12px 14px; margin-top: 24px;">
      <p style="color: #64748b; font-size: 11px; line-height: 1.5; margin: 0; word-break: break-all;">
        If the button above does not open, copy and paste this URL into your browser:<br/>
        <a href="${verifyUrl}" style="color: #ef4444; text-decoration: underline;">${verifyUrl}</a>
      </p>
    </div>
  `;

  const htmlContent = renderEmailShell({
    title: 'Verify Your Email Address',
    subtitle: 'Activate your customer account for custom embroidery orders',
    contentHtml,
  });

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
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';

  const contentHtml = `
    <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Hi <strong style="color: #ffffff;">${recipientName || 'Valued Client'}</strong>,
    </p>
    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 24px;">
      We received a request to reset your password for your <strong>${businessName}</strong> account. Click the button below to choose a new password. This security link expires in <strong style="color: #e2e8f0;">1 hour</strong> and can only be used once.
    </p>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${resetUrl}" 
         style="display: inline-block; background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); 
                color: #ffffff; text-decoration: none; padding: 13px 34px; border-radius: 8px; 
                font-size: 13.5px; font-weight: 700; letter-spacing: 0.3px;
                box-shadow: 0 4px 14px rgba(185, 28, 28, 0.4); border: 1px solid rgba(255, 255, 255, 0.1);">
        Reset Password &rarr;
      </a>
    </div>

    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 8px; padding: 12px 14px; margin-top: 24px;">
      <p style="color: #64748b; font-size: 11px; line-height: 1.5; margin: 0; word-break: break-all;">
        If you did not request a password reset, you can safely ignore this email. Your account remains secure.
      </p>
    </div>
  `;

  const htmlContent = renderEmailShell({
    title: 'Reset Your Password',
    subtitle: 'Choose a new password to regain access to your account',
    contentHtml,
  });

  return dispatchEmail({
    to: recipientEmail,
    subject: `Reset your password — ${businessName}`,
    html: htmlContent,
    simulationInfo: { tag: 'PASSWORD RESET', url: resetUrl },
  });
}

/**
 * Sends a security alert email when a password has been updated.
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @returns {Promise<{ success: boolean, simulated?: boolean, provider?: string }>}
 */
async function sendPasswordChangedAlertEmail(recipientEmail, recipientName) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';
  const resetUrl = `${baseUrl}/?auth=forgot`;
  const timeFormatted = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

  const contentHtml = `
    <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Hi <strong style="color: #ffffff;">${recipientName || 'Valued Client'}</strong>,
    </p>
    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 20px;">
      The password for your account was successfully changed on <strong style="color: #e2e8f0;">${timeFormatted} (PHT)</strong>.
    </p>

    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px 14px; margin: 0 0 20px;">
      <p style="color: #cbd5e1; font-size: 12px; margin: 0; line-height: 1.5;">
        <strong style="color: #ffffff;">Session Security:</strong> All other active sessions have been automatically logged out for your safety.
      </p>
    </div>

    <div style="background: rgba(239, 68, 68, 0.08); border-left: 3px solid #ef4444; border-radius: 6px; padding: 14px 16px; margin: 0 0 12px;">
      <p style="color: #fca5a5; font-size: 12px; margin: 0 0 10px; line-height: 1.5;">
        <strong>Did not make this change?</strong> Your account may be compromised. Please secure your account immediately or inform our Pacific Mall counter team.
      </p>
      <div style="text-align: left;">
        <a href="${resetUrl}" style="display: inline-block; background: #b91c1c; color: #ffffff; text-decoration: none; padding: 9px 18px; border-radius: 6px; font-size: 12px; font-weight: 700;">
          Secure My Account &rarr;
        </a>
      </div>
    </div>
  `;

  const htmlContent = renderEmailShell({
    title: 'Password Updated',
    subtitle: 'Security notification regarding your customer account',
    contentHtml,
  });

  return dispatchEmail({
    to: recipientEmail,
    subject: `Security Alert: Your password was changed — ${businessName}`,
    html: htmlContent,
    simulationInfo: { tag: 'PASSWORD CHANGED ALERT' },
  });
}

/**
 * Sends an elevated, brand-aligned Order Confirmation & Digital Pick-Up Slip email.
 * Adheres strictly to the website's Grounded Obsidian (#090d16) and Artisan Crimson (#b91c1c) tokens.
 */
async function sendOrderConfirmationEmail(recipientEmail, recipientName, order) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const orderId = order.orderId || order.id || 'N/A';
  const trackingUrl = `${baseUrl}/dashboard?tab=orders`;
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';

  const totalAmount = parseFloat(order.totalAmount || order.amount || 0).toFixed(2);
  const items = Array.isArray(order.items) ? order.items : [];
  const personalization = (order.personalization && typeof order.personalization === 'object') ? order.personalization : {};

  // 1. Official Counter Claim Code
  const getVerificationCode = (id) => {
    if (!id) return '#A-000';
    if (id.startsWith('WI-')) return `#${id.replace('WI-', 'A-')}`;
    const suffix = id.slice(-4).replace(/[^a-zA-Z0-9]/g, '');
    return `#A-${suffix.toUpperCase()}`;
  };
  const claimCode = personalization.claimCode || order.claimCode || getVerificationCode(orderId);

  // 2. Estimated Ready Date & Time calculation honoring Pacific Mall workshop operating hours
  const ordersAhead = personalization.ordersAhead !== undefined ? personalization.ordersAhead : null;
  const queuePosition = personalization.queuePosition !== undefined ? personalization.queuePosition : null;
  let estimatedReadyLabel = personalization.readyLabel || null;

  if (!estimatedReadyLabel) {
    try {
      const { calculatePickupSchedule, estimateArtisanProductionTime } = require('./pickupScheduler');
      const prodMins = order.estimatedTime || estimateArtisanProductionTime(order);
      const schedule = calculatePickupSchedule({
        orderDurationMinutes: prodMins,
        queueBacklogMinutes: (personalization.queueWaitMinutes || 0),
        startTime: order.createdAt ? new Date(order.createdAt) : new Date()
      });
      if (schedule && schedule.readyLabel) {
        estimatedReadyLabel = schedule.readyLabel;
      }
    } catch (schedErr) {
      console.warn('[emailService] Schedule estimation fallback:', schedErr.message);
    }
  }

  if (!estimatedReadyLabel) {
    estimatedReadyLabel = (order.deliveryTime && !order.deliveryTime.includes('Store Hours'))
      ? order.deliveryTime
      : 'Scheduled for workshop production';
  }

  const paymentMethodLabel = (order.paymentMethod || 'GCash').toUpperCase();

  // 3. Itemized Breakdown with Personalization Details
  const itemsHtml = items.length > 0 ? items.map((it) => {
    const customText = it.personalization?.text || personalization.text || '';
    const rawThread = it.personalization?.color || it.personalization?.threadHex || personalization.color || '';
    const fontChoice = it.personalization?.font || personalization.font || '';
    const unitPrice = parseFloat(it.price || 0);
    const qty = it.quantity || 1;
    const itemSubtotal = (unitPrice * qty).toFixed(2);
    
    // Resolve thread swatch color safely
    let swatchColor = '#dc2626';
    if (rawThread) {
      if (rawThread.startsWith('#')) {
        swatchColor = rawThread;
      } else {
        const lower = rawThread.toLowerCase();
        if (lower.includes('gold') || lower.includes('yellow')) swatchColor = '#eab308';
        else if (lower.includes('white') || lower.includes('silver')) swatchColor = '#f8fafc';
        else if (lower.includes('blue')) swatchColor = '#3b82f6';
        else if (lower.includes('green')) swatchColor = '#10b981';
        else if (lower.includes('black')) swatchColor = '#1e293b';
        else if (lower.includes('pink')) swatchColor = '#ec4899';
      }
    }

    return `
      <div style="background: #151d2e; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px;">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
          <tr>
            <td style="color: #f8fafc; font-size: 13px; font-weight: 600;">
              <span style="display: inline-block; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 4px; margin-right: 6px;">${qty}x</span>
              ${it.name || 'Custom Garment'}
            </td>
            <td style="color: #f8fafc; font-weight: 700; font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 13px; text-align: right;">
              ₱${itemSubtotal}
            </td>
          </tr>
        </table>
        ${customText ? `
          <div style="background: #090d16; border-left: 2px solid #b91c1c; padding: 6px 10px; border-radius: 4px; margin-top: 8px;">
            <div style="color: #64748b; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px;">Custom Stitch Text:</div>
            <div style="color: #ffffff; font-size: 12.5px; font-weight: 700; letter-spacing: 0.5px; margin-top: 1px;">&ldquo;${customText}&rdquo;</div>
          </div>
        ` : ''}
        ${rawThread || fontChoice ? `
          <div style="color: #94a3b8; font-size: 11.5px; margin-top: 6px;">
            ${rawThread ? `
              <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background-color: ${swatchColor}; border: 1px solid rgba(255, 255, 255, 0.2); vertical-align: middle; margin-right: 4px;"></span>
              Thread: <strong style="color: #f8fafc;">${rawThread}</strong>
            ` : ''}
            ${rawThread && fontChoice ? ' &nbsp;•&nbsp; ' : ''}
            ${fontChoice ? `Font: <strong style="color: #f8fafc;">${fontChoice}</strong>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('') : `
    <div style="color: #94a3b8; font-size: 13px; padding: 10px 0;">Custom Embroidery Garments</div>
  `;

  // Status Badge for top right
  const statusBadge = `
    <span style="display: inline-block; font-size: 10.5px; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); padding: 5px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
      ✓ Paid &amp; In Queue
    </span>
  `;

  const contentHtml = `
    <!-- Digital Counter Claim Ticket -->
    <div style="background: #1e293b; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);">
      <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #dc2626; margin-bottom: 8px;">
        Official In-Store Claim Slip
      </div>
      <div style="background: #090d16; border: 1px solid rgba(185, 28, 28, 0.4); border-radius: 8px; padding: 10px 24px; display: inline-block; margin-bottom: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.5);">
        <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 30px; font-weight: 800; color: #ffffff; letter-spacing: 3px;">
          ${claimCode}
        </span>
      </div>
      <div style="color: #cbd5e1; font-size: 12px; line-height: 1.5;">
        Present this code to our attendant at Pacific Mall Lucena upon pickup.
      </div>
    </div>

    <!-- 3-Stage Workshop Stepper (Visual, Clean, No Emojis) -->
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 20px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 12px 14px;">
      <tr>
        <td style="text-align: center; width: 33.3%;">
          <div style="font-size: 10px; font-weight: 700; color: #10b981; text-transform: uppercase; letter-spacing: 0.5px;">✓ 1. Verified</div>
          <div style="font-size: 11px; color: #cbd5e1; font-weight: 600; margin-top: 2px;">Payment Settled</div>
        </td>
        <td style="text-align: center; width: 33.3%; border-left: 1px solid rgba(255, 255, 255, 0.08); border-right: 1px solid rgba(255, 255, 255, 0.08);">
          <div style="font-size: 10px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: 0.5px;">● 2. Workshop Queue</div>
          <div style="font-size: 11px; color: #ffffff; font-weight: 600; margin-top: 2px;">${ordersAhead !== null ? (ordersAhead === 0 ? 'Next in Line' : `${ordersAhead} Ahead`) : 'Queued'}</div>
        </td>
        <td style="text-align: center; width: 33.3%;">
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">○ 3. Pick-Up</div>
          <div style="font-size: 11px; color: #94a3b8; font-weight: 500; margin-top: 2px;">Ground Floor</div>
        </td>
      </tr>
    </table>

    <!-- Estimated Ready Time Card -->
    <div style="background: rgba(185, 28, 28, 0.08); border: 1px solid rgba(185, 28, 28, 0.25); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px;">
      <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
        <tr>
          <td valign="middle">
            <span style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #f87171; display: block;">
              Estimated Ready Time
            </span>
            <span style="font-size: 14.5px; font-weight: 700; color: #ffffff; margin-top: 3px; display: block;">
              ${estimatedReadyLabel}
            </span>
          </td>
          <td align="right" valign="middle">
            <span style="display: inline-block; font-size: 10.5px; font-weight: 600; color: #fca5a5; background: rgba(185, 28, 28, 0.2); border: 1px solid rgba(185, 28, 28, 0.35); padding: 4px 10px; border-radius: 6px;">
              Pacific Mall Workshop
            </span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Workshop & Order Details Table -->
    <div style="background: #151d2e; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 16px; margin-bottom: 20px;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; color: #94a3b8; margin-bottom: 12px;">
        Workshop &amp; Pick-Up Details
      </div>
      <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; font-size: 12.5px;">
        <tr>
          <td style="color: #64748b; padding: 6px 0;">Order Reference:</td>
          <td style="color: #f8fafc; font-weight: 600; text-align: right; padding: 6px 0; font-family: 'SFMono-Regular', Consolas, Menlo, monospace;">#${orderId}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 6px 0;">Pick-Up Counter:</td>
          <td style="color: #f8fafc; font-weight: 600; text-align: right; padding: 6px 0;">Eds Towels &amp; Caps (Ground Floor)</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 6px 0;">Operating Hours:</td>
          <td style="color: #94a3b8; text-align: right; padding: 6px 0;">Daily 10:00 AM – 8:00 PM</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 6px 0;">Payment Method:</td>
          <td style="color: #10b981; font-weight: 600; text-align: right; padding: 6px 0;">${paymentMethodLabel} • Fully Paid</td>
        </tr>
        <tr style="border-top: 1px solid rgba(255, 255, 255, 0.08);">
          <td style="color: #f8fafc; font-weight: 700; font-size: 13px; padding-top: 10px;">Total Amount:</td>
          <td style="color: #10b981; font-weight: 800; font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 16px; text-align: right; padding-top: 10px;">₱${totalAmount}</td>
        </tr>
      </table>
    </div>

    <!-- Itemized Garments Breakdown -->
    <div style="margin-bottom: 20px;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; color: #94a3b8; margin-bottom: 12px;">
        Itemized Garments &amp; Personalization
      </div>
      ${itemsHtml}
    </div>

    <!-- Live Tracking Callout (Clean, No Broken Buttons) -->
    <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.07); border-left: 3px solid #b91c1c; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px;">
      <div style="color: #f8fafc; font-size: 12.5px; font-weight: 600; margin-bottom: 4px;">
        Track Workshop Progress Online
      </div>
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0 0 10px;">
        All garments are custom-embroidered in queue order at our Pacific Mall studio. You can monitor live embroidery machine progress anytime in the Orders tab of your customer account.
      </p>
      <a href="${trackingUrl}" style="color: #ef4444; font-size: 12px; font-weight: 600; text-decoration: none; display: inline-block;">
        Open Orders Tab in Browser &rarr;
      </a>
    </div>

    <!-- Claim Instructions -->
    <div style="color: #64748b; font-size: 11.5px; text-align: center; line-height: 1.5; padding: 4px 12px;">
      Please keep this email or note down your Counter Claim Code <strong style="color: #cbd5e1;">${claimCode}</strong> when picking up your order at Pacific Mall Lucena.
    </div>
  `;

  const htmlContent = renderEmailShell({
    title: 'Order Confirmed',
    subtitle: `Order #${orderId} • Placed by ${recipientName || 'Customer'}`,
    statusBadge,
    contentHtml,
  });

  return dispatchEmail({
    to: recipientEmail,
    subject: `Order Received (#${orderId}) — Queued for Production at ${businessName}`,
    html: htmlContent,
    simulationInfo: { tag: 'ORDER CONFIRMATION', url: trackingUrl }
  });
}

module.exports = {
  generateVerificationToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedAlertEmail,
  sendOrderConfirmationEmail,
};
