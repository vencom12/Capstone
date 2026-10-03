# Stitch-Opt: Comprehensive Ordering, Production & Logistics Tracking System
**Official Engineering & Architecture Documentation**  
*Capstone Defense Reference Manual | Academic Year 2026*

---

## 1. Executive System Overview

The **Stitch-Opt Ordering & Logistics Tracking System** is an end-to-end e-commerce, automated manufacturing, and 3rd-party logistics (3PL) fulfillment platform built specifically for on-demand computerized embroidery and customized apparel.

Traditional Philippine e-commerce platforms struggle with customized apparel because they treat every item as an "off-the-shelf" SKU. Stitch-Opt bridges the gap between **e-commerce checkout**, **artisanal embroidery line production**, and **nationwide courier distribution** (standardized with J&T Express Philippines).

* **Official Business Facility:** Pacific Mall Lucena, M.L. Tagarao St., Brgy. 3, Lucena City, Quezon 4301
* **Customer Service & Operations Hotline:** **0928 810 3928**
* **Official GCash Account Name:** **Eds Towels and Caps Embroidery**
* **Primary 3PL Logistics Partner:** J&T Express Philippines (Lucena Distribution Center)

```mermaid
flowchart LR
    subgraph Customer [1. Customer Web Portal]
        A[Browse Catalog] --> B[Variant Customization]
        B --> C[Multi-Address Checkout]
        C --> D[GCash / Payment Gateway]
    end

    subgraph Studio [2. Stitch-Opt Studio Line]
        D --> E[Job Order Logged]
        E --> F[Vector Digitization]
        F --> G[Multi-Needle CNC Stitching]
        G --> H[QA & Packaging]
        H --> I[Print 4x6" J&T Waybill]
    end

    subgraph Logistics [3. J&T Express 3PL Logistics]
        I --> J[Studio Pickup / Hub Drop-off]
        J --> K[South Luzon Sorting Center]
        K --> L[Lucena Delivery Hub]
        L --> M[Rider Out for Delivery]
        M --> N[Customer Handover & Signature]
    end

    subgraph Tracking [4. In-App Tracking]
        N -. In-App Timeline .-> O[Shopee-Style Live Stepper]
        M -. Live Telemetry .-> O
        K -. Hub Updates .-> O
    end
```

---

## 2. End-to-End User Journeys

### Journey 1: Customer Journey (Purchasing & In-App Tracking)
1. **Catalog Browsing & Personalization**:
   - The customer browses the Stitch-Opt catalog (caps, hoodies, jackets, patches).
   - Selects colorways, thread colors, sizes, and hooping configurations.
   - Products are held in an idempotent local/cloud basket (`useBasketStore`).
2. **Shopee-Style Address Selection**:
   - Customers can save multiple delivery addresses with recipient names, contact numbers, and landmarks.
   - Designates one address as **Default** or selects an alternate address during checkout.
3. **Checkout & Verified Payment**:
   - Order is validated against live pricing and VAT (12% Philippine BIR standard).
   - Payment processed via GCash or Electronic Gateway.
   - System creates a persistent Order Record with an initial status: `Order Placed`.
4. **Shopee-Style In-App Tracking**:
   - The customer navigates to **My Orders** $\rightarrow$ **Track Delivery**.
   - The web app displays the J&T Express tracking number (`JNT-PH-78XXXXXX`) with a 1-click **Copy** button.
   - A step-by-step chronological audit log shows the item’s progress from digitization to courier transit without leaving the Stitch-Opt web app.

---

### Journey 2: Studio Staff Journey (Manufacturing & Packaging)
1. **Job Order Ingestion**:
   - Workshop staff review incoming orders in the Employee / Admin Portal.
   - Vector assets (.DST / .PES embroidery files) are loaded into computerized embroidery machines.
2. **Artisanal Production & QA**:
   - Status updates through: *Vector Digitization* (20%) $\rightarrow$ *Machine Stitching* (50%) $\rightarrow$ *QA & Trimming* (80%).
