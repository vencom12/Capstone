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
    <body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #f8fafc;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #090d16; padding: 10px 4px;">
        <tr>
          <td align="center" valign="top">
            <!-- Main Compact Container (Full width on mobile, max 520px) -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 520px; background-color: #0d121f; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
              
              <!-- Top Crimson Precision Bar -->
              <tr>
                <td style="height: 3px; background: linear-gradient(90deg, #b91c1c 0%, #dc2626 50%, #991b1b 100%); font-size: 0; line-height: 0;">&nbsp;</td>
              </tr>

              <!-- Ultra-Compact Header (Single horizontal row) -->
              <tr>
                <td style="padding: 10px 14px; background-color: #0d121f; border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td valign="middle">
                        <table cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td valign="middle" style="padding-right: 8px;">
                              <div style="width: 26px; height: 26px; background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); border-radius: 5px; text-align: center; line-height: 26px; font-size: 10.5px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px;">
                                EDZ
                              </div>
                            </td>
                            <td valign="middle">
                              <div style="font-size: 11.5px; font-weight: 800; color: #ffffff; letter-spacing: 0.3px; text-transform: uppercase;">
                                ${businessName}
                              </div>
                              <div style="font-size: 9.5px; color: #94a3b8;">
                                Pacific Mall Lucena • Studio
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
                    <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.04);">
                      <div style="color: #f8fafc; font-size: 14px; font-weight: 700;">
                        ${title}
                      </div>
                      ${subtitle ? `
                        <div style="color: #94a3b8; font-size: 11px; margin-top: 1px;">
                          ${subtitle}
                        </div>
                      ` : ''}
                    </div>
                  ` : ''}
                </td>
              </tr>

              <!-- Card Body Content -->
              <tr>
                <td style="padding: 12px 14px; background-color: #111827;">
                  ${contentHtml}
                </td>
              </tr>

              <!-- Ultra-Compact Footer (Single clean line) -->
              <tr>
                <td style="border-top: 1px solid rgba(255, 255, 255, 0.06); padding: 8px 14px; text-align: center; background-color: #090d16; font-size: 10px; color: #64748b; line-height: 1.4;">
                  Eds Towels &amp; Caps • Ground Floor, Pacific Mall Lucena City • 0928 810 3928
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
 */
async function sendVerificationEmail(recipientEmail, recipientName, verificationToken) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';

  const contentHtml = `
    <div style="color: #e2e8f0; font-size: 13px; line-height: 1.5; margin-bottom: 12px;">
      Hi <strong style="color: #ffffff;">${recipientName || 'Valued Client'}</strong>, welcome to <strong>${businessName}</strong>! Please verify your email to activate your account:
    </div>

    <div style="margin: 14px 0;">
      <a href="${verifyUrl}" 
         style="display: block; text-align: center; background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); 
                color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px; 
                font-size: 13px; font-weight: 700; letter-spacing: 0.3px;
                box-shadow: 0 2px 8px rgba(185, 28, 28, 0.35);">
        Verify Email Address &rarr;
      </a>
    </div>

    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px; padding: 8px 10px;">
      <div style="color: #64748b; font-size: 10px; line-height: 1.4; word-break: break-all;">
        Or paste into browser: <a href="${verifyUrl}" style="color: #ef4444; text-decoration: underline;">${verifyUrl}</a>
      </div>
    </div>
  `;

  const htmlContent = renderEmailShell({
    title: 'Verify Your Email',
    subtitle: 'Expires in 24 hours',
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
 */
async function sendPasswordResetEmail(recipientEmail, recipientName, resetToken) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';

  const contentHtml = `
    <div style="color: #e2e8f0; font-size: 13px; line-height: 1.5; margin-bottom: 12px;">
      Hi <strong style="color: #ffffff;">${recipientName || 'Valued Client'}</strong>, we received a request to reset your password. Tap below to choose a new one:
    </div>

    <div style="margin: 14px 0;">
      <a href="${resetUrl}" 
         style="display: block; text-align: center; background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); 
                color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px; 
                font-size: 13px; font-weight: 700; letter-spacing: 0.3px;
                box-shadow: 0 2px 8px rgba(185, 28, 28, 0.35);">
        Reset Password &rarr;
      </a>
    </div>

    <div style="color: #64748b; font-size: 10.5px; text-align: center;">
      Link expires in 1 hour. If you didn't request this, you can safely ignore this email.
    </div>
  `;

  const htmlContent = renderEmailShell({
    title: 'Reset Password',
    subtitle: 'Security link valid for 1 hour',
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
 */
async function sendPasswordChangedAlertEmail(recipientEmail, recipientName) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';
  const resetUrl = `${baseUrl}/?auth=forgot`;
  const timeFormatted = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

  const contentHtml = `
    <div style="color: #e2e8f0; font-size: 13px; line-height: 1.5; margin-bottom: 10px;">
      Hi <strong style="color: #ffffff;">${recipientName || 'Valued Client'}</strong>, the password for your account was changed on <strong style="color: #ffffff;">${timeFormatted}</strong>. All other sessions have been logged out.
    </div>

    <div style="background: rgba(239, 68, 68, 0.08); border-left: 3px solid #ef4444; border-radius: 6px; padding: 10px 12px; margin-top: 10px;">
      <div style="color: #fca5a5; font-size: 11px; margin-bottom: 6px;">
        <strong>Did not make this change?</strong> Secure your account immediately:
      </div>
      <a href="${resetUrl}" style="display: inline-block; background: #b91c1c; color: #ffffff; text-decoration: none; padding: 6px 14px; border-radius: 4px; font-size: 11px; font-weight: 700;">
        Secure My Account &rarr;
      </a>
    </div>
  `;

  const htmlContent = renderEmailShell({
    title: 'Password Updated',
    subtitle: 'Account security notification',
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
 * Sends an ultra-compact, mobile-first Order Confirmation & Claim Slip email.
 * Maximizes horizontal space so customers can view their claim code, ready time,
 * items, and store counter without scrolling on mobile phones.
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

  // 2. Estimated Ready Date & Time calculation
  const ordersAhead = personalization.ordersAhead !== undefined ? personalization.ordersAhead : null;
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
      : 'Queued for workshop';
  }

  const paymentMethodLabel = (order.paymentMethod || 'GCash').toUpperCase();

  // 3. Compact Horizontal Itemized Breakdown
  const itemsHtml = items.length > 0 ? items.map((it, idx) => {
    const customText = it.personalization?.text || personalization.text || '';
    const rawThread = it.personalization?.color || it.personalization?.threadHex || personalization.color || '';
    const fontChoice = it.personalization?.font || personalization.font || '';
    const unitPrice = parseFloat(it.price || 0);
    const qty = it.quantity || 1;
    const itemSubtotal = (unitPrice * qty).toFixed(2);
    const isLast = idx === items.length - 1;

    return `
      <div style="padding: 6px 0; ${isLast ? '' : 'border-bottom: 1px solid rgba(255, 255, 255, 0.05);'}">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
          <tr>
            <td style="color: #f8fafc; font-size: 12px; font-weight: 600; line-height: 1.3;">
              <span style="display: inline-block; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-right: 4px;">${qty}x</span>
              ${it.name || 'Custom Garment'}
            </td>
            <td align="right" style="color: #f8fafc; font-weight: 700; font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 12px;">
              ₱${itemSubtotal}
            </td>
          </tr>
        </table>
        ${customText ? `
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px; line-height: 1.3;">
            <span style="color: #f87171; font-weight: 700;">&ldquo;${customText}&rdquo;</span>
            ${rawThread ? ` • Thread: <strong style="color: #ffffff;">${rawThread}</strong>` : ''}
            ${fontChoice ? ` • Font: <strong style="color: #ffffff;">${fontChoice}</strong>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('') : `
    <div style="color: #94a3b8; font-size: 12px; padding: 4px 0;">Custom Embroidery Garments</div>
  `;

  // Status Badge for top right
  const statusBadge = `
    <span style="display: inline-block; font-size: 9.5px; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.25); padding: 3px 8px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.3px;">
      ✓ Paid &amp; Queued
    </span>
  `;

  const queueSubtitle = ordersAhead !== null
    ? (ordersAhead === 0 ? 'Next in line' : `${ordersAhead} orders ahead`)
    : 'Workshop queue';

  const contentHtml = `
    <!-- Dual-Column Hero Card: Claim Code + Ready Time (Zero Scrolling Needed) -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #151d2e; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; margin-bottom: 10px;">
      <tr>
        <!-- Left: Claim Code -->
        <td width="48%" style="padding: 10px 12px; text-align: center; vertical-align: middle; border-right: 1px solid rgba(255, 255, 255, 0.08);">
          <div style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #f87171;">
            CLAIM CODE
          </div>
          <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 2px; margin: 2px 0;">
            ${claimCode}
          </div>
          <div style="font-size: 9px; color: #94a3b8;">
            Show at GF Counter
          </div>
        </td>
        <!-- Right: Ready Time -->
        <td width="52%" style="padding: 10px 12px; text-align: center; vertical-align: middle;">
          <div style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #34d399;">
            ESTIMATED READY
          </div>
          <div style="font-size: 12px; font-weight: 700; color: #ffffff; line-height: 1.25; margin: 3px 0 1px;">
            ${estimatedReadyLabel}
          </div>
          <div style="font-size: 9px; color: #94a3b8;">
            ${queueSubtitle}
          </div>
        </td>
      </tr>
    </table>

    <!-- Order Items & Payment Summary (High Density Horizontal Space) -->
    <div style="background: #151d2e; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 6px;">
        <tr>
          <td style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; font-family: monospace;">
            ORDER #${orderId}
          </td>
          <td align="right" style="font-size: 11px; font-weight: 700; color: #10b981;">
            PAID ₱${totalAmount} <span style="font-size: 9.5px; color: #94a3b8; font-weight: 500;">(${paymentMethodLabel})</span>
          </td>
        </tr>
      </table>

      <!-- Items List -->
      ${itemsHtml}
    </div>

    <!-- Store Counter Pick-Up Info -->
    <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 9px 12px; text-align: center;">
      <div style="font-size: 10.5px; color: #94a3b8; line-height: 1.35;">
        <strong style="color: #ffffff;">Pick-Up:</strong> Eds Towels &amp; Caps, Ground Floor, Pacific Mall Lucena (10 AM – 8 PM)
      </div>
    </div>
  `;

  const htmlContent = renderEmailShell({
    title: '',
    statusBadge,
    contentHtml,
  });

  return dispatchEmail({
    to: recipientEmail,
    subject: `Order #${orderId} Confirmed — ${businessName}`,
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
