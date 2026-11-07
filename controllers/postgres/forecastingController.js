const prisma = require('../../utils/prisma');
const fetch = global.fetch || require('node-fetch');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');
const { logAiChange } = require('../../utils/aiLogger');
const { fetchGroqChatWithFallback } = require('../../utils/groqClient');

// Simple global in-memory cache for descriptive analytics summary
let biCache = null;
let cacheTime = null;
let lastForceRefresh = null;

async function getActiveSuggestionsInternal(force = false) {
    const now = new Date();

    if (force) {
        console.log('[Descriptive AI] Refresh triggered. Updating summary from live records.');
        lastForceRefresh = now;
        biCache = null;
    }

    // Cache hit (15 minutes duration)
    if (biCache && cacheTime && (now - cacheTime < 15 * 60 * 1000)) {
        return biCache;
    }

    // Query recorded database totals & current operational status (purely descriptive — no predictive regression)
    const [
        totalVisitsCount,
        validOrderAgg,
        inventory,
        products,
        activeQueueCount
    ] = await Promise.all([
        prisma.siteTraffic.count(),
        prisma.order.aggregate({
            where: { NOT: { status: { in: ['Order Canceled', 'Cancelled'] } } },
            _count: { id: true },
            _sum: { totalAmount: true }
        }),
        prisma.inventory.findMany(),
        prisma.product.findMany(),
        prisma.order.count({
            where: { status: { in: ['Pending Payment', 'Insufficient Payment', 'In Queue', 'Preparing Order'] } }
        })
    ]);

    const totalVisitsRecorded = Number(totalVisitsCount) || 0;
    const totalValidOrders = Number(validOrderAgg?._count?.id) || 0;
    const totalRecordedRevenue = Number(validOrderAgg?._sum?.totalAmount) || 0;
    const lowStockCount = inventory.filter(inv => inv.count <= (inv.minThreshold || 0)).length;

    // 1. Low Stock Inventory Alerts (Direct threshold check on current stock)
    const fallbackSuggestions = [];
    for (const inv of inventory) {
        if (inv.count <= inv.minThreshold) {
            const suggestAmount = Math.max(10, inv.minThreshold * 2 - inv.count);
            fallbackSuggestions.push({
                id: `SUG-INV-${inv.id}`,
                title: `Restock Item: ${inv.item}`,
                category: 'Inventory',
                severity: 'warning',
                description: `Stock for "${inv.item}" is low (${inv.count} ${inv.unit} remaining, safety limit: ${inv.minThreshold}).`,
                actionText: `Restock +${suggestAmount} Units`,
                action: {
                    type: 'restock',
                    payload: {
                        inventoryId: inv.id,
                        itemName: inv.item,
                        amount: suggestAmount
                    }
                }
            });
        }
    }

    // 5. Margin Protection Pricing (Strict Store Policy: Never give discounts; only adjust price if supplier raw material costs increase)
    const inventoryCostMap = {};
    inventory.forEach(inv => {
        const cost = Number(inv.supplierUnitCost) || 0;
        inventoryCostMap[inv.id] = cost;
        inventoryCostMap[inv.item.toLowerCase()] = cost;
    });

    products.forEach(p => {
        let totalUnitMaterialCost = 0;
        const lowerName = p.name.toLowerCase();
        const matchedInv = inventory.find(inv => {
            const itemLower = inv.item.toLowerCase();
            return lowerName.includes(itemLower) || itemLower.includes(lowerName);
        });
        if (matchedInv && Number(matchedInv.supplierUnitCost) > 0) {
            totalUnitMaterialCost = Number(matchedInv.supplierUnitCost);
        }

        // Only evaluate if supplier unit cost is recorded and positive
        if (totalUnitMaterialCost > 0 && p.price > 0) {
            const costRatio = totalUnitMaterialCost / p.price;

            // Critical: Supplier cost meets or exceeds selling price (zero or negative gross profit)
            if (totalUnitMaterialCost >= p.price) {
                const targetPrice = Math.ceil((totalUnitMaterialCost / 0.60) / 10) * 10;
                fallbackSuggestions.push({
                    id: `SUG-PRICE-SUPPLIER-CRIT-${p.id}`,
                    title: `Supplier Cost Squeeze: ${p.name}`,
                    category: 'Pricing',
                    severity: 'critical',
                    description: `Supplier raw material unit cost for "${p.name}" is ₱${totalUnitMaterialCost.toFixed(2)}, which meets or exceeds its current retail price of ₱${p.price.toFixed(2)}. Per business policy, price increases are only enacted when supplier costs rise. Recommend adjusting retail price to ₱${targetPrice.toFixed(2)} to restore standard margin.`,
                    actionText: `Update Price to ₱${targetPrice.toFixed(2)}`,
                    action: {
                        type: 'updatePrice',
                        payload: {
                            productId: p.id,
                            price: targetPrice
                        }
                    }
                });
            }
            // Warning: Supplier cost exceeds 65% of selling price (eroding gross margin below 35%)
            else if (costRatio > 0.65) {
                const targetPrice = Math.ceil((totalUnitMaterialCost / 0.60) / 10) * 10;
                fallbackSuggestions.push({
                    id: `SUG-PRICE-SUPPLIER-WARN-${p.id}`,
                    title: `Supplier Cost Margin Alert: ${p.name}`,
                    category: 'Pricing',
                    severity: 'warning',
                    description: `Supplier material cost for "${p.name}" is ₱${totalUnitMaterialCost.toFixed(2)} (${Math.round(costRatio * 100)}% of current retail price ₱${p.price.toFixed(2)}). Per business policy, price adjustments are reserved strictly for supplier cost increases. Recommend adjusting price to ₱${targetPrice.toFixed(2)} to maintain baseline profitability.`,
                    actionText: `Adjust Price to ₱${targetPrice.toFixed(2)}`,
                    action: {
                        type: 'updatePrice',
                        payload: {
                            productId: p.id,
                            price: targetPrice
                        }
                    }
                });
            }
        }
    });

    // backlog priority escalations
    const pendingBacklog = await prisma.order.findMany({
        where: {
            status: { in: ['Pending Payment', 'Preparing Order', 'In Queue'] },
            isRush: false
        },
        take: 5,
        orderBy: { createdAt: 'asc' }
    });

    pendingBacklog.forEach(order => {
        const ageInHours = (now - new Date(order.createdAt)) / (1000 * 60 * 60);
        if (ageInHours > 24) {
            fallbackSuggestions.push({
                id: `SUG-OPS-${order.id}`,
                title: `Escalate Order Prioritization: ${order.orderId}`,
                category: 'Operations',
                severity: 'warning',
                description: `Order "${order.orderId}" for client "${order.client || 'Valued Customer'}" has been pending for ${Math.round(ageInHours)} hours in status "${order.status}". Suggest escalating to priority rush to prevent customer satisfaction SLA breach.`,
                actionText: `Prioritize Order (Rush)`,
                action: {
                    type: 'prioritizeOrder',
                    payload: {
                        orderId: order.id,
                        orderTicketId: order.orderId,
                        isRush: true,
                        priorityScore: 20
                    }
                }
            });
        }
    });

    // 4. Optional Descriptive AI Summary (strictly descriptive over recorded facts — no forecasting or ML)
    let suggestions = [...fallbackSuggestions];
    const apiKey = process.env.GROQ_API_KEY;

    if (apiKey && fallbackSuggestions.length > 0) {
        try {
            let settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
            const GROQ_API_URL = settings?.aiProviderUrl || 'https://api.groq.com/openai/v1/chat/completions';
            const MODEL = settings?.aiChatModel || 'llama-3.3-70b-versatile';

            const systemPrompt = `You are a Descriptive AI operational summary assistant for ${settings?.businessName || 'Edz Towels & Caps'}.
Your role is STRICTLY DESCRIPTIVE: summarize only actual recorded database figures, current stock counts vs. safety limits, supplier unit costs vs. selling prices, and active orders waiting in queue.

Recorded store status:
- Recorded storefront visits: ${totalVisitsRecorded}
- Recorded valid orders: ${totalValidOrders}
- Recorded total sales: ₱${totalRecordedRevenue.toFixed(2)}
- Current low-stock items: ${lowStockCount}
- Active orders in queue: ${activeQueueCount}

Recorded operational alerts:
${JSON.stringify(fallbackSuggestions, null, 2)}

STRICT CONSTRAINTS:
1. DESCRIPTIVE ONLY: Never predict future demand, never claim machine learning, linear regression, velocity projections, or depletion forecasts. State only current facts and recorded counts.
2. ZERO DISCOUNTS: Never propose discounts, markdowns, coupons, or clearance sales.
3. SUPPLIER-COST PRICING ONLY: Only keep price updates that already exist in the alerts above due to recorded supplier raw material costs. Never invent new price changes.
4. Preserve the exact "id" and "action" object of each alert so action buttons work accurately.

Format your output as a raw JSON array of objects (no markdown code fences). Each object must contain:
- id: String (preserve exact ID)
- title: String (clear, plain-English descriptive title)
- category: "Inventory" | "Pricing" | "Operations"
- severity: "info" | "warning" | "critical"
- description: String (1-2 clear descriptive sentences citing exact current stock, supplier cost, or waiting hours)
- actionText: String (plain button label)
- action: Object (preserve exact action type & payload)

Return ONLY the valid JSON array.`;

            const data = await fetchGroqChatWithFallback(apiKey, GROQ_API_URL, MODEL, {
                messages: [{ role: 'user', content: systemPrompt }],
                temperature: 0.1,
                max_tokens: 1200
            });

            if (data?.choices?.[0]?.message?.content) {
                const contentText = data.choices[0].message.content.trim();
                const cleanJson = contentText.replace(/^```json/i, '').replace(/```$/i, '').trim();
                const parsed = JSON.parse(cleanJson);
                if (Array.isArray(parsed)) {
                    suggestions = parsed;
                }
            }
        } catch (err) {
            console.warn('[Descriptive AI] Using direct recorded alerts:', err.message);
        }
    }

    // Strict policy enforcement filter
    suggestions = suggestions.filter(s => {
        const text = `${s.title || ''} ${s.description || ''} ${s.actionText || ''}`.toLowerCase();
        if (text.includes('discount') || text.includes('markdown') || text.includes('clearance') || text.includes('sale price')) {
            return false;
        }
        if (text.includes('a/b test') || text.includes('price elasticity') || s.action?.type === 'startAbTest') {
            return false;
        }
        return true;
    });

    const metrics = {
        totalVisits: totalVisitsRecorded,
        totalOrders: totalValidOrders,
        totalRevenue: totalRecordedRevenue,
        avgOrderValue: totalValidOrders > 0 ? (totalRecordedRevenue / totalValidOrders) : 0,
        conversionRate: totalVisitsRecorded > 0 ? (totalValidOrders / totalVisitsRecorded) : 0,
        lowStockCount,
        activeQueueCount
    };

    // Filter out dismissed alerts
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await prisma.declinedRecommendation.deleteMany({
            where: { declinedAt: { lt: sevenDaysAgo } }
        });

        const declinedRecs = await prisma.declinedRecommendation.findMany({
            select: { sugId: true }
        });
        const declinedIds = new Set(declinedRecs.map(d => d.sugId));
        suggestions = suggestions.filter(s => !declinedIds.has(s.id));
    } catch (dbErr) {
        console.error('[Descriptive AI] Failed to fetch dismissed alerts:', dbErr.message);
    }

    biCache = { metrics, suggestions };
    cacheTime = now;

    return biCache;
}

