# Stitch-Opt Engineering Changelog & System Documentation
**Date**: October 3, 2026  
**Scope**: UI/UX Modernization, Authentication Security, Catalog Bug Fixes, Customer Dashboard Gold Standards, and Shopee-Style Multi-Address Delivery System.

---

## 1. Executive Summary

During today's engineering sprint, five major milestones were completed across the full stack:
1. **Artisanal Linen & Ivory Cream Design Theme**: Softened the high-contrast light theme to eliminate eye strain while maintaining accessibility and luxury aesthetics across Admin, Employee, and Customer portals.
2. **Unified Authentication & Security Audit**: Clarified staff vs. customer login entry points, hardened RBAC token isolation, and eliminated customer login toast notification bugs.
3. **Product Catalog Card Flicker / Reload Resolution**: Diagnosed and eliminated card re-renders and animation restarts when toggling favorite hearts.
4. **Customer Dashboard Gold Standards (5 Pillars)**: Built and deployed real-time order milestone tracking, 1-click repeat orders, actionable favorites with stock awareness, and BIR-compliant digital invoices.
5. **Shopee-Style Multiple Delivery Addresses**: Implemented full multi-address support with recipient names, courier contact phone numbers, default address tags, checkout integration, and database persistence.

---

## 2. Bug Fixes & Technical Root Cause Analysis

### Bug 1: Product Catalog Card Flicker & Apparent Reload on Favoriting
* **Symptom**: Clicking the heart (favorite) icon on any product card caused the cards to visibly disappear and flash/reload, then flash again when switching to or viewing the Favorites tab.
* **Root Cause 1 (CSS Keyframe Restart)**: `ProductCard.tsx` contained `animate-[fadeIn_0.5s_ease-out]` on its outermost container. When the favorite state updated in Zustand, React re-rendered the card to show the filled heart. This re-render caused the browser to restart the CSS keyframe from `opacity: 0` with a 20px translation.
* **Root Cause 2 (Aggressive Sync State)**: `useProductStore.ts` had `fetchDashboardState()` setting `isSyncing: true` indiscriminately during regular 15-second background polling, causing momentary skeleton component swaps.
* **Fix**:
  - Removed `animate-[fadeIn]` from `ProductCard.tsx` and replaced it with smooth CSS transitions (`transition-all duration-300 hover:border-primary/40 hover:-translate-y-1 shadow-sm hover:shadow-md`).
  - Added a `silent = false` parameter to `fetchDashboardState(silent?: boolean)`. Skeleton states are now only displayed on initial page load when products have not yet been fetched. Background polling runs silently with zero UI interruption.
  - Added a direct "Explore Catalog →" CTA on the Favorites empty state.

---

### Bug 2: Customer Login Feedback / Redundant Toast Alert
* **Symptom**: When authenticating as a customer, redundant or ambiguous toast alerts were triggered during token handoff.
* **Root Cause**: Inconsistent response handling between legacy cookie detection and newly unified auth state dispatchers.
* **Fix**: Refined the auth handler to trigger clean, role-tailored success notifications and cleanly route the user to `/dashboard` without spurious error toasts.

---

## 3. Major Feature Implementations & Revisions

### A. Shopee-Style Multiple Delivery Addresses (`AddressBookModal.tsx`)
* **Features**:
  - **Comprehensive Courier Details**: Full Recipient Name, Delivery Phone Number (Philippine format: `09XXXXXXXXX`), Detailed Street Address, Barangay, City, Province, and Postal Code.
  - **Category Labels**: Quick toggle between `🏠 Home`, `🏢 Work`, and `📍 Other`.
  - **Default Address Selector**: Dedicated `DEFAULT` badge and toggle for the primary shipping address.
  - **Full CRUD Support**: Add, Edit, Delete, and Set as Default with instantaneous optimistic state updates.
* **Checkout Integration (`CheckoutModal.tsx`)**:
  - Upgraded the delivery section to a Shopee-style interactive address card.
  - Shows recipient name, contact phone number, address, and category badge.
  - Includes a "Change" button that opens `AddressBookModal` in selection mode, allowing customers to switch destinations in 1 click or add a new address directly during checkout.
* **Database & API Persistence**:
  - Added `savedAddresses Json? @default("[]")` to the `User` model in `prisma/schema.prisma` and pushed to Supabase PostgreSQL.
  - Updated `customerController.js` and `authController.js` to return and update `savedAddresses`.
  - Updated `useAuthStore.ts` `refreshUser()` to keep addresses synced across browser reloads.

---

### B. Customer Dashboard Gold Standards

