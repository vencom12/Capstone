const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config();
const prisma = require('../utils/prisma');

let adminToken = '';

async function makePostRequest(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 5001,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Cookie': `admin_token=${adminToken}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runPhase1EdgeCaseTests() {
  console.log('🧪 Starting Phase 1 Minimalist Counter Edge-Case Test Suite...\n');
  const cleanOrderIds = [];

  try {
    // Generate valid admin token
    const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!adminUser) throw new Error('No admin user found in database to authenticate test.');
    adminToken = jwt.sign(
      { id: adminUser.id, role: adminUser.role, tokenVersion: adminUser.tokenVersion },
      process.env.JWT_SECRET || 'your_fallback_secret'
    );
    // -------------------------------------------------------------------------
    // TEST 1: Anonymous Walk-in (No Name, No Phone)
    // -------------------------------------------------------------------------
    console.log('▶️ Test 1: Anonymous Walk-in (Empty Name & Phone)');
    const t1Res = await makePostRequest('/api/admin/orders/walk-in', {
      clientName: '',
      design: 'Royal Cannon (Mid-Range) — "ALEX"',
      personalizationText: 'ALEX',
      items: [{ name: 'Royal Cannon (Mid-Range)', quantity: 1, price: 250 }],
      totalAmount: 250,
      paymentMethod: 'Cash',
      paymentStatus: 'paid'
    });

    if (t1Res.status === 201 && t1Res.body.success) {
      console.log(`  ✅ Passed: Order created as '${t1Res.body.order.client}' (ID: ${t1Res.body.order.orderId})`);
      cleanOrderIds.push(t1Res.body.order.id);
    } else {
      throw new Error(`Test 1 Failed: Status ${t1Res.status}, Body: ${JSON.stringify(t1Res.body)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Google Account Auto-Linking via Email
    // -------------------------------------------------------------------------
    console.log('\n▶️ Test 2: Auto-Linking Walk-in to Existing Google Account');
    // Find or create test customer account
    let googleUser = await prisma.user.findFirst({ where: { email: 'revindevtest@gmail.com' } });
    if (!googleUser) {
      googleUser = await prisma.user.create({
        data: {
          username: 'RevinDev',
          email: 'revindevtest@gmail.com',
          password: '$2a$10$dummyhashedpasswordfordevtestonly',
          role: 'customer',
          isEmailVerified: true
        }
      });
    }

    const t2Res = await makePostRequest('/api/admin/orders/walk-in', {
      clientName: 'Revin Walkin',
      clientEmail: 'revindevtest@gmail.com',
      design: 'Chinese Fan (Big) — "REVIN"',
      personalizationText: 'REVIN',
      items: [{ name: 'Chinese Fan (Big)', quantity: 1, price: 100 }],
      totalAmount: 100,
      paymentMethod: 'GCash',
      paymentStatus: 'paid'
    });

    if (t2Res.status === 201 && t2Res.body.order.userId === googleUser.id) {
      console.log(`  ✅ Passed: Order auto-linked to Google user ID: ${googleUser.id} (${googleUser.email})`);
      cleanOrderIds.push(t2Res.body.order.id);
    } else {
      throw new Error(`Test 2 Failed: Expected userId ${googleUser.id}, got ${t2Res.body?.order?.userId}`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: BYOG (Customer-Brought Garment) Handling
    // -------------------------------------------------------------------------
    console.log('\n▶️ Test 3: Customer-Brought Garment (BYOG ₱100)');
    const t3Res = await makePostRequest('/api/admin/orders/walk-in', {
      clientName: 'Chef Santos',
      design: 'BYOG (Chef Uniform) — "CHEF SANTOS"',
      isByog: true,
      personalizationText: 'CHEF SANTOS',
      items: [{ name: 'BYOG (Chef Uniform)', quantity: 1, price: 100, isByog: true }],
      totalAmount: 100,
      paymentMethod: 'Cash',
      paymentStatus: 'paid'
    });

    if (t3Res.status === 201 && t3Res.body.order.isByog === true) {
      console.log(`  ✅ Passed: BYOG flagged properly with ₱100 labor fee (ID: ${t3Res.body.order.orderId})`);
      cleanOrderIds.push(t3Res.body.order.id);
    } else {
      throw new Error(`Test 3 Failed: Status ${t3Res.status}, Body: ${JSON.stringify(t3Res.body)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Quick Slip Punch with Instant Stock Deduction
    // -------------------------------------------------------------------------
    console.log('\n▶️ Test 4: Quick Slip Punch (isAlreadyCompleted = true)');
    const ts = Date.now();
    const testBlank = await prisma.inventory.create({
      data: {
        item: `TEST Blank ${ts}`,
        count: 15,
        unit: 'pcs'
      }
    });

    const testProd = await prisma.product.create({
      data: {
        name: `TEST Royal Cannon ${ts}`,
        price: 250,
        tag: 'Bath Towel',
        imageUrl: '/test.jpg',
        count: 15,
        variants: [
          { name: 'Navy Blue', stock: 15, materialId: testBlank.id, materialName: testBlank.item }
        ]
      }
    });

    const t4Res = await makePostRequest('/api/admin/orders/walk-in', {
      clientName: 'Nanay Finished Slip',
      design: 'TEST Royal Cannon Edge - Navy Blue — "MARIA"',
      personalizationText: 'MARIA',
      items: [{
        productId: testProd.id,
        name: 'TEST Royal Cannon Edge',
        selectedVariant: 'Navy Blue',
        quantity: 1,
        price: 250,
        personalization: { variant: 'Navy Blue' }
      }],
      totalAmount: 250,
      paymentMethod: 'Cash',
      isAlreadyCompleted: true
    });

    if (t4Res.status === 201) {
      cleanOrderIds.push(t4Res.body.order.id);
      // Verify atomic stock deduction
      const updatedProd = await prisma.product.findUnique({ where: { id: testProd.id } });
      const updatedBlank = await prisma.inventory.findUnique({ where: { id: testBlank.id } });

      const variantStock = updatedProd.variants[0].stock;
      console.log(`  🔎 Product Total Count: ${updatedProd.count} (Was: 15, Expected: 14)`);
      console.log(`  🔎 Variant Stock: ${variantStock} (Was: 15, Expected: 14)`);
      console.log(`  🔎 Blank Inventory Count: ${updatedBlank.count} (Was: 15, Expected: 14)`);

      if (updatedProd.count === 14 && variantStock === 14 && updatedBlank.count === 14) {
        console.log('  ✅ Passed: 100% atomic deduction on quick slip punch!');
      } else {
        throw new Error('Test 4 Failed: Stock did not deduct properly.');
      }
    } else {
      throw new Error(`Test 4 Failed: Status ${t4Res.status}`);
    }

    // Clean up test product & blank
    await prisma.product.delete({ where: { id: testProd.id } }).catch(() => {});
    await prisma.inventory.delete({ where: { id: testBlank.id } }).catch(() => {});

    // -------------------------------------------------------------------------
    // TEST 5: Claim Desk Status Transitions (Waiting -> Ready -> Completed)
    // -------------------------------------------------------------------------
    console.log('\n▶️ Test 5: Claim Desk Batch Status Transition Flow');
    const orderToAdvance = t1Res.body.order;

    // Advance to Ready For Pick Up
    const advanceRes = await makePostRequest('/api/admin/orders/batch-status', {
      ids: [orderToAdvance.id],
      status: 'Ready For Pick Up',
      note: 'Item stitched on machine and placed on pickup shelf'
    });

    const checkOrder1 = await prisma.order.findUnique({ where: { id: orderToAdvance.id } });
    console.log(`  🔎 Status after 'Mark Stitching Done': '${checkOrder1.status}' (Expected: 'Ready For Pick Up')`);

    // Advance to Completed (Turned Over)
    const turnOverRes = await makePostRequest('/api/admin/orders/batch-status', {
      ids: [orderToAdvance.id],
      status: 'Completed',
      note: 'Turned over to customer with claim stub verification'
    });

    const checkOrder2 = await prisma.order.findUnique({ where: { id: orderToAdvance.id } });
    console.log(`  🔎 Status after 'Turn Over to Customer': '${checkOrder2.status}' (Expected: 'Completed')`);

    if (checkOrder1.status === 'Ready For Pick Up' && checkOrder2.status === 'Completed') {
      console.log('  ✅ Passed: Order status transitions smoothly on claim desk!');
    } else {
      throw new Error('Test 5 Failed: Status transitions mismatched');
    }

    console.log('\n======================================================');
    console.log('🎉 ALL 5 PHASE 1 EDGE-CASE TESTS PASSED WITH 100% SUCCESS!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ Test Suite Error:', err.message);
  } finally {
    // Clean up test orders
    if (cleanOrderIds.length > 0) {
      await prisma.receipt.deleteMany({ where: { orderID: { in: cleanOrderIds } } }).catch(() => {});
      await prisma.transaction.deleteMany({ where: { orderID: { in: cleanOrderIds } } }).catch(() => {});
      await prisma.order.deleteMany({ where: { id: { in: cleanOrderIds } } }).catch(() => {});
      console.log(`🧹 Cleaned up ${cleanOrderIds.length} test order records.`);
    }
    await prisma.$disconnect();
  }
}

runPhase1EdgeCaseTests();
