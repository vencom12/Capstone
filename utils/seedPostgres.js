const mongoose = require('mongoose');
const prisma = require('./prisma');
const ProductMongo = require('../models/Product');
const InventoryMongo = require('../models/Inventory');
require('dotenv').config();

async function migrateData() {
    try {
        console.log('>>> STARTING MIGRATION: Mongo -> Postgres <<<');
        
        // Use the URI from .env
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) throw new Error('MONGODB_URI is missing in .env');

        await mongoose.connect(mongoUri);
        console.log('[OK] Connected to MongoDB');

        // 1. Migrate Products
        const products = await ProductMongo.find();
        console.log(`[INFO] Found ${products.length} products in MongoDB.`);
        
        for (const p of products) {
            await prisma.product.upsert({
                where: { id: p._id.toString() }, // Attempt to keep IDs consistent
                update: { 
                    name: p.name, 
                    price: p.price, 
                    tag: p.tag, 
                    description: p.description, 
                    imageUrl: p.imageUrl,
                    views: p.views || 0,
                    createdAt: p.createdAt
                },
                create: { 
                    id: p._id.toString(), 
                    name: p.name, 
                    price: p.price, 
                    tag: p.tag, 
                    description: p.description, 
                    imageUrl: p.imageUrl,
                    views: p.views || 0,
                    createdAt: p.createdAt
                }
            });
        }
        console.log('[OK] Products migrated.');

        // 2. Migrate Inventory
        const inventory = await InventoryMongo.find();
        console.log(`[INFO] Found ${inventory.length} inventory items in MongoDB.`);
        for (const i of inventory) {
            await prisma.inventory.upsert({
                where: { item: i.item },
                update: { count: i.count, unit: i.unit, lastUpdated: i.lastUpdated },
                create: { item: i.item, count: i.count, unit: i.unit, lastUpdated: i.lastUpdated }
            });
        }
        console.log('[OK] Inventory migrated.');

        console.log('>>> MIGRATION COMPLETE! <<<');
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrateData();
