# 📘 Stitch-Opt Master System Integration & Security Guide
*Comprehensive Architectural Specification, Security Blueprint, and Step-by-Step Cloud Console Setup Runbook for Production SaaS Systems.*

---

## 📑 Table of Contents
1. [Executive System Architecture](#1-executive-system-architecture)
2. [Email Verification System (Nodemailer / SMTP)](#2-email-verification-system)
3. [Phone Verification System (Firebase Phone Auth + SMS OTP)](#3-phone-verification-system)
4. [Admin Multi-Factor Authentication (TOTP / RFC 6238)](#4-admin-multi-factor-authentication-totp)
5. [Cloudinary Cloud Asset & Receipt Integration](#5-cloudinary-cloud-asset-integration)
6. [Supabase & PostgreSQL Database Architecture (Prisma ORM)](#6-supabase--postgresql-architecture)
7. [GitHub CI/CD & Render Cloud Production Deployment](#7-github-cicd--render-deployment)
8. [Complete Project & Directory Blueprint](#8-complete-project--directory-blueprint)
9. [Step-by-Step Cloud Console Navigation & Setup Runbook](#9-step-by-step-cloud-console-navigation--setup-runbook)
   - [9.1 Google Cloud Console & Google AI Studio](#91-google-cloud-console--google-ai-studio-oauth-20--gemini-vision)
   - [9.2 Firebase Console Setup](#92-firebase-console-web-sdk-google-auth-phone-sms--authorized-domains)
   - [9.3 Cloudinary Dashboard Setup](#93-cloudinary-dashboard-cloud-name-api-keys--upload-presets)
   - [9.4 Supabase Dashboard Setup](#94-supabase-dashboard-postgresql-pgbouncer-pooler--direct-strings)
   - [9.5 GitHub Repository Configuration](#95-github-repository-setup--connection)
   - [9.6 Render Dashboard Configuration](#96-render-dashboard-web-service-build-pipeline--environment-variables)

---

## 1. Executive System Architecture

This project is built on a **High-Performance Hybrid Monorepo Architecture** designed for zero-latency customer experiences, edge caching, and scalable state management:

```mermaid
graph TD
    User([Customer / Admin Browser]) -->|HTTPS / WSS| CDN[Cloudflare / Render Edge CDN]
    CDN -->|Static Files / SPA| Frontend[Next.js 16 Framework Static Export]
    CDN -->|API / WebSockets / Auth| Backend[Express.js Core Server]
    
    subgraph "External Cloud Infrastructure"
        Backend -->|Prisma Client / Pooling| Supabase[(Supabase PostgreSQL 15)]
        Backend -->|Media Storage / Delivery| Cloudinary[(Cloudinary Media CDN)]
        Backend -->|SMTP Protocol| GmailSMTP[Gmail / Resend SMTP Relay]
        Frontend -->|Client OAuth / Phone OTP| Firebase[Firebase Identity Services]
        Backend -->|Receipt AI OCR| GeminiAPI[Google Gemini 1.5 Flash Vision]
    end
```

### Core Design Principles
1. **Decoupled Frontend / Unified Backend**: Next.js operates in static export mode (`output: 'export'`), producing purely pre-rendered HTML/JS/CSS assets placed into `frontend/out/`. The Express.js backend serves these static files while simultaneously powering the REST API, Socket.IO real-time channels, and authentication cookies.
2. **Role-Isolated Cookie Authentication**: Role tokens are strictly separated into dedicated `httpOnly` cookies (`admin_token`, `employee_token`, `customer_token`). This prevents session bleeding or privilege escalation if a user holds multiple tabs.
3. **Graceful Fallbacks & Resilience**: All external integrations (Email, SMS, Cloudinary, AI) feature automated fallback simulations so that development, staging, and zero-budget production tiers never crash on API quota exhaustion.

---

## 2. Email Verification System

The email verification system ensures that customer accounts are linked to legitimate, deliverable email inboxes before allowing high-value actions (such as submitting checkout orders).

```mermaid
sequenceDiagram
    autonumber
    actor User as Customer
    participant App as Frontend (Next.js)
    participant API as Express API
    participant DB as Supabase PostgreSQL
    participant Mail as SMTP Service (Gmail / Resend)

    User->>App: Submits Registration or clicks "Resend Verification"
    App->>API: POST /api/auth/resend-verification
    API->>DB: Check if already verified
    API->>API: Generate 64-char crypto token & 24h expiry
    API->>DB: UPDATE User SET emailVerificationToken, emailVerificationExpires
    API->>Mail: Send branded verification HTML email with ?token=XYZ
    Mail-->>User: Delivers email to inbox
    User->>App: Clicks link: https://your-domain.com/verify-email?token=XYZ
    App->>API: GET /api/auth/verify-email?token=XYZ
    API->>DB: Find user with matching unexpired token
    API->>DB: UPDATE User SET isEmailVerified = true, token = null
    API-->>App: { success: true, message: "Email verified successfully" }
    App->>User: Displays animated Success confirmation & unlocks checkout
```

### Step-by-Step Implementation

#### Step 2.1: Database Schema ([`prisma/schema.prisma`](file:///c:/Users/revin/Downloads/Capstone/prisma/schema.prisma))
Add verification state fields to the `User` model:
```prisma
model User {
  id                        String    @id @default(uuid())
  username                  String    @unique
  email                     String    @unique
  password                  String
  isEmailVerified           Boolean   @default(false)
  emailVerificationToken    String?   @unique
  emailVerificationExpires  DateTime?
  // ... other fields
}
```

#### Step 2.2: Cryptographic Token & Mailer Service ([`utils/emailService.js`](file:///c:/Users/revin/Downloads/Capstone/utils/emailService.js))
```javascript
const nodemailer = require('nodemailer');
const crypto = require('crypto');

function createTransporter() {
  const user = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS || '').replace(/\s+/g, '');

  if (!user || !pass) return null; // Triggers simulated development mode

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex'); // 64-character hexadecimal token
}

async function sendVerificationEmail(recipientEmail, recipientName, verificationToken) {
  const baseUrl = process.env.FRONTEND_URL || 'https://capstone-btr7.onrender.com';
  const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
  const transporter = createTransporter();

  if (!transporter) {
    console.log(`[EMAIL SIMULATION] Verification URL for ${recipientEmail}: ${verifyUrl}`);
    return { success: true, simulated: true };
  }

  const html = `
    <div style="font-family: sans-serif; background: #0b0f19; color: #fff; padding: 30px; border-radius: 12px;">
      <h2>Verify Your Email</h2>
      <p>Hi ${recipientName}, click the button below to verify your email:</p>
      <a href="${verifyUrl}" style="display:inline-block; background:#6366f1; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">
        Verify Email Address
      </a>
      <p style="color:#94a3b8; font-size:12px; margin-top:20px;">Link expires in 24 hours.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Stitch-Opt" <${process.env.GMAIL_USER}>`,
    to: recipientEmail,
    subject: 'Confirm your Stitch-Opt Email Address',
    html
  });

  return { success: true, simulated: false };
}
```

#### Step 2.3: Express Verification Endpoint ([`controllers/postgres/authController.js`](file:///c:/Users/revin/Downloads/Capstone/controllers/postgres/authController.js))
```javascript
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Verification token required.' });

    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null
      }
    });

    res.json({ success: true, message: 'Email verified successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server verification error.' });
  }
};
```

---

## 3. Phone Verification System

For traditional email/password registrations, verifying the customer's phone number upfront ensures that SMS delivery dispatch notices reach genuine mobile numbers.

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Modal as AuthModal.tsx
    participant Firebase as Firebase Client SDK
    participant API as Express /api/auth/register-with-otp
    participant DB as PostgreSQL

    Customer->>Modal: Enters details & mobile: 09171234567
    Modal->>Modal: Normalize to E.164: +639171234567
    Modal->>Firebase: signInWithPhoneNumber(auth, '+63...', recaptchaVerifier)
    Firebase-->>Customer: Sends 6-digit SMS code via carrier
    Modal->>Customer: Switches UI to 6-box OTP digits form
    Customer->>Modal: Inputs 6-digit code
    Modal->>Firebase: confirmationResult.confirm(otpCode)
    Firebase-->>Modal: Returns UserCredential with verified UID
    Modal->>API: POST /api/auth/register-with-otp { username, email, phone, firebaseUid }
    API->>DB: Creates user with isPhoneVerified = true
    API-->>Modal: Issue JWT auth cookie & session active
    Modal->>Customer: Logged in & redirected to storefront!
```

### Key Components

#### Step 3.1: Philippine Number Normalization
In [AuthModal.tsx](file:///c:/Users/revin/Downloads/Capstone/frontend/src/components/auth/AuthModal.tsx#L157-L175):
```typescript
function normalizePhilippinePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.startsWith('09') && digitsOnly.length === 11) {
    return `+63${digitsOnly.substring(1)}`;
  } else if (digitsOnly.startsWith('639') && digitsOnly.length === 12) {
    return `+${digitsOnly}`;
  } else if (digitsOnly.startsWith('9') && digitsOnly.length === 10) {
    return `+63${digitsOnly}`;
  }
  return digitsOnly.startsWith('+') ? digitsOnly : `+${digitsOnly}`;
}
```

#### Step 3.2: Invisible reCAPTCHA Verifier
Prevent spam bots from exhausting your SMS balance:
```typescript
const getRecaptchaVerifier = () => {
  if (typeof window === 'undefined') return null;
  if (!(window as any).recaptchaVerifier) {
    (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {}
    });
  }
  return (window as any).recaptchaVerifier;
};
```

---

## 4. Admin Multi-Factor Authentication (TOTP)

Admin accounts have access to financial ledgers, system settings, database tables, and staff management. Multi-Factor Authentication (MFA) using **TOTP (RFC 6238)** provides bulletproof protection against compromised passwords.

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant Frontend as Next.js Admin View
    participant API as Express Auth Controller
    participant DB as PostgreSQL

    Note over Admin,API: Phase 1: TOTP Setup & Pairing
    Admin->>Frontend: Clicks "Enable 2FA" in Admin Settings
    Frontend->>API: POST /api/admin/2fa/generate
    API->>API: Generate Base32 Secret & otpauth:// URI
    API-->>Frontend: Returns Secret & Base64 QR Code
    Admin->>Admin: Scans QR code using Google Authenticator
    Admin->>Frontend: Enters current 6-digit code: "492817"
    Frontend->>API: POST /api/admin/2fa/verify-and-enable { code: "492817" }
    API->>API: Verify token against secret
    API->>DB: Encrypt & save twoFactorSecret, twoFactorEnabled = true
    API-->>Frontend: 2FA Active! Provide 8 Backup Recovery Codes

    Note over Admin,API: Phase 2: Login Challenge
    Admin->>Frontend: Enters Username & Password
    Frontend->>API: POST /api/auth/login
    API->>DB: Validate password
    API->>API: Detects twoFactorEnabled === true
    API-->>Frontend: 200 OK { mfaRequired: true, tempToken: "JWT_SHORT_LIVED" }
    Frontend->>Admin: Displays "Enter 6-digit Authenticator Code"
    Admin->>Frontend: Submits "839201"
    Frontend->>API: POST /api/auth/mfa/verify { tempToken, code: "839201" }
    API->>API: Validate code against decrypted secret
    API->>DB: Issue full admin_token cookie
    API-->>Frontend: Login Success! Redirects to /admin
```

### Complete Implementation

#### Step 4.1: Install Dependencies
```bash
npm install otplib qrcode
```

#### Step 4.2: Prisma Schema Additions
```prisma
model User {
  // ...
  twoFactorEnabled    Boolean   @default(false)
  twoFactorSecret     String?   // Store encrypted or base32 secret
  twoFactorBackupCodes String[] // Hashed recovery codes
}
```

#### Step 4.3: Backend 2FA Controller ([`controllers/postgres/mfaController.js`](file:///c:/Users/revin/Downloads/Capstone/controllers/postgres/mfaController.js))
```javascript
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const prisma = require('../../utils/prisma');
const bcrypt = require('bcryptjs');

// 1. Generate new 2FA setup QR Code
exports.generate2FASetup = async (req, res) => {
  try {
    const admin = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (admin.role !== 'admin') return res.status(403).json({ message: 'Access denied' });

    const secret = authenticator.generateSecret();
    const serviceName = 'Stitch-Opt Admin';
    const otpauth = authenticator.keyuri(admin.username, serviceName, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

    // Save temporary secret until verified
    await prisma.user.update({
      where: { id: admin.id },
      data: { twoFactorSecret: secret }
    });

    res.json({ success: true, qrCode: qrCodeDataUrl, secret });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. Confirm and activate 2FA
exports.verifyAndEnable2FA = async (req, res) => {
  try {
    const { code } = req.body;
    const admin = await prisma.user.findUnique({ where: { id: req.user.id } });
    
    const isValid = authenticator.check(code, admin.twoFactorSecret);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid authenticator code.' });
    }

    // Generate 8 emergency one-time backup codes
    const plainBackupCodes = Array.from({ length: 8 }, () => Math.random().toString(36).substring(2, 8).toUpperCase());
    const hashedBackupCodes = await Promise.all(plainBackupCodes.map(c => bcrypt.hash(c, 10)));

    await prisma.user.update({
      where: { id: admin.id },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: hashedBackupCodes
      }
    });

    res.json({
      success: true,
      message: 'Two-Factor Authentication is now active!',
      backupCodes: plainBackupCodes // User must save these immediately
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
```

---

## 5. Cloudinary Cloud Asset Integration

Render's web containers run on **ephemeral disks**—any image uploaded to the local disk is wiped when Render restarts or deploys. Cloudinary provides high-availability cloud storage with automatic image transformations.

```mermaid
graph LR
    Client[Browser / Customer Checkout] -->|Upload Receipt / Photo| Express[Express Server]
    Express -->|Stream via Multer-Storage-Cloudinary| Cloudinary[Cloudinary Cloud CDN]
    Cloudinary -->|Secure HTTPS URL| Express
    Express -->|Analyze Receipt Image| GeminiVision[Gemini AI Vision]
    Express -->|Persist URL in Transaction| Supabase[(Supabase PostgreSQL)]
```

### Configuration & Usage

#### Step 5.1: Cloudinary Client ([`utils/cloudinary.js`](file:///c:/Users/revin/Downloads/Capstone/utils/cloudinary.js))
```javascript
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'stitch_opt_uploads',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'pdf'],
    transformation: [{ width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }]
  }
});

module.exports = { cloudinary, storage };
```

#### Step 5.2: Multer Route Upload Example
```javascript
const multer = require('multer');
const { storage } = require('../../utils/cloudinary');
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

router.post('/upload-receipt', upload.single('receipt'), async (req, res) => {
  if (!req.file || !req.file.path) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  // req.file.path is the permanent Cloudinary HTTPS URL
  const permanentUrl = req.file.path;
  res.json({ success: true, url: permanentUrl });
});
```

---

## 6. Supabase & PostgreSQL Architecture

Supabase hosts the managed PostgreSQL instance. Prisma ORM translates TypeScript models into optimized SQL queries.

### Connection Architecture: Transaction Pooler vs Session
```
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[REF]:[PASS]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
```
* **Port 6543 (PgBouncer)**: Used for normal application queries. Reuses connections to prevent exhausting PostgreSQL connection limits. Must have `?pgbouncer=true`.
* **Port 5432 (Direct URL)**: Used exclusively for Prisma migrations (`npx prisma migrate` or `prisma db push`) where schema alterations require non-pooled session state.

### Self-Healing Drift Detection ([`utils/schemaHealth.js`](file:///c:/Users/revin/Downloads/Capstone/utils/schemaHealth.js))
The server runs an automated schema audit on boot to guarantee that all columns expected by Prisma actually exist in Supabase:
```javascript
// Validates essential tables & columns on startup
const criticalTables = ['User', 'Product', 'Order', 'Transaction', 'Machine'];
```

---

## 7. GitHub CI/CD & Render Deployment

### The Monorepo Build Pipeline ([`package.json`](file:///c:/Users/revin/Downloads/Capstone/package.json))
On Render, the build process triggers automatically on every `git push origin main`:
```json
{
  "scripts": {
    "start": "node server.js",
    "build": "npm install && npm install --include=dev --prefix frontend && npm run build --prefix frontend",
    "postinstall": "npx prisma generate && npm install --include=dev --prefix frontend && npm run build --prefix frontend"
  }
}
```

### Essential Render Environment Variables
| Variable | Value / Format | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables cookie security, minification, and strict CORS |
| `DATABASE_URL` | `postgresql://...:6543/postgres?pgbouncer=true` | Supabase pooled connection string |
| `DIRECT_URL` | `postgresql://...:5432/postgres` | Supabase direct connection string |
| `JWT_SECRET` | 64+ char random hex string | Signs auth cookies |
| `CLOUDINARY_CLOUD_NAME` | `your_cloud_name` | Cloudinary storage bucket |
| `CLOUDINARY_API_KEY` | `1234567890` | Cloudinary authentication |
| `CLOUDINARY_API_SECRET` | `secret_key` | Cloudinary signing |
| `GMAIL_USER` | `your.business@gmail.com` | SMTP Sender account |
| `GMAIL_APP_PASSWORD` | `xxxx xxxx xxxx xxxx` | 16-character Google App Password |
| `FRONTEND_URL` | `https://capstone-btr7.onrender.com` | Base link for verification emails |
| `GEMINI_API_KEY` | `AIzaSy...` | Powers receipt OCR in Gemini Vision |

---

## 8. Complete Project & Directory Blueprint

```
Capstone/
├── controllers/postgres/            # REST API Route Business Logic
│   ├── authController.js            # Login, Register, Google Auth, Email Verification
│   ├── customerController.js        # Basket, Profile, Receipt Verification (Gemini AI)
│   ├── adminController.js           # Inventory, Shift Management, Production Stats
│   └── employeeController.js        # Operator Task Queue, Machine Claiming
├── frontend/                        # Next.js 16 Framework (Static Export)
│   ├── src/
│   │   ├── app/                     # App Router Pages
│   │   │   ├── page.tsx             # Customer Storefront Landing Page
│   │   │   ├── dashboard/           # Customer Account & Delivery Settings
│   │   │   ├── admin/               # Admin Management Dashboard
│   │   │   ├── employee/            # Employee Kanban Board
│   │   │   └── verify-email/        # Email Verification Landing Confirmation
│   │   ├── components/
│   │   │   ├── auth/                # AuthModal, GlobalAuthListener, VerificationBanner
│   │   │   ├── checkout/            # CheckoutModal, GCashPayment
│   │   │   ├── layout/              # StorefrontHeader, Sidebar
│   │   │   └── ui/                  # AddressSelect (PH Cascading), Toast, GlassModal
│   │   ├── lib/
│   │   │   ├── api.ts               # Universal Fetch Wrapper (CSRF, Credentials)
│   │   │   ├── firebase.ts          # Firebase Client Auth Singleton
│   │   │   └── phAddress.ts         # Philippine PSGC Geo Data (CALABARZON, Lucena)
│   │   └── stores/                  # Zustand Global State
│   │       ├── useAuthStore.ts      # Session State, Rehydration, Auto-logout Protection
│   │       ├── useBasketStore.ts    # Customer Cart & Persistent Storage
│   │       ├── useProductStore.ts   # Product Grid & Stock Enrichment
│   │       └── useUIStore.ts        # Modal Toggles & Themes
├── middleware/
│   ├── auth.js                      # Role-Based JWT Cookie Verification
│   └── tenant.js                    # B2B Multi-Tenancy Boundary Resolver
├── prisma/
│   ├── schema.prisma                # Supabase Database Models & Relationships
│   └── migrations/                  # Version-Controlled SQL Migrations
├── routes/postgres/                 # Express Router Endpoints
├── utils/
│   ├── cloudinary.js                # Multer Cloud Storage Engine
│   ├── emailService.js              # Nodemailer SMTP Relay
│   ├── inventoryManager.js          # Thread & Stabilizer Automated Stock Tracking
│   ├── prisma.js                    # Prisma Singleton Client
│   └── schemaHealth.js              # Database Drift Auditor
├── server.js                        # Master Express Server (HTTP, Sockets, Helmet, CORS)
└── render.yaml                      # Infrastructure as Code Specification
```

---

## 9. Step-by-Step Cloud Console Navigation & Setup Runbook

*This section provides click-by-click instructions for setting up the external platforms via their web user interfaces.*

---

### 9.1 Google Cloud Console & Google AI Studio (OAuth 2.0 & Gemini Vision)

#### A. Configure Google OAuth 2.0 Client ID
1. Navigate to **[Google Cloud Console](https://console.cloud.google.com/)**.
2. In the top project selector dropdown, select your project (e.g., `ryven-4cbd5` or your Capstone project).
3. In the left navigation menu, go to **APIs & Services** &rarr; **OAuth consent screen**:
   - Choose **User Type**: **External** &rarr; Click **Create**.
   - **App name**: `Stitch-Opt`
   - **User support email**: Select your Gmail account.
   - **Developer contact information**: Enter your Gmail address.
   - Click **Save and Continue**.
   - Under **Scopes**, click **Add or Remove Scopes**, select:
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `openid`
   - Click **Update** &rarr; **Save and Continue**.
   - Under **Test users**, add your own Gmail (`revinaryven7@gmail.com`) for early staging testing.
   - Click **Back to Dashboard**, and under **Publishing status**, click **Publish App** so any Google user can sign in.
4. In the left menu, click **Credentials**:
   - Click **+ CREATE CREDENTIALS** &rarr; Choose **OAuth client ID**.
   - **Application type**: **Web application**.
   - **Name**: `Stitch-Opt Web Client`.
   - **Authorized JavaScript origins**: Click **+ ADD URI** and add:
     - `http://localhost:3000`
     - `http://localhost:5001`
     - `https://capstone-btr7.onrender.com`
   - **Authorized redirect URIs**: Click **+ ADD URI** and add:
     - `https://ryven-4cbd5.firebaseapp.com/__/auth/handler`
     - `http://localhost:3000`
     - `https://capstone-btr7.onrender.com`
   - Click **Create**.
   - Copy the **Client ID** and save it.

#### B. Generate Gemini 1.5 Flash Vision API Key (Receipt OCR)
1. Go to **[Google AI Studio](https://aistudio.google.com/)**.
2. Sign in with your Google account.
3. In the top-left menu, click **Get API key**.
4. Click **Create API key** &rarr; Select your Google Cloud Project &rarr; Click **Create API key in existing project**.
5. Copy the generated key (`AIzaSy...`) and add it to your environment as `GEMINI_API_KEY`.

---

### 9.2 Firebase Console (Web SDK, Google Auth, Phone SMS & Authorized Domains)

1. Open **[Firebase Console](https://console.firebase.google.com/)**.
2. Click on your project card (e.g., `ryven-4cbd5`).

#### A. Retrieve Web SDK Credentials
1. Click the **Project settings** (gear icon ⚙️) next to *Project Overview* in the left sidebar.
2. Under the **General** tab, scroll down to the **Your apps** section.
3. If no web app exists, click the Web icon (`</>`), name it `Stitch-Opt Frontend`, and click **Register app**.
4. Under **SDK setup and configuration**, select **Config**. Copy the configuration keys:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
5. Ensure these values match your `frontend/src/lib/firebase.ts` and Render environment variables.

#### B. Configure Authentication Providers
1. In the left navigation, click **Build** &rarr; **Authentication**.
2. Click the **Sign-in method** tab:
   - **Google**:
     1. Click on **Google**.
     2. Toggle **Enable** to ON.
     3. Set the **Project support email** to your Gmail.
     4. Click **Save**.
   - **Phone**:
     1. Click on **Phone**.
     2. Toggle **Enable** to ON.
     3. (Optional for local testing) Expand **Phone numbers for testing** &rarr; Add:
        - Phone: `+639170000000`
        - Verification Code: `123456`
     4. Click **Save**.

#### C. Add Authorized Domains *(Critical)*
1. While still under **Authentication**, click the **Settings** tab.
2. Select **Authorized domains** from the sub-menu.
3. Verify the following domains are listed (click **Add domain** if missing):
   - `localhost`
   - `ryven-4cbd5.firebaseapp.com`
   - `ryven-4cbd5.web.app`
   - `capstone-btr7.onrender.com` *(your live Render domain)*
4. Click **Save**.

---

### 9.3 Cloudinary Dashboard (Cloud Name, API Keys & Upload Presets)

1. Navigate to **[Cloudinary Console](https://console.cloudinary.com/)** and log in.
2. From the **Dashboard** home screen, locate the **Product Environment Credentials** box:
   - Copy **Cloud Name** &rarr; `CLOUDINARY_CLOUD_NAME`
   - Copy **API Key** &rarr; `CLOUDINARY_API_KEY`
   - Click the eye icon next to **API Secret** &rarr; Copy to `CLOUDINARY_API_SECRET`
3. In the left sidebar, click the **Settings** gear icon (bottom left) &rarr; **Upload**:
   - Scroll down to **Upload presets**.
   - Verify that signed uploads are permitted (default is enabled).
4. In the left sidebar, click **Media Library**:
   - You can create a folder named `stitch_opt_uploads` where receipts and customized customer logos are automatically sorted.

---

### 9.4 Supabase Dashboard (PostgreSQL, PgBouncer Pooler & Direct Strings)

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** and select your project.

#### A. Retrieve Connection Strings
1. Click the **Project Settings** (gear icon ⚙️) in the left navigation &rarr; **Database**.
2. Scroll down to the **Connection string** section:
   - Click the **URI** tab.
   - Select **Transaction** mode (Port `6543` with PgBouncer):
     - Check the **Use connection pooling** box.
     - Mode: **Transaction**.
     - Copy the URI:
       ```
       postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
       ```
     - Paste this into `DATABASE_URL`.
   - Select **Session** mode / Direct (Port `5432`):
     - Uncheck connection pooling or select Session.
     - Copy the URI:
       ```
       postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
       ```
     - Paste this into `DIRECT_URL`.
3. Replace `[YOUR-PASSWORD]` with the database password set during project creation.

#### B. Verify Tables in Table Editor
1. In the left sidebar, click **Table Editor** (grid icon).
2. Confirm the presence of core tables: `User`, `Product`, `Order`, `Transaction`, `Machine`.
3. If tables are missing, push the schema locally using:
   ```bash
   npx prisma db push
   ```

---

### 9.5 GitHub Repository Setup & Connection

1. Go to **[GitHub](https://github.com/)** and sign in.
2. In the top-right corner, click **+** &rarr; **New repository**:
   - Repository name: `Capstone`
   - Visibility: **Public** or **Private**.
   - Do not initialize with README if pushing an existing local codebase.
   - Click **Create repository**.
3. In your local terminal, link the repository and push your commits:
   ```bash
   git remote add origin https://github.com/vencom12/Capstone.git
   git branch -M main
   git push -u origin main
   ```
4. Verify on GitHub that all branches and commits appear under `main`.

---

### 9.6 Render Dashboard (Web Service, Build Pipeline & Environment Variables)

1. Open **[Render Dashboard](https://dashboard.render.com/)**.
2. Click **New +** in the top-right corner &rarr; Select **Web Service**.
3. Choose **Build and deploy from a Git repository** &rarr; Click **Next**.
4. Connect your GitHub account and select `vencom12/Capstone`.
5. Configure Service Settings:
   - **Name**: `capstone-btr7`
   - **Region**: `Singapore` (closest to Philippine users) or `Oregon`.
   - **Branch**: `main`
   - **Root Directory**: Leave blank (monorepo root).
   - **Runtime**: `Node`.
   - **Build Command**:
     ```bash
     npm install && npm install --include=dev --prefix frontend && npm run build --prefix frontend
     ```
   - **Start Command**:
     ```bash
     node server.js
     ```
   - **Instance Type**: `Free`.
6. Scroll down to **Environment Variables** &rarr; Click **Add Environment Variable** for each required key:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = *(Your Supabase Port 6543 Pooled String with `?pgbouncer=true`)*
   - `DIRECT_URL` = *(Your Supabase Port 5432 Direct String)*
   - `JWT_SECRET` = *(Generate with `crypto.randomBytes(64).toString('hex')`)*
   - `CLOUDINARY_CLOUD_NAME` = *(From Cloudinary Console)*
   - `CLOUDINARY_API_KEY` = *(From Cloudinary Console)*
   - `CLOUDINARY_API_SECRET` = *(From Cloudinary Console)*
   - `GMAIL_USER` = *(Your business Gmail address)*
   - `GMAIL_APP_PASSWORD` = *(16-character Google App Password from myaccount.google.com &rarr; Security)*
   - `FRONTEND_URL` = `https://capstone-btr7.onrender.com`
   - `GEMINI_API_KEY` = *(From Google AI Studio)*
   - `NEXT_PUBLIC_FIREBASE_API_KEY` = `AIzaSyAa-8VSKaCtHpW3LTjfBlUm_9jBlIyTjrs`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = `ryven-4cbd5.firebaseapp.com`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = `ryven-4cbd5`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = `ryven-4cbd5.firebasestorage.app`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` = `576470911091`
   - `NEXT_PUBLIC_FIREBASE_APP_ID` = `1:576470911091:web:83eaaee619b51308c34206`
7. Click **Create Web Service**.
8. Render will pull from GitHub, run the build pipeline, generate Prisma clients, compile the Next.js frontend, and launch `server.js`. Check the **Logs** tab to observe the server spinning up.

---
*Created for the Stitch-Opt Production Platform. Maintained in the Project Root.*
