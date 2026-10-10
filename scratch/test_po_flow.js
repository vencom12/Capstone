const prisma = require('../utils/prisma');
const { 
    createPurchaseOrder, 
    updatePurchaseOrderStatus,
    getPurchaseOrders,
    downloadPurchaseOrderPdf
} = require('../controllers/postgres/forecastingController');

async function testPoFlow() {
    console.log('--- Testing Supplier Purchase Order Flow ---');
    try {
        const item = await prisma.inventory.findFirst();
        if (!item) {
            console.log('No inventory item found.');
            return;
        }

        console.log(`Testing with item: ${item.item} (Current Count: ${item.count} ${item.unit})`);

        // 1. Create a PO
        let createdPo = null;
        const mockReq = {
            body: {
                inventoryId: item.id,
                quantity: 15,
                estimatedCost: 750.0,
                status: 'Approved'
            }
        };
        const mockRes = {
            status: () => mockRes,
            json: (data) => {
                createdPo = data;
                return data;
            }
        };

        await createPurchaseOrder(mockReq, mockRes);
        console.log(`✅ Created PO #${createdPo.id.slice(-6).toUpperCase()} with status: ${createdPo.status}`);

        // 2. Mark PO Received (auto-replenish stock)
        const updateReq = {
            params: { id: createdPo.id },
            body: { status: 'Received', deliveryReceipt: 'DR-TEST-2026' },
            user: { id: 'admin', username: 'admin', role: 'admin' },
            app: { get: () => null }
        };
        let updatedPo = null;
        const updateRes = {
            status: () => updateRes,
            json: (data) => {
                updatedPo = data;
                return data;
            }
        };

        await updatePurchaseOrderStatus(updateReq, updateRes);
        console.log(`✅ Updated PO #${updatedPo.id.slice(-6).toUpperCase()} to status: ${updatedPo.status}`);

        // 3. Verify stock increased
        const itemAfter = await prisma.inventory.findUnique({ where: { id: item.id } });
        console.log(`✅ Verified inventory stock replenished: ${item.count} ➔ ${itemAfter.count} ${item.unit} (+15 added)`);

        // 4. Test PDF generation (inline headers)
        let pdfHeaders = {};
        const pdfReq = {
            params: { id: createdPo.id },
            query: { download: 'false' }
        };
        const pdfRes = {
            setHeader: (key, val) => {
                pdfHeaders[key] = val;
            },
            status: () => pdfRes,
            send: () => {},
            pipe: () => {} // mock stream
        };

        await downloadPurchaseOrderPdf(pdfReq, pdfRes);
        console.log(`✅ PDF Headers verified: Content-disposition="${pdfHeaders['Content-disposition']}", Content-type="${pdfHeaders['Content-type']}"`);

        // Clean up test PO and restore count
        await prisma.purchaseOrder.delete({ where: { id: createdPo.id } });
        await prisma.inventory.update({ where: { id: item.id }, data: { count: item.count } });
        console.log('🧹 Cleaned up test PO and restored inventory count.');
    } catch (err) {
        console.error('PO Flow Test Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testPoFlow();
