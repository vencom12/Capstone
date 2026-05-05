const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to:', process.env.MONGODB_URI);
        
        try {
            await Transaction.collection.dropIndex('receiptId_1');
            console.log('Successfully dropped stale index: receiptId_1');
        } catch (e) {
            if (e.codeName === 'IndexNotFound') {
                console.log('Index receiptId_1 not found (already gone or never existed here).');
            } else {
                console.error('Error dropping index:', e.message);
            }
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
