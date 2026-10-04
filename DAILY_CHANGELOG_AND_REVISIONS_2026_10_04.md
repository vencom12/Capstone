# Stitch-Opt Engineering Changelog & System Documentation
**Date**: October 4, 2026  
**Scope**: Transactional Email (Resend HTTP API), Passwordless vs. Google Credential Architecture, Admin Variant Safety Guardrails, Mobile UX Gold Standards, and Light Theme Typography Audit.

---

## 1. Executive Summary

During today's engineering sprint, six critical system enhancements and stability fixes were completed across the full stack:

1. **Transactional Email Architecture (Resend HTTP API)**: Replaced direct SMTP port connections with resilient HTTPS REST API calls via Resend. Eliminates cloud host port blocks (Render/AWS/GCP outbound port 465/587 throttling) and guarantees instant delivery of password reset and email verification tokens.
2. **Google OAuth & Password Recovery Mechanics**: Clarified and documented the dual authentication pathways (OAuth Google Sign-In vs. Credential Email/Password), standardizing how users claim/set passwords for account flexibility.
3. **Admin Variant Safety Guardrails**: Eliminated accidental product variant deletions by replacing abrupt one-click removal with inline confirmation dialogs, toast notifications, and 1-click immediate restoration (`Undo`).
4. **Mobile UX & Navigation Clean-Up**: Removed the redundant top-right basket button on mobile screens to avoid user confusion with the floating footer basket trigger. Replaced all legacy emojis with clean, modern Lucide-style line SVG vector icons.
5. **In-Dashboard Customer Help & FAQs**: Resolved a mobile bug where tapping "Help & FAQs" redirected users back to the storefront. Replaced the redirect with the responsive `CustomerHelpModal` embedded directly in the customer dashboard.
6. **System-Wide Light Theme Typography Audit**: Scoured and resolved all hardcoded `text-white` classes across baskets, modals, inputs, and navigation so typography seamlessly adapts between Premium Dark Mode and the Artisanal Warm Linen / Ivory Light Theme.

---

## 2. Feature Implementations & Architecture Upgrades

### A. Resend HTTP API Email Delivery (`services/emailService.js`)
* **Problem**: When deployed to cloud environments (e.g. Render, Railway, DigitalOcean), traditional SMTP connections (`smtp.gmail.com` on ports 465/587) are frequently blocked or throttled by cloud firewalls to prevent spam, resulting in connection timeouts (`ETIMEDOUT`) and dropped password reset emails.
* **Solution**: Upgraded `emailService.js` to prioritize the modern **Resend HTTP API** (`https://api.resend.com/emails`) using native `fetch` over port 443:
  - Automatically activates when `RESEND_API_KEY` is present in the environment variables.
  - Sends high-priority transactional emails formatted with responsive HTML and branded templates.
  - Falls back smoothly to Nodemailer SMTP for local development environments if `RESEND_API_KEY` is omitted.
  - Configured custom sender address (e.g., `RESEND_FROM_EMAIL` or `onboarding@resend.dev`) with clear server logging.

```javascript
// Example architecture snippet in services/emailService.js
if (process.env.RESEND_API_KEY) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Eds Towels & Caps <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html
    })
  });
}
```

---

### B. Admin Variant Deletion Safety Guardrails (`PanelProducts.tsx`)
* **Problem**: In the Admin Product Management panel, clicking the `×` button on a product variant immediately deleted the variant with zero warning, zero confirmation, and zero ability to recover from accidental clicks.
* **Solution**:
  1. **Inline Confirmation**: Tapping the remove button now flags the specific variant in state (`confirmDeleteVariantKey`). An inline confirmation dialog appears: *"Remove variant? [Confirm] [Cancel]"*.
  2. **Audit Toast Notification**: Upon confirmed deletion, a floating toast notification informs the operator: `Variant "[Color - Size]" deleted`.
  3. **1-Click Immediate Undo**: The toast includes an interactive **"Undo"** action button that immediately restores the deleted variant back to the form state without losing unsaved changes.

---

### C. Mobile Navigation & Iconography Modernization
* **Elimination of Duplicate Mobile Basket Button**: On mobile screens, having both a header basket icon and a bottom sticky bar created visual clutter and confusion. The mobile header now suppresses the secondary basket trigger, establishing the bottom bar as the single source of truth for basket access on phones.
* **Vector Line Icon Standardization**:
  - Replaced legacy emojis (`🏠`, `🏢`, `📍`, `⏰`, `📞`) across `AddressBookModal.tsx`, `CustomerHelpModal.tsx`, `CheckoutModal.tsx`, and `TermsAndPoliciesModal.tsx`.
  - Implemented crisp 24×24 Lucide-style SVG line paths matching the application's clean design aesthetic.

---

