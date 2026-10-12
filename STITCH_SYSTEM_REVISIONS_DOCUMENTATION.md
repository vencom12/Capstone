# Stitch-Opt UI/UX & Audit Trail System Revisions Documentation

**Date:** October 12, 2026  
**Project:** Stitch-Opt Capstone Management System  
**Scope:** Admin Personnel Directory, UI/UX Design System Alignment, and Global Audit Ledger  

---

## Executive Summary

This document provides a comprehensive technical and non-technical record of recent UI/UX and architectural enhancements applied across the **Stitch-Opt** administrative dashboard. These revisions address visual ambiguity, table column clutter, design token harmonization, domain segregation, and audit trail transparency.

---

## 1. Interactive Button vs. Static Status Bubble Distinction

### Problem Statement
In previous iterations, static informational indicators (e.g., `Shift Status`, `Access/Role`, `Account Status`, `Email Verified`) utilized rounded pill containers with backgrounds and borders identical to clickable buttons. This caused cognitive friction: users could not distinguish which elements were interactive buttons and which were passive status labels.

### Solution & Implementation
- **Static Statuses**: Converted into clean, plain typography without background pills, bubbles, or borders.
  - **Account Status**: Rendered as plain text: `Active` (emerald) or `Disabled` (rose/danger).
  - **Shift Status**: Rendered as plain text: `On Shift` (success) or `Offline` (dimmed).
  - **Email Verification**: Rendered as plain text: `Verified` (success) or `Unverified` (dimmed).
- **Interactive Action Buttons**: Retained pill bubble containers (`rounded-lg`), borders, background fills, and hover elevation strictly for actionable items:
  - `Profile` (View CRM / staff profile modal)
  - `Edit` (Modify personnel details modal)
  - `Disable` / `Enable` (Account deactivation toggle)
- **Informational Badges**: Non-clickable contextual labels like `(You)` were stripped of button bubbles and styled as muted informational font labels.

**Modified Files:**
- `frontend/src/components/admin/PanelStaffing.tsx`

---

## 2. Action Buttons Alignment & Grid Consistency

### Problem Statement
Customer rows only had 2 actions (`Profile`, `Disable/Enable`), while Staff rows had 3 actions (`Profile`, `Edit`, `Disable/Enable/(You)`). Because the action cell used `justify-end`, customer buttons shifted into adjacent columns, causing a jagged, misaligned appearance down the table.

### Solution & Implementation
- Implemented standardized fixed-width slots for each button:
  - **Slot 1 (w-16)**: `Profile`
  - **Slot 2 (w-14)**: `Edit` (staff only; omitted cleanly on segregated customer tables)
  - **Slot 3 (w-16)**: `Disable` / `Enable` / `(You)`
- Ensures strict vertical column alignment across every row in the directory.

**Modified Files:**
- `frontend/src/components/admin/PanelStaffing.tsx`

---

## 3. Removal of Visual Noise (Colored Indicator Dots)

### Problem Statement
Small colored circle indicators (`w-1.5 h-1.5 rounded-full`) before status words added visual clutter that conflicted with the user's requirement for a sleek, minimalistic, and emoji-free interface.

### Solution & Implementation
- Completely removed all dot indicators from table rows and mobile card views.
- Status is communicated solely through clean typography and curated text colors.

**Modified Files:**
- `frontend/src/components/admin/PanelStaffing.tsx`

---

## 4. Elimination of Irrelevant Columns on Customers

### Problem Statement
When viewing personnel accounts, customers were previously displayed in a combined view where staff-only columns (`Shift Status` and `Assigned Machine`) appeared, resulting in misleading rows such as:
`Customer: RevInDev | Shift Status: Offline | Assigned Machine: Unassigned`

### Solution & Implementation
- Restricted `Shift Status` and `Assigned Machine` exclusively to staff members.
- Replaced internal operational fields on customer rows with metrics relevant to customers:
  - **Orders Placed**: Lifetime order count.
  - **Lifetime Spend**: Total historical spend in Philippine Pesos (`₱`).

**Modified Files:**
- `frontend/src/components/admin/PanelStaffing.tsx`

---

## 5. Theme Color Harmonization with Design Tokens

### Problem Statement
Multiple panels contained hardcoded arbitrary Tailwind color classes (`indigo-300`, `indigo-400`, `amber-400`, `emerald-400`, `rose-400`) that clashed with the central Stitch-Opt design tokens defined in `globals.css`. Notably, customer roles were rendered in jarring amber/yellow, which visually mimicked a warning state.

### Solution & Implementation
- Mapped all text, borders, and backgrounds to the core Stitch-Opt `@theme` tokens:
  - `--color-primary` (`#4f46e5` - Brand Indigo)
  - `--color-secondary` (`#6366f1` - Brand Violet / Admin Accent)
  - `--color-accent` (`#3b82f6` - Artisan Blue)
  - `--color-success` (`#10b981` - Emerald Green)
  - `--color-warning` (`#f59e0b` - Amber)
  - `--color-danger` (`#ef4444` - Crimson Red)
  - `--color-text-main` (`#f8fafc` - High-contrast text)
  - `--color-text-dim` (`#94a3b8` - Muted secondary text)
