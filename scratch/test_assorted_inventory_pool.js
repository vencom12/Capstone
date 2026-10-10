require('dotenv').config();
const prisma = require('../utils/prisma');
const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const dataStr = postData ? JSON.stringify(postData) : null;
    if (dataStr) {
      options.headers['Content-Length'] = Buffer.byteLength(dataStr);
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

async function runTest() {
  console.log('🧪 Testing Unified Pooled Inventory for Assorted Supplies...');

  // 1. Create a test product with 10 pcs pooled stock, and 3 color variants without individual stock
  const testProd = await prisma.product.create({
    data: {
      name: 'TEST Assorted Towel Item',
      price: 250,
      count: 10,
      reservedCount: 0,
      tag: 'Towels',
      variants: [
        { name: 'Pastel Pink', color: '#ffc0cb' },
        { name: 'Navy Blue', color: '#000080' },
        { name: 'Emerald Green', color: '#50c878', stock: 0 } // Legacy 0 stock shouldn't block checkout
      ]
    }
  });

  let testUser = await prisma.user.findFirst({ where: { isEmailVerified: true } });
  if (!testUser) {
    testUser = await prisma.user.findFirst();
    if (testUser) {
      testUser = await prisma.user.update({
        where: { id: testUser.id },
        data: { isEmailVerified: true, walletBalance: 1000 }
      });
    }
  } else {
    testUser = await prisma.user.update({
      where: { id: testUser.id },
      data: { walletBalance: 1000 }
    });
  }
  if (!testUser) throw new Error('No user found');

  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { id: testUser.id, role: testUser.role, email: testUser.email, tokenVersion: testUser.tokenVersion },
    process.env.JWT_SECRET || 'your_fallback_secret'
  );

  try {
    // 2. Submit online order for "Emerald Green" (which had legacy 0 stock)
    console.log('\n▶️ Test 1: Online Order for Assorted Color Variant (Legacy Stock 0)');
    const orderRes = await makeRequest({
      hostname: 'localhost',
      port: 5001,
      path: '/api/customer/order/submit',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `token=${token}`
      }
    }, {
      items: [
        {
          productId: testProd.id,
          name: testProd.name,
          price: 250,
          quantity: 2,
          selectedVariant: 'Emerald Green',
          personalization: { text: 'REVIN' }
        }
      ],
      paymentMethod: 'wallet',
      address: 'Test Address Pacific Mall'
    });

    console.log(`  🔎 Order Submit Status: ${orderRes.status}`);
    if (orderRes.status === 200 || orderRes.status === 201) {
      console.log('  ✅ Passed: Order succeeded despite variant having no isolated stock!');
      const updatedProd = await prisma.product.findUnique({ where: { id: testProd.id } });
      console.log(`  🔎 Product Reserved Count: ${updatedProd.reservedCount} (Expected: 2)`);
      if (updatedProd.reservedCount !== 2) {
        throw new Error('Reserved count mismatch');
      }

      // Check the created order record
      const createdOrder = await prisma.order.findUnique({
        where: { orderId: orderRes.body.order.orderId }
      });
      console.log(`  🔎 Order Design String: "${createdOrder.design}"`);

      if (
        createdOrder.design.includes('Emerald Green') &&
        createdOrder.design.includes('REVIN')
      ) {
        console.log('  ✅ Passed: Clean, confident single variant purchase verified on order records & stubs!');
      } else {
        throw new Error('Variant was not saved correctly to order');
      }

      // Clean up order
      await prisma.order.delete({ where: { id: createdOrder.id } });
    } else {
      console.error('Order failed:', orderRes.body);
      throw new Error(`Order failed with status ${orderRes.status}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ASSORTED POOLED INVENTORY TEST PASSED 100%!');
    console.log('======================================================\n');
  } finally {
    await prisma.product.delete({ where: { id: testProd.id } }).catch(() => {});
  }
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
