const prisma = require('./prisma');
const socketUtil = require('./socketUtil');
const { ACTIONS, ENTITIES } = require('./apiConstants');

const RESERVED_STATES = ['In Queue', 'Awaiting Payment', 'Pending Payment', 'On Hold - Awaiting Materials'];
const PROCESSED_STATES = ['Preparing Order', 'In Transit', 'Ready For Pick Up', 'Ready For Pick-Up', 'Ready for Pickup', 'Out for Delivery', 'Order Delivered', 'Completed'];

/**
 * Perform all inventory status transition actions inside an atomic Prisma transaction.
 * 
 * @param {object} tx - Prisma Transaction Context
 * @param {string} orderId - ID of the order to transition
 * @param {string} newStatus - Target status for the order
 * @param {string} username - Action operator username
 * @returns {Promise<object>} The updated order object
 */
async function handleOrderStateTransition(tx, orderId, newStatus, username = 'System', extraData = {}) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error(`Order ${orderId} not found`);

    const oldStatus = order.status;
    // Allow trackingNumber or note updates even if status text is identical
    if (oldStatus === newStatus && !extraData.trackingNumber && !extraData.note) return order;

    const isOldReserved = RESERVED_STATES.includes(oldStatus);
    const isNewReserved = RESERVED_STATES.includes(newStatus);
    const isOldProcessed = PROCESSED_STATES.includes(oldStatus);
    const isNewProcessed = PROCESSED_STATES.includes(newStatus);
    const isCancel = newStatus === 'Order Canceled';

    // Mandatory: Inventory audit trails cannot be disabled
    const logEnabled = true;
    const items = Array.isArray(order.items) ? order.items : [];

    // CASE 1: Transition from RESERVED to PROCESSED
    if (isOldReserved && isNewProcessed) {
        for (const item of items) {
            if (item.isByog || order.isByog) continue; // BYOG garment provided by customer

            let productId = item.productId || item.id;
            let product = productId ? await tx.product.findUnique({ where: { id: productId } }) : null;
            if (!product && item.name) {
                // Fallback: match by product name or base name before hyphen
                const baseName = item.name.split(' - ')[0].trim();
                product = await tx.product.findFirst({
                    where: {
                        OR: [
                            { name: { equals: item.name.trim(), mode: 'insensitive' } },
                            { name: { equals: baseName, mode: 'insensitive' } }
                        ]
                    }
                });
            }
            if (!product) continue;

            const garmentQuantity = item.quantity || 1;

            // NEGATIVE STOCK SAFEGUARD: Route to Hold Queue if physical stock is insufficient
            if (product.count < garmentQuantity) {
                const heldOrder = await tx.order.update({
                    where: { id: orderId },
                    data: { status: "On Hold - Awaiting Materials", progress: 5 }
                });
                
                const err = new Error(`Insufficient physical stock for "${product.name}". Needed: ${garmentQuantity}, Available: ${product.count}. Order routed to Hold Queue.`);
                err.isStockError = true;
                err.heldOrder = heldOrder;
                throw err;
            }

            // Deduct physical blanks and release reservation lock
            const newReserved = Math.max(0, (product.reservedCount || 0) - garmentQuantity);

            // Check if product has variants and deduct variant stock + linked raw blank material
            let updatedVariants = null;
            let matchedMaterialId = null;
            let matchedMaterialName = null;

            if (product.variants) {
                let variantsList = product.variants;
                if (typeof variantsList === 'string') {
                    try { variantsList = JSON.parse(variantsList); } catch(e) { variantsList = []; }
                }
                if (Array.isArray(variantsList)) {
                    const variantTarget = item.selectedVariant || item.variant || item.sku;
                    let variantFound = false;
                    updatedVariants = variantsList.map(v => {
                        if (v && (v.name === variantTarget || v.sku === variantTarget || v.id === variantTarget)) {
                            variantFound = true;
                            if (v.materialId) {
                                matchedMaterialId = v.materialId;
                                matchedMaterialName = v.materialName || v.name;
                            }
                            const currentVStock = v.stock !== undefined ? Number(v.stock) : null;
                            if (currentVStock !== null) {
                                return {
                                    ...v,
                                    stock: Math.max(0, currentVStock - garmentQuantity)
                                };
                            }
                        }
                        return v;
                    });
                    if (!variantFound) {
                        updatedVariants = null;
                    }
                }
            }

            const updateProductData = {
                count: { decrement: garmentQuantity },
                reservedCount: newReserved
            };
            if (updatedVariants) {
                updateProductData.variants = updatedVariants;
            }

            await tx.product.update({
                where: { id: product.id },
                data: updateProductData
            });

            // If variant is explicitly linked to raw materials (blank garments), deduct from Inventory stockpile
            if (matchedMaterialId) {
                const invBlank = await tx.inventory.findUnique({ where: { id: matchedMaterialId } });
                if (invBlank) {
                    const updatedInv = await tx.inventory.update({
                        where: { id: matchedMaterialId },
                        data: { count: { decrement: garmentQuantity } }
                    });
                    if (logEnabled) {
                        await tx.inventoryLog.create({
                            data: {
                                inventoryId: matchedMaterialId,
                                action: 'Deduct',
                                amount: garmentQuantity,
                                newTotal: updatedInv.count,
                                userId: `${username} (Blank: ${matchedMaterialName || 'Variant'})`
                            }
                        });
                    }
                }
            }
        }
    }

    // CASE 2: Transition from RESERVED to CANCELED (Release reservation locks only)
    else if (isOldReserved && isCancel) {
        for (const item of items) {
            const productId = item.productId || item.id;
            if (!productId) continue;

            const product = await tx.product.findUnique({ where: { id: productId } });
            if (!product) continue;

            const garmentQuantity = item.quantity || 1;
            const newReserved = Math.max(0, (product.reservedCount || 0) - garmentQuantity);

            await tx.product.update({
                where: { id: product.id },
                data: { reservedCount: newReserved }
            });
        }
    }

    // CASE 3: Transition from PROCESSED to CANCELED (Rollback physical blanks & raw threads stockpile)
    else if (isOldProcessed && isCancel) {
        for (const item of items) {
            const productId = item.productId || item.id;
            if (!productId) continue;

            const product = await tx.product.findUnique({ where: { id: productId } });
            if (!product) continue;

            const garmentQuantity = item.quantity || 1;

            // Restore physical blanks count + variant stocks + linked blank material
            let rollbackVariants = null;
            let matchedMaterialId = null;
            let matchedMaterialName = null;

            if (product.variants) {
                let variantsList = product.variants;
                if (typeof variantsList === 'string') {
                    try { variantsList = JSON.parse(variantsList); } catch(e) { variantsList = []; }
                }
                if (Array.isArray(variantsList)) {
                    const variantTarget = item.selectedVariant || item.variant || item.sku;
                    let variantFound = false;
                    rollbackVariants = variantsList.map(v => {
                        if (v && (v.name === variantTarget || v.sku === variantTarget || v.id === variantTarget)) {
                            variantFound = true;
                            if (v.materialId) {
                                matchedMaterialId = v.materialId;
                                matchedMaterialName = v.materialName || v.name;
                            }
                            const currentVStock = v.stock !== undefined ? Number(v.stock) : null;
                            if (currentVStock !== null) {
                                return {
                                    ...v,
                                    stock: currentVStock + garmentQuantity
                                };
                            }
                        }
                        return v;
                    });
                    if (!variantFound) {
                        rollbackVariants = null;
                    }
                }
            }

            const rollbackData = {
                count: { increment: garmentQuantity }
            };
            if (rollbackVariants) {
                rollbackData.variants = rollbackVariants;
            }

            await tx.product.update({
                where: { id: product.id },
                data: rollbackData
            });

            // Restore linked blank raw material in inventory
            if (matchedMaterialId) {
                const invBlank = await tx.inventory.findUnique({ where: { id: matchedMaterialId } });
                if (invBlank) {
                    const updatedInv = await tx.inventory.update({
                        where: { id: matchedMaterialId },
                        data: { count: { increment: garmentQuantity } }
                    });
                    if (logEnabled) {
                        await tx.inventoryLog.create({
                            data: {
                                inventoryId: matchedMaterialId,
                                action: 'Add',
                                amount: garmentQuantity,
                                newTotal: updatedInv.count,
                                userId: `Rollback (${username}) (Blank: ${matchedMaterialName || 'Variant'})`
                            }
                        });
                    }
                }
            }
        }
    }

    // Perform the actual order status update in database
    const progressMap = {
        'In Queue': 10,
        'Preparing Order': 30,
        'In Transit': 70,
        'Ready For Pick Up': 90,
        'Ready For Pick-Up': 90,
        'Ready for Pickup': 90,
        'Out for Delivery': 90,
        'Order Delivered': 100,
        'Completed': 100,
        'Order Canceled': 0
    };
    const progress = progressMap[newStatus] !== undefined ? progressMap[newStatus] : 50;

    let personalization = {};
    if (order.personalization && typeof order.personalization === 'object') {
        personalization = { ...order.personalization };
    } else if (typeof order.personalization === 'string') {
        try { personalization = JSON.parse(order.personalization); } catch(e) {}
    }

    const currentHistory = Array.isArray(personalization.statusHistory) ? [...personalization.statusHistory] : [];
    
    let defaultHub = 'Eds Towels Pacific Mall Lucena Hub';
    if (newStatus.includes('Transit') || newStatus.includes('Delivery')) {
        defaultHub = 'J&T Express South Luzon Sort Facility';
    } else if (newStatus.includes('Delivered') || newStatus.includes('Completed')) {
        defaultHub = 'Destination Delivery Address';
    }

    currentHistory.push({
        status: newStatus,
        timestamp: new Date().toISOString(),
        actor: username,
        hub: extraData.hub || defaultHub,
        note: extraData.note || `Order status updated to "${newStatus}"`
    });

    personalization.statusHistory = currentHistory;

    if (extraData.trackingNumber) {
        personalization.trackingNumber = extraData.trackingNumber;
    }
    personalization.courier = extraData.courier || personalization.courier || 'Store Pick-up';
    personalization.fulfillmentType = 'pickup';

    const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { 
            status: newStatus, 
            progress,
            personalization,
            stagingCubby: null
        }
    });

    // Run self-healing database column reconciliation inside transition transactions
    await reconcileReservedCounts(tx);

    return updatedOrder;
}

