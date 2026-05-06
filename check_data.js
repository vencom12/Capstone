const mongoose = require('mongoose');
const Order = require('./models/Order');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Ryven';

mongoose.connect(uri)
    .then(async () => {
        const order = await Order.findOne();
        console.log('--- SINGLE ORDER ---');
        console.log(JSON.stringify(order, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
