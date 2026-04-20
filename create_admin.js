require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Ryven';

async function createMasterAdmin() {
    try {
        await mongoose.connect(uri);
        console.log("Connected to MongoDB:", uri);

        const email = 'admin@stitchopt.com';
        const exists = await User.findOne({ email });

        if (exists) {
            console.log("Admin account already exists. Updating role to 'admin'.");
            exists.role = 'admin';
            // If they want to reset it: exists.password = 'StitchOptAdmin123!';
            await exists.save();
        } else {
            console.log("Creating new master admin account...");
            const newAdmin = new User({
                username: 'MasterAdmin',
                email: email,
                password: 'password123',
                role: 'admin'
            });
            await newAdmin.save();
            console.log("Master Admin specifically created!");
        }

        console.log("\n--- ADMIN PORTAL CREDENTIALS ---");
        console.log("Email:    admin@stitchopt.com");
        console.log("Password: password123 (if newly created) OR your existing password if the account was found and updated.");
        console.log("--------------------------------");

    } catch (err) {
        console.error("Error creating admin:", err);
    } finally {
        mongoose.disconnect();
    }
}

createMasterAdmin();
