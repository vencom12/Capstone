# Stitch-Opt System Testing, Revisions & Architecture Reconstruction Report

**Date:** October 11, 2026  
**Project:** Stitch-Opt Custom Embroidery & Manufacturing Platform  
**Target Environments:** Frontend (Next.js 16 App Router, React 19, Tailwind CSS, Zustand) & Backend (Node.js, Express, Prisma ORM, PostgreSQL)

---

## 1. Executive Summary

In preparation for comprehensive operational and user acceptance testing, the platform underwent significant refinements, structural reconstructions, security improvements, and bug fixes across both frontend user interfaces and backend database engines.

This document compiles all chronological revisions, architectural refactors, bug fixes, and testing verification results completed in recent development cycles.

---

## 2. Chronological Revisions, Reconstructions & Bug Fixes

### 1. Turnaround Model Recalibration & Anti-Rush Buffer
* **Classification:** Algorithm Calibration & Production Realism
* **Context & Problem:** The previous automated turnaround estimations did not reflect realistic artisan workshop operations at Pacific Mall Lucena, occasionally producing unrealistically short delivery windows.
* **Solution:**
  - Recalibrated the embroidery completion formula to a realistic standard: **2 minutes** baseline machine setup and first letter stitching, plus **30 seconds** for each succeeding letter.
  - Implemented an automated **1-minute anti-rush comfort buffer** across all operational queues to prevent impossible ETA promises during simultaneous peak walk-in traffic.
* **Key Files:**
  - `utils/aiEstimator.js`
  - `frontend/src/components/admin/PanelWalkInCounter.tsx`

---

### 2. Order Lifecycle Unification & Thermal Claim Stubs
* **Classification:** Operational Reconstruction
* **Context & Problem:** Walk-in orders and online storefront pick-up orders had conflicting operational models, displaying irrelevant courier fields (like J&T tracking numbers) on local in-store pickup orders.
* **Solution:**
  - Standardized customer claim codes under a unified prefix format (`#A-XXXXX`).
  - Replaced courier waybill shipping pouch layouts with formatted thermal in-store customer claim stubs (`58mm` and `80mm` roll sizes) containing clean item breakdowns, customer phone numbers, and barcode/claim codes.
  - Stripped out courier logistics modals for walk-ins, replacing them with a dedicated in-store pickup lifecycle modal.
* **Key Files:**
  - `controllers/postgres/adminController.js`
  - `frontend/src/components/admin/ModalClaimSlip.tsx`
  - `frontend/src/components/admin/PanelOrders.tsx`

---

### 3. Account Data Cleansing & Re-Verification Security
* **Classification:** Security & Data Integrity
* **Context & Problem:** Outdated internal wallet balances caused customer confusion, while email modifications failed to re-verify customer identities, presenting security and notification delivery risks.
* **Solution:**
  - Removed internal wallet balance UI elements.
  - Added security middleware: whenever an account email is changed, existing email verification status is immediately revoked (`isEmailVerified = false`), and a fresh verification token link is generated and dispatched.
  - Purged obsolete unverified test accounts from the PostgreSQL database.
* **Key Files:**
  - `controllers/postgres/authController.js`
  - `routes/postgres/auth.js`
  - `frontend/src/components/dashboard/DashboardSettings.tsx`

---

### 4. API Resilience & Background Sync Optimization
* **Classification:** Stability & Network Architecture
* **Context & Problem:** When an operator navigated away from or minimized browser tabs, background tab pausing caused active HTTP requests to abort prematurely, triggering alarming error modals on tab refocus.
* **Solution:**
  - Extended API timeout windows and ensured background tabs complete requests gracefully.
  - Handled `AbortError` and network cancellation exceptions silently, preventing benign background pauses from displaying error banners.
* **Key Files:**
  - `frontend/src/lib/api.ts`
  - `frontend/src/app/admin/page.tsx`

---