- Role coloring updated:
  - **Admin**: `text-secondary` (`#6366f1`)
  - **Artisan / Employee**: `text-accent` (`#3b82f6`)
  - **Customer**: Neutral `text-text-dim` (`#94a3b8`)
- Action button styling harmonized:
  - Secondary action (`Profile`): Glass ghost button (`bg-white/5 border border-border-glass text-text-main`)
  - Primary action (`Edit`): `bg-primary/10 border border-primary/20 text-primary`
  - Destructive action (`Disable`): `bg-danger/10 border border-danger/20 text-danger`
  - Re-enable action (`Enable`): `bg-success/10 border border-success/20 text-success`

**Modified Files:**
- `frontend/src/components/admin/PanelStaffing.tsx`
- `frontend/src/components/admin/PanelRawMaterials.tsx`
- `frontend/src/components/admin/PanelOverview.tsx`

---

## 6. Segregated 2-Tab Directory (Removed "All" Tab)

### Problem Statement
Staff members (operators with shifts and embroidery machines) and customers (shoppers with orders and delivery addresses) represent fundamentally different entities. Combining them in an "All" tab caused layout inconsistencies and confusing data columns.

### Solution & Implementation
- Removed the "All" tab completely. The personnel registry now cleanly toggles between:
  1. **Staff & Operators** (Admins & Employees)
  2. **Customers** (Customer Accounts)
- Summary metrics bar updated to be contextual:
  - On Staff: `X Currently On Shift • Y Total Personnel`
  - On Customers: `X Registered Customers`

**Modified Files:**
- `frontend/src/components/admin/PanelStaffing.tsx`

---

## 7. Streamlined 7-Column Grid (Removed Redundant "Access / Role" Column)

### Problem Statement
On the **Customers** tab, every row is guaranteed to be a customer, making an "Access / Role" column that says "CUSTOMER" on every row completely redundant. On the **Staff** tab, allocating an entire column for two roles consumed excessive horizontal width.

### Solution & Implementation
- Removed the standalone `Access / Role` column from both views.
- **Staff View**: Role is rendered elegantly directly underneath the personnel name in the first column:
  - E.g., `employ` with `Administrator` in `text-secondary` underneath.
- **Customer View**: First column displays the customer's name with their primary delivery address previewed subtly underneath.
- Both tabs now share a balanced 7-column layout:

#### Staff & Operators View (7 Columns)
1. **Staff & Role** (`Username` + `Administrator` / `Artisan`)
2. **Contact Info** (`Email`, `Phone`)
3. **Shift Status** (`On Shift` / `Offline`)
4. **Assigned Machine** (`1st Machine`, `2nd Machine`, `Unassigned`)
5. **Last Active** (Relative timestamp)
6. **Status** (`Active` / `Disabled`)
7. **Actions** (`Profile`, `Edit`, `Disable` / `Enable` / `(You)`)

#### Customers View (7 Columns)
1. **Customer** (`Username` + Delivery Address)
2. **Contact Info** (`Email` + `Verified` / `Unverified`, `Phone`)
3. **Orders Placed** (Count)
4. **Lifetime Spend** (`₱` Currency)
5. **Last Active** (Relative timestamp)
6. **Status** (`Active` / `Disabled`)
7. **Actions** (`Profile`, `Disable` / `Enable`)

**Modified Files:**
- `frontend/src/components/admin/PanelStaffing.tsx`

---

## 8. Audit Trail Target Subject Transparency

### Problem Statement
In the Audit Trail (`PanelAuditTrail.tsx`), mutations on accounts (e.g. `TOGGLE_USER_STATUS`, `ADMIN_PASSWORD_RESET`, `CREATE_USER`, `DISABLE_USER`) logged the performing admin under `Actor`, but only listed an unreadable UUID (e.g. `f1374875-2bac-46f5-a601-67b165a4fdf5`) under `Target ID`. Administrators had no way of knowing which user had actually been modified without manual database cross-referencing.

### Solution & Implementation
- **Backend (`adminController.js`)**:
  - Enhanced `getGlobalAuditLogs` to join and enrich the target entities for all logs.
  - When `entity === 'User'`, the backend resolves:
    - `targetName`: The affected user's `username` (e.g., `RevInDev`).
    - `targetDetail`: The affected user's `email` (e.g., `revindevtest@gmail.com`).
    - `targetUser.role`: The affected user's account role (`customer` / `employee` / `admin`).
  - Also resolves names for Products (`product.name`), Inventory (`rawMaterial.item`), and Orders (`order.orderId`).
- **Frontend (`PanelAuditTrail.tsx`)**:
  - Renamed table column from `Target ID` to **`Target Subject`**.
  - Displays the target username in bold with role badge, and their email address underneath.
  - Retains the exact UUID in copyable tooltips and in the **Inspect Diff** state inspection modal.
  - Updated CSV exports to include the enriched `Target Subject` column.

**Modified Files:**
- `controllers/postgres/adminController.js`
- `frontend/src/components/admin/PanelAuditTrail.tsx`

---

## Verification & Build Results
- **Express Backend**: Verified active and healthy on port 5001 (`/api/health` reports status `ok` with connected database).
- **Next.js Turbopack Build**: Compiled and statically prerendered all 11 application routes with exit code `0` and zero TypeScript/lint errors.