/**
 * Scans active orders and reconciles/updates the reservedCount field for all products.
 * This is a self-healing routine to fix any data drift.
 * 
 * @param {object} tx - Prisma context
 */
async function reconcileReservedCounts(tx = prisma) {
    const activeOrders = await tx.order.findMany({
        where: {
            status: {
                in: RESERVED_STATES
            }
        }
    });

    const reservedGarments = {};
    for (const order of activeOrders) {
        const items = Array.isArray(order.items) ? order.items : [];
        for (const item of items) {
            const productId = item.productId || item.id;
            if (!productId) continue;
            const quantity = item.quantity || 1;
            reservedGarments[productId] = (reservedGarments[productId] || 0) + quantity;
        }
    }

    const inventory = await tx.inventory.findMany();
    const allProducts = await tx.product.findMany({ select: { id: true, reservedCount: true, variants: true, count: true } });
    for (const product of allProducts) {
        let variantsList = product.variants;
        if (typeof variantsList === 'string') {
            try { variantsList = JSON.parse(variantsList); } catch(e) { variantsList = []; }
        }

        // Product count is strictly the sum of materials linked to its variants
        let expectedCount = 0;
        if (Array.isArray(variantsList) && variantsList.length > 0) {
            expectedCount = variantsList.reduce((sum, v) => {
                if (v && v.materialId) {
                    const mat = inventory.find(i => i.id === v.materialId);
                    return sum + (mat ? (mat.count || 0) : 0);
                }
                return sum;
            }, 0);
        }

        let expectedReserved = expectedCount === 0 ? 0 : Math.min(reservedGarments[product.id] || 0, expectedCount);

        if (product.reservedCount !== expectedReserved || product.count !== expectedCount) {
            await tx.product.update({
                where: { id: product.id },
                data: { 
                    reservedCount: expectedReserved,
                    count: expectedCount
                }
            });
        }
    }
}