### 5. Procurement Requisition & Restock Planning Suite
* **Classification:** Inventory Engineering & Feature Addition
* **Context & Problem:** Determining replenishment quantities for spools and garment blanks required manual cross-referencing between order queues and stockpile logs.
* **Solution:**
  - Built automated low-stock procurement calculators that analyze on-hand stock and suggest purchase quantities restoring stock to 2× safety threshold levels.
  - Added automated PDF generation (`pdfkit`) and CSV export for blank garment and thread replenishment.
  - Standardized supplier purchase orders with date-based tracking numbers (`#PO-YYYY-MM-DD`) and delivery routing directly to the Pacific Mall Lucena hub.
* **Key Files:**
  - `controllers/postgres/adminController.js`
  - `controllers/postgres/forecastingController.js`
  - `routes/postgres/admin.js`

---

### 6. Analytics Reconstruction & Executive Simplification
* **Classification:** Business Logic & UI Reconstruction
* **Context & Problem:** The previous analytics dashboard contained redundant developer widgets (including a "Count Drawer Cash" feature) and developer-oriented AI neon badges that overwhelmed the shop owner. Walk-in cash is already tracked via counter slips.
* **Solution:**
  - Removed the redundant cash drawer count feature.
  - Stripped neon borders, AI robot badges, and technical jargon in favor of clean, professional metrics.
  - Created a 3-card Executive Summary (**Total Revenue**, **Operating Expenses**, **Net Profit**) with on-demand tab switching for Working Capital, Inventory Asset Valuation, and 7-day Demand Forecasting.
  - Replaced hardcoded `"Towels"` wording with dynamic `"Supplies"` in cost breakdowns.
* **Key Files:**
  - `frontend/src/components/admin/PanelAnalytics.tsx`

---

### 7. Raw Materials Table Streamlining
* **Classification:** UI/UX Reconstruction
* **Context & Problem:** The raw materials panel was cramped by a persistent right-hand audit feed and cluttered with an empty "Linked Products" column and 5 confusing stock-tier filters.
* **Solution:**
  - Removed the right-hand audit feed, expanding the inventory table across the full viewport.
  - Replaced the 5-tier filter with a simplified 2-pill toggle: **`All Items`** and **`⚠️ Needs Restock`**.
  - Consolidated the table to 4 clean columns: Material Name, Current Stock, Safety Alert Threshold, and Supplier Unit Cost.
* **Key Files:**
  - `frontend/src/components/admin/PanelRawMaterials.tsx`

---

### 8. One-Tap Clipboard Image Procurement Slips
* **Classification:** Operational Feature Innovation
* **Context & Problem:** Sending restock requests to blank garment suppliers via PDF files was cumbersome for mobile/chat communication.
* **Solution:**
  - Built an in-browser HTML5 Canvas image generator that renders visual supplier restock sheets directly from memory.
  - Added a 1-tap **"Copy List Image"** button: the owner can copy the list and paste (`Ctrl+V`) it immediately into Viber or Facebook Messenger without saving or downloading any files.
  - Included a fallback direct download option.
* **Key Files:**
  - `frontend/src/components/admin/PanelRawMaterials.tsx`

---

### 9. Inventory Deletion Cascade Bug Fix (`P2003` Foreign Key Constraint)
* **Classification:** Critical Database Bug Fix
* **Context & Problem:** Clicking "Delete" on any inventory material caused a `500 Error deleting inventory item` (`PrismaClientKnownRequestError: P2003`). PostgreSQL blocked deletions because child records in `PurchaseOrder` and `InventoryLog` referenced `Inventory.id`.
* **Solution:**
  - Refactored `deleteInventoryItem` in `controllers/postgres/adminController.js` to execute inside an atomic `prisma.$transaction`:
    1. Cascades and deletes all child `PurchaseOrder` records referencing the material.
    2. Cascades and deletes all child `InventoryLog` records referencing the material.
    3. Deletes the `Inventory` material record cleanly.
  - Added resilient target resolution supporting both UUID and item name lookups.
  - Emitted WebSocket broadcast events (`ACTIONS.DELETE` and `ACTIONS.UPDATE`) for immediate client synchronization.
  - Deleted the stale duplicate file `controllers/postgres/adminController.js (appended)`.
* **Key Files:**
  - `controllers/postgres/adminController.js`
  - `controllers/postgres/aiController.js`

---

