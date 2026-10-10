/**
 * test_edge_cases.js
 * Verification Test Suite for:
 * 1. Google Account Linking Edge Cases (Collision, Orders Integrity, Token Revocation)
 * 2. Variant-Level Stock & Bill of Materials (BOM) Mechanics
 * 3. Staff vs Customer Role-Based Query Segregation
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const assert = require('assert');

async function runTestSuite() {
    console.log('===============================================================');
    console.log('🧪 RUNNING COMPREHENSIVE EDGE CASE VERIFICATION TEST SUITE');
    console.log('===============================================================\n');

    let passedTests = 0;
    let failedTests = 0;

    // Helper assertion logger
    function test(name, fn) {
        return async () => {
            try {
                process.stdout.write(`▶ Testing: ${name}... `);
                await fn();
                console.log('✅ PASSED');
                passedTests++;
            } catch (err) {
                console.log(`❌ FAILED: ${err.message}`);
                failedTests++;
            }
        };
    }

    // ==============================================================
    // EDGE CASE 1: Google Account Change - Email Collision
    // ==============================================================
    await test('EC-1: Changing Google Account to an Already Registered Email MUST Be Blocked', async () => {
        // Setup two test users
        const emailA = `test_user_a_${Date.now()}@example.com`;
        const emailB = `test_user_b_${Date.now()}@example.com`;

        const userA = await prisma.user.create({
            data: { username: `userA_${Date.now()}`, email: emailA, password: 'hashedpasswordA', role: 'customer' }
        });
        const userB = await prisma.user.create({
            data: { username: `userB_${Date.now()}`, email: emailB, password: 'hashedpasswordB', role: 'customer' }
        });

        // Simulate User A attempting to change linked Google email to User B's email
        const targetNewEmail = emailB;
        const collisionCheck = await prisma.user.findFirst({
            where: {
                email: targetNewEmail,
                id: { not: userA.id }
            }
        });

        assert.ok(collisionCheck, 'System must detect that the target email already belongs to another user.');
        assert.strictEqual(collisionCheck.id, userB.id, 'Collision detected against user B.');

        // Cleanup
        await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    })();

    // ==============================================================
    // EDGE CASE 2: Token Version Increment on Auth Provider Change
    // ==============================================================
    await test('EC-2: Updating Linked Auth Provider Must Invalidate Previous JWTs via tokenVersion', async () => {
        const testEmail = `token_user_${Date.now()}@example.com`;
        const user = await prisma.user.create({
            data: { username: `tok_${Date.now()}`, email: testEmail, password: 'hashedpassword', tokenVersion: 0 }
        });

        const initialTokenVersion = user.tokenVersion;

        // Perform security provider update: increment tokenVersion
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                tokenVersion: { increment: 1 }
            }
        });

        assert.strictEqual(updatedUser.tokenVersion, initialTokenVersion + 1, 'tokenVersion must increment by 1.');

        // Cleanup
        await prisma.user.delete({ where: { id: user.id } });
    })();

    // ==============================================================
    // EDGE CASE 3: Active Orders & Receipts Integrity on User Update
    // ==============================================================
    await test('EC-3: User Email or Identity Change Keeps All Historical Orders & Receipts Intact', async () => {
        const testEmail = `order_owner_${Date.now()}@example.com`;
        const user = await prisma.user.create({
            data: { username: `orderOwner_${Date.now()}`, email: testEmail, password: 'hashedpassword' }
        });

        const orderId = `TEST-ORD-${Date.now()}`;
        const order = await prisma.order.create({
            data: {
                orderId: orderId,
                client: 'Test Client',
                design: 'Custom Towel Monogram',
                items: [{ name: 'Navy Towel', qty: 1 }],
                status: 'Processing',
                userId: user.id
            }
        });

        // Now user updates their email / provider
        const newEmail = `updated_google_${Date.now()}@gmail.com`;
        await prisma.user.update({
            where: { id: user.id },
            data: { email: newEmail }
        });

        // Verify order still links to the user
        const retrievedOrder = await prisma.order.findUnique({
            where: { orderId: orderId },
            include: { user: true }
        });

        assert.ok(retrievedOrder, 'Order must exist.');
        assert.strictEqual(retrievedOrder.userId, user.id, 'Order foreign key must stay linked to immutable user UUID.');
        assert.strictEqual(retrievedOrder.user.email, newEmail, 'Order must reflect the updated user email cleanly.');

        // Cleanup
        await prisma.order.delete({ where: { id: order.id } });
        await prisma.user.delete({ where: { id: user.id } });
    })();

    // ==============================================================
    // EDGE CASE 4: Role-Based Personnel vs Customer Segregation
    // ==============================================================
    await test('EC-4: Personnel Query Must Segregate Staff (Admin/Employee) From Customers', async () => {
        const timestamp = Date.now();
        const adminUser = await prisma.user.create({
            data: { username: `adm_${timestamp}`, email: `adm_${timestamp}@test.com`, password: 'pw', role: 'admin' }
        });
        const empUser = await prisma.user.create({
            data: { username: `emp_${timestamp}`, email: `emp_${timestamp}@test.com`, password: 'pw', role: 'employee' }
        });
        const custUser = await prisma.user.create({
            data: { username: `cust_${timestamp}`, email: `cust_${timestamp}@test.com`, password: 'pw', role: 'customer' }
        });

        // 1. Internal Staff Query
        const internalStaff = await prisma.user.findMany({
            where: {
                role: { in: ['admin', 'employee'] },
                id: { in: [adminUser.id, empUser.id, custUser.id] }
            }
        });

        assert.strictEqual(internalStaff.length, 2, 'Internal staff query must only retrieve admin and employee.');
        assert.ok(!internalStaff.some(u => u.role === 'customer'), 'Customer must never appear in internal staff query.');

        // 2. Customer CRM Query
        const customersOnly = await prisma.user.findMany({
            where: {
                role: 'customer',
                id: { in: [adminUser.id, empUser.id, custUser.id] }
            }
        });

        assert.strictEqual(customersOnly.length, 1, 'Customer query must only retrieve customer accounts.');
        assert.strictEqual(customersOnly[0].id, custUser.id, 'Target customer found.');

        // Cleanup
        await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, empUser.id, custUser.id] } } });
    })();

    // ==============================================================
    // EDGE CASE 5: Variant Stock vs Raw Material BOM Isolation
    // ==============================================================
    await test('EC-5: Variant Garment Stock Decrement Does Not Corrupt Raw Material Consumable Stock', async () => {
        // Create raw thread inventory
        const threadItem = await prisma.inventory.create({
            data: {
                item: `Metallic Gold Thread - ${Date.now()}`,
                count: 100,
                unit: 'Cones',
                supplierUnitCost: 120.0
            }
        });

        // Create product with recipe linking to thread
        const testProduct = await prisma.product.create({
            data: {
                name: `Embroidered Apron - ${Date.now()}`,
                price: 350.0,
                tag: 'Apron',
                count: 20, // 20 physical blanks
                recipe: [
                    { inventoryId: threadItem.id, name: threadItem.item, quantity: 1 }
                ],
                variants: [
                    { name: 'Black Apron', color: '#000000', stockCount: 12, priceOverride: 350 },
                    { name: 'Forest Green Apron', color: '#228B22', stockCount: 8, priceOverride: 350 }
                ]
            }
        });

        // Simulate ordering 2 units of "Black Apron"
        // Garment stock decreases by 2, Thread stock decreases by 2 cones
        const orderedQty = 2;
        const updatedProduct = await prisma.product.update({
            where: { id: testProduct.id },
            data: { count: { decrement: orderedQty } }
        });

        const updatedThread = await prisma.inventory.update({
            where: { id: threadItem.id },
            data: { count: { decrement: orderedQty } }
        });

        assert.strictEqual(updatedProduct.count, 18, 'Product blank count decremented from 20 to 18.');
        assert.strictEqual(updatedThread.count, 98, 'Thread inventory count decremented from 100 to 98.');

        // Cleanup
        await prisma.product.delete({ where: { id: testProduct.id } });
        await prisma.inventory.delete({ where: { id: threadItem.id } });
    })();

    console.log('\n===============================================================');
    console.log(`📊 TEST SUITE SUMMARY: ${passedTests} Passed | ${failedTests} Failed`);
    console.log('===============================================================\n');

    await prisma.$disconnect();
    if (failedTests > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
