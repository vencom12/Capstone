const prisma = require('../utils/prisma');

async function fixSettings() {
    try {
        const updated = await prisma.systemSettings.upsert({
            where: { id: 'global' },
            update: {
                aiChatModel: 'openai/gpt-oss-120b',
                aiVisionModel: 'qwen/qwen3.6-27b'
            },
            create: {
                id: 'global',
                aiChatModel: 'openai/gpt-oss-120b',
                aiVisionModel: 'qwen/qwen3.6-27b'
            }
        });
        console.log("Successfully updated SystemSettings in DB:", updated);
    } catch (e) {
        console.error("Failed to update settings:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

fixSettings();