exports.getActiveSuggestions = getActiveSuggestionsInternal;

exports.getSuggestions = async (req, res) => {
    try {
        const force = req.query.refresh === 'true';
        const biData = await getActiveSuggestionsInternal(force);
        res.json(biData);
    } catch (err) {
        console.error('getSuggestions Error:', err);
        res.status(500).json({ message: 'Error compiling descriptive store summary' });
    }
};

exports.executeSuggestionAction = async (req, res) => {
    try {
        const { actionType, payload } = req.body;
        const username = req.user?.username || 'Admin';

        if (!actionType || !payload) {
            return res.status(400).json({ message: 'Missing actionType or payload' });
        }

        let actionDetails = '';
        let entityId = '';
        let entity = '';

        if (actionType === 'restock') {
            const { inventoryId, amount, itemName } = payload;
            const existing = await prisma.inventory.findUnique({ where: { id: inventoryId } });
            if (!existing) {
                return res.status(404).json({ message: `Material ${itemName} not found` });
            }

            const updated = await prisma.inventory.update({
                where: { id: inventoryId },
                data: { count: existing.count + parseInt(amount) }
            });

            await prisma.inventoryLog.create({
                data: {
                    inventoryId: updated.id,
                    action: 'Add',
                    amount: parseInt(amount),
                    newTotal: updated.count,
                    userId: username
                }
            });

            entity = ENTITIES.INVENTORY;
            entityId = updated.id;
            actionDetails = `Restocked item "${updated.item}" (+${amount} units). New total: ${updated.count}`;
            logAiChange(username, 'Restock Item', actionDetails);

            biCache = null;
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.INVENTORY, await prisma.inventory.findMany());
        }
        else if (actionType === 'updatePrice') {
            const { productId, price } = payload;
            const updated = await prisma.product.update({
                where: { id: productId },
                data: { price: parseFloat(price) }
            });

            entity = ENTITIES.PRODUCT;
            entityId = updated.id;
            actionDetails = `Adjusted price for "${updated.name}" to ₱${price}`;
            logAiChange(username, 'Adjust Product Price', actionDetails);

            biCache = null;

            const { enrichProductsWithStock } = require('../../utils/inventoryManager');
            const productsList = await prisma.product.findMany();
            const enriched = await enrichProductsWithStock(productsList);
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.PRODUCT, enriched);
        }
        else if (actionType === 'prioritizeOrder') {
            const { orderId, isRush, priorityScore } = payload;
            const updated = await prisma.order.update({
                where: { id: orderId },
                data: {
                    isRush: isRush,
                    priorityScore: parseFloat(priorityScore)
                }
            });

            entity = ENTITIES.ORDER;
            entityId = updated.id;
            actionDetails = `Set order ${updated.orderId} to Rush priority (Score: ${priorityScore})`;
            logAiChange(username, 'Prioritize Order', actionDetails);

            biCache = null;
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.ORDER, updated);
        }
        else if (['acknowledge', 'monitorSupplierCost', 'initiateMarketing', 'reviewProcess'].includes(actionType)) {
            entity = ENTITIES.SYSTEM;
            entityId = payload?.productId || payload?.inventoryId || 'global';
            actionDetails = `Confirmed operational action: ${payload?.note || actionType}`;
            logAiChange(username, 'Confirm Operational Action', actionDetails);
            biCache = null;
        }
        else {
            return res.status(400).json({ message: `Unknown action type: ${actionType}` });
        }

        await prisma.globalAuditLog.create({
            data: {
                userId: req.user?.id || 'system',
                userRole: req.user?.role || 'admin',
                action: `BI_AUTO_${actionType.toUpperCase()}`,
                entity: entity,
                entityId: entityId,
                ipAddress: req.ip || '127.0.0.1',
                diff: payload
            }
        });

        res.json({ success: true, message: actionDetails });

    } catch (err) {
        console.error('executeSuggestionAction Error:', err);
        res.status(500).json({ message: `Failed to execute action: ${err.message}` });
    }
};

