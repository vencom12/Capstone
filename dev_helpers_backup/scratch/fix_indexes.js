const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function fixIndexes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const collections = await mongoose.connection.db.listCollections().toArray();
        const transactionColl = collections.find(c => c.name === 'transactions');
        
        if (transactionColl) {
            console.log('Checking indexes for transactions...');
            const indexes = await mongoose.connection.db.collection('transactions').indexes();
            console.log('Current indexes:', JSON.stringify(indexes, null, 2));
            
            if (indexes.find(i => i.name === 'receiptId_1')) {
                console.log('Dropping stale unique index receiptId_1...');
                await mongoose.connection.db.collection('transactions').dropIndex('receiptId_1');
                console.log('Index dropped successfully.');
            } else {
                console.log('Index receiptId_1 not found.');
            }
        }
        
        await mongoose.disconnect();
        console.log('Done.');
    } catch (err) {
        console.error('Error fixing indexes:', err);
    }
}

fixIndexes();
