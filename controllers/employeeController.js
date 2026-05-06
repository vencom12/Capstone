const User = require('../models/User');
const Order = require('../models/Order');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');

exports.getDashboardState = async (req, res) => {
    try {
        const [orders, inventory, products] = await Promise.all([
            Order.find().sort({ date: -1 }).limit(100),
            Inventory.find(),
            Product.find().sort({ createdAt: -1 }).limit(100)
        ]);

        res.json({
            orders,
            inventory,
            products,
            analytics: {
                activeOrders: orders.filter(o => o.status !== 'Completed' && o.status !== 'Order Canceled').length,
                lowStock: inventory.filter(i => i.count < 10).length
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching employee state' });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const { status, progress } = req.body;
        const order = await Order.findByIdAndUpdate(req.params.id, { status, progress }, { new: true });
        if (!order) return res.status(404).json({ message: 'Order not found' });
        
        req.app.get('io').to(`user:${order.userId}`).to('staff').emit('ordersUpdated');
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateInventory = async (req, res) => {
    try {
        const { count } = req.body;
        const inventory = await Inventory.findOneAndUpdate(
            { item: req.params.item },
            { count, lastUpdated: Date.now() },
            { new: true, upsert: true }
        );
        req.app.get('io').to('staff').emit('dataChanged', { type: 'inventory' });
        res.json(inventory);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};
