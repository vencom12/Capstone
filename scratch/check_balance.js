const mongoose = require('mongoose');
const User = require('../models/User');

async function check() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/Ryven');
        const users = await User.find({});
        users.forEach(u => {
            console.log(`User: ${u.username}, Email: ${u.email}, Balance: ${u.walletBalance}`);
        });
        mongoose.connection.close();
    } catch (e) {
        console.error(e);
    }
}

check();
