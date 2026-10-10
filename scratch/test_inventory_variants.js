const prisma = require('../utils/prisma');
const { handleOrderStateTransition } = require('../utils/inventoryManager');

async function runInventoryVariantTest() {
  console.log('🧪 Starting Inventory & Variant Deduction Verification...');
  
  // 1. Create a dummy test material (Blank Garment)
  const testMaterial = await prisma.inventory.create({
    data: {
      item: `TEST Navy Towel Blank ${Date.now()}`,
      count: 50,
      minThreshold: 5,
      unit: 'pcs'
    }
  });
  console.log(`✅ Step 1: Created test raw material "${testMaterial.item}" with count = 50`);

  // 2. Create a test product with variants linked to that material
  const testProduct = await prisma.product.create({
    data: {
      name: `TEST Custom Towel ${Date.now()}`,
      price: 250,
      count: 20,
      reservedCount: 0,
      variants: [
        {
          name: 'Navy Blue / Standard',
          color: '#000080',
          stock: 15,
          sku: 'TWL-NVY-STD',
          materialId: testMaterial.id,
          materialName: testMaterial.item
        },
        {
          name: 'Classic White / Standard',
          color: '#FFFFFF',
          stock: 5,
          sku: 'TWL-WHT-STD'
        }
      ]
    }
  });
  console.log(`✅ Step 2: Created test product "${testProduct.name}" with 2 variants. Navy stock = 15.`);

  // Find or create a test user
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        username: 'test_artisan_user',
        email: `test_artisan_${Date.now()}@example.com`,
        password: 'password123',
        role: 'customer'
      }
    });
  }

  // 3. Create a test order with status 'In Queue' (Reserved)
  const testOrder = await prisma.order.create({
    data: {
      orderId: `ORD-TEST-${Date.now()}`,
      client: 'Test Client',
      design: testProduct.name,
      status: 'In Queue',
      totalAmount: 500,
      userId: user.id,
      items: [
        {
          productId: testProduct.id,
          name: testProduct.name,
          quantity: 2,
          selectedVariant: 'Navy Blue / Standard'
        }
      ]
    }
  });
  console.log(`✅ Step 3: Created test order ${testOrder.orderId} for 2 pcs of Navy Blue variant.`);

  // 4. Transition order from 'In Queue' to 'Preparing Order' (Processed)
  await prisma.$transaction(async (tx) => {
    await handleOrderStateTransition(tx, testOrder.id, 'Preparing Order', 'Tester');
  });

  // Verify variant stock and raw material were decremented by 2
  const productAfterProcess = await prisma.product.findUnique({ where: { id: testProduct.id } });
  const materialAfterProcess = await prisma.inventory.findUnique({ where: { id: testMaterial.id } });

  const navyVariantAfter = productAfterProcess.variants.find(v => v.name === 'Navy Blue / Standard');
  console.log(`🔎 After Processing: Navy Variant Stock = ${navyVariantAfter.stock} (Expected: 13)`);
  console.log(`🔎 After Processing: Raw Blank Material Count = ${materialAfterProcess.count} (Expected: 48)`);
  console.log(`🔎 After Processing: Overall Product Count = ${productAfterProcess.count} (Expected: 18)`);

  if (navyVariantAfter.stock !== 13 || materialAfterProcess.count !== 48 || productAfterProcess.count !== 18) {
    throw new Error('Deduction assertion failed!');
  }
  console.log('✅ Deduction Verification PASSED!');

  // 5. Transition order to 'Order Canceled' (Rollback)
  await prisma.$transaction(async (tx) => {
    await handleOrderStateTransition(tx, testOrder.id, 'Order Canceled', 'Tester');
  });

  // Verify rollback restored variant stock, material count, and product count
  const productAfterRollback = await prisma.product.findUnique({ where: { id: testProduct.id } });
  const materialAfterRollback = await prisma.inventory.findUnique({ where: { id: testMaterial.id } });

  const navyVariantRollback = productAfterRollback.variants.find(v => v.name === 'Navy Blue / Standard');
  console.log(`🔎 After Rollback: Navy Variant Stock = ${navyVariantRollback.stock} (Expected: 15)`);
  console.log(`🔎 After Rollback: Raw Blank Material Count = ${materialAfterRollback.count} (Expected: 50)`);
  console.log(`🔎 After Rollback: Overall Product Count = ${productAfterRollback.count} (Expected: 20)`);

  if (navyVariantRollback.stock !== 15 || materialAfterRollback.count !== 50 || productAfterRollback.count !== 20) {
    throw new Error('Rollback assertion failed!');
  }
  console.log('✅ Rollback Verification PASSED!');

  // Cleanup test artifacts
  await prisma.order.delete({ where: { id: testOrder.id } });
  await prisma.product.delete({ where: { id: testProduct.id } });
  await prisma.inventory.delete({ where: { id: testMaterial.id } });
  console.log('🧹 Cleaned up test records.');
  console.log('🎉 ALL INVENTORY & VARIANT TESTS COMPLETED SUCCESSFULLY!');
}

runInventoryVariantTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
}).finally(() => {
  prisma.$disconnect();
});
