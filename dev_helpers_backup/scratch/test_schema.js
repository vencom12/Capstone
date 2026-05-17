const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const orders = await prisma.order.findMany({
            select: { id: true, createdAt: true },
            take: 1
        });
        console.log('Query successful:', orders);
    } catch (e) {
        console.error('Query failed with error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