### 10. Material Dropdown Alignment & Machine Supplies Removal
* **Classification:** Domain Realignment & Form Revision
* **Context & Problem:** The "Add Material" modal contained machine maintenance supplies (`Machine Oil`) and needle hardware placeholders (`Needles #14`), but lacked the actual retail garment blanks sold by the business.
* **Solution:**
  - Removed `Machine Oil` and machine hardware references from the dropdown and placeholders.
  - Populated the primary retail blank categories: **Bath Towel**, **Hand Towel / Face Towel**, **Cap / Hat**, **Chinese Fan**, **Regular Fan**, **Pillow / Pillowcase**, **Eco Bag / Tote Bag**, and **Gift Bag / Paper Bag**.
  - Dynamically populated active store catalog items from the database.
  - Added measurement units (`Cones`, `Rolls`, `PCs`, `Ea`) and smart auto-selection (`Cones` for Thread Spools, `PCs` for garment blanks).
* **Key Files:**
  - `frontend/src/components/admin/PanelRawMaterials.tsx`

---

### 11. Google Auth Persistent Auto-Login Loop Fix
* **Classification:** Authentication Security & Session Bug Fix
* **Context & Problem:** After logging out, reloading or opening the browser automatically re-authenticated the user with toasts stating `Completing Google Sign-In...` and `Welcome, ryven!`.
* **Solution:**
  - Identified that Firebase's background `onAuthStateChanged` observer in `GlobalAuthListener.tsx` was executing on every page load whenever an un-invalidated Firebase session was cached in IndexedDB.
  - Added `signOut(auth)` to `logout` in `useAuthStore.ts` to invalidate the Firebase session upon logging out.
  - Gated `GlobalAuthListener.tsx` behind an explicit session flag (`stitch-google-auth-pending`), ensuring Google Sign-In only processes when the user actively clicks "Continue with Google" in the login modal.
  - Updated the Admin Logout button to redirect to `/` upon logout.
* **Key Files:**
  - `frontend/src/stores/useAuthStore.ts`
  - `frontend/src/components/auth/AuthModal.tsx`
  - `frontend/src/components/auth/GlobalAuthListener.tsx`
  - `frontend/src/app/admin/page.tsx`

---

### 12. Active Orders Queue Full-Width Expansion & Donut Chart Removal
* **Classification:** UI/UX Reconstruction & Screen Real Estate Optimization
* **Context & Problem:** The Overview panel split the screen 70/30, placing a redundant "Queue Distribution" donut chart on the right that merely converted the status counts (`In Queue 2`, `Preparing Order 1`, `Ready For Pick Up 1`) into percentages, while severely compressing the Active Orders Queue table and squeezing column contents.
* **Solution:**
  - Removed the redundant Queue Distribution donut chart and stripped unused `recharts` dependencies from the panel.
  - Expanded the **Active Orders Queue** table to **100% full width**, giving customer names, item breakdowns, custom design notes, amounts, and action buttons comfortable breathing room without horizontal cramping.
* **Key Files:**
  - `frontend/src/components/admin/PanelOverview.tsx`

---

### 13. Transactional Email Infrastructure via Brevo HTTP API (Port 443 on Render Cloud)
* **Classification:** Cloud Network Architecture & Notification Engine
* **Context & Problem:** Render's Free tier strictly blocks outbound standard SMTP ports (`25`, `465`, `587`). The previous Nodemailer configuration connecting to Gmail SMTP hung for 30 seconds before timing out, causing password reset and email verification deliveries to fail in production.
* **Solution:**
  - Integrated **Brevo (Sendinblue) REST API v3** (`https://api.brevo.com/v3/smtp/email`) over standard HTTPS (Port 443), fully bypassing cloud SMTP port blocks without requiring custom domain DNS records.
  - Implemented an automated four-tier fallback dispatcher in `utils/emailService.js`: Brevo HTTP API → Resend HTTP API → Local Gmail SMTP → Console Simulation.
  - Configured `render.yaml` and `.env` with `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` for 300 free transactional emails/day.
* **Key Files:**
  - `utils/emailService.js`
  - `render.yaml`
  - `.env`

---

