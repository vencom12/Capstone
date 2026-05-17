const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDashboardState() {
    const page = 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    console.log('Testing Dashboard State with skip:', skip, 'limit:', limit);
    try {
        const [orders, totalOrders] = await Promise.all([
            prisma.order.findMany({
                include: { transaction: true, receipt: true },
                orderBy: { date: 'desc' },
                skip,
                take: limit
            }),
            prisma.order.count()
        ]);

        console.log('Total Orders Count:', totalOrders);
        console.log('Orders returned:', orders.length);
        if (orders.length > 0) {
            console.log('First Order ID:', orders[0].orderId);
        } else {
            console.log('NO ORDERS RETURNED!');
            
            // Try without orderBy date
            const ordersNoSort = await prisma.order.findMany({ take: 5 });
            console.log('Orders without sort:', ordersNoSort.length);
        }
    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testDashboardState();
