const prisma = require('../../utils/prisma');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');
const { handleOrderStateTransition } = require('../../utils/inventoryManager');

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
                lowStock: inventory.filter(i => i.count <= (i.minThreshold || 10)).length,
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
        const { name, price, tag, description, count, minThreshold } = req.body;
        let imageUrl = req.body.imageUrl || '/icons/icon.ico';

        if (req.file) {
            imageUrl = req.file.path;
        }

        const recipe = req.body.recipe ? JSON.parse(req.body.recipe) : [];

        const newProduct = await prisma.product.create({
            data: { 
                name, 
                price: parseFloat(price), 
                tag, 
                description, 
                imageUrl, 
                recipe,
                count: count !== undefined ? parseInt(count) : 0,
                minThreshold: minThreshold !== undefined ? parseInt(minThreshold) : 5
            }
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
        const { name, price, tag, description, count, minThreshold } = req.body;
        const updateData = {};
        
        if (name !== undefined) updateData.name = name;
        if (price !== undefined) updateData.price = parseFloat(price);
        if (tag !== undefined) updateData.tag = tag;
        if (description !== undefined) updateData.description = description;

        if (req.file) {
            updateData.imageUrl = req.file.path;
        } else if (req.body.imageUrl) {
            updateData.imageUrl = req.body.imageUrl;
        }

        if (req.body.recipe) {
            updateData.recipe = JSON.parse(req.body.recipe);
        }

        // Safeguard: Prevent manual stock reductions below active order commitments
        if (count !== undefined) {
            const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
            if (existing) {
                const targetCount = parseInt(count);
                if (targetCount < existing.reservedCount) {
                    return res.status(400).json({
                        message: `Cannot reduce product stock below reserved count. Target: ${targetCount}, Reserved: ${existing.reservedCount}.`
                    });
                }
                updateData.count = targetCount;
            }
        }

        if (minThreshold !== undefined) updateData.minThreshold = parseInt(minThreshold);

        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: updateData
        });

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.PRODUCT, product);
        res.json({ message: 'Product updated', product });
    } catch (err) {
        console.error('updateProduct error:', err);
        res.status(500).json({ message: 'Error updating product', error: err.message });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
        if (existing && existing.reservedCount > 0) {
            return res.status(400).json({
                message: `Cannot delete product "${existing.name}" because there are ${existing.reservedCount} units actively reserved for orders in the queue.`
            });
        }
        await prisma.product.delete({ where: { id: req.params.id } });
        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.DELETE, ENTITIES.PRODUCT, { id: req.params.id });
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting product' });
    }
};

exports.updateInventoryItem = async (req, res) => {
    try {
        const { count, minThreshold, action, amount, userId, item, unit } = req.body;
        
        // Find existing to know what changed
        const existing = await prisma.inventory.findUnique({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ message: 'Item not found' });

        const updateData = {};
        if (minThreshold !== undefined) updateData.minThreshold = parseInt(minThreshold);
        if (item !== undefined) updateData.item = item;
        if (unit !== undefined) updateData.unit = unit;

        let newCount = existing.count;
        if (action && amount !== undefined) {
            const qty = parseInt(amount);
            if (action === 'Add') {
                newCount = existing.count + qty;
            } else if (action === 'Deduct') {
                newCount = existing.count - qty;
            }
        } else if (count !== undefined) {
            newCount = parseInt(count);
        }

        // Safeguard: Prevent manual stock reductions below active order commitments
        if (newCount < (existing.reservedCount || 0)) {
            return res.status(400).json({
                message: `Cannot reduce stock below reserved count. Target: ${newCount}, Reserved: ${existing.reservedCount || 0}.`
            });
        }

        updateData.count = newCount;

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
        res.status(500).json({ 
            message: 'Error creating inventory item', 
            error: err.message,
            code: err.code // Prisma error codes (e.g., P2002 for unique constraint)
        });
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

        const results = [];
        const errors = [];
        const username = req.user?.username || 'Admin';

        for (const orderId of ids) {
            try {
                const updated = await prisma.$transaction(async (tx) => {
                    return await handleOrderStateTransition(tx, orderId, status, username);
                });
                results.push(updated);
            } catch (err) {
                if (err.isStockError) {
                    errors.push(err.message);
                    results.push(err.heldOrder);
                } else {
                    throw err;
                }
            }
        }

        // Broadcast changes
        const io = req.app.get('io');
        io.to('staff').emit('ordersUpdated');
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, { ids, status });
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.INVENTORY, await prisma.inventory.findMany());
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.PRODUCT, await prisma.product.findMany());

        if (errors.length > 0) {
            return res.json({
                message: `Processed ${results.length - errors.length} orders successfully. ${errors.length} orders had insufficient base garment stock and were routed to the Hold Queue.`,
                errors
            });
        }

        res.json({ message: 'Orders updated successfully', results });
    } catch (err) {
        console.error('Update Orders Error:', err);
        res.status(500).json({ message: 'Error updating order status' });
    }
};

