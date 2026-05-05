const { MongoClient } = require('mongodb');

async function dropStaleIndex() {
    const client = new MongoClient('mongodb://127.0.0.1:27017');
    await client.connect();
    
    const adminDb = client.db().admin();
    const dbs = await adminDb.listDatabases();
    
    for (const dbInfo of dbs.databases) {
        const db = client.db(dbInfo.name);
        const collections = await db.listCollections().toArray();
        
        for (const col of collections) {
            if (col.name === 'transactions') {
                const collection = db.collection('transactions');
                const indexes = await collection.indexes();
                
                for (const idx of indexes) {
                    if (idx.name === 'receiptId_1') {
                        console.log(`>>> DROPPING receiptId_1 from ${dbInfo.name}.transactions`);
                        await collection.dropIndex('receiptId_1');
                        console.log(`    DONE.`);
                    }
                }
            }
        }
    }
    
    console.log('\n=== Finished scanning all databases ===');
    await client.close();
}

dropStaleIndex().catch(console.error);
