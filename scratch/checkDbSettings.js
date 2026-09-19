const prisma = require('../utils/prisma');

async function checkSettings() {
    try {
        const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        console.log("Global SystemSettings:", settings);
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkSettings();
