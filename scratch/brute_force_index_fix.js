const { MongoClient } = require('mongodb');
const uri = 'mongodb://127.0.0.1:27017';

async function run() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        
        // List of database names to check explicitly
        const dbsToCheck = ['test', 'testDB', 'Ryven', 'RyvenMongo', 'Ryven_db', 'pharmacy', 'Capstone'];
        
        for (const dbName of dbsToCheck) {
            const db = client.db(dbName);
            try {
                // Try to drop the index even if we don't think it's there
                await db.collection('transactions').dropIndex('receiptId_1');
                console.log(`[SUCCESS] Dropped index in ${dbName}.transactions`);
            } catch (e) {
                // console.log(`- ${dbName}.transactions: ${e.message}`);
            }
        }
        
        await client.close();
        console.log('Cleanup attempt finished.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
