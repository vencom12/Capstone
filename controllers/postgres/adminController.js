const prisma = require('../../utils/prisma');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');

exports.getDashboardState = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const [orders, inventory, products, totalUsers, totalOrders, adminUsers, trafficData, totalVisits30D] = await Promise.all([
            prisma.order.findMany({
                include: { transaction: true, receipt: true },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.inventory.findMany(),
            prisma.product.findMany({ orderBy: { createdAt: 'desc' } }),
            prisma.user.count(),
            prisma.order.count(),
            prisma.user.findMany({ orderBy: [{ role: 'asc' }, { createdAt: 'desc' }] }),
            prisma.siteTraffic.findMany({ orderBy: { timestamp: 'desc' }, take: 30 }),
            prisma.siteTraffic.count({
                where: {
                    timestamp: {
                        gte: new Date(new Date().setDate(new Date().getDate() - 30))
                    }
                }
            })
        ]);

        // Revenue Calculation (All non-cancelled orders)
        const revenueAggregate = await prisma.order.aggregate({
            _sum: { totalAmount: true },
            _count: { id: true },
            where: { 
                NOT: { status: 'Order Canceled' }
            }
        });

        // Paid Revenue (For separate tracking if needed)
        const paidAggregate = await prisma.order.aggregate({
            _sum: { totalAmount: true },
            where: { paymentStatus: 'paid' }
        });

        // Real Order Trends (Last 6 months)
        const allPaidOrders = await prisma.order.findMany({
            where: { paymentStatus: 'paid' },
            select: { totalAmount: true, createdAt: true }
        });

        const monthlyRevenue = {};
        allPaidOrders.forEach(o => {
            const d = new Date(o.createdAt);
            const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
            monthlyRevenue[key] = (monthlyRevenue[key] || 0) + (o.totalAmount || 0);
        });

        const orderTrends = Object.entries(monthlyRevenue).map(([key, revenue]) => {
            const [month, year] = key.split('/');
            return { _id: { month: parseInt(month), year: parseInt(year) }, revenue };
        }).sort((a, b) => (a._id.year - b._id.year) || (a._id.month - b._id.month)).slice(-6);

        // Status Distribution
        const statusCounts = await prisma.order.groupBy({
            by: ['status'],
            _count: { id: true }
        });
        const statusDistribution = statusCounts.map(s => ({ _id: s.status, count: s._count.id }));

        // Simple Design Stats (Top 5 items in orders)
        // Since items is JSON, we'll process it in JS for now to match Mongo logic perfectly
        // In a full SQL design, we'd have an OrderItem table.
        const allOrders = await prisma.order.findMany({ select: { items: true } });
        const itemCounts = {};
        allOrders.forEach(order => {
            const items = order.items || [];
            items.forEach(item => {
                itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || 1);
            });
        });
        const designStats = Object.entries(itemCounts)
            .map(([name, count]) => ({ _id: name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Top Liked Designs (Most Favorited)
        const productsWithFavs = await prisma.product.findMany({
            include: {
                _count: {
                    select: { favoritedBy: true }
                }
            }
        });
        const topLiked = productsWithFavs
            .map(p => ({ _id: p.name, count: p._count.favoritedBy }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        res.json({
            orders,
            inventory,
            products,
            users: adminUsers || [],
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalOrders / limit),
                totalOrders
            },
            analytics: {
                userCount: totalUsers,
                revenue: revenueAggregate._sum.totalAmount || 0,
                activeOrders: orders.filter(o => o.status !== 'Completed' && o.status !== 'Order Canceled').length,
                lowStock: inventory.filter(i => i.count < 10).length,
                totalOrders: revenueAggregate._count.id || 0,
                totalVisits: totalVisits30D || 0,
                avgOrderValue: (revenueAggregate._count.id > 0) 
                    ? (revenueAggregate._sum.totalAmount / revenueAggregate._count.id) 
                    : 0,
                orderTrends,
                statusDistribution,
                topOrdered: designStats,
                topLiked: topLiked, 
                traffic: trafficData
            }
        });
    } catch (err) {
        console.error('getDashboardState error:', err);
        res.status(500).json({ message: 'Error fetching admin state' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, username: true, email: true, role: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const existingUser = await prisma.user.findFirst({
            where: { OR: [{ email }, { username }] }
        });
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: { username, email, password: hashedPassword, role }
        });
        res.json({ message: 'User created successfully', user: { id: user.id, username, role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { username, email, role, password, phoneNumber, address } = req.body;
        const userId = req.params.id;

        const updateData = {};
        if (username) updateData.username = username;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (phoneNumber) updateData.phoneNumber = phoneNumber;
        if (address) updateData.address = address;
        if (password) {
            const bcrypt = require('bcryptjs');
            updateData.password = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        const { password: _, ...safeUser } = user;
        res.json(safeUser);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (req.params.id === req.user.id) return res.status(400).json({ message: 'Cannot delete self' });
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.createProduct = async (req, res) => {
    try {
        const { name, price, tag, description } = req.body;
        let imageUrl = req.body.imageUrl || '/icons/icon.ico';

        if (req.file) {
            imageUrl = req.file.path;
        }

        const newProduct = await prisma.product.create({
            data: { name, price: parseFloat(price), tag, description, imageUrl }
        });

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.CREATE, ENTITIES.PRODUCT, newProduct);
        res.json({ message: 'Product created', product: newProduct });
    } catch (err) {
        console.error('createProduct error:', err);
        res.status(500).json({ message: 'Error creating product', error: err.message });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { name, price, tag, description } = req.body;
        const updateData = { name, price: parseFloat(price), tag, description };

        if (req.file) {
            updateData.imageUrl = req.file.path;
        } else if (req.body.imageUrl) {
            updateData.imageUrl = req.body.imageUrl;
        }

        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: updateData
        });

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.PRODUCT, product);
        res.json({ message: 'Product updated', product });
    } catch (err) {
        res.status(500).json({ message: 'Error updating product', error: err.message });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        await prisma.product.delete({ where: { id: req.params.id } });
        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.DELETE, ENTITIES.PRODUCT, { id: req.params.id });
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting product' });
    }
};

exports.updateInventoryItem = async (req, res) => {
    try {
        const { count, minThreshold, action, amount, userId } = req.body;
        
        // Find existing to know what changed
        const existing = await prisma.inventory.findUnique({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ message: 'Item not found' });

        const updateData = {};
        if (count !== undefined) updateData.count = count;
        if (minThreshold !== undefined) updateData.minThreshold = minThreshold;

        const inventory = await prisma.inventory.update({
            where: { id: req.params.id },
            data: updateData
        });

        // Create audit log if an action was provided
        if (action && amount !== undefined) {
            await prisma.inventoryLog.create({
                data: {
                    inventoryId: inventory.id,
                    action: action,
                    amount: parseInt(amount),
                    newTotal: inventory.count,
                    userId: userId || req.user?.username || 'Admin'
                }
            });
            // Emit log update to clients
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.CREATE, 'INVENTORY_LOG', {});
        }

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.INVENTORY, inventory);
        res.json(inventory);
    } catch (err) {
        console.error("Error updating inventory:", err);
        res.status(500).json({ message: 'Error updating inventory' });
    }
};

exports.createInventoryItem = async (req, res) => {
    try {
        const { item, count, unit, minThreshold } = req.body;
        if (!item) return res.status(400).json({ message: 'Item name is required' });

        const inventory = await prisma.inventory.create({
            data: {
                item,
                count: parseInt(count) || 0,
                unit: unit || 'Cones',
                minThreshold: parseInt(minThreshold) || 10
            }
        });

        // Create log entry for initial stock
        await prisma.inventoryLog.create({
            data: {
                inventoryId: inventory.id,
                action: 'Add',
                amount: inventory.count,
                newTotal: inventory.count,
                userId: req.user?.username || 'Admin'
            }
        });

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.CREATE, ENTITIES.INVENTORY, inventory);
        res.json(inventory);
    } catch (err) {
        console.error("Error creating inventory item:", err);
        res.status(500).json({ message: 'Error creating inventory item' });
    }
};

