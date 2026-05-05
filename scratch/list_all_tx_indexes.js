const { MongoClient } = require('mongodb');

async function findAllTransactionIndexes() {
    const client = new MongoClient('mongodb://127.0.0.1:27017');
    await client.connect();
    
    const adminDb = client.db().admin();
    const dbs = await adminDb.listDatabases();
    
    for (const dbInfo of dbs.databases) {
        const db = client.db(dbInfo.name);
        const collections = await db.listCollections().toArray();
        
        for (const col of collections) {
            if (col.name.toLowerCase().includes('transaction')) {
                const collection = db.collection(col.name);
                const indexes = await collection.indexes();
                console.log(`\n[${dbInfo.name}.${col.name}] Indexes:`);
                indexes.forEach(idx => console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} unique=${idx.unique || false}`));
            }
        }
    }
    
    await client.close();
}

findAllTransactionIndexes().catch(console.error);