### D. In-Dashboard Customer Help & FAQs Drawer Action
* **Problem**: In earlier revisions, clicking "Help & FAQs" inside the mobile sidebar drawer executed an anchor link or redirected users out of their dashboard back to the homepage (`/#faq`).
* **Solution**:
  - Connected the drawer item directly to the customer dashboard modal state (`setIsHelpOpen(true)`).
  - Renders `CustomerHelpModal.tsx` containing studio turnaround details, Pacific Mall Lucena pick-up guidelines, J&T courier procedures, and a one-touch `tel:` studio calling button.

---

## 3. Light Theme Typography Audit (`[data-theme="light"]`)

### Technical Overview
In the application's design system (`globals.css`), switching to the Light Theme activates warm ivory porcelain backgrounds (`--color-bg-card: #fffefb`, `--color-bg-surface: #eae3d5`).

Hardcoded Tailwind classes like `text-white` caused headings, labels, table items, and modal texts to wash out or become unreadable against light backgrounds.

### Components Audited & Refactored

| Component | Target Elements | Previous Style | Adaptive Token |
| :--- | :--- | :--- | :--- |
| **BasketView.tsx** | Basket Header & Empty State Title | `text-white` | `text-text-main` |
| **BasketView.tsx** | "Select All" Checkbox Label | `text-white` | `text-text-main` |
| **BasketView.tsx** | Basket Item Names | `text-white` | `text-text-main` |
| **BasketView.tsx** | Stepper Quantity & Increment Buttons | `text-white` | `text-text-main` |
| **BasketView.tsx** | Order Summary Header & Estimated Total | `text-white` | `text-text-main` |
| **TermsAndPoliciesModal.tsx** | Modal Section Title & Policy Sub-headings | `text-white` | `text-text-main` |
| **TermsAndPoliciesModal.tsx** | Close / Understand Button | `text-white` | `text-text-main` |
| **CheckoutModal.tsx** | Store Pick-up Counter Heading & Studio Title | `text-white` | `text-text-main` |
| **CheckoutModal.tsx** | Estimated Completion Hours | `text-white` | `text-text-main` |
| **PanelSettings.tsx** | Business & Receipt Configuration Labels | `text-white` | `text-text-main` |
| **PanelSettings.tsx** | Receipt Configuration Text Inputs | `text-white` | `text-text-main` |
| **PanelSettings.tsx** | AI Model & Orchestration Field Labels | `text-white` | `text-text-main` |
| **PanelSettings.tsx** | Luxury Gift Suite & Default Theme Labels | `text-white` | `text-text-main` |
| **Sidebar.tsx** | Category Tab Hover State | `hover:text-white` | `hover:text-text-main` |
| **StorefrontHeader.tsx** | Category Dropdown Hover State | `hover:text-white` | `hover:text-primary` |
| **DashboardPage.tsx** | Delivery Time Selection Dropdown `<option>` | `text-white` | `text-text-main` |
| **EmailVerificationBanner.tsx**| Unverified Email Address Highlight | `text-white` | `text-amber-100` |

> [!NOTE]
> Primary action buttons and badges with solid colored backgrounds (`bg-primary`, `bg-danger`, `bg-emerald-600`) deliberately retain `text-white` because their colored backgrounds remain dark and vibrant in both themes.

---

## 4. Git Revision Log

The following commits record these enhancements in the repository:

1. **`1cdede0`**: `fix(drawer): remove redundant address button and replace storefront redirect with in-dashboard CustomerHelpModal`
2. **`d99cbb2`**: `fix(admin): replace variant pill emoji with outline line pen and cross SVG icons`
3. **`4430aea`**: `feat(admin): add inline warning confirmation, toast notification, and 1-click undo for variant deletions`
4. **`05cf6d7`**: `feat(email): add Resend HTTP API support for reliable cloud delivery on Render without SMTP blocks`
5. **`502a71a`**: `refactor(ui): remove redundant mobile top-right basket button and replace emoji badges with clean line SVG icons`
6. **`8fd2b98`**: `refactor(theme): adapt hardcoded white text across basket, modals, inputs and navigation to theme tokens`

---

## 5. Deployment Instructions (Render Verification)

To synchronize your deployed instance on Render with all local improvements:

1. Push the commits from `main` to GitHub:
   ```bash
   git push origin main
   ```
2. In the Render Dashboard, ensure the following environment variables are set under the Backend service:
   - `RESEND_API_KEY`: `re_xxxxxxxxxxxx` (Your live API key from resend.com)
   - `RESEND_FROM_EMAIL`: `Eds Towels & Caps <onboarding@resend.dev>` (or your verified domain email)
3. Once the automatic deployment finishes, test on mobile:
   - Open the mobile drawer and tap **Help & FAQs** (the in-dashboard modal will appear).
   - Toggle **Light Theme** from settings or the drawer (verify that all basket items, order summaries, and policies display crisp dark text on warm ivory surfaces).
