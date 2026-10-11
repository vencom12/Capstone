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

---

## 4. Current System State & Readiness

* **Branch:** `main` (clean working directory, pushed to `origin/main` at commit `4064495`).
* **Backend Engine:** Port `5001` (Express, Prisma ORM, PostgreSQL).
* **Frontend Application:** Port `3000` (Next.js 16 with Turbopack).
* **Readiness Level:** **Ready for User Acceptance & Operational Testing.**
