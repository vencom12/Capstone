const User = require('../models/User');
const Order = require('../models/Order');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const SiteTraffic = require('../models/SiteTraffic');

exports.getDashboardState = async (req, res) => {
    try {
        const [orders, inventory, products, totalUsers, totalRevenue, adminUsers] = await Promise.all([
            Order.find().populate('transactionId receiptRef').sort({ date: -1 }).limit(100),
            Inventory.find(),
            Product.find().sort({ createdAt: -1 }).limit(100),
            User.countDocuments(),
            Order.aggregate([{ $group: { _id: null, total: { $sum: { $convert: { input: "$totalAmount", to: "double", onError: 0, onNull: 0 } } } } }]),
            User.find().select('-password').sort({ createdAt: -1 })
        ]);

        res.json({
            orders,
            inventory,
            products,
            users: adminUsers,
            analytics: {
                userCount: totalUsers,
                revenue: totalRevenue[0]?.total || 0,
                activeOrders: orders.filter(o => o.status !== 'Completed' && o.status !== 'Order Canceled').length,
                lowStock: inventory.filter(i => i.count < 10).length
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching admin state' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) return res.status(400).json({ message: 'User already exists' });

        user = new User({ username, email, password, role });
        await user.save();
        res.json({ message: 'User created successfully', user: { id: user._id, username, role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { username, email, role, password } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (username) user.username = username;
        if (email) user.email = email;
        if (role) user.role = role;
        if (password && password.trim() !== '') user.password = password;

        await user.save();
        const safeUser = user.toObject();
        delete safeUser.password;
        res.json(safeUser);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (req.params.id === req.user.id) return res.status(400).json({ message: 'Cannot delete self' });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getAnalytics = async (req, res) => {
    try {
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [orderTrends, statusDistribution, topOrdered, totalStats, totalVisits, topLiked, traffic] = await Promise.all([
            Order.aggregate([
                { $match: { date: { $gte: twelveMonthsAgo } } },
                { $project: { date: 1, total: { $convert: { input: "$totalAmount", to: "double", onError: 0, onNull: 0 } } } },
                { $group: { _id: { year: { $year: "$date" }, month: { $month: "$date" } }, count: { $sum: 1 }, revenue: { $sum: "$total" } } },
                { $sort: { "_id.year": 1, "_id.month": 1 } }
            ]),
            Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
            Order.aggregate([{ $unwind: "$items" }, { $group: { _id: "$items.name", count: { $sum: "$items.quantity" } } }, { $sort: { count: -1 } }, { $limit: 5 }]),
            Order.aggregate([{ $group: { _id: null, total: { $sum: { $convert: { input: "$totalAmount", to: "double", onError: 0, onNull: 0 } } }, count: { $sum: 1 } } }]),
            SiteTraffic.countDocuments(),
            // Top Liked: count how many users have favorited each product
            User.aggregate([
                { $unwind: "$favorites" },
                { $group: { _id: "$favorites", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 },
                { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
                { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
                { $project: { _id: { $ifNull: ["$product.name", "Unknown"] }, count: 1 } }
            ]),
            // Site Traffic: daily visits for last 30 days
            SiteTraffic.aggregate([
                { $match: { timestamp: { $gte: thirtyDaysAgo } } },
                { $group: {
                    _id: { $dateToString: { format: "%m/%d", date: "$timestamp" } },
                    count: { $sum: 1 }
                }},
                { $sort: { _id: 1 } }
            ])
        ]);

        const revenue = totalStats.length > 0 ? totalStats[0].total : 0;
        const totalOrders = totalStats.length > 0 ? totalStats[0].count : 0;
        const avgOrderValue = totalOrders > 0 ? revenue / totalOrders : 0;

        res.json({ orderTrends, statusDistribution, topOrdered, topLiked, traffic, revenue, avgOrderValue, totalVisits });
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).json({ message: 'Analytics error' });
    }
};
exports.updateOrdersStatus = async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!ids || !status) return res.status(400).json({ message: 'Missing IDs or status' });

        await Order.updateMany({ _id: { $in: ids } }, { $set: { status } });
        
        const io = req.app.get('io');
        io.to('staff').emit('ordersUpdated');
        // Ideally emit to each user too, but staff update is primary for admin UI sync
        
        res.json({ message: 'Orders updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};
exports.createProduct = async (req, res) => {
    try {
        const { name, price, tag, description, imageUrl } = req.body;
        const newProduct = new Product({ name, price: parseFloat(price), tag, description, imageUrl });
        await newProduct.save();
        req.app.get('io').emit('dataChanged', { type: 'products' });
        res.json({ message: 'Product created', product: newProduct });
    } catch (err) {
        res.status(500).json({ message: 'Error creating product' });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { name, price, tag, description, imageUrl } = req.body;
        const product = await Product.findByIdAndUpdate(req.params.id, 
            { name, price: parseFloat(price), tag, description, imageUrl }, 
            { new: true }
        );
        if (!product) return res.status(404).json({ message: 'Product not found' });
        req.app.get('io').emit('dataChanged', { type: 'products' });
        res.json({ message: 'Product updated', product });
    } catch (err) {
        res.status(500).json({ message: 'Error updating product' });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        req.app.get('io').emit('dataChanged', { type: 'products' });
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting product' });
    }
};

exports.updateInventoryItem = async (req, res) => {
    try {
        const { count } = req.body;
        const inventory = await Inventory.findOneAndUpdate(
            { _id: req.params.id },
            { count, lastUpdated: Date.now() },
            { new: true }
        );
        req.app.get('io').emit('dataChanged', { type: 'inventory' });
        res.json(inventory);
    } catch (err) {
        res.status(500).json({ message: 'Error updating inventory' });
    }
};

exports.updateOrdersStatus = async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!ids || !status) return res.status(400).json({ message: 'Missing ids or status' });

        // Map status to progress for convenience
        const progressMap = {
            'In Queue': 10,
            'Preparing Order': 30,
            'In Transit': 70,
            'Ready For Pick Up': 90,
            'Order Delivered': 100,
            'Order Canceled': 0
        };
        const progress = progressMap[status] !== undefined ? progressMap[status] : 50;

        await Order.updateMany(
            { _id: { $in: ids } },
            { $set: { status, progress } }
        );

        const io = req.app.get('io');
        io.emit('ordersUpdated');
        
        res.json({ message: 'Orders updated successfully' });
    } catch (err) {
        console.error('updateOrdersStatus error:', err);
        res.status(500).json({ message: 'Error updating order status' });
    }
};
