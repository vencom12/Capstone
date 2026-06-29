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

    let prodWithImage;
    let prodWithPlaceholder;

    // Run creation inside the tenant context so they get the correct tenantId in the DB
    await tenantStorage.run(adminUser.tenantId, async () => {
        console.log("Creating test products under correct tenant context: one with image, one with placeholder...");
        
        // Clean up any existing test items
        await prisma.product.deleteMany({
            where: {
                name: { in: ["Test Product With Image", "Test Product With Placeholder"] }
            }
        });

        prodWithImage = await prisma.product.create({
            data: {
                name: "Test Product With Image",
                price: 10.00,
                imageUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg"
            }
        });

        prodWithPlaceholder = await prisma.product.create({
            data: {
                name: "Test Product With Placeholder",
                price: 20.00,
                imageUrl: "https://via.placeholder.com/200" // default placeholder
            }
        });
    });

    console.log(`Created products:`);
    console.log(`- ${prodWithImage.name} (ID: ${prodWithImage.id}, Image: ${prodWithImage.imageUrl})`);
    console.log(`- ${prodWithPlaceholder.name} (ID: ${prodWithPlaceholder.id}, Image: ${prodWithPlaceholder.imageUrl})`);

    // Part 1: Test that the prompt context successfully contains the imageurl and is parsed correctly.
    // Part 2: Test the XML parser with mock model response
    console.log("\n--- PART 1: Testing XML Resiliency Parser ---");
    
    const rawContent = `I am deleting the products without pictures.
<function=deleteProduct>{"productId":"${prodWithPlaceholder.id}"}</function>
<function name="deleteProduct">{"productId":"dummy-id-for-attr"}</function>
<function(deleteProduct) = {"productId":"dummy-id-for-original"}></function>`;

    console.log("Testing matches for all three patterns in raw content...");
    const matches = [];

    // Pattern 1: <function(funcName) = {args}></function>
    const regex1 = /<function\((\w+)\)\s*=\s*({.*?})\s*><\/function>/g;
    let match;
    while ((match = regex1.exec(rawContent)) !== null) {
        matches.push({ fullMatch: match[0], name: match[1], argsStr: match[2] });
    }

    // Pattern 2: <function=funcName>{args}</function>
    const regex2 = /<function=(\w+)>\s*({.*?})\s*<\/function>/g;
    while ((match = regex2.exec(rawContent)) !== null) {
        matches.push({ fullMatch: match[0], name: match[1], argsStr: match[2] });
    }

    // Pattern 3: <function name="funcName">{args}</function>
    const regex3 = /<function\s+name=["'](\w+)["']>\s*({.*?})\s*<\/function>/g;
    while ((match = regex3.exec(rawContent)) !== null) {
        matches.push({ fullMatch: match[0], name: match[1], argsStr: match[2] });
    }

    console.log("Total XML calls parsed:", matches.length);
    matches.forEach((m, idx) => {
        console.log(`Match #${idx + 1}: Name="${m.name}" Args="${m.argsStr}"`);
    });

    if (matches.length === 3) {
        console.log("SUCCESS: XML parser regex matched all three formatting patterns!");
    } else {
        console.log("FAILURE: XML parser missed some patterns.");
    }

    console.log("\n--- PART 2: Executing Live Chat Prompt ---");
    console.log("Asking AI to delete products without pictures. This will call the Groq model...");

    const req = {
        body: {
            message: `Please look at the product catalog. Locate "Test Product With Placeholder" (ID: ${prodWithPlaceholder.id}) and "Test Product With Image" (ID: ${prodWithImage.id}). Delete the one that does not have a real picture (only placeholder). Output only the deletion function call.`,
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
            console.log("\nGroq Response Details:");
            console.log(JSON.stringify(data, null, 2));

            // Verify database state under tenant context
            let checkPlaceholder;
            let checkImage;
            await tenantStorage.run(adminUser.tenantId, async () => {
                checkPlaceholder = await prisma.product.findUnique({ where: { id: prodWithPlaceholder.id } });
                checkImage = await prisma.product.findUnique({ where: { id: prodWithImage.id } });
            });

            console.log("\n--- DATABASE INTEGRITY CHECK ---");
            console.log("Product with placeholder exists?", !!checkPlaceholder);
            console.log("Product with image exists?", !!checkImage);

            if (!checkPlaceholder && checkImage) {
                console.log("SUCCESS: AI successfully identified and deleted the product with placeholder image, while preserving the product with a real image!");
            } else {
                console.log("FAILURE: Incorrect database state after AI execution.");
            }

            // Cleanup the remaining test product under tenant context
            console.log("Cleaning up remaining products...");
            await tenantStorage.run(adminUser.tenantId, async () => {
                await prisma.product.deleteMany({
                    where: {
                        id: { in: [prodWithPlaceholder.id, prodWithImage.id] }
                    }
                });
            });
        },
        status: (code) => {
            console.log("STATUS:", code);
            return res;
        }
    };

    // Run the chat function in tenant context
    await tenantStorage.run(adminUser.tenantId, async () => {
        await aiController.chat(req, res);
    });
}

run().catch(err => {
    console.error("Test error:", err);
    process.exit(1);
});
