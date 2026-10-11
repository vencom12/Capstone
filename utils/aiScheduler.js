const prisma = require('./prisma');
const socketUtil = require('./socketUtil');
const { ACTIONS, ENTITIES } = require('./apiConstants');

/**
 * Estimates production time in minutes for a given order based on empirical shop data:
 * - Setup & hooping + 1st letter takes around 2.0 minutes (120 seconds).
 * - Each proceeding letter consumes around 30 seconds (0.5 minutes).
 * @param {Object} order The order object to estimate
 * @returns {number} Estimated time in minutes
 */
function estimateProductionTime(order) {
    // 1. Extract total personalization character count
    let letters = 1;
    if (order.personalization && typeof order.personalization === 'object') {
        const text = (order.personalization.text || '').replace(/\s+/g, '');
        if (text.length > 0) letters = text.length;
    } else if (typeof order.monogramText === 'string') {
        const text = order.monogramText.replace(/\s+/g, '');
        if (text.length > 0) letters = text.length;
    } else if (order.items && Array.isArray(order.items)) {
        let totalLetters = 0;
        order.items.forEach(item => {
            const itemText = item.personalization?.text || '';
            totalLetters += itemText.replace(/\s+/g, '').length;
        });
        if (totalLetters > 0) letters = totalLetters;
    }

    // 2. Base formula: 1.5 mins setup/hooping + (letters * 0.5 mins / 30 seconds)
    // 1 letter: 1.5 + 0.5 = 2.0 mins (exactly 2 minutes including setup)
    // Each additional letter: +0.5 mins (30 seconds)
    let baseTime = 1.5 + (letters * 0.5);

    // 3. Minor garment framing adjustments
    const design = (order.design || '').toLowerCase();
    if (design.includes('cap') || design.includes('hat')) {
        baseTime += 0.5; // Cap round-clamp hooping (+30s)
    } else if (design.includes('hoodie') || design.includes('jacket')) {
        baseTime += 1.0; // Thick garment alignment (+60s)
    }

    // 4. Quantity factor
    let quantity = 1;
    if (order.items && Array.isArray(order.items)) {
        quantity = order.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    } else if (typeof order.items === 'object' && order.items !== null) {
        quantity = order.items.quantity || 1;
    }

    return Math.max(2, Math.ceil(baseTime * Math.max(1, quantity)));
}

/**
 * Calculates priority score and estimates production times for all pending/active orders,
 * then updates the database and broadcasts changes over sockets.
 * @param {Object} io Socket.IO instance for real-time updates
 */
async function recalculateQueuePriorities(io) {
    try {
        console.log('[AI Queue] Starting queue prioritization analysis...');

        // Fetch all active/pending orders in the queue lifecycle
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

        // 1. Optimization: Query customer historical completed order counts in a single batch GroupBy
        const userIds = [...new Set(activeOrders.map(o => o.userId))];
        const orderCounts = await prisma.order.groupBy({
            by: ['userId'],
            _count: { id: true },
            where: {
                userId: { in: userIds },
                status: 'Completed'
            }
        });

        const completedCountMap = {};
        orderCounts.forEach(c => {
            completedCountMap[c.userId] = c._count.id;
        });

        // 2. Optimization: Identify active designs currently in 'Preparing Order' state in memory
        const activeDesigns = activeOrders
            .filter(o => o.status === 'Preparing Order' && o.design)
            .map(o => o.design.toLowerCase().trim());

        // Calculate and update each active order in parallel database updates
        const updates = activeOrders.map(async (order) => {
            let score = 0;
            const estTime = estimateProductionTime(order);

            // A. Urgency Score (Max 40 points)
            let urgencyScore = 0;
            if (order.dueDate) {
                const createdTime = new Date(order.createdAt || order.date || now).getTime();
                const dueTime = new Date(order.dueDate).getTime();
                const nowTime = now.getTime();
                const totalWindow = dueTime - createdTime;

                if (totalWindow <= 0) {
                    urgencyScore = 40; // Overdue or immediate due date gets max points
                } else {
                    const elapsed = nowTime - createdTime;
                    const ratio = Math.max(0, Math.min(1, elapsed / totalWindow));
                    urgencyScore = ratio * 40;
                }
            } else if (order.deliveryTime) {
                const delLower = order.deliveryTime.toLowerCase().trim();
                if (delLower.includes('today') || delLower.includes('hour') || delLower.includes('asap')) {
                    urgencyScore = 40;
                } else if (delLower.includes('tomorrow')) {
                    urgencyScore = 25;
                } else {
                    const match = delLower.match(/(\d+)\s*day/);
                    if (match) {
                        const days = parseInt(match[1]);
                        urgencyScore = Math.max(0, Math.min(40, (10 - days) * 4));
                    } else {
                        urgencyScore = 15;
                    }
                }
            } else {
                // Starvation prevention: scale based on age up to 7 days
                const createdTime = new Date(order.createdAt || order.date || now).getTime();
                const elapsed = now.getTime() - createdTime;
                const defaultWindow = 7 * 24 * 60 * 60 * 1000; // 7 days
                urgencyScore = Math.min(40, (elapsed / defaultWindow) * 40);
            }
            score += urgencyScore;

            // B. Rush Processing flat boost (Max 30 points)
            if (order.isRush) {
                score += 30;
            }

            // C. Batching Compatibility (Max 20 points)
            // Adds bonus if order is in queue and matches a design configuration already running
            const designLower = (order.design || '').toLowerCase().trim();
            if (order.status === 'In Queue' && designLower && activeDesigns.includes(designLower)) {
                score += 20;
            }

            // D. Customer Tier historical loyalty bonus (Max 10 points)
            const completedCount = completedCountMap[order.userId] || 0;
            const tierScore = Math.min(10, completedCount);
            score += tierScore;

            // Strict 0-100 cap
            const finalScore = Math.min(100, score);

            // Update database row
            return prisma.order.update({
                where: { id: order.id },
                data: {
                    priorityScore: parseFloat(finalScore.toFixed(2)),
                    estimatedTime: Math.ceil(estTime)
                }
            });
        });

        await Promise.all(updates);
        console.log(`[AI Queue] Successfully recalculated priority scores for ${activeOrders.length} orders.`);

        // Fetch refreshed top-100 sorted orders list to broadcast to all clients
        const allOrders = await prisma.order.findMany({
            include: { transaction: true, receipt: true },
            orderBy: [
                { priorityScore: 'desc' },
                { createdAt: 'asc' }
            ],
            take: 100
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
