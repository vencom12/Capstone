const prisma = require('../utils/prisma');
const { enrichProductsWithStock, reconcileReservedCounts } = require('../utils/inventoryManager');

async function runTests() {
    console.log('>>> RUNNING STOCK FLOW TESTS <<<');

    // Clean up any leftover test orders from previous crashed runs
    await prisma.order.deleteMany({
        where: { client: 'Test Client' }
    });
    
    // 1. Create/Find a test thread inventory item
    let testInventory = await prisma.inventory.findFirst({
        where: { item: 'Test Gold Thread' }
    });
    if (!testInventory) {
        testInventory = await prisma.inventory.create({
            data: {
                item: 'Test Gold Thread',
                count: 100,
                unit: 'spools',
                minThreshold: 5
            }
        });
    } else {
        await prisma.inventory.update({
            where: { id: testInventory.id },
            data: { count: 100 }
        });
    }

    // 2. Create/Find a test product with a recipe
    let testProduct = await prisma.product.findFirst({
        where: { name: 'Test Stitch Jacket' }
    });
    if (!testProduct) {
        testProduct = await prisma.product.create({
            data: {
                name: 'Test Stitch Jacket',
                price: 120.00,
                tag: 'Jacket',
                imageUrl: 'https://example.com/jacket.jpg',
                count: 10,
                reservedCount: 0,
                minThreshold: 2,
                recipe: [
                    { inventoryId: testInventory.id, name: 'Test Gold Thread', quantity: 10 }
                ]
            }
        });
    } else {
        await prisma.product.update({
            where: { id: testProduct.id },
            data: {
                count: 10,
                reservedCount: 0,
                recipe: [
                    { inventoryId: testInventory.id, name: 'Test Gold Thread', quantity: 10 }
                ]
            }
        });
    }

    // Refresh references
    testProduct = await prisma.product.findUnique({ where: { id: testProduct.id } });

    console.log('\n--- Initial Product Stock & Recipe ---');
    console.log(`Garment blanks: ${testProduct.count}`);
    console.log(`Thread count in inventory: 100 spools`);
    console.log(`Recipe requires: 10 spools per garment`);

    // 3. Test Enrichment calculation
    let enriched = await enrichProductsWithStock([testProduct]);
    console.log('\n--- Testing enrichProductsWithStock (Thread = 100, Blanks = 10) ---');
    console.log(`Available stock: ${enriched[0].availableStock}`);
    console.log(`Is Out of Stock: ${enriched[0].isOutOfStock}`);
    if (enriched[0].availableStock !== 10) {
        throw new Error(`Expected available stock to be 10, got ${enriched[0].availableStock}`);
    }

    // Update Thread Count to 25 (max 2 garments)
    await prisma.inventory.update({
        where: { id: testInventory.id },
        data: { count: 25 }
    });
    enriched = await enrichProductsWithStock([testProduct]);
    console.log('\n--- Testing enrichProductsWithStock (Thread = 25, Blanks = 10) ---');
    console.log(`Available stock: ${enriched[0].availableStock}`);
    console.log(`Is Out of Stock: ${enriched[0].isOutOfStock}`);
    if (enriched[0].availableStock !== 2) {
        throw new Error(`Expected available stock to be 2, got ${enriched[0].availableStock}`);
    }

    // Update Thread Count to 0
    await prisma.inventory.update({
        where: { id: testInventory.id },
        data: { count: 0 }
    });
    enriched = await enrichProductsWithStock([testProduct]);
    console.log('\n--- Testing enrichProductsWithStock (Thread = 0, Blanks = 10) ---');
    console.log(`Available stock: ${enriched[0].availableStock}`);
    console.log(`Is Out of Stock: ${enriched[0].isOutOfStock}`);
    if (enriched[0].availableStock !== 0 || !enriched[0].isOutOfStock) {
        throw new Error(`Expected available stock to be 0 and isOutOfStock to be true`);
    }

    console.log('\n>>> ALL ENRICHMENT TESTS PASSED <<<');

    // Restore stock and threads for concurrency test
    await prisma.inventory.update({
        where: { id: testInventory.id },
        data: { count: 50 } // Enough for exactly 5 garments
    });
    await prisma.product.update({
        where: { id: testProduct.id },
        data: { count: 10, reservedCount: 0 }
    });

    console.log('\n--- Testing Concurrent Checkouts (Available Material for 5 garments) ---');
    
    // We will simulate two concurrent checkout attempts of 5 garments each.
    // We expect one to succeed and one to fail with OutOfStockMaterial error.
    const itemsList = [
        { productId: testProduct.id, name: testProduct.name, price: testProduct.price, quantity: 5 }
    ];

    // Clean up past test client orders
    await prisma.order.deleteMany({
        where: { client: 'Test Client' }
    });

    // Find or create a test user
    let testUser = await prisma.user.findFirst();
    if (!testUser) {
        testUser = await prisma.user.create({
            data: {
                username: 'testuser',
                email: 'testuser@example.com',
                passwordHash: 'hashed',
                role: 'Customer',
                walletBalance: 1000.00
            }
        });
    }

    // Helper to simulate submitOrder transaction
    const executeCheckoutTx = async (orderIdSuffix, quantity) => {
        return prisma.$transaction(async (tx) => {
            console.log(`[Tx ${orderIdSuffix}] Starting transaction...`);
            
            // 1. Lock Product
            const products = await tx.$queryRaw`
                SELECT * FROM "Product" WHERE id = ${testProduct.id} FOR UPDATE
            `;
            const product = products[0];
            const needed = quantity;
            const atp = product.count - product.reservedCount;
            if (atp < needed) {
                throw new Error(`OutOfStock:${product.name}`);
            }

            // 2. Lock & Check Spools
            if (product.recipe && Array.isArray(product.recipe)) {
                const { getReservedThreadCounts } = require('../utils/inventoryManager');
                const reservedThreads = await getReservedThreadCounts(tx);
                for (const component of product.recipe) {
                    const neededMaterial = Math.ceil(component.quantity * needed);
                    const invItems = await tx.$queryRaw`
                        SELECT * FROM "Inventory" WHERE id = ${component.inventoryId} FOR UPDATE
                    `;
                    const inventoryItem = invItems[0];
                    const invCount = inventoryItem ? inventoryItem.count : 0;
                    const reservedCount = reservedThreads[component.inventoryId] || 0;
                    const availableMaterial = Math.max(0, invCount - reservedCount);

                    if (availableMaterial < neededMaterial) {
                        throw new Error(`OutOfStockMaterial:${product.name}:${component.name}`);
                    }
                }
            }

            // 3. Create mock order
            await tx.order.create({
                data: {
                    orderId: `TEST-ORD-${orderIdSuffix}-${Date.now()}`,
                    client: 'Test Client',
                    design: 'Test Design',
                    items: itemsList,
                    totalAmount: 120.00,
                    paymentMethod: 'wallet',
                    paymentStatus: 'paid',
                    status: 'In Queue',
                    userId: testUser.id,
                }
            });

            // 4. Update Product
            await tx.product.update({
                where: { id: testProduct.id },
                data: {
                    reservedCount: { increment: needed }
                }
            });

            console.log(`[Tx ${orderIdSuffix}] Finished checks, committing...`);
            return `Success:${orderIdSuffix}`;
        });
    };

    console.log('Launching concurrent requests...');
    const results = await Promise.allSettled([
        executeCheckoutTx('A', 5),
        executeCheckoutTx('B', 5)
    ]);

    console.log('\nResults:');
    results.forEach(res => {
        if (res.status === 'fulfilled') {
            console.log(`Success: ${res.value}`);
        } else {
            console.log(`Failed: ${res.reason.message}`);
        }
    });

    const finalProduct = await prisma.product.findUnique({ where: { id: testProduct.id } });
    console.log(`\nFinal product reservedCount: ${finalProduct.reservedCount}`);

    const succeededCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected' && r.reason.message.includes('OutOfStockMaterial')).length;

    if (succeededCount !== 1 || failedCount !== 1 || finalProduct.reservedCount !== 5) {
        throw new Error(`Concurrency test failed: succeededCount=${succeededCount}, failedCount=${failedCount}, reservedCount=${finalProduct.reservedCount}`);
    }
    console.log('\n>>> CONCURRENCY TEST PASSED! Exactly one order succeeded, and exactly one failed due to OutOfStockMaterial. No double booking.');

    console.log('\n--- Testing Self-Healing Reconciliation & Dynamic Resolution ---');
    
    // Reset thread inventory to 100 to ensure recipe check does not throttle availableStock to 0
    await prisma.inventory.update({
        where: { id: testInventory.id },
        data: { count: 100 }
    });

    // 1. Artificially corrupt the reservedCount database column to trigger drift simulation
    console.log('Artificially corrupting database column reservedCount to 99...');
    await prisma.product.update({
        where: { id: testProduct.id },
        data: { reservedCount: 99 }
    });

    const corruptedProduct = await prisma.product.findUnique({ where: { id: testProduct.id } });
    console.log(`Corrupted value in database: ${corruptedProduct.reservedCount}`);
    if (corruptedProduct.reservedCount !== 99) throw new Error('Failed to set corrupted value');

    // 2. Test that enrichProductsWithStock resolves dynamic count correctly (ignores corrupt value in DB)
    const [enrichedCorrupted] = await enrichProductsWithStock([corruptedProduct]);
    // The testProduct has count = 10, real reservations = 5. Available stock should be 10 - 5 = 5.
    // If it used the corrupted value of 99, available stock would be 0.
    console.log(`Dynamic availableStock (ignores DB column): ${enrichedCorrupted.availableStock}`);
    if (enrichedCorrupted.availableStock !== 5) {
        throw new Error(`Dynamic stock calculation failed: expected 5, got ${enrichedCorrupted.availableStock}`);
    }
    console.log('>>> Dynamic calculation resolved stock correctly (ignoring DB corruption)!');

    // 3. Trigger reconciliation to self-heal the database column
    console.log('Running reconcileReservedCounts() to repair database column...');
    await reconcileReservedCounts(prisma);

    const repairedProduct = await prisma.product.findUnique({ where: { id: testProduct.id } });
    console.log(`Repaired value in database: ${repairedProduct.reservedCount}`);
    if (repairedProduct.reservedCount !== 5) {
        throw new Error(`Self-healing reconciliation failed: expected database column to be 5, got ${repairedProduct.reservedCount}`);
    }
    console.log('>>> Database column repaired and reconciled successfully!');

    // Cleanup at the end
    await prisma.order.deleteMany({
        where: { client: 'Test Client' }
    });
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
}).then(() => process.exit(0));