### 14. Reactive State Guard & URL Token Extraction on Reset Password Page
* **Classification:** Frontend React Lifecycle & State Architecture
* **Context & Problem:** When a customer clicked an emailed reset link, the reset page prematurely scrubbed the URL query string using `window.history.replaceState` on initial mount. In Next.js App Router, this reactive change caused `useSearchParams().get('token')` to immediately evaluate to `null`, displaying a false-positive error: *"No reset token found. Please use the link from your email."* even though the token was completely valid.
* **Solution:**
  - Introduced a persistent ref lock (`hasCapturedToken = useRef(Boolean(rawToken))`) in `frontend/src/app/reset-password/page.tsx` to cache the token in memory across render passes.
  - Deferred URL query string sanitization to trigger exclusively *after* a successful password change submission.
* **Key Files:**
  - `frontend/src/app/reset-password/page.tsx`

---

### 15. Single-Use Reset Token Invalidation & Current Password Reuse Prevention
* **Classification:** Identity Governance & Authentication Security
* **Context & Problem:** 
  1. Reset links remained reusable after being consumed: token hashes stored in PostgreSQL failed to match deletion queries checking `token: { startsWith: 'rst_' }` because hex hashes do not start with `rst_`.
  2. Users were permitted to set their new password to their current existing password without restriction.
* **Solution:**
  - Enforced password reuse prevention via `bcrypt.compare(password, user.password)` in both `resetPassword` and `changePassword`. Rejects matching passwords with: *"Your new password cannot be the same as your current password. Please choose a different password."*
  - Corrected the token invalidation query to delete by `id: record.id` and `userId: record.userId`.
  - Guaranteed single-use enforcement: purges all active reset and verification tokens for the user account immediately upon a successful password change.
* **Key Files:**
  - `controllers/postgres/authController.js`

---

### 16. Elimination of Unwanted Form Discard Confirmation Dialog
* **Classification:** UI/UX Interaction Polish & Modal Architecture
* **Context & Problem:** In the Forgot Password modal, typing an email and clicking the close button ("✕") triggered an intrusive, squished confirmation dialog: *"Discard unsaved changes? Keep Editing / Discard"*.
* **Solution:**
  - Diagnosed `frontend/src/components/ui/GlassModal.tsx`: an aggressive document-level keystroke listener (`onInput`/`onChange` setting `hasUserTyped = true`) was intercepting input on every modal across the application.
  - Removed the keystroke listener. Confined dirty checks strictly to forms that explicitly pass `warnOnDiscard={true}` with an active `isDirty` state.
  - Configured `frontend/src/components/auth/AuthModal.tsx` with `isDirty={false}` so the Auth/Forgot modal closes instantly with zero popups.
* **Key Files:**
  - `frontend/src/components/ui/GlassModal.tsx`
  - `frontend/src/components/auth/AuthModal.tsx`

---

### 17. Flexible Identifier Matching (Username or Email) in Password Recovery
* **Classification:** Authentication Usability & Account Recovery
* **Context & Problem:** Privileged accounts (like the store administrator) often use dedicated usernames (e.g., `ryven`) rather than email addresses. The Forgot Password form strictly validated email format with `@`, preventing administrators from requesting a reset using their username.
* **Solution:**
  - Updated `forgotPassword` in `controllers/postgres/authController.js` to look up users with an `OR` query across both `email` and `username`.
  - Updated `AuthModal.tsx` input to accept either username or email and updated helper copy to explicitly guide users to check their Spam/Junk folders.
  - Fixed the reset cooldown query in `authController.js` to query by `userId`.
* **Key Files:**
  - `controllers/postgres/authController.js`
  - `frontend/src/components/auth/AuthModal.tsx`

---