3. **Thermal Waybill Printing**:
   - When garments pass QA, staff pack them into standard poly-mailer pouches or boxes.
   - Staff click **"🏷️ J&T Waybill Sticker"** directly from the order interface.
   - The system formats a standard **100mm x 150mm (4x6 inch) J&T Air Waybill (AWB)** with scannable Code 128 barcode and routing QR code.
   - The sticker is printed on a thermal label printer (*Xprinter / Phomemo*) and applied to the parcel.

---

### Journey 3: Delivery Service Provider (3PL Handover & Transit)
1. **Courier Acceptance**:
   - J&T Express rider collects the package at the Pacific Mall Lucena Studio or staff drops it off at the J&T Lucena branch.
   - Order status transitions to `Handed Over to J&T Express` / `In Transit`.
2. **Hub Sorting & Regional Routing**:
   - Parcel moves: *Origin Lucena Hub (`LCN-MAIN-01`)* $\rightarrow$ *South Luzon Sorting Center* $\rightarrow$ *Destination Hub*.
3. **Doorstep Handover**:
   - J&T delivery rider marks parcel as `Out for Delivery`.
   - Upon delivery and recipient signature, order is completed (`Completed` / 100%).

---

## 3. Technical Architecture & Component Structure

### Component Hierarchy
```
frontend/src/
├── app/
│   ├── dashboard/
│   │   └── page.tsx              # Main customer hub (orders, favorites, addresses)
│   ├── courier-scan/
│   │   └── page.tsx              # Mobile Barcode / QR terminal for logistics staff
│   └── rider-track/
│       └── page.tsx              # HTML5 Geolocation transmitter for mobile delivery
└── components/
    └── dashboard/
        ├── DeliveryTracker.tsx   # Shopee-style in-app milestone tracking stepper
        ├── WaybillModal.tsx      # Printable 4x6" J&T Express AWB thermal sticker
        ├── OrderDetailsModal.tsx # Order summary, item breakdown, & tracking tab
        ├── InvoiceModal.tsx      # Official BIR-compliant electronic VAT receipt
        └── AddressBookModal.tsx  # Shopee-style multi-address book manager
```

---

## 4. Key Component Deep Dive

### A. In-App Tracking Interface (`DeliveryTracker.tsx`)
* **Shopee-Style Banner**: Displays the active delivery state with color-coded status badges:
  - 🧵 `In Production`: Garment undergoing stitching & quality inspection.
  - 📦 `In Transit`: Parcel accepted by J&T Express and moving through sorting centers.
  - 🚚 `Out for Delivery`: Assigned to J&T courier rider for today’s drop-off.
  - ✓ `Delivered`: Handover confirmed with photo proof and signature.
* **Courier Bar**:
  - Official **J&T Express Philippines** insignia.
  - Formatted J&T Tracking Number (`JNT-PH-78XXXXXX`) with copy-to-clipboard functionality.
* **Chronological Logistics Stepper**:
  - Vertical connection line with active green pulse on the latest milestone.
  - Philippine localized timestamps (`en-PH`: e.g., `Oct 3, 02:15 PM`).
  - Facility hub tags (*Lucena Studio*, *South Luzon Sorting Center*, *Lucena Delivery Hub*).
* **Delivery Destination Card**:
  - Displays recipient name, phone, address, and special rider landmark instructions.

### B. Thermal Waybill Sticker Modal (`WaybillModal.tsx`)
* **Standard 100mm x 150mm (4x6 Inch) Layout**:
  - Formatted to match official J&T Express Philippine Air Waybill (AWB) guidelines.
  - **Barcode**: Pure SVG Code 128 barcode encoding the tracking number.
  - **Origin Hub Routing**: `LCN-MAIN-01` (Pacific Mall Lucena Studio) to destination sorting code.
  - **Payment Specification**: Highlights `NON-COD (PAID - GCASH)` or `COD` terms.
  - **Package Specifications**: Itemized descriptions, quantities, and weight (0.40 kg).
  - **Verification QR Code**: Scannable QR code generated via dynamic API encoding order reference, destination, and security token.
