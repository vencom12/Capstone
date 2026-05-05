const mongoose = require('mongoose');
const uri = 'mongodb://127.0.0.1:27017/test'; // Try 'test' database directly

async function run() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB (test db)');
        
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log('Collections in test:', collections.map(c => c.name));

        if (collections.find(c => c.name === 'transactions')) {
            const collection = db.collection('transactions');
            const indexes = await collection.indexes();
            console.log('Indexes in test.transactions:', indexes.map(i => i.name));
            
            if (indexes.find(idx => idx.name === 'receiptId_1')) {
                await collection.dropIndex('receiptId_1');
                console.log('Successfully dropped stale index: receiptId_1');
            }
        } else {
            console.log('transactions collection not found in "test" database.');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
