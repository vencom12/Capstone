# Stitch-Opt: End-to-End Customer Journey & System User Manual
**Capstone Project**: Stitch-Opt Automated Computerized Embroidery & E-Commerce Platform  
**Purpose**: A complete, non-technical walkthrough of how customers use the website, how staff processes orders, and how the entire system functions in real life.

---

## 1. Overview: The Real-Life Business Model

Stitch-Opt is a custom embroidery studio. Unlike a standard store selling pre-made clothes, **custom embroidery items must be manufactured in a workshop after an order is placed**.

Because of this manufacturing workflow, the customer journey is divided into **5 clear, logical steps**:

```
[1. Discover & Save] ➔ [2. Customize & Basket] ➔ [3. Checkout & Payment] ➔ [4. Production & Delivery Tracking] ➔ [5. Receipt & Reorder]
```

---

## 2. The 5-Step Customer Journey (Step-by-Step)

### Step 1: Browse & Discover
1. **Customer visits the website** (`/dashboard` or `/` storefront).
2. **Browsing Designs**: The customer views professional embroidery designs (logos, patches, florals, monograms) with real-time pricing and stock indicators (*"In Stock"* or *"Only X left"*).
3. **Favoriting (Heart Icon)**:
   - The customer clicks the **Heart icon** to save designs they like.
   - In the **"My Favorites"** tab, they can view all saved items and click **"Move All to Basket"** when ready to order.

---

### Step 2: Customization & Adding to Basket
1. **Quick View Modal**: The customer clicks on any design card to inspect:
   - Garment options (e.g., Polo Shirt, Hoodie, Tote Bag).
   - Thread color variants (e.g., Gold, Navy, Burgundy, Royal Blue).
   - Size options (S, M, L, XL).
2. **Add to Basket**:
   - The customer selects their quantity and options.
   - The floating **My Basket drawer** on the right updates instantly with the subtotal.

---

### Step 3: Frictionless Checkout (Shopee-Style)
When the customer clicks **"Proceed to Checkout"**:
1. **Delivery Address & Phone Number**:
   - The customer selects their delivery location (e.g., `🏠 Home` or `🏢 Work`).
   - If it's their first time, they tap **"+ Add Address"** to enter:
     - Recipient Name (e.g. *Juan Dela Cruz*)
     - Mobile Number for the courier (e.g. *0917 123 4567*)
     - Street, Barangay, City, Province, and Postal Code
   - *Why this matters*: Just like Shopee, once saved, the customer never has to re-type their address again on future orders.
2. **Special Delivery Instructions**:
   - An optional text box for landmark guides (e.g., *"Yellow gate beside 7-Eleven, please call upon arrival"*).
3. **GCash Payment & AI Verification**:
   - The customer scans the official Stitch-Opt GCash QR code.
   - They upload the screenshot of their GCash payment receipt.
   - The system verifies the payment reference and automatically places the order.

---

### Step 4: Transparent Order Tracking (Two Real-Life Phases)
Once the order is placed, the customer clicks **"Order Tracking"**. The system realistically shows where their item is:

#### Phase A: Workshop Production (Inside the Studio)
* **What the customer sees**: A workshop manufacturing status bar:
  1. **Payment Verified & Job Logged**: Payment confirmed.
  2. **Vector Digitization**: The artwork is converted to embroidery machine code.
  3. **Embroidery Machine Stitching**: The multi-needle machine is currently stitching the garment.
  4. **QA Inspection**: Staff inspects thread tension and trims loose threads.
* **Why it works this way**: An order cannot be "on the road with a rider" when it hasn't even been stitched yet! This guarantees 100% credibility during your capstone defense.

#### Phase B: Out for Delivery (Live Courier GPS)
* **When this activates**: Only after workshop staff finishes the embroidery and clicks **"Dispatch Order"**.
* **What the customer sees**:
  - Assigned Courier Name & Motorcycle (e.g., *Mark Anthony R. • Honda Click 125*).
  - A clickable **"Call Courier"** button.
  - Live distance remaining in kilometers and estimated arrival window.
  - A link to **"Open in Google Maps"** showing the route between the Lucena Studio and their delivery address.

---

### Step 5: Proof of Delivery, Official Invoice & 1-Click Reorder
Once the courier hands over the package:
1. **Official Tax Invoice (`InvoiceModal`)**:
   - The customer can click **"Invoice"** at any time.
   - Shows a clean, BIR-compliant digital receipt with company TIN, 12% VAT breakdown, customer details, and a 1-click **"Print / Save PDF"** button for business expense liquidation or personal records.
2. **1-Click Reorder**:
   - Repeat customers (like schools, sports teams, or companies ordering company shirts) can tap **"Reorder This"** on any past order.
   - The system automatically loads the exact same shirts, thread colors, and quantities into the basket for checkout in under 10 seconds.

---

## 3. How the 3 User Roles Work Together

| Role | What They Do | Key Screen |
| :--- | :--- | :--- |
| **Customer** | • Browses catalog and favorites items<br>• Manages saved addresses with contact phone<br>• Checks out with GCash<br>• Tracks workshop progress & live delivery<br>• Downloads official invoices and reorders | `/dashboard`<br>`CheckoutModal`<br>`DeliveryTracker` |
| **Workshop Employee** | • Views incoming order queue<br>• Assigns designs to computerized embroidery machines<br>• Performs Quality Assurance (QA)<br>• Clicks "Dispatch Order" when finished stitching | `/employee` |
| **Delivery Courier / Rider** | • Receives delivery assignment on smartphone<br>• Navigates to customer address via Google Maps<br>• Pings live GPS location to customer<br>• Marks order as "Delivered & Signed" | `/rider-track` |
| **Administrator** | • Manages catalog designs and raw materials (thread cones, blank shirts)<br>• Views revenue, sales analytics, and audit logs<br>• Updates GCash QR code and system settings | `/admin` |

---

## 4. Why Each Feature Exists (No Unnecessary Bloat)

Every single feature in the system was added to address a specific real-world requirement:

1. **Shopee-Style Address Book with Phone Number**:
   - *Why*: Couriers cannot deliver packages without a phone number to call the recipient at the gate. Saving multiple addresses (Home vs. Office) eliminates checkout friction.
2. **Separated Workshop vs. Courier Phases**:
   - *Why*: Moving a delivery motorbike on screen when an order was placed 30 seconds ago is a fake simulation that thesis panelists immediately reject. Showing the studio stitching line first is how real manufacturing operates.
3. **1-Click Reorder Button**:
   - *Why*: Embroidery businesses rely on repeat bulk customers (corporate uniforms, school clubs). Reordering identical designs must be effortless.
4. **BIR-Compliant Digital Invoices**:
   - *Why*: Corporate, government, and school clients legally require tax invoices with VAT breakdowns to reimburse their embroidery orders.
5. **Rider Mobile GPS Transmitter (`/rider-track`)**:
   - *Why*: Proves during your capstone defense that your tracking system uses real browser APIs (`navigator.geolocation`) and real-time backend updates rather than hardcoded mockups.
