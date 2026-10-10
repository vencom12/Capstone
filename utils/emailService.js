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

/**
 * Sends an Order Confirmation email upon checkout submission.
 */
async function sendOrderConfirmationEmail(recipientEmail, recipientName, order) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const trackingUrl = `${baseUrl}/dashboard?tab=orders`;
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';

  const orderId = order.orderId || order.id || 'N/A';
  const totalAmount = parseFloat(order.totalAmount || order.amount || 0).toFixed(2);
  const items = Array.isArray(order.items) ? order.items : [];
  const personalization = (order.personalization && typeof order.personalization === 'object') ? order.personalization : {};
  const isPickup = personalization.fulfillmentType === 'pickup' || (typeof order.address === 'string' && order.address.toLowerCase().includes('pick-up'));

  const itemsHtml = items.map((it) => `
    <li style="margin-bottom: 8px; color: #e2e8f0; font-size: 13px;">
      <strong>${it.quantity}x ${it.name}</strong> 
      ${it.personalization?.text ? `<span style="color: #fbbf24;">(Stitch: "${it.personalization.text}")</span>` : ''} 
      — ₱${(parseFloat(it.price || 0) * (it.quantity || 1)).toFixed(2)}
    </li>
  `).join('');

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #0f1117; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800;">🧵 Order Confirmed!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 13px;">Order #${orderId} • ${businessName}</p>
      </div>
      <div style="padding: 28px 24px;">
        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Hi <strong>${recipientName || 'Valued Customer'}</strong>,
        </p>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 20px;">
          We have received your embroidery order. Our workshop team is currently digitizing and preparing your items for production.
        </p>
        
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
          <h3 style="color: #ffffff; margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Order Details</h3>
          <ul style="padding-left: 20px; margin: 0;">
            ${itemsHtml || '<li style="color: #94a3b8;">Custom Embroidery Design</li>'}
          </ul>
          <div style="border-top: 1px solid rgba(255,255,255,0.08); margin-top: 12px; padding-top: 10px; display: flex; justify-content: space-between; color: #ffffff; font-weight: bold; font-size: 14px;">
            <span>Total Payable:</span>
            <span style="color: #10b981; font-family: monospace;">₱${totalAmount}</span>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #94a3b8;">
            Fulfillment: <strong style="color: #e2e8f0;">${isPickup ? '🏪 Store Pick-up (Pacific Mall Lucena)' : '🚚 J&T Express Delivery'}</strong>
          </div>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${trackingUrl}" style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 10px; font-size: 13px; font-weight: 700;">
            Track Order Live
          </a>
        </div>
      </div>
    </div>
  `;

  return dispatchEmail({
    to: recipientEmail,
    subject: `Order Confirmed #${orderId} — ${businessName}`,
    html: htmlContent,
    simulationInfo: { tag: 'ORDER CONFIRMATION', url: trackingUrl }
  });
}

const { detectRushSeason } = require('./holidayRushHelper');

/**
 * Sends a notification email when an order is ready for in-store pickup or handed to courier.
 */
