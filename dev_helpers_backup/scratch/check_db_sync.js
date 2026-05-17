require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
    console.log("--- STITCH-OPT DIAGNOSTICS ---");
    console.log("DB_TYPE from .env:", process.env.DB_TYPE);
    console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);
    
    if (process.env.DB_TYPE !== 'postgres') {
        console.log("!!! WARNING: System is NOT in postgres mode. It is in:", process.env.DB_TYPE || 'mongodb (default)');
    }

    try {
        console.log("Attempting to connect to Supabase...");
        const result = await prisma.$queryRaw`SELECT count(*) as count FROM "Order"`;
        console.log("SUCCESS! Connected to Supabase.");
        console.log("Orders found in database:", result[0].count);
    } catch (err) {
        console.error("CONNECTION FAILED:", err.message);
        if (err.message.includes("does not exist")) {
            console.log("TIP: The 'Order' table exists in Supabase but Prisma doesn't see it locally. Try running 'npx prisma generate'");
        }
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
