const mongoose = require('mongoose');
const path = require('path');
const User = require(path.join(__dirname, '../models/User'));
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function createAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const adminData = {
            username: 'admin_test',
            email: 'admin@test.com',
            password: 'password123',
            role: 'admin'
        };

        let user = await User.findOne({ email: adminData.email });
        if (user) {
            user.role = 'admin';
            user.password = adminData.password;
            await user.save();
            console.log('Admin user updated');
        } else {
            user = new User(adminData);
            await user.save();
            console.log('Admin user created');
        }

        mongoose.connection.close();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

createAdmin();