exports.updateGlobalThreshold = async (req, res) => {
    try {
        const { minThreshold } = req.body;
        if (minThreshold === undefined) return res.status(400).json({ message: 'Missing minThreshold' });

        await prisma.inventory.updateMany({
            data: { minThreshold: parseInt(minThreshold) }
        });

        const updatedInventory = await prisma.inventory.findMany();
        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, 'INVENTORY_BATCH', updatedInventory);
        res.json(updatedInventory);
    } catch (err) {
        console.error("Error updating global threshold:", err);
        res.status(500).json({ message: 'Error updating global threshold' });
    }
};

exports.getInventoryLogs = async (req, res) => {
    try {
        const logs = await prisma.inventoryLog.findMany({
            orderBy: { timestamp: 'desc' },
            take: 50,
            include: { inventory: { select: { item: true, unit: true } } }
        });
        res.json(logs);
    } catch (err) {
        console.error("Error fetching logs:", err);
        res.status(500).json({ message: 'Error fetching inventory logs' });
    }
};

exports.updateOrdersStatus = async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!ids || !status) return res.status(400).json({ message: 'Missing ids or status' });

        const progressMap = {
            'In Queue': 10,
            'Preparing Order': 30,
            'In Transit': 70,
            'Ready For Pick Up': 90,
            'Order Delivered': 100,
            'Order Canceled': 0
        };
        const progress = progressMap[status] !== undefined ? progressMap[status] : 50;

        await prisma.order.updateMany({
            where: { id: { in: ids } },
            data: { status, progress }
        });

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.ORDER, { ids, status, progress });
        res.json({ message: 'Orders updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating order status' });
    }
};

