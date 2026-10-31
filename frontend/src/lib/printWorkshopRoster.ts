/**
 * Printable Artisan Workshop Production Sheet
 * Formats a clean, high-contrast production roster with checkboxes,
 * garment specifications, thread color, and QC signoff for commercial embroidery machines.
 */

export interface WorkshopRosterData {
  orderId: string;
  client: string;
  itemName: string;
  threadColor: string;
  variantText?: string;
  namesList: string[];
}

export function printWorkshopRoster(data: WorkshopRosterData): void {
  if (typeof window === 'undefined' || !data) return;

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
        <title>Embroidery Production Sheet - ${data.orderId}</title>
        <style>
          @page {
            size: auto;
            margin: 10mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
            color: #111;
            background: #fff;
            padding: 8px;
            font-size: 12px;
          }
          .header {
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .title {
            font-size: 16px;
            font-weight: 900;
            letter-spacing: 0.5px;
          }
          .subtitle {
            font-size: 11px;
            color: #555;
            margin-top: 2px;
          }
          .badge {
            background: #000;
            color: #fff;
            padding: 3px 8px;
            font-size: 10px;
            font-weight: 800;
            border-radius: 4px;
            letter-spacing: 0.5px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px 12px;
            font-size: 11.5px;
            margin-bottom: 12px;
            background: #f4f4f5;
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #e4e4e7;
          }
          .meta-item {
            display: flex;
            gap: 6px;
          }
          .meta-label {
            font-weight: 700;
            color: #52525b;
          }
          .meta-val {
            font-weight: 800;
            color: #000;
          }
          .roster-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            font-size: 12px;
          }
          .roster-table th {
            background: #18181b;
            color: #fff;
            text-align: left;
            padding: 6px 8px;
            font-size: 10.5px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .roster-table td {
            border-bottom: 1px solid #e4e4e7;
            padding: 6px 8px;
          }
          .roster-table tr:nth-child(even) {
            background: #fafafa;
          }
          .chk-box {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 1.5px solid #000;
            border-radius: 2px;
            vertical-align: middle;
            margin-right: 6px;
          }
          .footer {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px dashed #71717a;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
          }
          .sig-line {
            border-top: 1px solid #000;
            width: 170px;
            margin-top: 24px;
            text-align: center;
            padding-top: 4px;
            font-size: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">EDS TOWELS &amp; CAPS • ARTISAN PRODUCTION ROSTER</div>
            <div class="subtitle">Commercial Embroidery Workstation • Pacific Mall Lucena</div>
          </div>
          <div class="badge">BATCH CHECKLIST</div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Order Ref:</span> <span class="meta-val">#${data.orderId}</span></div>
          <div class="meta-item"><span class="meta-label">Customer:</span> <span class="meta-val">${data.client}</span></div>
          <div class="meta-item"><span class="meta-label">Garment:</span> <span class="meta-val">${data.itemName}${data.variantText ? ` (${data.variantText})` : ''}</span></div>
          <div class="meta-item"><span class="meta-label">Thread Color:</span> <span class="meta-val">${data.threadColor}</span></div>
          <div class="meta-item"><span class="meta-label">Total Pieces:</span> <span class="meta-val">${data.namesList.length} Units</span></div>
          <div class="meta-item"><span class="meta-label">Date &amp; Time:</span> <span class="meta-val">${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
        </div>

        <table class="roster-table">
          <thead>
            <tr>
              <th style="width: 35px;">#</th>
              <th style="width: 55px; text-align: center;">Done</th>
              <th>Name to Embroider</th>
              <th style="width: 80px;">Length</th>
              <th style="width: 120px;">QC / Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.namesList.map((name, i) => `
              <tr>
                <td><strong>${i + 1}</strong></td>
                <td style="text-align: center;"><span class="chk-box"></span></td>
                <td style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; font-family: monospace;">${name}</td>
                <td style="font-size: 11px; color: #555;">${name.length} chars</td>
                <td></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>
            <div style="font-weight: 700;">Artisan Quality Checklist:</div>
            <div style="font-size: 9.5px; color: #555; margin-top: 2px;">• Check spelling before hooping • Verify thread tension • Inspect back stabilizer</div>
          </div>
          <div>
            <div class="sig-line">Artisan Sign-Off / Operator</div>
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

