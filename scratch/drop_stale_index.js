const mongoose = require('mongoose');
const uri = 'mongodb://127.0.0.1:27017/Ryven';

async function run() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');
        
        // List all databases
        const admin = mongoose.connection.db.admin();
        const dbs = await admin.listDatabases();
        console.log('Databases:', dbs.databases.map(d => d.name));

        for (const dbInfo of dbs.databases) {
            const dbName = dbInfo.name;
            const db = mongoose.connection.useDb(dbName).db;
            const collections = await db.listCollections().toArray();
            const names = collections.map(c => c.name);
            
            if (names.includes('transactions')) {
                console.log(`Found "transactions" in database: ${dbName}`);
                const collection = db.collection('transactions');
                const indexes = await collection.indexes();
                console.log(`Indexes in ${dbName}.transactions:`, indexes.map(i => i.name));
                
                if (indexes.find(idx => idx.name === 'receiptId_1')) {
                    await collection.dropIndex('receiptId_1');
                    console.log(`Successfully dropped receiptId_1 in ${dbName}`);
                }
            }
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
