require('dotenv').config();
const prisma = require('../utils/prisma');
const aiController = require('../controllers/postgres/aiController');
const tenantStorage = require('../utils/tenantContext');

async function run() {
    console.log("Fetching an admin user from database...");
    const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!adminUser) {
        console.error("No admin user found in DB to mock request.");
        return;
    }

    // Clean up any existing test products with these names first
    console.log("Cleaning up any existing test products...");
    await prisma.product.deleteMany({
        where: {
            tenantId: adminUser.tenantId,
            name: { in: ["Silk Hoodie", "Classic Cap", "Leather Vest"] }
        }
    });

    const req = {
        body: {
            message: "Create three new products: Silk Hoodie at price 49.99 (tag: Hoodies, description: Fine silk), Classic Cap at price 14.50 (tag: Caps, description: Cotton fit), and Leather Vest at price 79.99 (tag: Outerwear, description: Faux leather).",
            history: []
        },
        user: {
            id: adminUser.id,
            role: adminUser.role
        },
        app: {
            get: (key) => {
                if (key === 'io') {
                    return {
                        emit: (event, data) => console.log(`[SOCKET EMIT] ${event}:`, JSON.stringify(data).substring(0, 100) + "...")
                    };
                }
                return null;
            }
        }
    };

    const res = {
        json: async (data) => {
            console.log("RESPONSE JSON:", JSON.stringify(data, null, 2));
            
            // Verify if products were created in the database
            const products = await prisma.product.findMany({
                where: {
                    tenantId: adminUser.tenantId,
                    name: { in: ["Silk Hoodie", "Classic Cap", "Leather Vest"] }
                }
            });
            console.log("\n--- VERIFICATION RESULT ---");
            console.log(`Expected 3 products, found in database: ${products.length}`);
            products.forEach(p => {
                console.log(`- Product: "${p.name}", Price: $${p.price}, Tag: "${p.tag}", Description: "${p.description}"`);
            });
            if (products.length === 3) {
                console.log("SUCCESS: Bulk creation verified successfully!");
            } else {
                console.log("FAILURE: Not all products were created.");
            }
        },
        status: (code) => {
            console.log("STATUS CODE:", code);
            return res;
        }
    };

    console.log("Calling aiController.chat with admin user:", adminUser.username);
    // Run in the tenant context of the admin user
    await tenantStorage.run(adminUser.tenantId, async () => {
        await aiController.chat(req, res);
    });
}

run().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