exports.declineSuggestionAction = async (req, res) => {
    try {
        const suggestionId = req.body?.suggestionId || req.body?.sugId;
        if (!suggestionId) {
            return res.status(400).json({ message: 'Missing suggestionId' });
        }

        await prisma.declinedRecommendation.upsert({
            where: { sugId: suggestionId },
            update: {},
            create: { sugId: suggestionId }
        });

        biCache = null;

        res.json({ success: true, message: `Alert ${suggestionId} dismissed.` });
    } catch (err) {
        console.error('declineSuggestionAction Error:', err);
        res.status(500).json({ message: `Failed to dismiss alert: ${err.message}` });
    }
};

exports.getPurchaseOrders = async (req, res) => {
    try {
        const pos = await prisma.purchaseOrder.findMany({
            include: { inventory: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(pos);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching purchase orders' });
    }
};

exports.approvePurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.purchaseOrder.update({
            where: { id },
            data: { status: 'Approved' }
        });

        // Add to global audit log
        await prisma.globalAuditLog.create({
            data: {
                userId: req.user?.id || 'system',
                userRole: req.user?.role || 'admin',
                action: 'APPROVE_PURCHASE_ORDER',
                entity: 'PurchaseOrder',
                entityId: updated.id,
                ipAddress: req.ip || '127.0.0.1',
                diff: { status: 'Approved' }
            }
        });

        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Error approving purchase order' });
    }
};

exports.createPurchaseOrder = async (req, res) => {
    try {
        const { inventoryId, quantity, estimatedCost, status } = req.body;
        if (!inventoryId || !quantity) {
            return res.status(400).json({ message: 'inventoryId and quantity are required' });
        }
        const po = await prisma.purchaseOrder.create({
            data: {
                inventoryId,
                quantity: parseInt(quantity),
                estimatedCost: estimatedCost ? parseFloat(estimatedCost) : null,
                status: status || 'Draft'
            },
            include: { inventory: true }
        });
        res.status(201).json(po);
    } catch (err) {
        console.error('createPurchaseOrder error:', err);
        res.status(500).json({ message: 'Error creating purchase order' });
    }
};

exports.updatePurchaseOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, deliveryReceipt, notes } = req.body;
        if (!status) return res.status(400).json({ message: 'Status is required' });

        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { inventory: true }
        });

        if (!po) return res.status(404).json({ message: 'Purchase Order not found' });

        let resultPo = po;
        if (status === 'Received' && po.status !== 'Received') {
            await prisma.$transaction(async (tx) => {
                resultPo = await tx.purchaseOrder.update({
                    where: { id },
                    data: { status: 'Received' },
                    include: { inventory: true }
                });

                // Replenish inventory stockpile automatically
                const updatedInv = await tx.inventory.update({
                    where: { id: po.inventoryId },
                    data: { count: { increment: po.quantity } }
                });

                // Create inventory log
                await tx.inventoryLog.create({
                    data: {
                        inventoryId: po.inventoryId,
                        action: 'Add',
                        amount: po.quantity,
                        newTotal: updatedInv.count,
                        userId: req.user?.username || 'admin'
                    }
                });

                // Write to global audit log
                await tx.globalAuditLog.create({
                    data: {
                        userId: req.user?.id || 'admin',
                        userRole: req.user?.role || 'admin',
                        action: 'SUPPLIER_PO_RECEIVED',
                        entity: 'PurchaseOrder',
                        entityId: id,
                        ipAddress: req.ip || '127.0.0.1',
                        diff: {
                            item: po.inventory.item,
                            quantityAdded: po.quantity,
                            newTotal: updatedInv.count,
                            deliveryReceipt: deliveryReceipt || 'N/A',
                            notes: notes || null
                        }
                    }
                });
            });

            // Real-time socket broadcast
            const io = req.app.get('io');
            if (io) {
                const refreshedInv = await prisma.inventory.findMany();
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.INVENTORY, refreshedInv);
            }
        } else {
            resultPo = await prisma.purchaseOrder.update({
                where: { id },
                data: { status },
                include: { inventory: true }
            });
        }

        res.json(resultPo);
    } catch (err) {
        console.error('updatePurchaseOrderStatus error:', err);
        res.status(500).json({ message: 'Error updating purchase order status' });
    }
};