exports.getAnalytics = async (req, res) => {
    try {
        const [totalUsers, totalOrders, allPaidOrders, statusCounts, trafficData] = await Promise.all([
            prisma.user.count(),
            prisma.order.count(),
            prisma.order.findMany({
                where: { paymentStatus: 'paid' },
                select: { totalAmount: true, date: true, createdAt: true }
            }),
            prisma.order.groupBy({
                by: ['status'],
                _count: { id: true }
            }),
            prisma.siteTraffic.findMany({ orderBy: { timestamp: 'desc' }, take: 30 })
        ]);

        // Revenue Trends
        const monthlyRevenue = {};
        allPaidOrders.forEach(o => {
            const d = new Date(o.date || o.createdAt);
            const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
            monthlyRevenue[key] = (monthlyRevenue[key] || 0) + (o.totalAmount || 0);
        });

        const orderTrends = Object.entries(monthlyRevenue).map(([key, revenue]) => {
            const [month, year] = key.split('/');
            return { _id: { month: parseInt(month), year: parseInt(year) }, revenue };
        }).sort((a, b) => (a._id.year - b._id.year) || (a._id.month - b._id.month)).slice(-6);

        // Top Designs logic (already verified in dashboard state)
        const allOrders = await prisma.order.findMany({ select: { items: true } });
        const itemCounts = {};
        allOrders.forEach(order => {
            const items = order.items || [];
            items.forEach(item => {
                itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || 1);
            });
        });
        const designStats = Object.entries(itemCounts)
            .map(([name, count]) => ({ _id: name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        res.json({
            userCount: totalUsers,
            revenue: allPaidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
            totalOrders,
            orderTrends,
            statusDistribution: statusCounts.map(s => ({ _id: s.status, count: s._count.id })),
            topOrdered: designStats,
            topLiked: [], 
            traffic: trafficData
        });
    } catch (err) {
        console.error('getAnalytics error:', err);
        res.status(500).json({ message: 'Error fetching analytics' });
    }
};
