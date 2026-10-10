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

    const settings = await tx.systemSettings.findUnique({ where: { id: 'global' } });
    const logEnabled = settings ? settings.inventoryAuditLog : true;
    const items = Array.isArray(order.items) ? order.items : [];

    // CASE 1: Transition from RESERVED to PROCESSED
    if (isOldReserved && isNewProcessed) {
        for (const item of items) {
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

            // Explode Recipe BOM and deduct threads
            if (product.recipe && Array.isArray(product.recipe)) {
                for (const component of product.recipe) {
                    const totalDeduction = Math.ceil(component.quantity * garmentQuantity);

                    // Check/deduct from stockpile
                    const inventoryItem = await tx.inventory.findUnique({ where: { id: component.inventoryId } });
                    if (inventoryItem) {
                        const updatedInv = await tx.inventory.update({
                            where: { id: component.inventoryId },
                            data: { count: { decrement: totalDeduction } }
                        });
                        
                        if (logEnabled) {
                            await tx.inventoryLog.create({
                                data: {
                                    inventoryId: component.inventoryId,
                                    action: 'Deduct',
                                    amount: totalDeduction,
                                    newTotal: updatedInv.count,
                                    userId: username
                                }
                            });
                        }
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

            // Restore raw thread spools
            if (product.recipe && Array.isArray(product.recipe)) {
                for (const component of product.recipe) {
                    const totalDeduction = Math.ceil(component.quantity * garmentQuantity);

                    const inventoryItem = await tx.inventory.findUnique({ where: { id: component.inventoryId } });
                    if (inventoryItem) {
                        const updatedInv = await tx.inventory.update({
                            where: { id: component.inventoryId },
                            data: { count: { increment: totalDeduction } }
                        });

                        if (logEnabled) {
                            await tx.inventoryLog.create({
                                data: {
                                    inventoryId: component.inventoryId,
                                    action: 'Add',
                                    amount: totalDeduction,
                                    newTotal: updatedInv.count,
                                    userId: `Rollback (${username})`
                                }
                            });
                        }
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
    if (extraData.courier) {
        personalization.courier = extraData.courier;
    } else if (!personalization.courier) {
        personalization.courier = 'J&T Express';
    }

    const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { 
            status: newStatus, 
            progress,
            personalization 
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

    const allProducts = await tx.product.findMany({ select: { id: true, reservedCount: true } });
    for (const product of allProducts) {
        const expectedReserved = reservedGarments[product.id] || 0;
        if (product.reservedCount !== expectedReserved) {
            await tx.product.update({
                where: { id: product.id },
                data: { reservedCount: expectedReserved }
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
    const activeOrders = await tx.order.findMany({
        where: {
            status: {
                in: ['In Queue', 'Awaiting Payment', 'Pending Payment', 'On Hold - Awaiting Materials']
            }
        }
    });

    const reservedThreads = {};
    for (const order of activeOrders) {
        const items = Array.isArray(order.items) ? order.items : [];
        for (const item of items) {
            const productId = item.productId || item.id;
            if (!productId) continue;

            const product = await tx.product.findUnique({ where: { id: productId } });
            if (product && product.recipe && Array.isArray(product.recipe)) {
                const quantity = item.quantity || 1;
                for (const component of product.recipe) {
                    const needed = component.quantity * quantity;
                    reservedThreads[component.inventoryId] = (reservedThreads[component.inventoryId] || 0) + needed;
                }
            }
        }
    }
    return reservedThreads;
}

/**
 * Enrichment function to calculate availableStock and isOutOfStock for products.
 * 
 * @param {Array} products - Array of product objects
 * @param {object} [tx] - Optional transaction context or prisma instance
 * @returns {Promise<Array>} Enriched products
 */
async function enrichProductsWithStock(products, tx = prisma) {
    const inventory = await tx.inventory.findMany();
    const reservedThreads = await getReservedThreadCounts(tx);

    // Calculate product reserved count dynamically to prevent any locked stock drift
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

    return products.map(product => {
        const dynamicReserved = reservedGarments[product.id] || 0;
        const blanksAvailable = (product.count || 0) - dynamicReserved;
        let availableStock = blanksAvailable;

        if (product.recipe && Array.isArray(product.recipe) && product.recipe.length > 0) {
            for (const component of product.recipe) {
                const invItem = inventory.find(i => i.id === component.inventoryId);
                const invCount = invItem ? invItem.count : 0;
                const reservedCount = reservedThreads[component.inventoryId] || 0;
                const availableCount = Math.max(0, invCount - reservedCount);

                const quantityRequired = component.quantity || 1;
                const maxFromComponent = Math.floor(availableCount / quantityRequired);
                availableStock = Math.min(availableStock, maxFromComponent);
            }
        }

        const finalAvailable = Math.max(0, availableStock);
        return {
            ...product,
            dynamicReserved,
            availableStock: finalAvailable,
            isOutOfStock: finalAvailable <= 0
        };
    });
}

module.exports = {
    handleOrderStateTransition,
    enrichProductsWithStock,
    getReservedThreadCounts,
    reconcileReservedCounts,
    RESERVED_STATES,
    PROCESSED_STATES
};