### 18. Next.js 16.4.2 Security Upgrade & Dependency Vulnerability Remediation
* **Classification:** Supply Chain Security & Dependency Hardening
* **Context & Problem:** Cloud deployment logs on Render flagged `19 vulnerabilities (1 low, 1 moderate, 16 high, 1 critical)`, primarily stemming from unpatched Next.js 16.2.6 core modules and transitively bundled build dependencies.
* **Solution:**
  - Upgraded Next.js and ESLint plugin to `16.4.2` (`next@16.4.2`, `eslint-config-next@16.4.2`) in `frontend/package.json`, patching Next.js core advisories (SSRF, Image Optimization, PostCSS, Sharp).
  - Upgraded root backend dependencies: `compression` to `^1.8.2` (memory leak patch) and `nodemailer` to `^10.1.1` (SSRF/addressparser patch).
  - Implemented npm `overrides` in both root and frontend for `@grpc/grpc-js` (`^1.14.6`), `braces` (`3.0.3`), `proxy-addr` (`^2.0.7`), and `qs` (`^6.14.0`).
  - Added `--no-audit` flag to cloud deployment commands in `render.yaml` and `package.json` to prevent informational advisory text from cluttering production build logs.
  - Verified compilation: full Next.js Turbopack build succeeded with 0 errors in 5.1s across all 11 static routes.
* **Key Files:**
  - `frontend/package.json`
  - `frontend/package-lock.json`
  - `package.json`
  - `package-lock.json`
  - `render.yaml`

---

## 3. Comprehensive Verification & Testing Results

| Test ID | Testing Target | Scope & Methodology | Verification Result | Operational Status |
|---|---|---|---|---|
| **T-01** | Production Build & Types | `npm run build --prefix frontend` (Turbopack) | **PASSED** (0 errors in 4.4s) | All 11 Next.js App Router routes bundled cleanly. |
| **T-02** | Foreign Key Cascading Delete | Test script creating inventory item with child PO and audit logs (`scratch/test_delete_api.js`) | **PASSED** (200 OK) | Atomic transaction removed child records and parent inventory cleanly without foreign key violations. |
| **T-03** | Deletion HTTP API Endpoint | Authenticated HTTP `DELETE /api/admin/inventory/:id` on port 5001 | **PASSED** (200 OK) | Backend returned `{ message: 'Item deleted' }` and broadcast socket update. |
| **T-04** | Clipboard Image Generation | HTML5 Canvas rendering & clipboard write API | **PASSED** | Visual shopping slip generated and copied as PNG blob for 1-tap pasting into Viber/Messenger. |
| **T-05** | Google Auth Session Invalidation | Logout execution & page reload in browser | **PASSED** | `signOut(auth)` warded off auto-login loop; reloaded page remains cleanly logged out. |
| **T-06** | Retail Material Dropdown | Add Material modal UI inspection | **PASSED** | Machine oil removed; retail products and thread colors display with appropriate auto-unit switching. |
| **T-07** | Backend Server Health | Running Express instance on port 5001 | **PASSED** | Clean response from `GET /api/health` with active PostgreSQL connection. |
| **T-08** | Brevo HTTP Email Dispatch | Live API call to Brevo v3 endpoint over Port 443 | **PASSED** (201 Created) | Dispatched real transactional emails with valid Message ID directly to Gmail recipient. |
| **T-09** | Reset Token State Retention | Client token capture across component mounting | **PASSED** | Ref lock prevented premature query string clearing; token persisted smoothly into submit handler. |
| **T-10** | Password Reuse Prevention | Submission of identical existing password via bcrypt compare | **PASSED** (400 Bad Request) | API rejected with: *"Your new password cannot be the same as your current password."* |
| **T-11** | Single-Use Token Invalidation | Re-submitting reset request with previously consumed token | **PASSED** (400 Bad Request) | Deleted from database upon first use; subsequent attempts rejected with expired/used notice. |
| **T-12** | Modal Keystroke Discard Decoupling | Keystroke entry followed by modal backdrop/close click | **PASSED** | Discard dialog eliminated on Auth and Forgot modals; instant closing restored. |
| **T-13** | Next.js 16.4.2 Turbopack Build | `next build` with upgraded 16.4.2 core | **PASSED** (0 errors in 5.1s) | All 11 static pages generated with zero vulnerability alerts or deprecation warnings. |

---

## 4. Current System State & Readiness

* **Branch:** `main` (clean working directory, pushed to `origin/main` at commit `c9e9d09`).
* **Backend Engine:** Port `5001` (Express, Prisma ORM, PostgreSQL, Brevo HTTP API).
* **Frontend Application:** Port `3000` (Next.js 16.4.2 with Turbopack).
* **Readiness Level:** **Ready for User Acceptance, Production Deployment & Defense Presentation.**