exports.emailPurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { supplierEmail } = req.body;

        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { inventory: true }
        });
        if (!po) return res.status(404).json({ message: 'Purchase Order not found' });

        const targetEmail = supplierEmail || 'supplier@textilehub.ph';
        const poDate = new Date(po.createdAt).toISOString().split('T')[0];
        const poNumber = `PO-${poDate}`;

        console.log(`[Supplier PO Dispatch] Sending PO ${poNumber} to ${targetEmail}`);

        const updated = await prisma.purchaseOrder.update({
            where: { id },
            data: { status: 'Ordered' },
            include: { inventory: true }
        });

        res.json({
            success: true,
            message: `Purchase Order ${poNumber} dispatched to ${targetEmail}`,
            po: updated
        });
    } catch (err) {
        console.error('emailPurchaseOrder error:', err);
        res.status(500).json({ message: 'Error emailing purchase order' });
    }
};

exports.downloadPurchaseOrderPdf = async (req, res) => {
    try {
        const { id } = req.params;
        const PDFDocument = require('pdfkit');

        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { inventory: true }
        });
        if (!po) return res.status(404).send('Purchase Order not found');

        const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        const bizName = settings?.businessName || 'EDS TOWELS & CAPS';
        const poDate = new Date(po.createdAt).toISOString().split('T')[0];
        const poNumber = `PO-${poDate}`;

        const doc = new PDFDocument({ size: [320, 480], margin: 20 });
        const isInline = req.query.download !== 'true';
        const disposition = isInline ? 'inline' : 'attachment';

        res.setHeader('Content-disposition', `${disposition}; filename=${poNumber}.pdf`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        // Header
        doc.font('Helvetica-Bold').fontSize(14).text(bizName, { align: 'center' });
        doc.font('Helvetica').fontSize(8).text('Pacific Mall Lucena • Custom Embroidery Operations', { align: 'center' });
        doc.moveDown(0.4);
        doc.font('Courier').fontSize(8).text('--------------------------------------------', { align: 'center' });
        doc.moveDown(0.2);

        doc.font('Helvetica-Bold').fontSize(11).text('OFFICIAL PURCHASE ORDER', { align: 'center' });
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#4f46e5').text(poNumber, { align: 'center' }).fillColor('#000000');
        doc.font('Helvetica').fontSize(8).text(`Date: ${new Date(po.createdAt).toLocaleDateString()}`, { align: 'center' });
        doc.text(`Status: ${po.status.toUpperCase()}`, { align: 'center' });
        doc.moveDown(0.4);
        doc.font('Courier').fontSize(8).text('--------------------------------------------', { align: 'center' });
        doc.moveDown(0.4);

        // Item details
        doc.font('Helvetica-Bold').fontSize(9).text('ORDER SPECIFICATIONS:');
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(9).text(`Material: ${po.inventory.item}`);
        doc.text(`Quantity: ${po.quantity} ${po.inventory.unit}`);
        if (po.estimatedCost) {
            doc.text(`Est. Total: PHP ${po.estimatedCost.toFixed(2)}`);
        }
        doc.moveDown(0.8);

        // Delivery Instructions
        doc.font('Helvetica-Bold').fontSize(8).text('DELIVERY & FULFILLMENT:');
        doc.font('Helvetica').fontSize(8).text('Hub: Ground Floor, Pacific Mall Lucena City');
        doc.text('Attn: Production Head / Artisan');
        doc.text(`Contact: ${settings?.businessContact || '0928 810 3928'}`);
        doc.moveDown(0.6);
        doc.font('Helvetica-Oblique').fontSize(7).text('Please ensure spools are matched by uniform batch/dye lot code.');

        doc.moveDown(1.5);
        doc.font('Courier').fontSize(8).text('--------------------------------------------', { align: 'center' });
        doc.font('Helvetica').fontSize(7).text('Authorized by Eds Towels & Caps Management', { align: 'center' });

        doc.end();
    } catch (err) {
        console.error('downloadPurchaseOrderPdf error:', err);
        res.status(500).send('Error generating Purchase Order PDF');
    }
};

