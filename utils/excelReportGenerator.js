const ExcelJS = require('exceljs');

/**
 * Generates a clean, easy-to-read, print-ready Microsoft Excel (.xlsx) report
 * combining a simple Financial Summary + Order History on a single worksheet.
 * Supports 1 Day ('1day'), 1 Week ('week'), and 1 Month ('month').
 */
async function generateOrderHistoryExcelWorkbook({
    period = '1day',
    orders = [],
    products = [],
    inventory = [],
    settings = null
}) {
    const normalizedPeriod = String(period || '1day').toLowerCase();
    let periodDays = 1;
    let periodTitle = '1 Day (Today)';
    let fileSlug = '1_DAY';

    if (normalizedPeriod === 'week' || normalizedPeriod === '1week' || normalizedPeriod === '7days') {
        periodDays = 7;
        periodTitle = '1 Week (Last 7 Days)';
        fileSlug = '1_WEEK';
    } else if (normalizedPeriod === 'month' || normalizedPeriod === '1month' || normalizedPeriod === '30days') {
        periodDays = 30;
        periodTitle = '1 Month (Last 30 Days)';
        fileSlug = '1_MONTH';
    }

    const now = new Date();
    const phtOffsetMs = 8 * 60 * 60 * 1000;
    const phtNow = new Date(now.getTime() + phtOffsetMs);
    const startOfTodayUtc = new Date(Date.UTC(
        phtNow.getUTCFullYear(),
        phtNow.getUTCMonth(),
        phtNow.getUTCDate(),
        0, 0, 0
    ) - phtOffsetMs);
    const startDate = new Date(startOfTodayUtc.getTime() - (periodDays - 1) * 24 * 60 * 60 * 1000);

    const businessName = settings?.businessName || 'Edz Towels & Caps';
    const businessAddress = settings?.businessAddress || 'Ground Floor, Pacific Mall Lucena City';
    const dailyRent = (settings && settings.dailyRent != null)
        ? Number(settings.dailyRent)
        : (process.env.DAILY_RENT ? parseFloat(process.env.DAILY_RENT) : 1500.00);

    // Raw material unit cost lookup
    const invCostById = {};
    const invCostByName = {};
    (inventory || []).forEach(inv => {
        const unitCost = Number(inv.supplierUnitCost) || 0;
        if (inv.id && unitCost > 0) invCostById[inv.id] = unitCost;
        if (inv.item && unitCost > 0) invCostByName[String(inv.item).toLowerCase().trim()] = unitCost;
    });

    const productById = {};
    const productByName = {};
    (products || []).forEach(prod => {
        if (prod.id) productById[prod.id] = prod;
        if (prod.name) productByName[String(prod.name).toLowerCase().trim()] = prod;
    });

    const computeItemMaterialCost = (item, parentOrder) => {
        if (!item || item.isByog || parentOrder?.isByog) return 0;
        const qty = Math.max(1, Number(item.quantity) || 1);
        const prod = (item.productId && productById[item.productId]) ||
            (item.id && productById[item.id]) ||
            (item.name && productByName[String(item.name).toLowerCase().trim()]) ||
            null;

        if (prod && Array.isArray(prod.variants) && item.selectedVariant) {
            const matchedVar = prod.variants.find(v =>
                v && v.name && String(v.name).trim().toLowerCase() === String(item.selectedVariant).trim().toLowerCase()
            );
            if (matchedVar?.materialId && invCostById[matchedVar.materialId]) {
                return invCostById[matchedVar.materialId] * qty;
            }
        }

        if (prod && Array.isArray(prod.recipe) && prod.recipe.length > 0) {
            let unitRecipeCost = 0;
            for (const r of prod.recipe) {
                const matId = r.inventoryId || r.materialId;
                if (matId && invCostById[matId]) {
                    unitRecipeCost += invCostById[matId] * (Number(r.quantityRequired || r.quantity) || 1);
                }
            }
            if (unitRecipeCost > 0) return unitRecipeCost * qty;
        }

        const lowerName = String(item.name || '').toLowerCase().trim();
        if (lowerName) {
            for (const [invName, cost] of Object.entries(invCostByName)) {
                const firstWord = invName.replace(/[()]/g, '').split(/\s+/)[0];
                if (lowerName.includes(invName) || (firstWord && firstWord.length >= 3 && lowerName.includes(firstWord))) {
                    return cost * qty;
                }
            }
        }
        return 0;
    };

    const isOrderCanceled = (status) => /cancel/i.test(String(status || ''));
    const isOrderCompleted = (status) => /^(completed|order delivered|delivered)$/i.test(String(status || '').trim());

    // Filter out abandoned online checkouts that are still 'Awaiting Payment' with zero payment uploaded
    const relevantOrders = (orders || []).filter(o => {
        const st = String(o.status || '').trim().toLowerCase();
        const paySt = String(o.paymentStatus || '').trim().toLowerCase();
        const pers = (o.personalization && typeof o.personalization === 'object') ? o.personalization : {};
        const hasCredit = Number(pers.accountCredit) > 0;
        const hasValidReceipt = o.receipt && o.receipt.status !== 'Rejected' && Number(o.receipt?.ocrData?.extractedAmount) > 0;
        if (st === 'awaiting payment' && paySt !== 'paid' && !hasCredit && !hasValidReceipt) {
            return false;
        }
        return true;
    });

    let validOrdersCount = 0;
    let canceledOrdersCount = 0;
    let totalPieces = 0;
    let totalRevenue = 0;
    let totalMoneySent = 0;
    let gcashMoneySent = 0;
    let cashMoneySent = 0;
    let totalUnpaidBalance = 0;
    let totalMaterialsCost = 0;

    const orderRows = relevantOrders.map(o => {
        const canceled = isOrderCanceled(o.status);
        const completed = isOrderCompleted(o.status);
        const orderTotal = Math.round((Number(o.totalAmount || o.amount) || 0) * 100) / 100;
        const pers = (o.personalization && typeof o.personalization === 'object') ? o.personalization : {};
        const ocr = (o.receipt?.ocrData && typeof o.receipt.ocrData === 'object') ? o.receipt.ocrData : {};
        const payStatus = String(o.paymentStatus || '').toLowerCase();
        const rawMethod = String(o.paymentMethod || o.receipt?.paymentMethod || 'Cash').toLowerCase();

        let paymentLabel = 'Cash';
        if (rawMethod.includes('gcash') || rawMethod.includes('qr') || rawMethod.includes('online')) {
            paymentLabel = 'GCash';
        } else if (rawMethod.includes('maya')) {
            paymentLabel = 'Maya';
        } else if (rawMethod.includes('wallet')) {
            paymentLabel = 'Credit';
        }

        let moneySent = 0;
        if (!canceled) {
            if (payStatus === 'paid' || completed) {
                const ocrExtracted = Number(ocr.extractedAmount) || 0;
                moneySent = ocrExtracted >= orderTotal ? ocrExtracted : orderTotal;
            } else if (Number(pers.accountCredit) > 0) {
                const topUp = pers.balanceTopUpPending ? 0 : (Number(pers.balanceTopUpAmount) || 0);
                moneySent = Math.round((Number(pers.accountCredit) + topUp) * 100) / 100;
            } else if (Number(ocr.extractedAmount) > 0 && o.receipt?.status !== 'Rejected') {
                moneySent = Math.round(Number(ocr.extractedAmount) * 100) / 100;
            }
        }

        const balanceLeft = canceled ? 0 : Math.max(0, Math.round((orderTotal - moneySent) * 100) / 100);

        const itemsArr = Array.isArray(o.items) ? o.items : [];
        let qty = 0;
        let orderMatCost = 0;
        const itemText = [];

        if (itemsArr.length > 0) {
            itemsArr.forEach(it => {
                const q = Math.max(1, Number(it.quantity) || 1);
                qty += q;
                if (!canceled) {
                    orderMatCost += computeItemMaterialCost(it, o);
                }
                const variantStr = it.selectedVariant ? ` (${it.selectedVariant})` : '';
                itemText.push(`${q}x ${it.name || 'Item'}${variantStr}`);
            });
        } else {
            qty = 1;
            itemText.push(o.design || 'Custom Embroidery');
        }

        if (canceled) {
            canceledOrdersCount += 1;
        } else {
            validOrdersCount += 1;
            totalPieces += qty;
            totalRevenue += orderTotal;
            totalMoneySent += moneySent;
            totalUnpaidBalance += balanceLeft;
            totalMaterialsCost += Math.round(orderMatCost * 100) / 100;

            if (paymentLabel === 'GCash' || paymentLabel === 'Maya') {
                gcashMoneySent += moneySent;
            } else {
                cashMoneySent += moneySent;
            }
        }

        const orderTimestamp = new Date(o.date || o.createdAt || now);
        return {
            orderId: o.orderId || o.id,
            dateFormatted: orderTimestamp.toLocaleString('en-US', {
                timeZone: 'Asia/Manila',
                month: 'short',
                day: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            client: o.client || 'Walk-In',
            itemsSummary: itemText.join(', '),
            qty: canceled ? 0 : qty,
            displayQty: qty,
            paymentLabel,
            status: o.status || 'Completed',
            orderTotal,
            moneySent,
            balanceLeft,
            canceled
        };
    });

    totalRevenue = Math.round(totalRevenue * 100) / 100;
    totalMoneySent = Math.round(totalMoneySent * 100) / 100;
    gcashMoneySent = Math.round(gcashMoneySent * 100) / 100;
    cashMoneySent = Math.round(cashMoneySent * 100) / 100;
    totalUnpaidBalance = Math.round(totalUnpaidBalance * 100) / 100;
    totalMaterialsCost = Math.round(totalMaterialsCost * 100) / 100;

    const totalOverhead = Math.round(dailyRent * periodDays * 100) / 100;
    const totalExpenses = Math.round((totalMaterialsCost + totalOverhead) * 100) / 100;
    const netProfit = Math.round((totalMoneySent - totalExpenses) * 100) / 100;
    const roi = totalExpenses > 0 ? (netProfit / totalExpenses) : 0;

    const currencyFmt = '"₱"#,##0.00;-"₱"#,##0.00;"₱"0.00';
    const percentFmt = '0.00%';

    const formatShortDate = (dt) => dt.toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: '2-digit',
        year: 'numeric'
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = businessName;
    workbook.created = now;
    workbook.modified = now;

    // Single, clean, print-ready worksheet containing Financial Summary + Order History
    const sheet = workbook.addWorksheet('Financial & Order Report', {
        pageSetup: {
            paperSize: 9, // A4
            orientation: 'landscape',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            showGridLines: true,
            margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
        }
    });

    sheet.columns = [
        { key: 'orderId', width: 15 },       // A
        { key: 'dateFormatted', width: 21 }, // B
        { key: 'client', width: 19 },        // C
        { key: 'itemsSummary', width: 34 },  // D
        { key: 'qty', width: 8 },            // E
        { key: 'payment', width: 12 },       // F
        { key: 'status', width: 18 },        // G
        { key: 'orderTotal', width: 15 },    // H
        { key: 'moneySent', width: 15 },     // I
        { key: 'balanceLeft', width: 14 }    // J
    ];

    // 1. Report Title Banner
    sheet.mergeCells('A1:J1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `${businessName.toUpperCase()} — FINANCIAL & ORDER HISTORY REPORT`;
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1E1E' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 28;

    sheet.mergeCells('A2:J2');
    const subCell = sheet.getCell('A2');
    subCell.value = `Period: ${periodTitle} (${formatShortDate(startDate)} – ${formatShortDate(now)})   •   ${businessAddress}`;
    subCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(2).height = 20;

    sheet.getRow(3).height = 8;

    // 2. Clean Two-Box Financial Summary (Rows 4 to 10)
    // Left Box (A-D): Sales & Money Sent | Right Box (F-J): Expenses, Profit & ROI
    sheet.mergeCells('A4:C4');
    sheet.getCell('A4').value = 'SALES & PAYMENTS';
    sheet.getCell('D4').value = 'AMOUNT';

    sheet.mergeCells('F4:H4');
    sheet.getCell('F4').value = 'EXPENSES, PROFIT & ROI';
    sheet.mergeCells('I4:J4');
    sheet.getCell('I4').value = 'AMOUNT';

    sheet.getRow(4).height = 22;
    ['A4', 'B4', 'C4', 'D4', 'F4', 'G4', 'H4', 'I4', 'J4'].forEach(addr => {
        const c = sheet.getCell(addr);
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        c.alignment = {
            vertical: 'middle',
            horizontal: (addr === 'D4' || addr === 'I4' || addr === 'J4') ? 'right' : 'left'
        };
    });

    const summaryPairs = [
        {
            leftLabel: 'Valid Orders',
            leftVal: `${validOrdersCount} orders (${totalPieces} pcs)`,
            leftFmt: null,
            leftBold: false,
            leftColor: 'FF0F172A',
            rightLabel: 'Materials Cost',
            rightVal: totalMaterialsCost,
            rightFmt: currencyFmt,
            rightBold: false,
            rightColor: 'FF0F172A'
        },
        {
            leftLabel: 'Total Revenue (Order Sales)',
            leftVal: totalRevenue,
            leftFmt: currencyFmt,
            leftBold: true,
            leftColor: 'FF0F172A',
            rightLabel: `Overhead (₱${dailyRent.toLocaleString()}/day × ${periodDays}d)`,
            rightVal: totalOverhead,
            rightFmt: currencyFmt,
            rightBold: false,
            rightColor: 'FF0F172A'
        },
        {
            leftLabel: 'Money Sent (Total Paid)',
            leftVal: totalMoneySent,
            leftFmt: currencyFmt,
            leftBold: true,
            leftColor: 'FF15803D',
            rightLabel: 'Total Expenses (Materials + Overhead)',
            rightVal: totalExpenses,
            rightFmt: currencyFmt,
            rightBold: true,
            rightColor: 'FFB91C1C'
        },
        {
            leftLabel: '   • GCash / Online',
            leftVal: gcashMoneySent,
            leftFmt: currencyFmt,
            leftBold: false,
            leftColor: 'FF334155',
            rightLabel: 'NET PROFIT (Money Sent − Expenses)',
            rightVal: netProfit,
            rightFmt: currencyFmt,
            rightBold: true,
            rightColor: netProfit >= 0 ? 'FF15803D' : 'FFB91C1C',
            rightHighlight: true
        },
        {
            leftLabel: '   • Cash',
            leftVal: cashMoneySent,
            leftFmt: currencyFmt,
            leftBold: false,
            leftColor: 'FF334155',
            rightLabel: 'ROI (Return on Investment)',
            rightVal: roi,
            rightFmt: percentFmt,
            rightBold: true,
            rightColor: roi >= 0 ? 'FF15803D' : 'FFB91C1C',
            rightHighlight: true
        },
        {
            leftLabel: 'Unpaid Balance',
            leftVal: totalUnpaidBalance,
            leftFmt: currencyFmt,
            leftBold: totalUnpaidBalance > 0,
            leftColor: totalUnpaidBalance > 0 ? 'FFB45309' : 'FF64748B',
            rightLabel: 'Canceled Orders (Excluded)',
            rightVal: `${canceledOrdersCount} order(s)`,
            rightFmt: null,
            rightBold: false,
            rightColor: 'FF64748B'
        }
    ];

    const thinBorder = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };

    summaryPairs.forEach((pair, idx) => {
        const rNum = 5 + idx;
        const row = sheet.getRow(rNum);
        row.height = 20;

        // Left side (A:C label, D value)
        sheet.mergeCells(`A${rNum}:C${rNum}`);
        const lLabel = sheet.getCell(`A${rNum}`);
        const lVal = sheet.getCell(`D${rNum}`);
        lLabel.value = pair.leftLabel;
        lVal.value = pair.leftVal;
        if (pair.leftFmt) lVal.numFmt = pair.leftFmt;

        ['A', 'B', 'C', 'D'].forEach(col => {
            const cell = sheet.getCell(`${col}${rNum}`);
            cell.font = {
                name: 'Calibri',
                size: 10,
                bold: col === 'D' ? true : pair.leftBold,
                color: { argb: col === 'D' ? pair.leftColor : 'FF0F172A' }
            };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: pair.leftBold ? 'FFF8FAFC' : 'FFFFFFFF' }
            };
            cell.alignment = { vertical: 'middle', horizontal: col === 'D' ? 'right' : 'left' };
            cell.border = thinBorder;
        });

        // Right side (F:H label, I:J value)
        sheet.mergeCells(`F${rNum}:H${rNum}`);
        sheet.mergeCells(`I${rNum}:J${rNum}`);
        const rLabel = sheet.getCell(`F${rNum}`);
        const rVal = sheet.getCell(`I${rNum}`);
        rLabel.value = pair.rightLabel;
        rVal.value = pair.rightVal;
        if (pair.rightFmt) rVal.numFmt = pair.rightFmt;

        ['F', 'G', 'H', 'I', 'J'].forEach(col => {
            const cell = sheet.getCell(`${col}${rNum}`);
            const isValCol = col === 'I' || col === 'J';
            cell.font = {
                name: 'Calibri',
                size: pair.rightHighlight ? 10.5 : 10,
                bold: isValCol ? true : pair.rightBold,
                color: { argb: isValCol ? pair.rightColor : 'FF0F172A' }
            };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: pair.rightHighlight ? 'FFF1F5F9' : 'FFFFFFFF' }
            };
            cell.alignment = { vertical: 'middle', horizontal: isValCol ? 'right' : 'left' };
            cell.border = thinBorder;
        });
    });

    sheet.getRow(11).height = 12;

    // 3. Order History Table (Row 12 onward)
    const tableHeaderRow = sheet.getRow(12);
    tableHeaderRow.values = [
        'Order ID',
        'Date & Time',
        'Customer',
        'Items Ordered',
        'Qty',
        'Payment',
        'Status',
        'Order Total',
        'Money Sent',
        'Balance'
    ];
    tableHeaderRow.height = 22;
    tableHeaderRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = {
            vertical: 'middle',
            horizontal: (colNumber >= 8 || colNumber === 5) ? 'right' : 'left'
        };
        cell.border = thinBorder;
    });

    if (orderRows.length === 0) {
        const emptyRow = sheet.addRow(['No orders recorded in this selected period.']);
        sheet.mergeCells(`A${emptyRow.number}:J${emptyRow.number}`);
        emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        emptyRow.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
        emptyRow.height = 24;
    } else {
        orderRows.forEach((r, idx) => {
            const row = sheet.addRow([
                r.orderId,
                r.dateFormatted,
                r.client,
                r.itemsSummary,
                r.displayQty,
                r.paymentLabel,
                r.status,
                r.orderTotal,
                r.moneySent,
                r.balanceLeft
            ]);
            row.height = 20;
            [8, 9, 10].forEach(c => { row.getCell(c).numFmt = currencyFmt; });

            const bg = r.canceled ? 'FFFEF2F2' : (idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF');
            row.eachCell((cell, colNumber) => {
                cell.font = {
                    name: 'Calibri',
                    size: 9.5,
                    color: { argb: r.canceled ? 'FF991B1B' : 'FF0F172A' },
                    strike: r.canceled && colNumber >= 8
                };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: (colNumber >= 8 || colNumber === 5) ? 'right' : 'left'
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            });
        });

        // Totals Row
        const totalRow = sheet.addRow([
            'TOTAL',
            `${validOrdersCount} valid order(s)`,
            '',
            '',
            totalPieces,
            '',
            '',
            totalRevenue,
            totalMoneySent,
            totalUnpaidBalance
        ]);
        totalRow.height = 23;
        [8, 9, 10].forEach(c => { totalRow.getCell(c).numFmt = currencyFmt; });
        totalRow.eachCell((cell, colNumber) => {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
            cell.alignment = {
                vertical: 'middle',
                horizontal: (colNumber >= 8 || colNumber === 5) ? 'right' : 'left'
            };
            cell.border = {
                top: { style: 'medium', color: { argb: 'FF475569' } },
                bottom: { style: 'double', color: { argb: 'FF475569' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });
    }

    const dateStamp = new Date(now.getTime() + phtOffsetMs).toISOString().slice(0, 10);
    const filename = `FINANCIAL_REPORT_${fileSlug}_${dateStamp}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();

    return {
        buffer: Buffer.from(buffer),
        filename,
        startDate,
        endDate: now
    };
}

module.exports = { generateOrderHistoryExcelWorkbook };
