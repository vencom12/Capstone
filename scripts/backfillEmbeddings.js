require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { generateEmbedding } = require('../utils/embeddingClient');

const prisma = new PrismaClient();

async function backfillEmbeddings() {
    try {
        console.log('Starting RAG Semantic Search backfill for existing products...');
        
        const products = await prisma.product.findMany();
        console.log(`Found ${products.length} products to process.`);

        let successCount = 0;
        let failCount = 0;

        for (const product of products) {
            try {
                const textToEmbed = `${product.name} ${product.tag || ''} ${product.description || ''}`;
                const embedding = await generateEmbedding(textToEmbed);
                
                if (embedding) {
                    await prisma.$executeRaw`UPDATE "Product" SET embedding = ${embedding}::vector WHERE id = ${product.id}`;
                    successCount++;
                    console.log(`[SUCCESS] Embedded: ${product.name}`);
                } else {
                    failCount++;
                    console.log(`[FAILED] Embedding returned null for: ${product.name}`);
                }
            } catch (err) {
                failCount++;
                console.error(`[ERROR] Failed to embed ${product.name}:`, err.message);
            }
        }

        console.log(`\nBackfill Complete. Success: ${successCount} | Failed: ${failCount}`);
    } catch (e) {
        console.error('Fatal error during backfill:', e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

backfillEmbeddings();
