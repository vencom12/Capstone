# Stitch-Opt Engineering Changelog & System Documentation
**Date**: October 4, 2026  
**Scope**: Transactional Email (Resend HTTP API), Passwordless vs. Google Credential Architecture, Admin Variant Safety Guardrails, Mobile UX Gold Standards, and Light Theme Typography Audit.

---

## 1. Executive Summary

During today's engineering sprint, eleven critical system enhancements and stability fixes were completed across the full stack:

1. **Transactional Email Architecture (Resend HTTP API)**: Replaced direct SMTP port connections with resilient HTTPS REST API calls via Resend. Eliminates cloud host port blocks (Render/AWS/GCP outbound port 465/587 throttling) and guarantees instant delivery of password reset and email verification tokens.
2. **Google OAuth & Password Recovery Mechanics**: Clarified and documented the dual authentication pathways (OAuth Google Sign-In vs. Credential Email/Password), standardizing how users claim/set passwords for account flexibility.
3. **Admin Variant Safety Guardrails**: Eliminated accidental product variant deletions by replacing abrupt one-click removal with inline confirmation dialogs, toast notifications, and 1-click immediate restoration (`Undo`).
4. **Mobile UX & Navigation Clean-Up**: Swapped Account with Favorites in the mobile bottom bar dock, added a direct profile avatar trigger in the mobile header, and removed redundant header buttons.
5. **In-Dashboard Customer Help & FAQs**: Resolved a mobile bug where tapping "Help & FAQs" redirected users back to the storefront. Replaced the redirect with the responsive `CustomerHelpModal` embedded directly in the customer dashboard.
6. **System-Wide Light Theme Typography Audit**: Scoured and resolved all hardcoded `text-white` classes across baskets, modals, inputs, and navigation so typography seamlessly adapts between Premium Dark Mode and the Artisanal Warm Linen / Ivory Light Theme.
7. **Single Standard Cursive Embroidery Alphabet**: Replaced multi-font dropdown options with the shop's single proprietary cursive running-stitch computerized alphabet (`Classic Cursive Script`), matching real embroidery machine alphabets.
8. **In-Basket Variant Editing Modal**: Enabled customers to edit garment variants, colors, and sizes directly from within the Basket view without navigating back to the product catalog, preserving custom lettering and quantities.
9. **Basket Favorite Preservation**: Fixed the "Save" action in the basket so bookmarking an item to Favorites no longer removes it from the basket.
10. **Custom Dialog Modal for Clear Basket**: Replaced the native browser alert `confirm()` with a custom glassmorphic modal dialogue (`GlassModal`) with proper safety options ("Keep Items" / "Yes, Clear All").
11. **Iconography Clean-Up & Header Safety Clearance**: Replaced all remaining decorative emojis (`🚚`, `🏪`, `🪡`, `🧵`, `🛡️`) with crisp vector SVG line icons. Added header right padding (`pr-10`) to modal headers to prevent absolute close (`✕`) buttons from ever overlapping text.

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

---

## 4. Operational & Frontend UI Enhancements (Sprint Part II)