* **Zero-Margin Print Styling (`@media print`)**:
  - Custom CSS isolates `#jnt-thermal-waybill` during printing, hiding browser headers and footers to ensure clean output on thermal sticker rolls.

---

## 5. Data Models & Lifecycle State Machine

### Order Data Model
```typescript
interface Order {
  id: string;
  orderId: string;              // e.g. "ORD-F29AD4DA"
  client: string;               // Recipient Name
  email: string;
  address: string;              // Delivery Address with optional "(Landmark: ...)"
  date: string;                 // ISO Date string
  status: OrderStatus;          // "Pending" | "In Production" | "Out for Delivery" | "Completed"
  progress: number;             // 0 - 100 %
  totalAmount: number;          // Philippine Peso (PHP)
  paymentMethod: string;        // "gcash" | "cod" | "credit_card"
  items: OrderItem[];           // List of garments & embroidered items
  notes?: string;               // Seller instructions or landmark details
}
```

### Order Lifecycle State Transitions
| Current Status | Trigger Action | Progress | Next Status | In-App Tracking Display |
| :--- | :--- | :---: | :--- | :--- |
| **Pending** | GCash Payment Verified | 10% | `Order Placed` | Payment Confirmed & Material Hooping |
| **Order Placed** | Workshop Starts Stitching | 40% | `In Production` | Machine Stitching at Lucena Studio |
| **In Production** | QA Passed & Waybill Attached | 80% | `In Transit` | Handed Over to J&T Express Hub |
| **In Transit** | J&T Rider Dispatched | 90% | `Out for Delivery` | J&T Courier En Route to Address |
| **Out for Delivery** | Recipient Signs for Parcel | 100% | `Completed` | Parcel Delivered & Received |

---

## 6. Security, Privacy & Integrity Standards

1. **Philippine Data Privacy Act (RA 10173) Compliance**:
   - Customer phone numbers are masked on public customer interfaces.
   - Only necessary logistics data (name, destination address, contact number) is exposed on the physical waybill sticker.
2. **Zero "Demo" Integrity**:
   - Removed all developer simulation toggles and demo buttons from customer views.
   - Status transitions reflect authentic order lifecycle states.
3. **Bir Electronic Receipt Compliance**:
   - The invoice modal computes the official 12% Philippine VAT breakdown (*Vatable Sales* + *12% VAT* = *Total Amount*), including Registered TIN, business address, and unique digital receipt hash.

---

## 7. Capstone Defense: Evaluator Questions & Answers

### Q1: *"Why did you integrate J&T Express instead of creating a private delivery fleet?"*
> **Answer:** *"In the Philippine retail and apparel industry, building an in-house fleet for custom goods is operationally unviable. Over 90% of local e-commerce stores partner with 3rd-Party Logistics (3PL) providers like J&T Express for nationwide coverage. Our system automates the digital-to-physical handshake: we generate the official J&T thermal Air Waybill (AWB) sticker in-house, assign the tracking number, and track milestones directly inside the web app just like Shopee."*

### Q2: *"How does the customer track the order without leaving your website?"*
> **Answer:** *"Just like Shopee or Lazada, Stitch-Opt utilizes an In-App Logistics Stepper. When an order transitions from our Lucena studio to J&T Express, the tracking card renders a chronological timeline showing sorting center arrivals, delivery hub handovers, and courier dispatch with exact Philippine timestamps and tracking codes."*

### Q3: *"How does the store print the shipping waybill stickers?"*
> **Answer:** *"Our system features a built-in Thermal Waybill Generator formatted to standard 4x6 inch (100mm x 150mm) adhesive sticker rolls. With one click, staff can print directly to standard thermal label printers (such as Xprinter or Phomemo) with SVG Code 128 barcodes, sender details, recipient information, and parcel verification QR codes."*

---
*Documentation maintained by Stitch-Opt Engineering Team. Capstone 2026.*
