const prisma = require('./prisma');
const socketUtil = require('./socketUtil');
const { ACTIONS, ENTITIES } = require('./apiConstants');

/**
 * Estimates production time in minutes for a given order based on design, garment type, and personalization.
 * @param {Object} order The order object to estimate
 * @returns {number} Estimated time in minutes
 */
function estimateProductionTime(order) {
    let baseTime = 10; // Base 10 minutes for any order setup

    // 1. Garment complexity adjustments
    const design = (order.design || '').toLowerCase();
    if (design.includes('hoodie') || design.includes('jacket')) {
        baseTime += 15; // Thick garments require slower stitch speeds
    } else if (design.includes('cap') || design.includes('hat')) {
        baseTime += 8;  // Caps require round-hoop setup
    } else if (design.includes('t-shirt') || design.includes('tee')) {
        baseTime += 5;
    }

    // 2. Personalization text length complexity
    if (order.personalization && typeof order.personalization === 'object') {
        const text = order.personalization.text || '';
        baseTime += Math.ceil(text.length * 0.5); // 30 seconds per character

        // Thread color changes add overhead (changing spools)
        const color = order.personalization.color || '';
        if (color.toLowerCase().includes('gold') || color.toLowerCase().includes('silver') || color.toLowerCase().includes('metallic')) {
            baseTime += 5; // Metallic threads are fragile and require slower speeds
        }
    }

    // 3. Quantity factor
    let quantity = 1;
    if (order.items && Array.isArray(order.items)) {
        quantity = order.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    } else if (typeof order.items === 'object' && order.items !== null) {
        quantity = order.items.quantity || 1;
    }
    
    // Total time scale by quantity, with a slight batch discount
    return baseTime * quantity * 0.9;
}

/**
 * Calculates priority score and estimates production times for all pending/active orders,
 * then updates the database and broadcasts changes over sockets.
 * @param {Object} io Socket.IO instance for real-time updates
 */
async function recalculateQueuePriorities(io) {
    try {
        console.log('[AI Queue] Starting queue prioritization analysis...');
        
        // Fetch all non-completed, non-canceled orders
        const activeOrders = await prisma.order.findMany({
          where: {
            status: {
              in: ['Pending Payment', 'In Queue', 'Preparing Order']
            }
          }
        });

        if (activeOrders.length === 0) {
            console.log('[AI Queue] No active orders to prioritize.');
            return;
        }

        const now = new Date();

        // Calculate and update each order in a transaction
        const updates = activeOrders.map(async (order) => {
            let score = 0;
            const estTime = estimateProductionTime(order);

            // 1. Rush status (major boost)
            if (order.isRush) {
                score += 150;
            }

            // 2. Delivery target urgency (dueDate)
            if (order.dueDate) {
                const hoursRemaining = (new Date(order.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60);
                if (hoursRemaining <= 0) {
                    score += 300; // Overdue gets maximum priority
                } else if (hoursRemaining <= 4) {
                    score += 200; // Due in next 4 hours
                } else if (hoursRemaining <= 24) {
                    score += 100; // Due within 24 hours
                } else if (hoursRemaining <= 72) {
                    score += 50;  // Due within 3 days
                }
            } else if (order.deliveryTime) {
                // Fallback check if deliveryTime is a string but contains hints
                const delLower = order.deliveryTime.toLowerCase();
                if (delLower.includes('today') || delLower.includes('hour') || delLower.includes('asap')) {
                    score += 80;
                } else if (delLower.includes('tomorrow')) {
                    score += 40;
                }
            }

            // 3. Order age (prevents starvation of low-priority orders)
            const hoursInQueue = (now.getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);
            score += hoursInQueue * 5; // +5 points for every hour waiting in queue

            // 4. Luxury Upsell (Gift Packaging) gets minor priority bump
            if (order.giftPackaging) {
                score += 20;
            }

            // Update in DB
            return prisma.order.update({
                where: { id: order.id },
                data: {
                    priorityScore: parseFloat(score.toFixed(2)),
                    estimatedTime: Math.ceil(estTime)
                }
            });
        });

        await Promise.all(updates);
        console.log(`[AI Queue] Successfully recalculated priority scores for ${activeOrders.length} orders.`);

        // Fetch refreshed orders list to broadcast to all clients
        const allOrders = await prisma.order.findMany({
            include: { transaction: true, receipt: true }
        });
        
        if (io) {
            socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, allOrders);
        }
    } catch (error) {
        console.error('[AI Queue Error] Prioritization calculation failed:', error);
    }
}

module.exports = {
    estimateProductionTime,
    recalculateQueuePriorities
};