#### Pillar 1: Live Order Milestone Tracker (`OrderMilestoneHero.tsx`)
* Displays prominently at the top of the Customer Dashboard when an active order is present.
* 5-Stage Visual Stepper:
  $$\text{1. Order Placed} \longrightarrow \text{2. Digitized} \longrightarrow \text{3. Stitching} \longrightarrow \text{4. QA Inspection} \longrightarrow \text{5. Out for Delivery}$$
* Real-time progress bar, glowing active milestone node with pulse effects, estimated dispatch time, multi-order switcher, and a "Track Live GPS" shortcut.

#### Pillar 2: Actionable Favorites & Stock Awareness
* **Move All to Basket**: Added a 1-click header action on the Favorites tab that adds all in-stock favorited items to the basket simultaneously.
* **Inventory Badges**: Ambient stock badges on product cards display *"Only X left"* when remaining inventory is $\le 5$ units.
* **1-Click Add to Basket**: `ProductCard.tsx` now adds items directly to the basket on button click without popup modals unless variant customization (color/size) is required.

#### Pillar 3: 1-Click Repeat Order ("Reorder This")
* In the **Order Tracking** tab, each previous or completed order card now features a prominent **"Reorder"** button.
* Automatically extracts `order.items`, adds them to the basket drawer, and opens checkout in seconds.

#### Pillar 4: BIR-Compliant Digital Invoices & Receipts (`InvoiceModal.tsx`)
* Accessible from both **Order Tracking** and **My Transactions**.
* Displays official company header, VAT-registered TIN (`429-810-332-00000`), sequential invoice number, customer delivery details, line items table, and **12% VAT Breakdown** (Vatable Sales + VAT Amount).
* Includes a **"Print / Save PDF"** button formatted for clean printing via `window.print()`.

---

### C. Design Aesthetics & Visual Polish
* Implemented the **Artisanal Warm Linen & Ivory Cream** palette:
  - Background Canvas: Warm cream linen (`#FAF7F2`)
  - Elevated Cards: Soft white with subtle warm glassmorphism
  - Accents: Artisanal amber/champagne primary accents
  - Shadows: Soft, diffused ambient drop shadows (`rgba(180, 160, 140, 0.08)`) replacing harsh dark drop shadows.
* Consistent dark/light mode toggle with smooth theme transitions.

---

## 4. File Modification Summary

| File | Status | Description |
| :--- | :---: | :--- |
| `frontend/src/components/dashboard/AddressBookModal.tsx` | **Created** | Shopee-style multi-address book manager modal with phone numbers, labels, and CRUD actions. |
| `frontend/src/components/dashboard/OrderMilestoneHero.tsx` | **Created** | Live 5-step production progress hero banner with active milestone indicators. |
| `frontend/src/components/dashboard/InvoiceModal.tsx` | **Created** | BIR-compliant official digital tax invoice modal with 12% VAT breakdown and PDF printing. |
| `frontend/src/components/products/ProductCard.tsx` | **Modified** | Removed CSS fadeIn flicker; added low-stock awareness badge and 1-click add to basket. |
| `frontend/src/stores/useProductStore.ts` | **Modified** | Added silent background polling flag to prevent skeleton flashes during auto-sync. |
| `frontend/src/components/checkout/CheckoutModal.tsx` | **Modified** | Integrated Shopee-style delivery address selection card and AddressBookModal trigger. |
| `frontend/src/app/dashboard/page.tsx` | **Modified** | Integrated OrderMilestoneHero, Reorder This, Move All Favorites, Saved Addresses panel, and InvoiceModal. |
| `frontend/src/lib/types.ts` | **Modified** | Added `SavedAddress` interface; updated `User` and `DashboardState`. |
| `frontend/src/stores/useAuthStore.ts` | **Modified** | Updated `refreshUser` to keep `savedAddresses` and `phoneNumber` in sync. |
| `controllers/postgres/customerController.js` | **Modified** | Added `savedAddresses` handling to `updateSettings` and `getDashboardState`. |
| `controllers/postgres/authController.js` | **Modified** | Added `savedAddresses` to `login` payload and `exports.me` selection query. |
| `prisma/schema.prisma` | **Modified** | Added `savedAddresses Json? @default("[]")` to the `User` model; pushed to Supabase PostgreSQL. |

---

## 5. Verification & Deployment Log

- **Prisma Schema Synchronization**: `npx prisma db push` ran successfully against Supabase PostgreSQL (schema in sync).
- **Next.js Production Build**: `npm run build` compiled with Turbopack in 5.6s with **0 errors / 0 warnings**.
- **Git Commits & Pushes**:
  - `5e568bf`: *fix: eliminate product card flicker on favoriting and enable silent dashboard background sync*
  - `1150ca8`: *feat: implement customer dashboard gold standards and shopee-style multi-address book*
