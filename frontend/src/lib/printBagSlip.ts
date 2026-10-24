/**
 * 1-Click Printable Bag Slip Utility
 * Optimized for standard 80mm POS thermal printers & desktop printers.
 * Opens print preview immediately in a hidden background iframe without reloading the page.
 */

export function printBagSlip(order: any): void {
  if (typeof window === 'undefined' || !order) return;

  const orderId = order.orderId || order.id || 'N/A';
  const clientName =
    order.personalization?.claimantName ||
    order.client ||
    order.clientName ||
    order.customerName ||
    order.user?.username ||
    'Valued Customer';

  const orderDate = new Date(order.date || order.createdAt || Date.now());
  const formattedDate = isNaN(orderDate.getTime())
    ? new Date().toLocaleDateString('en-PH')
    : orderDate.toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

  // Extract items
  let itemsList: any[] = [];
  if (Array.isArray(order.items) && order.items.length > 0) {
    itemsList = order.items;
  } else if (typeof order.items === 'string') {
    try {
      itemsList = JSON.parse(order.items);
    } catch {
      itemsList = [];
    }
  } else if (order.design) {
    itemsList = [{ name: order.design, quantity: order.quantity || 1 }];
  }

  const persText =
    order.personalization?.text ||
    order.personalizationText ||
    order.monogramText ||
    '';
  const persColor =
    order.personalization?.color ||
    order.threadColor ||
    'Standard Gold';

  const claimCode = order.claimCode || order.verificationCode || orderId;

  // Create temporary invisible iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Bag Slip - ${orderId}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 3mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            background: #fff;
            color: #000;
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .slip-container {
            width: 76mm;
            max-width: 100%;
            padding: 8px 4px;
            font-size: 11px;
            line-height: 1.35;
            text-align: center;
          }
          .dashed-divider {
            border-bottom: 1.5px dashed #000;
            margin: 7px 0;
          }
          .shop-title {
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 0.5px;
          }
          .order-number {
            font-size: 26px;
            font-weight: 900;
            letter-spacing: 1px;
            margin: 4px 0;
          }
          .tag-badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 3px 8px;
            font-weight: 900;
            font-size: 11px;
            letter-spacing: 1px;
            margin: 3px 0;
          }
          .field-row {
            display: flex;
            justify-content: space-between;
            text-align: left;
            margin: 3px 0;
            font-size: 11px;
          }
          .field-label {
            color: #333;
            font-weight: 700;
          }
          .field-value {
            font-weight: 900;
            text-align: right;
          }
          .monogram-box {
            border: 2px solid #000;
            padding: 6px;
            margin: 6px 0;
            text-align: center;
            background: #f7f7f7;
          }
          .monogram-title {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .monogram-text {
            font-size: 18px;
            font-weight: 900;
            margin: 3px 0;
            font-style: italic;
          }
          .footer-note {
            font-size: 9px;
            margin-top: 6px;
            color: #222;
          }
        </style>
      </head>
      <body>
        <div class="slip-container">
          <div class="shop-title">EDS TOWELS & CAPS</div>
          <div style="font-size: 9.5px; margin-top: 1px;">PACIFIC MALL LUCENA • GROUND FLOOR</div>
          <div style="font-size: 8.5px; color: #444;">Tel: 0917 582 8192</div>

          <div class="dashed-divider"></div>

          <div>
            <div class="tag-badge">GARMENT BAG TAG</div>
          </div>

          <div class="order-number">#${orderId}</div>

          <div class="field-row">
            <span class="field-label">CUSTOMER:</span>
            <span class="field-value">${clientName}</span>
          </div>
          <div class="field-row">
            <span class="field-label">DATE/TIME:</span>
            <span class="field-value">${formattedDate}</span>
          </div>
          <div class="field-row">
            <span class="field-label">CLAIM CODE:</span>
            <span class="field-value">${claimCode}</span>
          </div>
          ${(() => {
            const staffName = order.processedBy || order.garmentsReceivedBy || order.personalization?.statusHistory?.[0]?.actor || '';
            return staffName ? `
          <div class="field-row">
            <span class="field-label">PROCESSED BY:</span>
            <span class="field-value">${staffName}</span>
          </div>` : '';
          })()}

          <div class="dashed-divider"></div>

          <!-- Stitched Customization Detail -->
          ${
            persText
              ? `
            <div class="monogram-box">
              <div class="monogram-title">STITCHED EMBROIDERY</div>
              <div class="monogram-text">"${persText}"</div>
              <div style="font-size: 10px; font-weight: bold;">Thread: ${persColor}</div>
            </div>
          `
              : `
            <div style="font-size: 11px; font-weight: bold; padding: 4px 0;">
              PLAIN RETAIL INVENTORY
            </div>
          `
          }

          <!-- Items list -->
          <div style="text-align: left; margin-top: 4px;">
            <div style="font-size: 10px; font-weight: 900; margin-bottom: 2px;">PACKAGE CONTENTS:</div>
            ${
              itemsList.length > 0
                ? itemsList
                    .map(
                      (item) => `
                <div style="font-size: 10.5px; padding: 1px 0;">
                  • ${item.quantity || 1}x ${item.name || 'Embroidered Item'}
                </div>
              `
                    )
                    .join('')
                : `<div style="font-size: 10.5px;">• 1x Embroidered Item</div>`
            }
          </div>

          <div class="dashed-divider"></div>

          <div class="footer-note">
            STAPLE OR TUCK ONTO FINISHED PACKAGE<br/>
            READY FOR COUNTER CLAIMING
          </div>
        </div>
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1500);
  }, 250);
}