/**
 * Helper to calculate thread quantities currently promised to active/pending orders.
 * 
 * @param {object} tx - Prisma context
 * @returns {Promise<object>} Map of inventoryId to reserved quantity
 */
async function getReservedThreadCounts(tx = prisma) {
    // Thread spools are continuously maintained workshop studio assets, not micro-metered per letter
    return {};
}

/**
 * Automatically cancels unpaid checkouts exceeding the 24-hour payment window
 * to guarantee stale reservations are never left hanging.
 */
async function autoExpireUnpaidOrders(tx = prisma) {
    try {
        const expirationCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await tx.order.updateMany({
            where: {
                status: { in: ['Awaiting Payment', 'Pending Payment'] },
                paymentStatus: { not: 'paid' },
                createdAt: { lt: expirationCutoff }
            },
            data: {
                status: 'Order Canceled',
                paymentStatus: 'unpaid'
            }
        });
    } catch (err) {
        console.error('[InventoryManager] autoExpireUnpaidOrders error:', err);
    }
}

/**
 * Enrichment function to calculate availableStock and isOutOfStock for products based on:
 * 1. Variants holding the stock (sum of variants = product stock).
 * 2. Variant linking to raw blank materials in the Materials tab (Inventory).
 * 3. Products with 0 variants strictly having 0 stock.
 * 
 * @param {Array} products - Array of product objects
 * @param {object} [tx] - Optional transaction context or prisma instance
 * @returns {Promise<Array>} Enriched products
 */
