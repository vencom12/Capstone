const prisma = require('../utils/prisma');
const { createWalkInOrder } = require('../controllers/postgres/adminController');

async function testWalkInOrderCreation() {
    console.log('--- Testing Walk-In Counter Order Creation ---');
    try {
        const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
        if (!adminUser) {
            console.log('No admin user found to test with.');
            return;
        }

        const mockReq = {
            user: { id: adminUser.id, username: adminUser.username, role: 'admin' },
            body: {
                clientName: 'Test Walk-In Customer',
                clientPhone: '0917-000-0000',
                clientEmail: 'walkin.test@gmail.com',
                design: 'Hand Towel - "Engr. Reyes"',
                items: [
                    {
                        name: 'Hand Towel',
                        quantity: 1,
                        price: 150,
                        isByog: false,
                        personalization: { text: 'Engr. Reyes', threadColor: 'Metallic Gold' }
                    }
                ],
                totalAmount: 150,
                paymentMethod: 'Cash',
                paymentStatus: 'paid',
                isByog: false,
                isRush: false,
                personalizationText: 'Engr. Reyes',
                threadColor: 'Metallic Gold',
                notes: 'Test counter walk-in order'
            },
            app: {
                get: (key) => null // Mock socket instance
            }
        };

        let responseStatusCode = 200;
        let responseJson = null;

        const mockRes = {
            status: (code) => {
                responseStatusCode = code;
                return mockRes;
            },
            json: (data) => {
                responseJson = data;
                return data;
            }
        };

        await createWalkInOrder(mockReq, mockRes);

        console.log(`HTTP Status: ${responseStatusCode}`);
        if (responseJson && responseJson.success && responseJson.order) {
            console.log('✅ Walk-In order created successfully!');
            console.log(`- Order ID: ${responseJson.order.orderId}`);
            console.log(`- Client: ${responseJson.order.client}`);
            console.log(`- Status: ${responseJson.order.status}`);
            console.log(`- Payment: ${responseJson.order.paymentMethod} (${responseJson.order.paymentStatus})`);
            console.log(`- Est. Production Time: ${responseJson.order.estimatedTime} mins`);
            console.log(`- Priority Score: ${responseJson.order.priorityScore}`);

            // Clean up test order
            await prisma.transaction.deleteMany({ where: { orderID: responseJson.order.orderId } });
            await prisma.receipt.deleteMany({ where: { orderID: responseJson.order.orderId } });
            await prisma.order.delete({ where: { id: responseJson.order.id } });
            console.log('🧹 Cleaned up test database row.');
        } else {
            console.log('Response failed:', responseJson);
        }
    } catch (err) {
        console.error('Walk-In Test Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testWalkInOrderCreation();