async function sendOrderStatusReadyEmail(recipientEmail, recipientName, order, newStatus) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const trackingUrl = `${baseUrl}/dashboard?tab=orders`;
  const businessName = process.env.BUSINESS_NAME || 'Eds Towels & Caps';

  const orderId = order.orderId || order.id || 'N/A';
  const personalization = (order.personalization && typeof order.personalization === 'object') ? order.personalization : {};
  const isPickup = personalization.fulfillmentType === 'pickup' || (typeof order.address === 'string' && order.address.toLowerCase().includes('pick-up'));
  const claimCode = personalization.trackingNumber || `PU-LUC-${orderId.slice(-6).toUpperCase()}`;

  const isReadyForPickup = newStatus ? (newStatus.toLowerCase().includes('pick') || isPickup) : isPickup;

  // 1. Order Placed Date
  const orderDateRaw = order.date || order.createdAt;
  const orderDateObj = orderDateRaw ? new Date(orderDateRaw) : null;
  const formattedOrderDate = orderDateObj && !isNaN(orderDateObj.getTime())
    ? orderDateObj.toLocaleDateString('en-PH', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    : 'Recently Placed';

  // 2. Production Finished Date & Estimated Machine Time
  const finishedDateObj = new Date();
  const formattedFinishedDate = finishedDateObj.toLocaleDateString('en-PH', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const estimatedMins = order.estimatedTime || 35;
  const estimatedTimeFormatted = estimatedMins >= 60
    ? `${Math.floor(estimatedMins / 60)} hr ${estimatedMins % 60 > 0 ? (estimatedMins % 60) + ' mins' : ''}`
    : `${estimatedMins} mins`;

  // Calculate actual elapsed turnaround duration
  let turnaroundText = 'On schedule';
  if (orderDateObj && !isNaN(orderDateObj.getTime())) {
    const elapsedMs = Math.max(0, finishedDateObj.getTime() - orderDateObj.getTime());
    const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));
    const elapsedMins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
    if (elapsedHours >= 24) {
      const elapsedDays = Math.floor(elapsedHours / 24);
      turnaroundText = `${elapsedDays} day${elapsedDays > 1 ? 's' : ''} ${elapsedHours % 24} hr${elapsedHours % 24 > 1 ? 's' : ''}`;
    } else if (elapsedHours > 0) {
      turnaroundText = `${elapsedHours} hr${elapsedHours > 1 ? 's' : ''} ${elapsedMins} mins`;
    } else {
      turnaroundText = `${Math.max(1, elapsedMins)} mins`;
    }
  }

  // 3. Philippine & Lucena City Holiday / Rush Season Detection
  const rushSeason = detectRushSeason(orderDateRaw, order.isRush || order.isRushOrder || personalization?.isRush);

  // 4. Itemized Summary
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsHtml = items.length > 0 ? items.map((it) => `
    <li style="margin-bottom: 6px; color: #e2e8f0; font-size: 13px;">
      <strong>${it.quantity || 1}x ${it.name || 'Custom Garment'}</strong> 
      ${it.personalization?.text ? `<span style="color: #fbbf24; font-weight: 500;">(Embroidery: "${it.personalization.text}")</span>` : ''}
    </li>
  `).join('') : '<li style="color: #94a3b8; font-size: 13px;">Custom Embroidery Craft</li>';

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0f1117; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); color: #f8fafc;">
      
      {/* Header Banner */}
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 24px; text-align: center;">
        <span style="font-size: 32px; display: block; margin-bottom: 8px;">🧵✨</span>
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
          ${isReadyForPickup ? 'Your Order is Ready for Pick-Up!' : 'Your Order is In Transit!'}
        </h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 13px; font-weight: 500;">
          Order #${orderId} • ${businessName} (Pacific Mall Lucena)
        </p>
      </div>

      <div style="padding: 28px 24px;">
        <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
          Hi <strong>${recipientName || 'Valued Customer'}</strong>,
        </p>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 20px;">
          ${isReadyForPickup 
            ? 'Great news! Your customized embroidery order has passed precision quality inspection and is now packaged and awaiting pickup at our Pacific Mall counter.' 
            : 'Your customized embroidery order has been completed and handed over to our delivery courier.'}
        </p>

        {/* Holiday / Rush Season Notice Banner */}
        ${rushSeason.isRushSeason ? `
          <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 14px 18px; margin-bottom: 22px;">
            <div style="display: flex; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 13px; font-weight: 800; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px;">
                ${rushSeason.title}
              </span>
            </div>
            <p style="color: #e2e8f0; font-size: 12px; line-height: 1.5; margin: 0 0 6px;">
              ${rushSeason.description}
            </p>
            <p style="color: #94a3b8; font-size: 11px; margin: 0; line-height: 1.4;">
              📍 <em>Notice for Lucena City &amp; Regional Customers: Orders fulfilled during regional Quezon/Philippine festival seasons receive priority artisan allocation to ensure stitch quality meets our highest standards.</em>
            </p>
          </div>
        ` : `
          <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 12px; padding: 10px 16px; margin-bottom: 22px; font-size: 12px; color: #34d399;">
            ✅ <strong>Standard Schedule:</strong> Crafted on-time under regular production hours at our Pacific Mall Lucena workshop.
          </div>
        `}

        {/* Claim Slip / Tracking Card */}
        <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 14px; padding: 20px; text-align: center; margin-bottom: 22px;">
          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #818cf8; font-weight: 700; display: block; margin-bottom: 6px;">
            ${isReadyForPickup ? 'Official Counter Claim Slip Code' : 'Courier Tracking Number'}
          </span>
          <span style="font-size: 26px; font-family: 'Consolas', 'Courier New', monospace; font-weight: 800; color: #ffffff; letter-spacing: 1.5px; display: inline-block; background: rgba(0,0,0,0.3); padding: 6px 18px; border-radius: 8px; border: 1px dashed rgba(255,255,255,0.2);">
            ${claimCode}
          </span>
          ${isReadyForPickup ? `
            <div style="color: #cbd5e1; font-size: 12px; margin-top: 14px; line-height: 1.6; text-align: left; background: rgba(0,0,0,0.2); padding: 12px 14px; border-radius: 10px;">
              <div style="margin-bottom: 4px;">📍 <strong>Counter Location:</strong> Eds Towels &amp; Caps, Ground Floor, Pacific Mall Lucena City (Near Main Entrance)</div>
              <div style="margin-bottom: 4px;">⏰ <strong>Operating Hours:</strong> 10:00 AM – 8:00 PM Daily (Mon–Sun)</div>
              <div style="margin-bottom: 4px;">📞 <strong>Store Contact:</strong> 0928 810 3928</div>
              <div>🪪 <strong>Claim Requirement:</strong> Present this email or Counter Claim Code + 1 Valid ID.</div>
            </div>
          ` : `
            <p style="color: #cbd5e1; font-size: 12px; margin: 12px 0 0;">
              Your parcel is on its way. Please ensure someone is present at your delivery address to receive it.
            </p>
          `}
        </div>

        {/* Production Timeline & Dates Grid */}
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; margin-bottom: 22px;">
          <h3 style="color: #ffffff; margin: 0 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;">
            ⏱️ Order &amp; Production Timeline
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr>
              <td style="color: #94a3b8; padding: 5px 0;">📅 Order Placed:</td>
              <td style="color: #ffffff; font-weight: 600; text-align: right; padding: 5px 0;">${formattedOrderDate}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 5px 0;">🏁 Production Finished:</td>
              <td style="color: #10b981; font-weight: 700; text-align: right; padding: 5px 0;">${formattedFinishedDate}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 5px 0;">⚙️ Est. Machine Time:</td>
              <td style="color: #ffffff; font-weight: 600; text-align: right; padding: 5px 0;">${estimatedTimeFormatted}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; padding: 5px 0;">⚡ Total Turnaround:</td>
              <td style="color: #818cf8; font-weight: 700; text-align: right; padding: 5px 0;">${turnaroundText}</td>
            </tr>
          </table>
        </div>

        {/* Order Items Breakdown */}
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <h3 style="color: #ffffff; margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;">
            📦 Items in this Order
          </h3>
          <ul style="padding-left: 20px; margin: 0;">
            ${itemsHtml}
          </ul>
        </div>

        {/* View Live Tracking Button */}
        <div style="text-align: center; margin: 24px 0 12px;">
          <a href="${trackingUrl}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);">
            View Order &amp; Claim Slip Online
          </a>
        </div>

        {/* Satisfaction & Care Note */}
        <p style="color: #64748b; font-size: 11px; line-height: 1.5; margin: 20px 0 0; text-align: center;">
          Thank you for choosing <strong>Eds Towels &amp; Caps</strong>! We take pride in delivering vibrant, wash-durable custom embroidery in Lucena City.
        </p>
      </div>

      <div style="border-top: 1px solid rgba(255,255,255,0.06); padding: 14px 24px; text-align: center; font-size: 11px; color: #475569;">
        Eds Towels &amp; Caps Embroidery • Ground Floor, Pacific Mall Lucena, Quezon Province
      </div>
    </div>
  `;

  return dispatchEmail({
    to: recipientEmail,
    subject: `${isReadyForPickup ? '🎉 Ready for Pick-Up' : '🚚 In Transit'}: Order #${orderId} — ${businessName}`,
    html: htmlContent,
    simulationInfo: { tag: 'ORDER READY NOTIFICATION', url: trackingUrl }
  });
}

module.exports = {
  generateVerificationToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusReadyEmail,
};