### E. Single Machine Standard Cursive Lettering (`ProductModal.tsx` & `qr-intake/page.tsx`)
* **Background & Domain Reality**: Real computerized embroidery machines at Eds Towels & Caps use proprietary running-stitch cursive embroidery alphabets rather than print font selections. Offering general fonts (e.g., Collegiate Block, Sans-serif) misrepresents production output.
* **Implementation**:
  - Removed multi-font dropdown and button picker options from [ProductModal.tsx](file:///c:/Users/revin/Downloads/Capstone/frontend/src/components/products/ProductModal.tsx) and [qr-intake/page.tsx](file:///c:/Users/revin/Downloads/Capstone/frontend/src/app/qr-intake/page.tsx).
  - Standardized on `Classic Cursive Script` using cursive CSS fallbacks (`'Brush Script MT', 'Segoe Script', 'Great Vibes', cursive`).
  - Updated the live stitch preview to automatically render entered monogram/name lettering with the chosen thread spool color (e.g., Metallic Gold, Silver Platinum, Royal Navy) in cursive script.
  - Added clear descriptive caption: *"Standard computerized cursive embroidery lettering"*.

---

### F. Basket Direct In-Window Variant Editing (`BasketView.tsx` & `useBasketStore.ts`)
* **Problem**: Customers had to remove items from their basket and return to the shop catalog if they wanted to switch garment colors, fan styles, or sizes.
* **Implementation**:
  - Added `updateBasketItem(basketItemId, updates)` to [useBasketStore.ts](file:///c:/Users/revin/Downloads/Capstone/frontend/src/stores/useBasketStore.ts).
  - Transformed the variant badge in [BasketView.tsx](file:///c:/Users/revin/Downloads/Capstone/frontend/src/components/dashboard/BasketView.tsx) into an interactive button (`Variant • Size ✎`).
  - Clicking this badge launches a dedicated `GlassModal` dialog listing all available garment options, color swatches, sizes, and price overrides.
  - Selecting a new option updates the line item immediately in place without losing the user's custom embroidery text or quantity.

---

### G. Basket Favorite Preservation & Toast Notification Policy
* **Item Preservation**: Clicking the heart / save button on a basket item no longer removes the product from the basket. The item remains in the cart while simultaneously syncing with the user's Favorites list.
* **Notification Streamlining**:
  - Adding an item to favorites triggers a clear success toast: `Saved "[Product Name]" to favorites`.
  - Unfavoriting / removing an item is now completely silent (no toast popup), eliminating intrusive feedback during routine wishlist cleanup.

---

### H. Custom Dialog Modal for Clear Basket
* **Problem**: Clicking "Clear Basket" previously invoked the native browser alert `window.confirm()`, which looks unstyled and breaks the custom glassmorphism aesthetic.
* **Implementation**:
  - Replaced `window.confirm()` with a themed `GlassModal` dialog.
  - Features a danger icon badge, clean warning prompt explaining how many items and custom lettering will be cleared, a **"Keep Items"** dismiss button, and an explicit **"Yes, Clear All"** red action button.

---

### I. Pure SVG Line Iconography & Modal Header Safety Clearance
* **Clean Line Icons**: Replaced decorative emojis (`🚚`, `🏪`, `🪡`, `🧵`, `🛡️`) in checkout and basket with 24×24 vector line SVGs.
* **Header Spacing Fix**: Added `pr-10` clearance to the variant selection modal header to guarantee that the absolute close (`✕`) button never overlaps or covers text regardless of device viewport size.

---

## 5. Git Revision Log

The following commits record these enhancements in the repository:

1. **`1cdede0`**: `fix(drawer): remove redundant address button and replace storefront redirect with in-dashboard CustomerHelpModal`
2. **`d99cbb2`**: `fix(admin): replace variant pill emoji with outline line pen and cross SVG icons`
3. **`4430aea`**: `feat(admin): add inline warning confirmation, toast notification, and 1-click undo for variant deletions`
4. **`05cf6d7`**: `feat(email): add Resend HTTP API support for reliable cloud delivery on Render without SMTP blocks`
5. **`502a71a`**: `refactor(ui): remove redundant mobile top-right basket button and replace emoji badges with clean line SVG icons`
6. **`8fd2b98`**: `refactor(theme): adapt hardcoded white text across basket, modals, inputs and navigation to theme tokens`
7. **`e61ee15`**: `fix(basket): bookmark to favorites without removing the product from basket`
8. **`ef7501b`**: `feat(catalog): lock embroidery font to studio default cursive script`
9. **`d9f9233`**: `fix(favorites): show notification only when adding to favorites, silent on removal`
10. **`8645914`**: `feat(basket): replace native browser confirm with custom dialog modal for clear basket`
11. **`2112209`**: `feat(basket): allow in-window variant editing directly from basket with modal selector`
12. **`3ad9a80`**: `style: replace emojis with clean crisp line SVG icons in checkout and basket`
13. **`2d2f4fe`**: `fix(modal): adjust variant modal header spacing to avoid close button overlapping text`

---

## 6. Deployment Instructions (Render Verification)

To synchronize your deployed instance on Render with all local improvements:

1. Push the commits from `main` to GitHub:
   ```bash
   git push origin main
   ```
2. In the Render Dashboard, ensure the following environment variables are set under the Backend service:
   - `RESEND_API_KEY`: `re_xxxxxxxxxxxx` (Your live API key from resend.com)
   - `RESEND_FROM_EMAIL`: `Eds Towels & Caps <onboarding@resend.dev>` (or your verified domain email)
3. Once the automatic deployment finishes, test on mobile & desktop:
   - Verify that adding embroidery text shows the default cursive lettering stitch preview.
   - Click a variant badge inside the basket to reselect garment options on the fly.
   - Click "Clear Basket" to test the custom confirmation dialog.
