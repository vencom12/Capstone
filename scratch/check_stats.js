const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const orders = await prisma.order.findMany();
    console.log('--- ALL ORDERS ---');
    orders.forEach(o => {
        console.log(`ID: ${o.orderId}, Status: ${o.status}, Payment: ${o.paymentStatus}, Total: ${o.totalAmount}`);
    });
    
    const traffic = await prisma.siteTraffic.count();
    console.log(`--- TOTAL TRAFFIC: ${traffic} ---`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
