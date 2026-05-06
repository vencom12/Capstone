const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');
const Inventory = require('./models/Inventory');
const Transaction = require('./models/Transaction');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Ryven';

async function seed() {
    try {
        console.log('Connecting to MongoDB:', uri);
        await mongoose.connect(uri);
        console.log('Connected. Cleaning collections...');

        await Promise.all([
            User.deleteMany({ role: { $ne: 'admin' } }), // Keep admin accounts if they exist
            Product.deleteMany({}),
            Order.deleteMany({}),
            Inventory.deleteMany({}),
            Transaction.deleteMany({})
        ]);

        console.log('Creating Sample Products...');
        const products = [
            { name: 'Golden Fleur', price: 24.99, tag: 'Premium', description: 'Intricate floral pattern.', imageUrl: 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=500' },
            { name: 'Cyber Shield', price: 18.50, tag: 'Tech', description: 'Modern minimalist geometric.', imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500' },
            { name: 'Neon Pulse', price: 29.00, tag: 'Neon', description: 'Vibrant neon-style threads.', imageUrl: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=500' }
        ];
        const savedProducts = await Product.insertMany(products);

        console.log('Creating Sample Customer...');
        const customer = new User({
            username: 'customer',
            email: 'customer@gmail.com',
            password: 'password123',
            role: 'customer',
            walletBalance: 1000,
            address: '123 Main St'
        });
        await customer.save();

        console.log('Creating Sample Orders...');
        const orders = [
            {
                orderId: 'ORD-1001',
                userId: customer._id,
                client: customer.username,
                design: 'Golden Fleur',
                items: [{ name: 'Golden Fleur', price: 24.99, quantity: 1 }],
                totalAmount: 24.99,
                status: 'Preparing Order',
                progress: 30,
                date: new Date()
            },
            {
                orderId: 'ORD-1002',
                userId: customer._id,
                client: customer.username,
                design: 'Neon Pulse',
                items: [{ name: 'Neon Pulse', price: 29.00, quantity: 2 }],
                totalAmount: 58.00,
                status: 'In Queue',
                progress: 10,
                date: new Date(Date.now() - 86400000)
            }
        ];
        await Order.insertMany(orders);

        console.log('Creating Sample Inventory...');
        const inventory = [
            { name: 'Midnight Black Thread', count: 50 },
            { name: 'Gold Metallic Thread', count: 5 } // Low stock
        ];
        await Inventory.insertMany(inventory);

        console.log('Seeding Complete!');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seed();
