const prisma = require('../utils/prisma');
const { recalculateQueuePriorities } = require('../utils/aiScheduler');

async function testPriorityScores() {
    console.log('--- Testing Priority Queue Recalculation ---');
    try {
        // Trigger recalculation (null Socket.IO instance)
        await recalculateQueuePriorities(null);

        // Fetch top 10 orders from the database
        const orders = await prisma.order.findMany({
            select: {
                orderId: true,
                client: true,
                design: true,
                status: true,
                isRush: true,
                priorityScore: true,
                estimatedTime: true,
                dueDate: true,
                createdAt: true
            },
            orderBy: [
                { priorityScore: 'desc' },
                { createdAt: 'asc' }
            ],
            take: 10
        });

        console.log('\n--- Refreshed Top 10 Order Queue Priorities ---');
        console.table(orders.map(o => ({
            ID: o.orderId,
            Client: o.client,
            Design: o.design,
            Status: o.status,
            Rush: o.isRush,
            PriorityScore: o.priorityScore,
            EstTime: o.estimatedTime ? `${o.estimatedTime}m` : 'N/A',
            DueDate: o.dueDate ? o.dueDate.toISOString() : 'N/A'
        })));

        console.log('\nRecalculation test executed successfully.');
    } catch (err) {
        console.error('Test calculation failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testPriorityScores();
