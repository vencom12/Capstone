const prisma = require('../utils/prisma');

async function testQuickPunch() {
  console.log('🧪 Testing Quick Slip Punch Backend Flow (Solution 1)...');

  // 1. Create a dummy test garment inventory item
  const testGarment = await prisma.inventory.create({
    data: {
      item: `TEST Towel Blank Slip ${Date.now()}`,
      count: 20,
      minThreshold: 3,
      unit: 'pcs'
    }
  });

  const testProduct = await prisma.product.create({
    data: {
      name: `TEST Embroidered Hand Towel ${Date.now()}`,
      price: 150,
      count: 20,
      variants: [
        {
          name: 'Navy Blue',
          stock: 10,
          materialId: testGarment.id,
          materialName: testGarment.item
        }
      ]
    }
  });

  console.log(`✅ Step 1: Created product with 10 pcs Navy Blue variant, linked to inventory count = 20.`);

  // Find admin user
  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } }) || await prisma.user.findFirst();

  // 2. Simulate what createWalkInOrder does when isAlreadyCompleted: true
  const orderId = `WI-TEST-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date();

  const createdOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderId,
        client: 'Walk-In (SOPHIA)',
        userId: adminUser.id,
        design: `${testProduct.name} — "SOPHIA"`,
        items: [
          {
            productId: testProduct.id,
            name: testProduct.name,
            quantity: 1,
            price: 150,
            selectedVariant: 'Navy Blue'
          }
        ],
        totalAmount: 150,
        paymentMethod: 'Cash',
        paymentStatus: 'paid',
        status: 'In Queue',
        progress: 5,
        address: 'Physical Store (Eds Towels & Caps Pacific Mall Lucena)',
        deliveryTime: 'Completed On-Site',
        notes: `Quick Slip Punch from Nanay's cash tin`
      }
    });

    // Execute state transition to deduct inventory & variant
    const { handleOrderStateTransition } = require('../utils/inventoryManager');
    await handleOrderStateTransition(tx, order.id, 'Completed', 'Shop Assistant');

    return order;
  });

  console.log(`✅ Step 2: Recorded completed order ${createdOrder.orderId} for SOPHIA.`);

  // Verify stock deductions
  const productAfter = await prisma.product.findUnique({ where: { id: testProduct.id } });
  const garmentAfter = await prisma.inventory.findUnique({ where: { id: testGarment.id } });

  const navyVariantAfter = productAfter.variants.find(v => v.name === 'Navy Blue');
  console.log(`🔎 Product Count = ${productAfter.count} (Expected: 19)`);
  console.log(`🔎 Navy Variant Stock = ${navyVariantAfter.stock} (Expected: 9)`);
  console.log(`🔎 Raw Blank Count = ${garmentAfter.count} (Expected: 19)`);

  if (productAfter.count !== 19 || navyVariantAfter.stock !== 9 || garmentAfter.count !== 19) {
    throw new Error('Stock deduction check failed!');
  }
  console.log('🎉 QUICK SLIP PUNCH VERIFICATION PASSED 100%!');

  // Cleanup
  await prisma.order.delete({ where: { id: createdOrder.id } });
  await prisma.product.delete({ where: { id: testProduct.id } });
  await prisma.inventory.delete({ where: { id: testGarment.id } });
  console.log('🧹 Cleaned up test records.');
}

testQuickPunch()
  .catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