async function enrichProductsWithStock(products, tx = prisma) {
    // 1. Proactively sweep away any stale checkouts past 24 hours
    await autoExpireUnpaidOrders(tx);

    const inventory = await tx.inventory.findMany();
    const reservedThreads = await getReservedThreadCounts(tx);

    // Dynamic verified product ratings aggregation (Amazon/Shopee Standard)
    let ratingMap = {};
    try {
        const ratingRows = await tx.$queryRawUnsafe(`
            SELECT "productId", AVG(rating)::numeric(10,1) as avg_rating, COUNT(*)::int as count
            FROM "Feedback"
            WHERE "productId" IS NOT NULL
            GROUP BY "productId"
        `);
        if (Array.isArray(ratingRows)) {
            for (const r of ratingRows) {
                if (r.productId) {
                    ratingMap[r.productId] = {
                        rating: parseFloat(r.avg_rating),
                        reviewCount: parseInt(r.count, 10)
                    };
                }
            }
        }
    } catch (e) {
        // Non-blocking fallback
    }

    // 2. Fetch active production orders; "Awaiting Payment" only locks stock within the 24h grace window
    const ONE_DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeOrders = await tx.order.findMany({
        where: {
            OR: [
                {
                    status: { in: ['In Queue', 'On Hold - Awaiting Materials', 'Processing', 'Stitching', 'Assembly', 'Queued', 'Paid', 'Order Placed'] }
                },
                {
                    status: { in: ['Awaiting Payment', 'Pending Payment', 'Payment Uploaded - Verifying'] },
                    createdAt: { gte: ONE_DAY_AGO } // Strictly must be within 24 hours
                }
            ]
        }
    });

    const reservedGarments = {};
    const reservedByVariant = {}; // key: `${productId}_${variantName.toLowerCase()}`
    const reservedByMaterial = {}; // key: materialId

    // Map all products to look up variant material links
    const productMap = {};
    for (const p of products) {
        productMap[p.id] = p;
    }

    for (const order of activeOrders) {
        const items = Array.isArray(order.items) ? order.items : [];
        for (const item of items) {
            const productId = item.productId || item.id;
            if (!productId) continue;
            const quantity = item.quantity || 1;
            reservedGarments[productId] = (reservedGarments[productId] || 0) + quantity;

            const variantName = item.selectedVariant || (item.personalization && item.personalization.variant) || item.variant || item.sku;
            if (variantName) {
                const vKey = `${productId}_${String(variantName).trim().toLowerCase()}`;
                reservedByVariant[vKey] = (reservedByVariant[vKey] || 0) + quantity;

                // If variant links to a raw material, track reservations for that material
                const prod = productMap[productId];
                if (prod && prod.variants) {
                    let vList = prod.variants;
                    if (typeof vList === 'string') {
                        try { vList = JSON.parse(vList); } catch(e) { vList = []; }
                    }
                    if (Array.isArray(vList)) {
                        const matchedV = vList.find(v => v && v.name && v.name.trim().toLowerCase() === String(variantName).trim().toLowerCase());
                        if (matchedV) {
                            let resolvedMatId = matchedV.materialId;
                            if (!resolvedMatId && matchedV.materialName) {
                                const found = inventory.find(i => i.item && i.item.trim().toLowerCase() === matchedV.materialName.trim().toLowerCase());
                                if (found) resolvedMatId = found.id;
                            }
                            if (!resolvedMatId && prod.name) {
                                const found = inventory.find(i => i.item && i.item.trim().toLowerCase() === prod.name.trim().toLowerCase());
                                if (found) resolvedMatId = found.id;
                            }
                            if (resolvedMatId) {
                                reservedByMaterial[resolvedMatId] = (reservedByMaterial[resolvedMatId] || 0) + quantity;
                            }
                        }
                    }
                }
            }
        }
    }

    return products.map(product => {
        let variantsList = product.variants;
        if (typeof variantsList === 'string') {
            try { variantsList = JSON.parse(variantsList); } catch(e) { variantsList = []; }
        }

        // Helper: Resolve raw material item with intelligent fallbacks
        const resolveMaterialForVariant = (v) => {
            let invItem = null;
            if (v.materialId) {
                invItem = inventory.find(i => i.id === v.materialId);
            }
            if (!invItem && v.materialName) {
                invItem = inventory.find(i => i.item && i.item.trim().toLowerCase() === v.materialName.trim().toLowerCase());
            }
            if (!invItem && v.name && product.name) {
                const c1 = `${v.name} ${product.name}`.toLowerCase();
                const c2 = `${product.name} ${v.name}`.toLowerCase();
                const c3 = `${product.name} - ${v.name}`.toLowerCase();
                invItem = inventory.find(i => {
                    if (!i.item) return false;
                    const it = i.item.trim().toLowerCase();
                    return it === c1 || it === c2 || it === c3;
                });
            }
            if (!invItem && product.name) {
                invItem = inventory.find(i => i.item && i.item.trim().toLowerCase() === product.name.trim().toLowerCase());
            }
            return invItem;
        };

        // Standard products with 0 variants: support direct inventory matching or product.count
        if (!Array.isArray(variantsList) || variantsList.length === 0) {
            const productGarmentSize = (() => {
                if (product.garmentSize === 'big' || product.garmentSize === 'small') return product.garmentSize;
                if (Array.isArray(product.tags)) {
                    if (product.tags.includes('garment:big')) return 'big';
                    if (product.tags.includes('garment:small')) return 'small';
                }
                const t = `${product.tag || ''} ${product.name || ''}`.toLowerCase();
                if (t.includes('bath') || t.includes('shirt') || t.includes('polo') || t.includes('jacket') || t.includes('hoodie') || t.includes('umbrella') || t.includes('robe') || t.includes('blanket')) {
                    return 'big';
                }
                return 'small';
            })();
            const matchingInv = inventory.find(i => i.item && i.item.trim().toLowerCase() === (product.name || '').trim().toLowerCase());
            const dynamicReserved = reservedGarments[product.id] || 0;
            if (matchingInv) {
                const matReserved = (reservedByMaterial[matchingInv.id] || 0) + dynamicReserved;
                const directCount = matchingInv.count || 0;
                const available = Math.max(0, directCount - matReserved);
                return {
                    ...product,
                    garmentSize: productGarmentSize,
                    count: directCount,
                    dynamicReserved: matReserved,
                    availableStock: available,
                    isOutOfStock: available <= 0,
                    variants: []
                };
            }

            const directCount = typeof product.count === 'number' ? product.count : (parseInt(product.count, 10) || 0);
            const available = Math.max(0, directCount - dynamicReserved);
            return {
                ...product,
                garmentSize: productGarmentSize,
                count: directCount,
                dynamicReserved,
                availableStock: available,
                isOutOfStock: available <= 0,
                variants: []
            };
        }

        // Shared material tracking to prevent double-counting when multiple variants share the same material
        const countedMaterialPhysical = new Set();
        const countedMaterialAvailable = new Set();
        let totalVariantPhysical = 0;
        let totalVariantAvailable = 0;

        const enrichedVariants = variantsList.map(v => {
            if (!v) return v;
            const invItem = resolveMaterialForVariant(v);
            let rawPhysical = 0;
            let available = 0;

            if (invItem) {
                const matCount = invItem.count || 0;
                const matReserved = reservedByMaterial[invItem.id] || 0;
                rawPhysical = matCount;
                available = Math.max(0, matCount - matReserved);

                // Shared Material Pool: add the material count only once to total product capacity
                if (!countedMaterialPhysical.has(invItem.id)) {
                    countedMaterialPhysical.add(invItem.id);
                    totalVariantPhysical += rawPhysical;
                }
                if (!countedMaterialAvailable.has(invItem.id)) {
                    countedMaterialAvailable.add(invItem.id);
                    totalVariantAvailable += available;
                }
            } else {
                // Independent unlinked variant: fallback to saved v.stock
                const s = typeof v.stock === 'number' ? v.stock : (parseInt(v.stock, 10) || 0);
                rawPhysical = Math.max(0, s);
                available = Math.max(0, s);
                totalVariantPhysical += rawPhysical;
                totalVariantAvailable += available;
            }

            return {
                ...v,
                materialId: invItem ? invItem.id : v.materialId,
                materialName: invItem ? invItem.item : v.materialName,
                stock: rawPhysical,
                availableStock: available,
                isOutOfStock: available <= 0
            };
        });

        const dynamicReserved = reservedGarments[product.id] || 0;
        const finalAvailable = Math.max(0, totalVariantAvailable);
        const ratingInfo = ratingMap[product.id] || { rating: null, reviewCount: 0 };
        const productGarmentSize = (() => {
            if (product.garmentSize === 'big' || product.garmentSize === 'small') return product.garmentSize;
            if (Array.isArray(product.tags)) {
                if (product.tags.includes('garment:big')) return 'big';
                if (product.tags.includes('garment:small')) return 'small';
            }
            const t = `${product.tag || ''} ${product.name || ''}`.toLowerCase();
            if (t.includes('bath') || t.includes('shirt') || t.includes('polo') || t.includes('jacket') || t.includes('hoodie') || t.includes('umbrella') || t.includes('robe') || t.includes('blanket')) {
                return 'big';
            }
            return 'small';
        })();

        return {
            ...product,
            garmentSize: productGarmentSize,
            rating: ratingInfo.rating,
            reviewCount: ratingInfo.reviewCount,
            count: totalVariantPhysical,
            dynamicReserved,
            availableStock: finalAvailable,
            isOutOfStock: finalAvailable <= 0,
            variants: enrichedVariants
        };
    });
}

module.exports = {
    handleOrderStateTransition,
    enrichProductsWithStock,
    getReservedThreadCounts,
    reconcileReservedCounts,
    autoExpireUnpaidOrders,
    RESERVED_STATES,
    PROCESSED_STATES
};

