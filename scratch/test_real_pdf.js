const fs = require('fs');
const path = require('path');
const prisma = require('../utils/prisma');
const { downloadPurchaseOrderPdf } = require('../controllers/postgres/forecastingController');

async function testRealPdfOutput() {
    try {
        const item = await prisma.inventory.findFirst();
        const po = await prisma.purchaseOrder.create({
            data: {
                inventoryId: item.id,
                quantity: 20,
                estimatedCost: 800.0,
                status: 'Approved'
            }
        });

        const testPdfPath = path.join(__dirname, 'test_po_output.pdf');
        const writeStream = fs.createWriteStream(testPdfPath);

        const mockReq = { params: { id: po.id }, query: { download: 'false' } };
        const mockRes = writeStream;
        mockRes.setHeader = () => {};

        await downloadPurchaseOrderPdf(mockReq, mockRes);

        // Wait a tick for stream write
        await new Promise(r => setTimeout(r, 600));

        const stats = fs.statSync(testPdfPath);
        console.log(`✅ Generated PDF file successfully! Size: ${stats.size} bytes`);
        
        fs.unlinkSync(testPdfPath);
        await prisma.purchaseOrder.delete({ where: { id: po.id } });
        console.log('🧹 Cleaned up temporary test PDF and PO record.');
    } catch (err) {
        console.error('PDF Test Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testRealPdfOutput();