exports.getAnalytics = async (req, res) => {
    try {
        const [totalUsers, totalOrders, allValidOrders, statusCounts, trafficData] = await Promise.all([
            prisma.user.count(),
            prisma.order.count(),
            prisma.order.findMany({
                where: { NOT: { status: 'Order Canceled' } },
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
        allValidOrders.forEach(o => {
            const d = new Date(o.date || o.createdAt);
            const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
            monthlyRevenue[key] = (monthlyRevenue[key] || 0) + (o.totalAmount || 0);
        });

        const orderTrends = Object.entries(monthlyRevenue).map(([key, revenue]) => {
            const [month, year] = key.split('/');
            return { _id: { month: parseInt(month), year: parseInt(year) }, revenue };
        }).sort((a, b) => (a._id.year - b._id.year) || (a._id.month - b._id.month)).slice(-6);

        // Top Designs logic
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

        const revenue = allValidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const avgOrderValue = allValidOrders.length > 0 ? revenue / allValidOrders.length : 0;
        const totalVisits = await prisma.siteTraffic.count({
            where: {
                timestamp: {
                    gte: new Date(new Date().setDate(new Date().getDate() - 30))
                }
            }
        });

        res.json({
            userCount: totalUsers,
            revenue,
            totalOrders,
            avgOrderValue,
            orderTrends,
            statusDistribution: statusCounts.map(s => ({ _id: s.status, count: s._count.id })),
            topOrdered: designStats,
            topLiked,
            traffic: trafficData,
            totalVisits
        });
    } catch (err) {
        console.error('getAnalytics error:', err);
        res.status(500).json({ message: 'Error fetching analytics' });
    }
};

exports.deleteInventoryItem = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.inventory.delete({ where: { id } });
        
        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, 'INVENTORY_BATCH', await prisma.inventory.findMany());
        res.json({ message: 'Inventory item deleted' });
    } catch (err) {
        console.error("Error deleting inventory item:", err);
        res.status(500).json({ message: 'Error deleting inventory item' });
    }
};

exports.getSettings = async (req, res) => {
    try {
        let settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        if (!settings) {
            settings = await prisma.systemSettings.create({ data: { id: 'global' } });
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching settings' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const settings = await prisma.systemSettings.upsert({
            where: { id: 'global' },
            update: req.body,
            create: { id: 'global', ...req.body }
        });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: 'Error updating settings' });
    }
};

exports.downloadShoppingListPdf = async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        
        // Fetch all inventory items
        const inventory = await prisma.inventory.findMany();
        const lowStockItems = inventory.filter((i) => i.count <= (i.minThreshold || 10));

        if (lowStockItems.length === 0) {
            return res.status(400).send('All stockpile spools are healthy. No restocks required!');
        }

        // Calculate dynamic height based on number of items
        const itemsCount = lowStockItems.length;
        const pageHeight = Math.max(260, 160 + itemsCount * 45 + 50);
        const doc = new PDFDocument({ size: [300, pageHeight], margin: 15 });

        // Set response headers for downloading a PDF file
        const dateStr = new Date().toISOString().split('T')[0];
        res.setHeader('Content-disposition', `attachment; filename=STITCH_OPT_RESTOCK_LIST_${dateStr}.pdf`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // Header
        doc.font('Helvetica-Bold').fontSize(14).text('STITCH-OPT DESIGNS', { align: 'center' });
        doc.font('Helvetica-Bold').fontSize(9).text('AUTO-PROCUREMENT ERP', { align: 'center' });
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(7).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.text(`Operator: ${req.user?.username || 'Administrator'}`, { align: 'center' });
        
        doc.moveDown(0.5);
        doc.font('Courier').fontSize(8).text('------------------------------------------', { align: 'center' });
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').fontSize(9).text('RESTOCK SHOPPING LIST', { align: 'center' });
        doc.moveDown(0.4);
        doc.font('Courier').fontSize(8).text('------------------------------------------', { align: 'center' });
        doc.moveDown(0.5);

        // Table Header (using monospaced columns centered)
        doc.font('Courier-Bold').fontSize(8);
        const headerLine = 'MATERIAL'.padEnd(18) + 'STOCK'.padStart(8) + 'ORDER'.padStart(10);
        doc.text(headerLine, { align: 'center' });
        doc.font('Courier').fontSize(8);
        doc.moveDown(0.5);

        // Items List
        lowStockItems.forEach((item) => {
            const minVal = item.minThreshold || 10;
            const target = minVal * 2;
            const suggestedOrder = Math.max(0, target - item.count);

            const name = item.item.substring(0, 17).padEnd(18);
            const current = `${item.count}`.padStart(8);
            const order = `+${suggestedOrder}`.padStart(10);
            
            doc.font('Courier-Bold').text(name + current + order, { align: 'center' });
            
            // Subtext showing the safety threshold and unit details
            doc.font('Courier-Oblique').fontSize(7);
            const subtext = `  (safety limit: ${minVal} / unit: ${item.unit})`.padEnd(36);
            doc.text(subtext, { align: 'center' });
            doc.fontSize(8); // Reset font size
            doc.moveDown(0.4);
        });

        doc.font('Courier').fontSize(8).text('------------------------------------------', { align: 'center' });
        doc.moveDown(0.5);

        // Procurement Guidelines
        doc.font('Helvetica-Oblique').fontSize(6.5);
        doc.text('* Suggested orders restore a 2x safety stock level.', { align: 'left', indent: 10 });
        doc.text('* Verify current open orders before supplier purchase.', { align: 'left', indent: 10 });
        doc.end();

    } catch (err) {
        console.error('downloadShoppingListPdf error:', err);
        res.status(500).send('Error generating PDF');
    }
};