exports.trackProductView = async (req, res) => {
    try {
        const { id } = req.params;
        const { variant } = req.body; // 'A' or 'B'

        const dataToUpdate = {};
        if (variant === 'A') dataToUpdate.variantAViews = { increment: 1 };
        if (variant === 'B') dataToUpdate.variantBViews = { increment: 1 };

        if (Object.keys(dataToUpdate).length > 0) {
            await prisma.product.update({
                where: { id },
                data: dataToUpdate
            });
        }
        res.json({ success: true });
    } catch (err) {
        // silent fail to avoid interrupting user experience
        res.status(500).json({ success: false });
    }
};

async function getCostWatchAuditInternal() {
    const [products, inventory] = await Promise.all([
        prisma.product.findMany({ select: { id: true, name: true, price: true } }),
        prisma.inventory.findMany({
            select: { id: true, item: true, supplierUnitCost: true }
        })
    ]);

    const items = [];
    let criticalCount = 0;
    let tightCount = 0;
    let healthyCount = 0;
    let totalMargin = 0;
    let evaluatedCount = 0;

    products.forEach(p => {
        let materialCost = 0;
        const lowerName = p.name.toLowerCase().trim();
        const matchedInv = inventory.find(inv => {
            const itemLower = (inv.item || '').toLowerCase().trim();
            return lowerName.includes(itemLower) || itemLower.includes(lowerName);
        });

        if (matchedInv && Number(matchedInv.supplierUnitCost) > 0) {
            materialCost = Number(matchedInv.supplierUnitCost);
        }

        const price = Number(p.price) || 0;
        if (price > 0 && materialCost > 0) {
            const margin = ((price - materialCost) / price) * 100;
            const marginPercent = Math.round(margin * 10) / 10;
            totalMargin += marginPercent;
            evaluatedCount++;

            let status = 'HEALTHY_MARGIN';
            if (materialCost >= price || marginPercent < 25) {
                status = 'CRITICAL_SQUEEZE';
                criticalCount++;
            } else if (marginPercent < 40) {
                status = 'TIGHT_MARGIN';
                tightCount++;
            } else {
                healthyCount++;
            }

            items.push({
                productId: p.id,
                productName: p.name,
                retailPrice: price,
                materialCost,
                marginPercent,
                status
            });
        }
    });

    return {
        summary: {
            criticalCount,
            tightCount,
            healthyCount,
            averageMarginPercent: evaluatedCount > 0 ? Math.round((totalMargin / evaluatedCount) * 10) / 10 : 0
        },
        items
    };
}

exports.getCostWatchAudit = getCostWatchAuditInternal;

exports.getCostWatch = async (req, res) => {
    try {
        const audit = await getCostWatchAuditInternal();
        res.json({ success: true, ...audit });
    } catch (err) {
        console.error('Failed to run Cost Watch audit:', err);
        res.status(500).json({ success: false, message: 'Failed to run Cost Watch audit' });
    }
};

