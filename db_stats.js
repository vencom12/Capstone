const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Ryven';

mongoose.connect(uri)
    .then(async () => {
        console.log('Connected to:', uri);
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log('--- COLLECTION STATS ---');
        for (let c of collections) {
            const count = await db.collection(c.name).countDocuments();
            console.log(`${c.name}: ${count} documents`);
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
