const prisma = require('../../utils/prisma');

exports.getDashboardState = async (req, res) => {
    try {
        const [orders, inventory, products] = await Promise.all([
            prisma.order.findMany({ orderBy: { date: 'desc' }, take: 100 }),
            prisma.inventory.findMany(),
            prisma.product.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
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
        const order = await prisma.order.update({
            where: { id: req.params.id },
            data: { status, progress }
        });
        
        req.app.get('io').to(`user:${order.userId}`).to('staff').emit('ordersUpdated');
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateInventory = async (req, res) => {
    try {
        const { count } = req.body;
        const inventory = await prisma.inventory.upsert({
            where: { item: req.params.item },
            update: { count, lastUpdated: new Date() },
            create: { item: req.params.item, count }
        });
        req.app.get('io').to('staff').emit('dataChanged', { type: 'inventory' });
        res.json(inventory);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};
