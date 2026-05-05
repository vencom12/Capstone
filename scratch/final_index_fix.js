const { MongoClient } = require('mongodb');
const uri = 'mongodb://127.0.0.1:27017';

async function run() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        
        const admin = client.db().admin();
        const dbs = await admin.listDatabases();
        
        for (const dbInfo of dbs.databases) {
            const dbName = dbInfo.name;
            const db = client.db(dbName);
            const collections = await db.listCollections().toArray();
            
            for (const col of collections) {
                if (col.name === 'transactions') {
                    console.log(`Found "transactions" in database: ${dbName}`);
                    const collection = db.collection('transactions');
                    const indexes = await collection.indexes();
                    console.log(`- Indexes:`, indexes.map(i => i.name));
                    
                    if (indexes.find(idx => idx.name === 'receiptId_1')) {
                        await collection.dropIndex('receiptId_1');
                        console.log(`[FIXED] Dropped stale index "receiptId_1" in ${dbName}.transactions`);
                    }
                }
            }
        }
        
        await client.close();
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
