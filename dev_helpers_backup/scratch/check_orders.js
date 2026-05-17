const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Checking orders in database...');
    try {
        const orders = await prisma.order.findMany({
            include: { transaction: true, receipt: true }
        });
        console.log('Total Orders Found:', orders.length);
        console.log('Orders Detail:', JSON.stringify(orders, null, 2));
    } catch (err) {
        console.error('Error fetching orders:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
