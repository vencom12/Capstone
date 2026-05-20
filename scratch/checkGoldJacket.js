const prisma = require('../utils/prisma');

async function main() {
    const product = await prisma.product.findFirst({ where: { name: 'Gold Stitch Jacket' }});
    console.log('Product:', JSON.stringify(product, null, 2));

    const inventory = await prisma.inventory.findMany();
    console.log('Inventory:', JSON.stringify(inventory, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
