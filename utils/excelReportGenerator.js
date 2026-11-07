const ExcelJS = require('exceljs');

/**
 * Generates a print-ready Microsoft Excel (.xlsx) workbook for Order History & Financial Statistics.
 * Supports 1 Day ('1day'), 1 Week ('week'), and 1 Month ('month') reporting windows.
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
    // Compute Philippine Time (UTC+8) window boundaries for accurate local reporting
    const phtOffsetMs = 8 * 60 * 60 * 1000;
    const phtNow = new Date(now.getTime() + phtOffsetMs);
    const phtYear = phtNow.getUTCFullYear();
    const phtMonth = phtNow.getUTCMonth();
    const phtDay = phtNow.getUTCDate();
    const startOfTodayUtc = new Date(Date.UTC(phtYear, phtMonth, phtDay, 0, 0, 0) - phtOffsetMs);
    const startDate = new Date(startOfTodayUtc.getTime() - (periodDays - 1) * 24 * 60 * 60 * 1000);

    const businessName = settings?.businessName || 'Edz Towels & Caps';
    const businessAddress = settings?.businessAddress || 'Ground Floor, Pacific Mall Lucena City';
    const businessContact = settings?.businessContact || '';
    const dailyRent = (settings && settings.dailyRent != null)
        ? Number(settings.dailyRent)
        : (process.env.DAILY_RENT ? parseFloat(process.env.DAILY_RENT) : 1500.00);

    // Build Raw Material Cost Lookup Maps (by ID and by normalized name)
    const invCostById = {};
    const invCostByName = {};
    (inventory || []).forEach(inv => {
        const unitCost = Number(inv.supplierUnitCost) || 0;
        if (inv.id && unitCost > 0) {
            invCostById[inv.id] = unitCost;
        }
        if (inv.item && unitCost > 0) {
            invCostByName[String(inv.item).toLowerCase().trim()] = unitCost;
        }
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

        // 1. Check variant-linked raw material cost
        if (prod && Array.isArray(prod.variants) && item.selectedVariant) {
            const matchedVar = prod.variants.find(v =>
                v && v.name && String(v.name).trim().toLowerCase() === String(item.selectedVariant).trim().toLowerCase()
            );
            if (matchedVar?.materialId && invCostById[matchedVar.materialId]) {
                return invCostById[matchedVar.materialId] * qty;
            }
        }

        // 2. Check product BOM recipe cost
        if (prod && Array.isArray(prod.recipe) && prod.recipe.length > 0) {
            let unitRecipeCost = 0;
            for (const r of prod.recipe) {
                const matId = r.inventoryId || r.materialId;
                if (matId && invCostById[matId]) {
                    unitRecipeCost += invCostById[matId] * (Number(r.quantityRequired || r.quantity) || 1);
                }
            }
            if (unitRecipeCost > 0) {
                return unitRecipeCost * qty;
            }
        }

        // 3. Fallback keyword match against Inventory supplierUnitCost
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

    // Enrich each order with financial details
    let totalOrdersCount = orders.length;
    let completedOrdersCount = 0;
    let canceledOrdersCount = 0;
    let activeOrPendingCount = 0;
    let totalPiecesProduced = 0;

    let grossBilledRevenue = 0;
    let canceledOrderValue = 0;
    let totalMoneySent = 0;
    let gcashMoneySent = 0;
    let gcashOrdersCount = 0;
    let cashMoneySent = 0;
    let cashOrdersCount = 0;
    let walletMoneySent = 0;
    let walletOrdersCount = 0;
    let totalOutstandingBalance = 0;
    let totalMaterialsCost = 0;

    const dailyBuckets = {};
    for (let d = 0; d < periodDays; d++) {
        const bucketUtc = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000 + phtOffsetMs);
        const dayKey = bucketUtc.toISOString().slice(0, 10);
        dailyBuckets[dayKey] = {
            dateKey: dayKey,
            ordersCount: 0,
            piecesCount: 0,
            billedRevenue: 0,
            moneySent: 0,
            materialsCost: 0,
            overhead: dailyRent
        };
    }

    const enrichedRows = orders.map(o => {
        const canceled = isOrderCanceled(o.status);
        const completed = isOrderCompleted(o.status);
        if (canceled) canceledOrdersCount++;
        else if (completed) completedOrdersCount++;
        else activeOrPendingCount++;

        const billed = Math.round((Number(o.totalAmount || o.amount) || 0) * 100) / 100;
        const pers = (o.personalization && typeof o.personalization === 'object') ? o.personalization : {};
        const ocr = (o.receipt?.ocrData && typeof o.receipt.ocrData === 'object') ? o.receipt.ocrData : {};
        const payStatus = String(o.paymentStatus || '').toLowerCase();
        const payMethod = String(o.paymentMethod || o.receipt?.paymentMethod || 'cash').toLowerCase();

        // Compute Money Sent (actual funds paid/sent by customer)
        let moneySent = 0;
        if (!canceled) {
            if (payStatus === 'paid' || completed) {
                const ocrExtracted = Number(ocr.extractedAmount) || 0;
                moneySent = ocrExtracted >= billed ? ocrExtracted : billed;
            } else if (Number(pers.accountCredit) > 0) {
                const topUp = pers.balanceTopUpPending ? 0 : (Number(pers.balanceTopUpAmount) || 0);
                moneySent = Math.round((Number(pers.accountCredit) + topUp) * 100) / 100;
            } else if (Number(ocr.extractedAmount) > 0 && o.receipt?.status !== 'Rejected') {
                moneySent = Math.round(Number(ocr.extractedAmount) * 100) / 100;
            }
        }

        const balanceDue = canceled ? 0 : Math.max(0, Math.round((billed - moneySent) * 100) / 100);

        const itemsArr = Array.isArray(o.items) ? o.items : [];
        let orderPieces = 0;
        let orderMaterialsCost = 0;
        const itemDescriptions = [];

        if (itemsArr.length > 0) {
            itemsArr.forEach(it => {
                const q = Math.max(1, Number(it.quantity) || 1);
                if (!canceled) {
                    orderPieces += q;
                    orderMaterialsCost += computeItemMaterialCost(it, o);
                }
                const variantStr = it.selectedVariant ? ` [${it.selectedVariant}]` : '';
                itemDescriptions.push(`${q}x ${it.name || 'Item'}${variantStr}`);
            });
        } else {
            if (!canceled) orderPieces += 1;
            itemDescriptions.push(o.design || 'Custom Embroidery');
        }
        orderMaterialsCost = Math.round(orderMaterialsCost * 100) / 100;

        if (canceled) {
            canceledOrderValue += billed;
        } else {
            grossBilledRevenue += billed;
            totalMoneySent += moneySent;
            totalOutstandingBalance += balanceDue;
            totalPiecesProduced += orderPieces;
            totalMaterialsCost += orderMaterialsCost;

            if (payMethod.includes('gcash') || payMethod.includes('qr') || payMethod.includes('online')) {
                gcashMoneySent += moneySent;
                gcashOrdersCount++;
            } else if (payMethod.includes('wallet')) {
                walletMoneySent += moneySent;
                walletOrdersCount++;
            } else {
                cashMoneySent += moneySent;
                cashOrdersCount++;
            }
        }

        const orderTimestamp = new Date(o.date || o.createdAt || now);
        const phtOrderDate = new Date(orderTimestamp.getTime() + phtOffsetMs);
        const dayKey = phtOrderDate.toISOString().slice(0, 10);
        if (!dailyBuckets[dayKey]) {
            dailyBuckets[dayKey] = {
                dateKey: dayKey,
                ordersCount: 0,
                piecesCount: 0,
                billedRevenue: 0,
                moneySent: 0,
                materialsCost: 0,
                overhead: dailyRent
            };
        }
        if (!canceled) {
            dailyBuckets[dayKey].ordersCount += 1;
            dailyBuckets[dayKey].piecesCount += orderPieces;
            dailyBuckets[dayKey].billedRevenue += billed;
            dailyBuckets[dayKey].moneySent += moneySent;
            dailyBuckets[dayKey].materialsCost += orderMaterialsCost;
        }

        const orderGrossProfit = canceled ? 0 : Math.round((moneySent - orderMaterialsCost) * 100) / 100;
        const orderMargin = (!canceled && moneySent > 0) ? (orderGrossProfit / moneySent) : 0;
        const refNo = o.receipt?.referenceId || pers.referenceNumber || '—';

        return {
            orderId: o.orderId || o.id,
            dateFormatted: orderTimestamp.toLocaleString('en-US', {
                timeZone: 'Asia/Manila',
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }),
            client: o.client || 'Walk-In Customer',
            itemsSummary: itemDescriptions.join('; '),
            pieces: orderPieces,
            status: o.status || 'Completed',
            paymentMethod: payMethod.toUpperCase(),
            paymentStatus: (o.paymentStatus || (completed ? 'paid' : 'unpaid')).toUpperCase(),
            referenceNo: refNo,
            billed,
            moneySent,
            balanceDue,
            materialsCost: orderMaterialsCost,
            grossProfit: orderGrossProfit,
            grossMargin: orderMargin,
            canceled
        };
    });

    // Aggregate Financial Calculations
    const validOrdersCount = Math.max(0, totalOrdersCount - canceledOrdersCount);
    const avgOrderValue = validOrdersCount > 0 ? (grossBilledRevenue / validOrdersCount) : 0;
    const collectionRate = grossBilledRevenue > 0 ? (totalMoneySent / grossBilledRevenue) : 0;

    const operatingOverhead = Math.round(dailyRent * periodDays * 100) / 100;
    const totalExpenses = Math.round((totalMaterialsCost + operatingOverhead) * 100) / 100;

    // Revenue & Profit Metrics (Cash Collected Basis & Billed Basis)
    const grossProfitCollected = Math.round((totalMoneySent - totalMaterialsCost) * 100) / 100;
    const netProfitCollected = Math.round((totalMoneySent - totalExpenses) * 100) / 100;
    const netProfitBilled = Math.round((grossBilledRevenue - totalExpenses) * 100) / 100;

    const grossMarginPct = totalMoneySent > 0 ? (grossProfitCollected / totalMoneySent) : 0;
    const netMarginPct = totalMoneySent > 0 ? (netProfitCollected / totalMoneySent) : 0;

    // ROI = (Net Profit / Total Investment [Materials + Overhead])
    const roiCollected = totalExpenses > 0 ? (netProfitCollected / totalExpenses) : 0;
    const roiBilled = totalExpenses > 0 ? (netProfitBilled / totalExpenses) : 0;

    // Build Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = businessName;
    workbook.created = now;
    workbook.modified = now;

    const currencyFmt = '"₱"#,##0.00;-"₱"#,##0.00;"₱"0.00';
    const percentFmt = '0.00%';

    // =========================================================================
    // SHEET 1: EXECUTIVE FINANCIAL SUMMARY (Print-Ready)
    // =========================================================================
    const summarySheet = workbook.addWorksheet('Financial Summary', {
        pageSetup: {
            paperSize: 9, // A4
            orientation: 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 1,
            showGridLines: true,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
        }
    });

    summarySheet.columns = [
        { key: 'metric', width: 42 },
        { key: 'value', width: 24 },
        { key: 'notes', width: 44 }
    ];

    // Title Banner
    summarySheet.mergeCells('A1:C1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = `${businessName.toUpperCase()} — ORDER HISTORY & FINANCIAL REPORT`;
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1E1E' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 28;

    const formatPhtDate = (dt) => dt.toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });

    summarySheet.mergeCells('A2:C2');
    const subCell = summarySheet.getCell('A2');
    subCell.value = `Reporting Period: ${periodTitle} (${formatPhtDate(startDate)} – ${formatPhtDate(now)}) | ${businessAddress}${businessContact ? ' • ' + businessContact : ''}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(2).height = 20;

    summarySheet.addRow([]);

    const addSectionHeader = (sheet, title) => {
        const row = sheet.addRow([title, 'AMOUNT / STATISTIC', 'ACCOUNTING FORMULA / NOTES']);
        row.height = 22;
        row.eachCell((cell, colNumber) => {
            cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'right' : 'left' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });
    };

    const addStatRow = (sheet, label, val, fmt, note, highlight = false, valueColor = null) => {
        const row = sheet.addRow([label, val, note]);
        row.height = 20;
        const valCell = row.getCell(2);
        if (fmt) valCell.numFmt = fmt;
        row.eachCell((cell, colNumber) => {
            cell.font = {
                name: 'Calibri',
                size: 10.5,
                bold: highlight || colNumber === 2,
                color: { argb: (colNumber === 2 && valueColor) ? valueColor : 'FF0F172A' }
            };
            if (highlight) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            }
            cell.alignment = {
                vertical: 'middle',
                horizontal: colNumber === 2 ? 'right' : 'left'
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
        });
    };

    // Section 1: Revenue & Money Sent
    addSectionHeader(summarySheet, '1. REVENUE & MONEY SENT (COLLECTIONS)');
    addStatRow(summarySheet, 'Gross Billed Revenue (Valid Orders)', grossBilledRevenue, currencyFmt, 'Total billed amount across non-canceled orders', true);
    addStatRow(summarySheet, 'Total Money Sent / Collected (Cash + GCash + Wallet)', totalMoneySent, currencyFmt, 'Actual verified customer payments received', true, 'FF15803D');
    addStatRow(summarySheet, '  • GCash Money Sent', gcashMoneySent, currencyFmt, `${gcashOrdersCount} GCash order(s)`);
    addStatRow(summarySheet, '  • Cash Received at Counter', cashMoneySent, currencyFmt, `${cashOrdersCount} Cash order(s)`);
    addStatRow(summarySheet, '  • Store Wallet / Account Credit Applied', walletMoneySent, currencyFmt, `${walletOrdersCount} Wallet order(s)`);
    addStatRow(summarySheet, 'Outstanding / Uncollected Balance', totalOutstandingBalance, currencyFmt, 'Remaining balance yet to be paid by customers', false, totalOutstandingBalance > 0 ? 'FFB45309' : null);
    addStatRow(summarySheet, 'Payment Collection Rate (%)', collectionRate, percentFmt, 'Money Sent ÷ Gross Billed Revenue');
    addStatRow(summarySheet, 'Canceled Orders Value (Excluded)', canceledOrderValue, currencyFmt, `${canceledOrdersCount} canceled order(s) excluded from revenue`);

    summarySheet.addRow([]);

    // Section 2: Overhead, COGS & Profitability
    addSectionHeader(summarySheet, '2. OVERHEAD, COSTS, PROFIT & ROI');
    addStatRow(summarySheet, 'Raw Materials Cost (COGS)', totalMaterialsCost, currencyFmt, 'Garment & thread unit costs consumed (BYOG = ₱0)');
    addStatRow(summarySheet, 'Gross Profit (Collected Revenue - COGS)', grossProfitCollected, currencyFmt, 'Money Sent minus Raw Materials Cost', true);
    addStatRow(summarySheet, 'Gross Profit Margin (%)', grossMarginPct, percentFmt, 'Gross Profit ÷ Money Sent');
    addStatRow(summarySheet, 'Daily Shop Overhead Rate (Rent & Utilities)', dailyRent, currencyFmt, 'Configured daily stall overhead in System Settings');
    addStatRow(summarySheet, `Total Operating Overhead (${periodDays} Day${periodDays > 1 ? 's' : ''})`, operatingOverhead, currencyFmt, `₱${dailyRent.toFixed(2)}/day × ${periodDays} day(s)`, true);
    addStatRow(summarySheet, 'Total Operating Expenses (COGS + Overhead)', totalExpenses, currencyFmt, 'Raw Materials Cost + Total Operating Overhead', true, 'FFB91C1C');
    addStatRow(
        summarySheet,
        'NET PROFIT (Collected Cash Basis)',
        netProfitCollected,
        currencyFmt,
        'Total Money Sent minus Total Operating Expenses',
        true,
        netProfitCollected >= 0 ? 'FF15803D' : 'FFB91C1C'
    );
    addStatRow(
        summarySheet,
        'Net Profit (Accrual / Billed Basis)',
        netProfitBilled,
        currencyFmt,
        'Gross Billed Revenue minus Total Operating Expenses',
        false,
        netProfitBilled >= 0 ? 'FF15803D' : 'FFB91C1C'
    );
    addStatRow(summarySheet, 'Net Profit Margin (%)', netMarginPct, percentFmt, 'Net Profit (Collected) ÷ Money Sent');
    addStatRow(
        summarySheet,
        'RETURN ON INVESTMENT — ROI (Collected Basis)',
        roiCollected,
        percentFmt,
        '(Net Profit ÷ Total Operating Expenses) × 100%',
        true,
        roiCollected >= 0 ? 'FF15803D' : 'FFB91C1C'
    );
    addStatRow(
        summarySheet,
        'Return on Investment — ROI (Billed Basis)',
        roiBilled,
        percentFmt,
        '(Billed Net Profit ÷ Total Operating Expenses) × 100%'
    );

    summarySheet.addRow([]);

    // Section 3: Order Volume & Production Statistics
    addSectionHeader(summarySheet, '3. ORDER VOLUME & PRODUCTION METRICS');
    addStatRow(summarySheet, 'Total Orders Recorded', totalOrdersCount, '#,##0', 'All orders within selected timeframe');
    addStatRow(summarySheet, 'Completed / Delivered Orders', completedOrdersCount, '#,##0', 'Fulfilled and claimed orders');
    addStatRow(summarySheet, 'Active / In-Queue Orders', activeOrPendingCount, '#,##0', 'Orders currently in workshop or awaiting balance');
    addStatRow(summarySheet, 'Canceled Orders', canceledOrdersCount, '#,##0', 'Voided or canceled tickets');
    addStatRow(summarySheet, 'Total Garments / Pieces Produced', totalPiecesProduced, '#,##0', 'Total non-canceled pieces embroidered/packaged');
    addStatRow(summarySheet, 'Average Order Value (AOV)', avgOrderValue, currencyFmt, 'Gross Billed Revenue ÷ Valid Non-Canceled Orders');

    // =========================================================================
    // SHEET 2: ORDER HISTORY LEDGER (Landscape Print-Ready)
    // =========================================================================
    const ledgerSheet = workbook.addWorksheet('Order History Ledger', {
        views: [{ state: 'frozen', ySplit: 3 }],
        pageSetup: {
            paperSize: 9, // A4
            orientation: 'landscape',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            showGridLines: true,
            printTitlesRow: '1:3',
            margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
        }
    });

    ledgerSheet.columns = [
        { key: 'orderId', width: 15 },
        { key: 'dateFormatted', width: 21 },
        { key: 'client', width: 20 },
        { key: 'itemsSummary', width: 36 },
        { key: 'pieces', width: 9 },
        { key: 'status', width: 18 },
        { key: 'paymentMethod', width: 12 },
        { key: 'paymentStatus', width: 12 },
        { key: 'referenceNo', width: 17 },
        { key: 'billed', width: 15 },
        { key: 'moneySent', width: 15 },
        { key: 'balanceDue', width: 15 },
        { key: 'materialsCost', width: 15 },
        { key: 'grossProfit', width: 15 },
        { key: 'grossMargin', width: 13 }
    ];

    ledgerSheet.mergeCells('A1:O1');
    const lTitle = ledgerSheet.getCell('A1');
    lTitle.value = `${businessName.toUpperCase()} — DETAILED ORDER HISTORY LEDGER (${periodTitle.toUpperCase()})`;
    lTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    lTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1E1E' } };
    lTitle.alignment = { vertical: 'middle', horizontal: 'center' };
    ledgerSheet.getRow(1).height = 26;

    ledgerSheet.mergeCells('A2:O2');
    const lSub = ledgerSheet.getCell('A2');
    lSub.value = `Generated: ${now.toLocaleString('en-US', { timeZone: 'Asia/Manila' })} PHT | Valid Orders: ${validOrdersCount} | Money Sent: ₱${totalMoneySent.toFixed(2)} | Overhead: ₱${operatingOverhead.toFixed(2)} | Net Profit: ₱${netProfitCollected.toFixed(2)} | ROI: ${(roiCollected * 100).toFixed(2)}%`;
    lSub.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
    lSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    lSub.alignment = { vertical: 'middle', horizontal: 'center' };
    ledgerSheet.getRow(2).height = 19;

    const headerRow = ledgerSheet.addRow([
        'Order ID',
        'Date & Time (PHT)',
        'Client / Customer',
        'Items & Variants',
        'Qty',
        'Order Status',
        'Method',
        'Pay Status',
        'GCash Ref No.',
        'Billed Total',
        'Money Sent',
        'Balance Due',
        'Materials Cost',
        'Order Profit',
        'Margin %'
    ]);
    headerRow.height = 22;
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = {
            vertical: 'middle',
            horizontal: colNumber >= 10 || colNumber === 5 ? 'right' : 'left',
            wrapText: true
        };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF94A3B8' } },
            bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
            left: { style: 'thin', color: { argb: 'FF94A3B8' } },
            right: { style: 'thin', color: { argb: 'FF94A3B8' } }
        };
    });

    if (enrichedRows.length === 0) {
        const emptyRow = ledgerSheet.addRow(['No orders recorded in this selected period.']);
        ledgerSheet.mergeCells(`A${emptyRow.number}:O${emptyRow.number}`);
        emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        emptyRow.height = 24;
    } else {
        enrichedRows.forEach((r, idx) => {
            const row = ledgerSheet.addRow([
                r.orderId,
                r.dateFormatted,
                r.client,
                r.itemsSummary,
                r.pieces,
                r.status,
                r.paymentMethod,
                r.paymentStatus,
                r.referenceNo,
                r.billed,
                r.moneySent,
                r.balanceDue,
                r.materialsCost,
                r.grossProfit,
                r.grossMargin
            ]);
            row.height = 20;
            [10, 11, 12, 13, 14].forEach(c => { row.getCell(c).numFmt = currencyFmt; });
            row.getCell(15).numFmt = percentFmt;

            const zebraBg = r.canceled ? 'FFFEF2F2' : (idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF');
            row.eachCell((cell, colNumber) => {
                cell.font = {
                    name: 'Calibri',
                    size: 9.5,
                    color: { argb: r.canceled ? 'FF991B1B' : 'FF0F172A' },
                    strike: r.canceled && colNumber >= 10
                };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } };
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: (colNumber >= 10 || colNumber === 5) ? 'right' : 'left'
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            });
        });

        // Ledger Totals Row
        const totalsRow = ledgerSheet.addRow([
            'TOTALS (VALID)',
            `${validOrdersCount} valid order(s)`,
            '',
            '',
            totalPiecesProduced,
            '',
            '',
            '',
            '',
            grossBilledRevenue,
            totalMoneySent,
            totalOutstandingBalance,
            totalMaterialsCost,
            grossProfitCollected,
            grossMarginPct
        ]);
        totalsRow.height = 23;
        [10, 11, 12, 13, 14].forEach(c => { totalsRow.getCell(c).numFmt = currencyFmt; });
        totalsRow.getCell(15).numFmt = percentFmt;
        totalsRow.eachCell((cell, colNumber) => {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
            cell.alignment = {
                vertical: 'middle',
                horizontal: (colNumber >= 10 || colNumber === 5) ? 'right' : 'left'
            };
            cell.border = {
                top: { style: 'medium', color: { argb: 'FF475569' } },
                bottom: { style: 'double', color: { argb: 'FF475569' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });
    }

    // =========================================================================
    // SHEET 3: DAILY FINANCIAL BREAKDOWN (Print-Ready)
    // =========================================================================
    const dailySheet = workbook.addWorksheet('Daily Breakdown', {
        views: [{ state: 'frozen', ySplit: 2 }],
        pageSetup: {
            paperSize: 9,
            orientation: 'landscape',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            showGridLines: true,
            printTitlesRow: '1:2',
            margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
        }
    });

    dailySheet.columns = [
        { key: 'date', width: 16 },
        { key: 'orders', width: 12 },
        { key: 'pieces', width: 12 },
        { key: 'billed', width: 18 },
        { key: 'sent', width: 18 },
        { key: 'materials', width: 18 },
        { key: 'overhead', width: 18 },
        { key: 'netProfit', width: 18 },
        { key: 'roi', width: 14 }
    ];

    dailySheet.mergeCells('A1:I1');
    const dTitle = dailySheet.getCell('A1');
    dTitle.value = `${businessName.toUpperCase()} — DAILY REVENUE, OVERHEAD, NET PROFIT & ROI (${periodTitle.toUpperCase()})`;
    dTitle.font = { name: 'Calibri', size: 12.5, bold: true, color: { argb: 'FFFFFFFF' } };
    dTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1E1E' } };
    dTitle.alignment = { vertical: 'middle', horizontal: 'center' };
    dailySheet.getRow(1).height = 25;

    const dHeader = dailySheet.addRow([
        'Date (PHT)',
        'Orders',
        'Pieces',
        'Billed Revenue',
        'Money Sent',
        'Materials Cost',
        'Daily Overhead',
        'Daily Net Profit',
        'Daily ROI %'
    ]);
    dHeader.height = 22;
    dHeader.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'right' };
    });

    const sortedDays = Object.values(dailyBuckets).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    sortedDays.forEach((b, idx) => {
        const dayExpenses = b.materialsCost + b.overhead;
        const dayNetProfit = b.moneySent - dayExpenses;
        const dayRoi = dayExpenses > 0 ? (dayNetProfit / dayExpenses) : 0;

        const row = dailySheet.addRow([
            b.dateKey,
            b.ordersCount,
            b.piecesCount,
            b.billedRevenue,
            b.moneySent,
            b.materialsCost,
            b.overhead,
            dayNetProfit,
            dayRoi
        ]);
        row.height = 19;
        [4, 5, 6, 7, 8].forEach(c => { row.getCell(c).numFmt = currencyFmt; });
        row.getCell(9).numFmt = percentFmt;

        const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
        row.eachCell((cell, colNumber) => {
            cell.font = {
                name: 'Calibri',
                size: 9.5,
                bold: colNumber === 8,
                color: {
                    argb: colNumber === 8
                        ? (dayNetProfit >= 0 ? 'FF15803D' : 'FFB91C1C')
                        : 'FF0F172A'
                }
            };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'right' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
        });
    });

    const dTotal = dailySheet.addRow([
        `TOTAL (${periodDays}d)`,
        validOrdersCount,
        totalPiecesProduced,
        grossBilledRevenue,
        totalMoneySent,
        totalMaterialsCost,
        operatingOverhead,
        netProfitCollected,
        roiCollected
    ]);
    dTotal.height = 23;
    [4, 5, 6, 7, 8].forEach(c => { dTotal.getCell(c).numFmt = currencyFmt; });
    dTotal.getCell(9).numFmt = percentFmt;
    dTotal.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'right' };
        cell.border = {
            top: { style: 'medium', color: { argb: 'FF475569' } },
            bottom: { style: 'double', color: { argb: 'FF475569' } }
        };
    });

    const dateStamp = new Date(now.getTime() + phtOffsetMs).toISOString().slice(0, 10);
    const filename = `ORDER_HISTORY_FINANCIAL_${fileSlug}_${dateStamp}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();

    return {
        buffer: Buffer.from(buffer),
        filename,
        startDate,
        endDate: now
    };
}

module.exports = { generateOrderHistoryExcelWorkbook };
