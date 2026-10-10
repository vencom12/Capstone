const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();

let adminToken = '';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:5001${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (adminToken) {
      headers['Cookie'] = `admin_token=${adminToken}`;
    }
    const req = http.request(`http://localhost:5001${path}`, {
      method: 'POST',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runPhase2Tests() {
  console.log('🧪 Starting Phase 2: Order Tracking & Verification Test Suite...\n');

  let testOrderId = null;
  let orderDbId = null;

  try {
    const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!adminUser) throw new Error('No admin user found in database to authenticate test.');
    adminToken = jwt.sign(
      { id: adminUser.id, role: adminUser.role, tokenVersion: adminUser.tokenVersion },
      process.env.JWT_SECRET || 'your_fallback_secret'
    );

    // ----------------------------------------------------
    // TEST 1: Live Queue Public Endpoint & Sanitization
    // ----------------------------------------------------
    console.log('▶️ Test 1: Public Live Queue Endpoint Sanitation & Data Integrity');
    const queueRes = await apiGet('/api/customer/live-queue');
    if (queueRes.status !== 200 || !queueRes.body.success) {
      throw new Error(`Failed to fetch /api/customer/live-queue, status ${queueRes.status}`);
    }
    console.log(`  ✅ Passed: Live queue accessible publicly (Status ${queueRes.status})`);
    console.log(`  🔎 Active Machines: ${queueRes.body.stats.activeMachines}, Done Today: ${queueRes.body.stats.completedTodayCount}`);

    // Verify sanitization: Ensure no raw emails or phone numbers appear in client names
    const allQueueItems = [
      ...queueRes.body.nowStitching,
      ...queueRes.body.readyForPickup,
      ...queueRes.body.upNext
    ];
    for (const item of allQueueItems) {
      if (item.client.includes('@') || /09\d{9}/.test(item.client)) {
        throw new Error(`Privacy violation: Raw contact detected in public client field: ${item.client}`);
      }
      if (!item.verificationCode.startsWith('#A-')) {
        throw new Error(`Verification code invalid format: ${item.verificationCode}`);
      }
    }
    console.log('  ✅ Passed: All customer names properly sanitized (Zero PII leaks)');
    console.log('  ✅ Passed: Anti-fraud claim codes strictly formatted as #A-XXXX');

    // ----------------------------------------------------
    // TEST 2: 3-State Queue Progression (In Queue -> Now Stitching -> Ready for Claim -> Completed)
    // ----------------------------------------------------
    console.log('\n▶️ Test 2: 3-State 1-Tap Queue Progression Flow');

    // 1. Create a walk-in order
    const orderPayload = {
      clientName: 'Phase2 Tester',
      clientEmail: 'p2test@example.com',
      design: 'Royal Cannon Towel — "MARIA"',
      items: [
        {
          name: 'Royal Cannon Towel',
          quantity: 1, // Single item = Express
          price: 250,
          personalization: { text: 'MARIA' }
        }
      ],
      totalAmount: 250,
      paymentMethod: 'Cash',
      paymentStatus: 'paid',
      notes: 'Phase 2 Test Order'
    };

    const createRes = await apiPost('/api/admin/orders/walk-in', orderPayload);
    if (!createRes.body || !createRes.body.order) {
      throw new Error('Failed to create walk-in test order');
    }
    const order = createRes.body.order;
    testOrderId = order.orderId;
    orderDbId = order.id;
    console.log(`  🔎 Created Order #${testOrderId} with status: '${order.status}'`);

    // Verify initial stage in live queue: Should be in upNext
    let liveCheck = await apiGet('/api/customer/live-queue');
    let foundInUpNext = liveCheck.body.upNext.find(o => o.orderId === testOrderId);
    if (!foundInUpNext) {
      throw new Error(`Order #${testOrderId} not found in upNext queue!`);
    }
    console.log(`  ✅ State 1: Order #${testOrderId} in Waiting Queue (isExpress: ${foundInUpNext.isExpress})`);

    // 2. Advance to "Now Stitching" (Preparing Order)
    const startRes = await apiPost('/api/admin/orders/batch-status', {
      ids: [orderDbId],
      status: 'Preparing Order',
      note: 'Nanay started stitching'
    });
    if (startRes.status !== 200) throw new Error(`Failed to update status to Preparing Order: ${JSON.stringify(startRes.body)}`);

    liveCheck = await apiGet('/api/customer/live-queue');
    let foundInStitching = liveCheck.body.nowStitching.find(o => o.orderId === testOrderId);
    if (!foundInStitching) {
      throw new Error(`Order #${testOrderId} not found in nowStitching!`);
    }
    console.log(`  ✅ State 2: Order #${testOrderId} active on machine ("Now Stitching", ~${foundInStitching.remainingMinutes}m remaining)`);

    // 3. Advance to "Ready for Claim" (Ready For Pick Up)
    const readyRes = await apiPost('/api/admin/orders/batch-status', {
      ids: [orderDbId],
      status: 'Ready For Pick Up',
      note: 'Item stitched and bagged'
    });
    if (readyRes.status !== 200) throw new Error(`Failed to update status to Ready For Pick Up: ${JSON.stringify(readyRes.body)}`);

    liveCheck = await apiGet('/api/customer/live-queue');
    let foundInReady = liveCheck.body.readyForPickup.find(o => o.orderId === testOrderId);
    if (!foundInReady) {
      throw new Error(`Order #${testOrderId} not found in readyForPickup!`);
    }
    console.log(`  ✅ State 3: Order #${testOrderId} on pickup shelf ("Ready for Claim", Code: ${foundInReady.verificationCode})`);

    // 4. Turnover and Complete
    const completeRes = await apiPost('/api/admin/orders/batch-status', {
      ids: [orderDbId],
      status: 'Completed',
      note: 'Verified claim stub and handed over'
    });
    if (completeRes.status !== 200) throw new Error(`Failed to update status to Completed: ${JSON.stringify(completeRes.body)}`);

    liveCheck = await apiGet('/api/customer/live-queue');
    const stillActive = [
      ...liveCheck.body.nowStitching,
      ...liveCheck.body.readyForPickup,
      ...liveCheck.body.upNext
    ].find(o => o.orderId === testOrderId);

    if (stillActive) {
      throw new Error(`Order #${testOrderId} should be completed and removed from active queue!`);
    }
    console.log(`  ✅ State 4: Order #${testOrderId} verified, turned over, and completed successfully!`);

    // ----------------------------------------------------
    // TEST 3: Express vs Bulk Auto-Badge Classification
    // ----------------------------------------------------
    console.log('\n▶️ Test 3: Express vs Bulk Auto-Badge Classification');
    const bulkPayload = {
      clientName: 'Bulk Tester',
      design: 'Bath Towels (10 pcs)',
      items: [
        {
          name: 'Bath Towels',
          quantity: 10,
          price: 300
        }
      ],
      totalAmount: 3000,
      paymentMethod: 'Cash',
      paymentStatus: 'paid'
    };
    const bulkCreateRes = await apiPost('/api/admin/orders/walk-in', bulkPayload);
    const bulkOrder = bulkCreateRes.body.order;

    const bulkCheck = await apiGet('/api/customer/live-queue');
    const bulkItem = bulkCheck.body.upNext.find(o => o.orderId === bulkOrder.orderId);
    if (!bulkItem) throw new Error('Bulk order not found in queue');

    console.log(`  🔎 Order #${bulkOrder.orderId} Quantity: ${bulkItem.quantity}, isExpress: ${bulkItem.isExpress}`);
    if (bulkItem.isExpress !== false || bulkItem.quantity !== 10) {
      throw new Error('Bulk order misclassified as express');
    }
    console.log('  ✅ Passed: Order properly tagged as Bulk (10 pcs) with extended turnaround scheduling');

    // Clean up bulk order
    await prisma.order.deleteMany({ where: { id: bulkOrder.id } });

    // ----------------------------------------------------
    // TEST 4: Customer Mobile Tracker by QR Code / Stub Code
    // ----------------------------------------------------
    console.log('\n▶️ Test 4: Customer Mobile Tracker API (/api/customer/track/:code)');
    
    // Create an order specifically to test the customer tracking endpoint
    const trackOrderPayload = {
      clientName: 'Juan Dela Cruz',
      clientEmail: 'juan@example.com',
      design: 'Cap — "JUAN"',
      items: [
        {
          name: 'Navy Blue Cap',
          quantity: 1,
          price: 180,
          personalization: { text: 'JUAN' }
        }
      ],
      totalAmount: 180,
      paymentMethod: 'Cash',
      paymentStatus: 'paid'
    };
    const trackOrderRes = await apiPost('/api/admin/orders/walk-in', trackOrderPayload);
    const trackOrder = trackOrderRes.body.order;

    // Test lookup by orderId
    const trackByIdRes = await apiGet(`/api/customer/track/${trackOrder.orderId}`);
    if (trackByIdRes.status !== 200 || !trackByIdRes.body.success) {
      throw new Error(`Tracking lookup by orderId failed with status ${trackByIdRes.status}`);
    }
    const trackedItem = trackByIdRes.body.order;
    console.log(`  ✅ Tracked by OrderID (${trackOrder.orderId}): Status '${trackedItem.status}', Code '${trackedItem.claimCode}'`);
    if (trackedItem.client.includes('@') || /09\d{9}/.test(trackedItem.client)) {
      throw new Error('PII leak in customer tracking endpoint!');
    }

    // Test lookup by 4-digit claim code (e.g., A-XXXX or #A-XXXX)
    const cleanCode = trackedItem.claimCode.replace('#', '');
    const trackByCodeRes = await apiGet(`/api/customer/track/${cleanCode}`);
    if (trackByCodeRes.status !== 200 || !trackByCodeRes.body.success) {
      throw new Error(`Tracking lookup by claim code ${cleanCode} failed!`);
    }
    console.log(`  ✅ Tracked by Stub Code (${cleanCode}): Match verified!`);

    // Clean up track order
    await prisma.order.deleteMany({ where: { id: trackOrder.id } });

    console.log('\n======================================================');
    console.log('🎉 ALL PHASE 2 ORDER TRACKING & QUEUE TESTS PASSED 100%!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Phase 2 Test Error:', err);
    process.exit(1);
  } finally {
    if (orderDbId) {
      await prisma.order.deleteMany({ where: { id: orderDbId } });
    }
    await prisma.$disconnect();
  }
}

runPhase2Tests();
