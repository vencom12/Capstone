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

        const { enrichProductsWithStock } = require('../../utils/inventoryManager');
        const enrichedProducts = await enrichProductsWithStock(products);

        res.json({
            orders,
            inventory,
            products: enrichedProducts,
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
        const { username, email, password, role, phoneNumber, address } = req.body;

        if (!username || !username.trim()) {
            return res.status(400).json({ message: 'Username is required' });
        }
        if (!email || !email.trim()) {
            return res.status(400).json({ message: 'Email address is required' });
        }
        if (!password || !password.trim()) {
            return res.status(400).json({ message: 'Password is required' });
        }

        const normalizedUsername = username.trim();
        const normalizedEmail = email.trim().toLowerCase();

        // 1. Check if user already exists by email
        const existingEmail = await prisma.user.findFirst({
            where: { email: { equals: normalizedEmail, mode: 'insensitive' } }
        });

        // 2. Check if user already exists by username
        const existingUsername = await prisma.user.findFirst({
            where: { username: { equals: normalizedUsername, mode: 'insensitive' } }
        });

        // Case A: The account already exists as a customer -> Automatically promote to staff!
        const existingCustomer = (existingEmail && existingEmail.role === 'customer')
            ? existingEmail
            : (existingUsername && existingUsername.role === 'customer')
                ? existingUsername
                : null;

        if (existingCustomer) {
            // Ensure username isn't taken by a third party
            if (normalizedUsername && normalizedUsername !== existingCustomer.username) {
                const usernameConflict = await prisma.user.findFirst({
                    where: {
                        username: { equals: normalizedUsername, mode: 'insensitive' },
                        id: { not: existingCustomer.id }
                    }
                });
                if (usernameConflict) {
                    return res.status(400).json({
                        message: `The username "${normalizedUsername}" is already taken by another account. Please select a different username.`
                    });
                }
            }

            // Ensure email isn't taken by a third party
            if (normalizedEmail && normalizedEmail !== existingCustomer.email.toLowerCase()) {
                const emailConflict = await prisma.user.findFirst({
                    where: {
                        email: { equals: normalizedEmail, mode: 'insensitive' },
                        id: { not: existingCustomer.id }
                    }
                });
                if (emailConflict) {
                    return res.status(400).json({
                        message: `The email "${normalizedEmail}" is already used by another account.`
                    });
                }
            }

            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(password.trim(), 10);

            const updatedUser = await prisma.user.update({
                where: { id: existingCustomer.id },
                data: {
                    role: role || 'employee',
                    username: normalizedUsername || existingCustomer.username,
                    email: normalizedEmail || existingCustomer.email,
                    password: hashedPassword,
                    phoneNumber: phoneNumber ? phoneNumber.trim() : (existingCustomer.phoneNumber || null),
                    address: address ? address.trim() : (existingCustomer.address || null)
                }
            });

            return res.json({
                id: updatedUser.id,
                message: `Existing customer account "${updatedUser.username}" was promoted to ${role === 'admin' ? 'Administrator' : 'Artisan / Employee'} staff successfully!`,
                user: { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role }
            });
        }

        // Case B: Existing user is already an employee or admin
        if (existingEmail) {
            return res.status(400).json({
                message: `A staff account with email "${normalizedEmail}" already exists (${existingEmail.role} account "${existingEmail.username}"). You can edit their credentials directly in the table.`
            });
        }

        if (existingUsername) {
            return res.status(400).json({
                message: `The username "${normalizedUsername}" is already taken by another account. Please select a different username.`
            });
        }

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password.trim(), 10);

        const user = await prisma.user.create({
            data: {
                username: normalizedUsername,
                email: normalizedEmail,
                password: hashedPassword,
                role: role || 'employee',
                phoneNumber: phoneNumber ? phoneNumber.trim() : null,
                address: address ? address.trim() : null
            }
        });
        res.json({ id: user.id, message: 'User created successfully', user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
        console.error('createUser error:', err);
        if (err.code === 'P2002') {
            return res.status(400).json({ message: 'An account with these unique credentials already exists.' });
        }
        res.status(500).json({ message: err.message || 'Server error creating user' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { username, email, role, password, phoneNumber, address } = req.body;
        const userId = req.params.id;

        const updateData = {};

        if (username && username.trim()) {
            const normalizedUsername = username.trim();
            const existingUsername = await prisma.user.findFirst({
                where: {
                    username: { equals: normalizedUsername, mode: 'insensitive' },
                    id: { not: userId }
                }
            });
            if (existingUsername) {
                return res.status(400).json({ message: `The username "${normalizedUsername}" is already taken by another account.` });
            }
            updateData.username = normalizedUsername;
        }

        if (email && email.trim()) {
            const normalizedEmail = email.trim().toLowerCase();
            const existingEmail = await prisma.user.findFirst({
                where: {
                    email: { equals: normalizedEmail, mode: 'insensitive' },
                    id: { not: userId }
                }
            });
            if (existingEmail) {
                return res.status(400).json({ message: `An account with the email "${normalizedEmail}" already exists (${existingEmail.role} account "${existingEmail.username}").` });
            }
            updateData.email = normalizedEmail;
        }

        if (role) updateData.role = role;
        if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber ? phoneNumber.trim() : null;
        if (address !== undefined) updateData.address = address ? address.trim() : null;

        if (password && password.trim()) {
            const bcrypt = require('bcryptjs');
            updateData.password = await bcrypt.hash(password.trim(), 10);
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        const { password: _, ...safeUser } = user;
        res.json(safeUser);
    } catch (err) {
        console.error('updateUser error:', err);
        if (err.code === 'P2002') {
            return res.status(400).json({ message: 'An account with these unique credentials already exists.' });
        }
        res.status(500).json({ message: err.message || 'Server error updating user' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (req.params.id === req.user.id) return res.status(400).json({ message: 'Cannot delete self' });
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error('deleteUser error:', err);
        if (err.code === 'P2003') {
            return res.status(400).json({ message: 'Cannot delete user because they have existing order history, transactions, or assigned machine records.' });
        }
        res.status(500).json({ message: err.message || 'Server error deleting user' });
    }
};

const formatCategoryTag = (tag) => {
    if (!tag) return 'General';
    return tag
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
};

exports.createProduct = async (req, res) => {
    try {
        const { name, price, tag, description, count, minThreshold } = req.body;
        const formattedTag = formatCategoryTag(tag);
        let imageUrl = req.body.imageUrl || '/icons/icon.ico';

        if (req.file) {
            imageUrl = req.file.path;
        }

        const recipe = req.body.recipe ? (typeof req.body.recipe === 'string' ? JSON.parse(req.body.recipe) : req.body.recipe) : [];
        const variants = req.body.variants ? (typeof req.body.variants === 'string' ? JSON.parse(req.body.variants) : req.body.variants) : [];

        const { generateEmbedding } = require('../../utils/embeddingClient');
        const embedding = await generateEmbedding(`${name} ${formattedTag} ${description || ''}`);

        const newProduct = await prisma.product.create({
            data: {
                name,
                price: parseFloat(price),
                tag: formattedTag,
                description,
                imageUrl,
                recipe,
                variants,
                count: count !== undefined ? parseInt(count) : 0,
                minThreshold: minThreshold !== undefined ? parseInt(minThreshold) : 5
            }
        });

        if (embedding) {
            await prisma.$executeRaw`UPDATE "Product" SET embedding = ${embedding}::vector WHERE id = ${newProduct.id}`;
        }

        const { enrichProductsWithStock } = require('../../utils/inventoryManager');
        const [enrichedProduct] = await enrichProductsWithStock([newProduct]);

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.CREATE, ENTITIES.PRODUCT, enrichedProduct);
        res.json({ message: 'Product created', product: enrichedProduct });
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
        if (tag !== undefined) updateData.tag = formatCategoryTag(tag);
        if (description !== undefined) updateData.description = description;

        if (req.file) {
            updateData.imageUrl = req.file.path;
        } else if (req.body.imageUrl) {
            updateData.imageUrl = req.body.imageUrl;
        }

        if (req.body.recipe) {
            updateData.recipe = typeof req.body.recipe === 'string' ? JSON.parse(req.body.recipe) : req.body.recipe;
        }

        if (req.body.variants !== undefined) {
            updateData.variants = typeof req.body.variants === 'string' ? JSON.parse(req.body.variants) : req.body.variants;
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

        if (name !== undefined || tag !== undefined || description !== undefined) {
            const { generateEmbedding } = require('../../utils/embeddingClient');
            const fullProduct = await prisma.product.findUnique({ where: { id: req.params.id } });
            const embedding = await generateEmbedding(`${fullProduct.name} ${fullProduct.tag} ${fullProduct.description || ''}`);
            if (embedding) {
                await prisma.$executeRaw`UPDATE "Product" SET embedding = ${embedding}::vector WHERE id = ${req.params.id}`;
            }
        }

        const { enrichProductsWithStock } = require('../../utils/inventoryManager');
        const [enrichedProduct] = await enrichProductsWithStock([product]);

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.PRODUCT, enrichedProduct);
        res.json({ message: 'Product updated', product: enrichedProduct });
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
        const { count, minThreshold, action, amount, userId, item, unit, supplierUnitCost } = req.body;

        // Find existing to know what changed
        const existing = await prisma.inventory.findUnique({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ message: 'Item not found' });

        const updateData = {};

        // Role separation: Employees can ONLY adjust stock counts (+ / -)
        if (req.user?.role !== 'admin') {
            if (minThreshold !== undefined && parseInt(minThreshold) !== existing.minThreshold) {
                return res.status(403).json({ message: 'Only administrators can adjust safety warning thresholds' });
            }
            if (item !== undefined && item !== existing.item) {
                return res.status(403).json({ message: 'Only administrators can rename inventory materials' });
            }
            if (unit !== undefined && unit !== existing.unit) {
                return res.status(403).json({ message: 'Only administrators can alter material measurement units' });
            }
        } else {
            if (minThreshold !== undefined) updateData.minThreshold = parseInt(minThreshold);
            if (item !== undefined) updateData.item = item;
            if (unit !== undefined) updateData.unit = unit;
            // Allow admins to set/update the actual supplier cost per unit
            if (supplierUnitCost !== undefined) {
                updateData.supplierUnitCost = supplierUnitCost === '' || supplierUnitCost === null ? null : parseFloat(supplierUnitCost);
            }
        }

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
            const operator = req.user?.username || userId || 'Admin';
            const logParts = [operator];
            if (req.body.supplier) logParts.push(`Supplier: ${req.body.supplier}`);
            if (req.body.deliveryReceipt) logParts.push(`DR#: ${req.body.deliveryReceipt}`);
            if (req.body.dyeLot) logParts.push(`Lot: ${req.body.dyeLot}`);

            const fullLogUser = logParts.join(' | ');

            await prisma.inventoryLog.create({
                data: {
                    inventoryId: inventory.id,
                    action: action,
                    amount: parseInt(amount),
                    newTotal: inventory.count,
                    userId: fullLogUser
                }
            });

            // If this was a formal supplier intake, also write to GlobalAuditLog
            if (req.body.supplier || req.body.deliveryReceipt) {
                await prisma.globalAuditLog.create({
                    data: {
                        userId: req.user?.id || 'staff',
                        userRole: req.user?.role || 'staff',
                        action: 'SUPPLIER_SHIPMENT_RECEIVED',
                        entity: 'Inventory',
                        entityId: inventory.id,
                        ipAddress: req.ip || '127.0.0.1',
                        diff: {
                            item: inventory.item,
                            deliveredQuantity: parseInt(amount),
                            previousCount: existing.count,
                            newCount: inventory.count,
                            supplier: req.body.supplier || 'N/A',
                            deliveryReceipt: req.body.deliveryReceipt || 'N/A',
                            dyeLot: req.body.dyeLot || null,
                            unitCost: req.body.unitCost || null,
                            notes: req.body.notes || null
                        }
                    }
                }).catch(err => console.error("Global audit log fail:", err));
            }

            // Emit log update to clients
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.CREATE, 'INVENTORY_LOG', {});
        }

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.INVENTORY, inventory);
        res.json({
            ...inventory,
            receivedDelivery: !!(req.body.supplier || req.body.deliveryReceipt),
            addedAmount: amount ? parseInt(amount) : 0
        });
    } catch (err) {
        console.error("Error updating inventory:", err);
        res.status(500).json({ message: 'Error updating inventory' });
    }
};

exports.createInventoryItem = async (req, res) => {
    try {
        const { item, count, unit, minThreshold, supplierUnitCost } = req.body;
        if (!item) return res.status(400).json({ message: 'Item name is required' });

        const inventory = await prisma.inventory.create({
            data: {
                item,
                count: parseInt(count) || 0,
                unit: unit || 'Cones',
                minThreshold: parseInt(minThreshold) || 10,
                supplierUnitCost: supplierUnitCost ? parseFloat(supplierUnitCost) : null
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
        const { ids, status, trackingNumber, hub, note, courier } = req.body;
        if (!ids || !status) return res.status(400).json({ message: 'Missing ids or status' });

        const results = [];
        const errors = [];
        const username = req.user?.username || 'Admin';

        for (const orderId of ids) {
            try {
                const updated = await prisma.$transaction(async (tx) => {
                    return await handleOrderStateTransition(tx, orderId, status, username, { trackingNumber, hub, note, courier });
                });
                results.push(updated);
            } catch (err) {
                if (err.isStockError) {
                    await prisma.order.update({
                        where: { id: orderId },
                        data: { status: "On Hold - Awaiting Materials", progress: 5 }
                    });
                    errors.push(err.message);
                    results.push(err.heldOrder);
                } else {
                    throw err;
                }
            }
        }

        // Broadcast immediate order change to staff
        const io = req.app.get('io');
        io.to('staff').emit('ordersUpdated');
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, { ids, status });

        // Respond immediately to the client (<25ms) so the UI is unblocked
        if (errors.length > 0) {
            res.json({
                message: `Processed ${results.length - errors.length} orders successfully. ${errors.length} orders had insufficient stock and were routed to Hold Queue.`,
                errors,
                results
            });
        } else {
            res.json({ message: 'Orders updated successfully', results });
        }

        // Run secondary table broadcasts, AI scheduler recalculation, and emails non-blocking in background
        setImmediate(async () => {
            try {
                // Secondary socket broadcasts for full tables
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.INVENTORY, await prisma.inventory.findMany());
                const productsList = await prisma.product.findMany();
                const { enrichProductsWithStock } = require('../../utils/inventoryManager');
                const enrichedProducts = await enrichProductsWithStock(productsList);
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.PRODUCT, enrichedProducts);

                // Recalculate AI Queue priorities asynchronously
                const { recalculateQueuePriorities } = require('../../utils/aiScheduler');
                recalculateQueuePriorities(io).catch(err => {
                    console.error('[AI Queue Background Error] Recalculation failed:', err);
                });

                // Send order ready / in-transit email notifications asynchronously
                const NOTIFY_STATUSES = ['ready for pick up', 'ready for pickup', 'in transit', 'out for delivery', 'order delivered'];
                if (NOTIFY_STATUSES.includes(status?.toLowerCase())) {
                    const { sendOrderStatusReadyEmail } = require('../../utils/emailService');
                    results.forEach(updatedOrder => {
                        if (!updatedOrder || !updatedOrder.userId) return;
                        prisma.user.findUnique({ where: { id: updatedOrder.userId } }).then(cust => {
                            if (cust && cust.email) {
                                sendOrderStatusReadyEmail(cust.email, cust.username || cust.name, updatedOrder, status).catch(err => {
                                    console.error('[EmailService] Ready email failed:', err.message);
                                });
                            }
                        }).catch(() => {});
                    });
                }
            } catch (bgErr) {
                console.error('[Background Broadcast Error]:', bgErr);
            }
        });
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

exports.testAISettings = async (req, res) => {
    try {
        const { aiChatModel, aiProviderUrl } = req.body;
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            return res.status(400).json({
                success: false,
                message: "No GROQ_API_KEY registered in environment. Cannot verify dynamic connection pings."
            });
        }

        const fetch = global.fetch || require('node-fetch');
        const response = await fetch(aiProviderUrl || 'https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: aiChatModel || 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: 'Connection test ping. Reply with only one word: OK' }],
                max_tokens: 5
            })
        });

        const data = await response.json();

        if (response.ok && data.choices && data.choices[0]) {
            res.json({
                success: true,
                message: "Connection verification successful!",
                reply: data.choices[0].message.content.trim()
            });
        } else {
            const errMsg = data.error?.message || response.statusText || "Provider rejected the request.";
            res.status(400).json({
                success: false,
                message: `Connection failed: ${errMsg}`
            });
        }
    } catch (err) {
        console.error('Test AI settings error:', err);
        res.status(500).json({
            success: false,
            message: `Connection diagnostic error: ${err.message}`
        });
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

        // Set response headers: inline for previewing in modal/browser, attachment for forced download
        const dateStr = new Date().toISOString().split('T')[0];
        const isInline = req.query.inline === 'true' || req.query.preview === 'true' || req.query.view === 'inline';
        const disposition = isInline ? 'inline' : 'attachment';
        res.setHeader('Content-disposition', `${disposition}; filename=STITCH_OPT_RESTOCK_LIST_${dateStr}.pdf`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // Header
        const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        const bizName = settings?.businessName || 'STITCH-OPT DESIGNS';

        doc.font('Helvetica-Bold').fontSize(14).text(bizName, { align: 'center' });
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

exports.uploadBusinessLogo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image provided' });
        }

        const logoUrl = req.file.path;

        const updated = await prisma.systemSettings.upsert({
            where: { id: 'global' },
            update: { businessLogoUrl: logoUrl },
            create: { id: 'global', businessLogoUrl: logoUrl }
        });

        res.json({ message: 'Logo updated successfully', businessLogoUrl: logoUrl, settings: updated });
    } catch (err) {
        console.error('uploadBusinessLogo error:', err);
        res.status(500).json({ message: 'Error uploading logo' });
    }
};

exports.uploadGCashQr = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image provided' });
        }

        const qrUrl = req.file.path;

        const updated = await prisma.systemSettings.upsert({
            where: { id: 'global' },
            update: { gcashQrCodeUrl: qrUrl },
            create: { id: 'global', gcashQrCodeUrl: qrUrl }
        });

        res.json({ message: 'GCash QR Code updated successfully', gcashQrCodeUrl: qrUrl, settings: updated });
    } catch (err) {
        console.error('uploadGCashQr error:', err);
        res.status(500).json({ message: 'Error uploading GCash QR code' });
    }
};

exports.getGlobalAuditLogs = async (req, res) => {
    try {
        const { entity, action, search, limit = 15, page = 1 } = req.query;
        const take = Math.min(parseInt(limit) || 15, 200);
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const skip = (pageNum - 1) * take;

        const where = {};
        if (entity && entity !== 'All' && entity.trim()) {
            where.entity = entity.trim();
        }
        if (action && action !== 'All' && action.trim()) {
            where.action = action.trim();
        }
        if (search && search.trim() && search.trim() !== 'undefined' && search.trim() !== 'null') {
            const q = search.trim();
            where.OR = [
                { action: { contains: q, mode: 'insensitive' } },
                { entity: { contains: q, mode: 'insensitive' } },
                { entityId: { contains: q, mode: 'insensitive' } },
                { ipAddress: { contains: q, mode: 'insensitive' } },
            ];
        }

        const [totalCount, logs] = await Promise.all([
            prisma.globalAuditLog.count({ where }),
            prisma.globalAuditLog.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                take,
                skip
            })
        ]);

        // Enrich with user names
        const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))];
        let userMap = {};
        if (userIds.length > 0) {
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, username: true, email: true, role: true }
            });
            userMap = users.reduce((acc, u) => {
                acc[u.id] = u;
                return acc;
            }, {});
        }

        const enrichedLogs = logs.map(l => ({
            ...l,
            user: l.userId ? (userMap[l.userId] || { username: 'Unknown User', role: l.userRole }) : null
        }));

        res.json({
            logs: enrichedLogs,
            pagination: {
                totalCount,
                currentPage: parseInt(page) || 1,
                totalPages: Math.ceil(totalCount / take) || 1,
                limit: take
            }
        });
    } catch (err) {
        console.error('getGlobalAuditLogs error:', err);
        res.status(500).json({ message: 'Error fetching global audit logs' });
    }
};

exports.getOrderHistory = async (req, res) => {
    try {
        const { search, date, page = 1, limit = 50 } = req.query;
        const pageNum = parseInt(page) || 1;
        const take = Math.min(parseInt(limit) || 50, 100);
        const skip = (pageNum - 1) * take;

        const where = {
            status: { in: ['Order Delivered', 'Delivered', 'Completed', 'Order Canceled', 'Cancelled'] }
        };

        if (search && search.trim() && search.trim() !== 'undefined' && search.trim() !== 'null') {
            const query = search.trim();
            where.OR = [
                { orderId: { contains: query, mode: 'insensitive' } },
                { client: { contains: query, mode: 'insensitive' } },
                { status: { contains: query, mode: 'insensitive' } }
            ];
        }

        if (date && date.trim() && date.trim() !== 'undefined' && date.trim() !== 'null') {
            const parsed = new Date(date.trim());
            if (!isNaN(parsed.getTime())) {
                const startOfDay = new Date(parsed);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(parsed);
                endOfDay.setHours(23, 59, 59, 999);
                where.date = {
                    gte: startOfDay,
                    lte: endOfDay
                };
            }
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: { transaction: true, receipt: true },
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
                skip,
                take
            }),
            prisma.order.count({ where })
        ]);

        res.json({
            orders,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / take) || 1
        });
    } catch (err) {
        console.error('getOrderHistory error:', err);
        res.status(500).json({ message: 'Error retrieving archived order history', error: err.message });
    }
};

/**
 * Creates a walk-in counter order with instant local AI queue wait estimation,
 * ticket generation, and Cash or GCash settlement.
 */
exports.createWalkInOrder = async (req, res) => {
    try {
        const {
            clientName,
            clientPhone,
            clientEmail,
            items,
            design,
            totalAmount,
            paymentMethod,
            paymentStatus,
            isByog,
            isRush,
            dueDate,
            personalizationText,
            threadColor,
            notes
        } = req.body;

        const trimmedName = clientName && clientName.trim() ? clientName.trim() : '';
        const now = new Date();
        const randHex = Math.random().toString(16).substring(2, 6).toUpperCase();
        const orderId = `WI-${randHex}`;
        const secureTransactionId = `TX-WI-${Date.now().toString(36).toUpperCase()}-${randHex}`;
        const secureReceiptId = `RC-WI-${Date.now().toString(36).toUpperCase()}-${randHex}`;

        let walkInUserId = req.user?.id || 'admin';
        // Auto-link to existing customer (e.g. Google Login account) if email or phone matches
        if (clientEmail || clientPhone) {
            try {
                const searchFilters = [];
                if (clientEmail && clientEmail.trim()) {
                    searchFilters.push({ email: { equals: clientEmail.trim(), mode: 'insensitive' } });
                }
                if (clientPhone && clientPhone.trim()) {
                    searchFilters.push({ phoneNumber: clientPhone.trim() });
                }
                if (searchFilters.length > 0) {
                    const matchedUser = await prisma.user.findFirst({
                        where: { OR: searchFilters },
                        select: { id: true, username: true, email: true }
                    });
                    if (matchedUser) {
                        walkInUserId = matchedUser.id;
                    }
                }
            } catch (userMatchErr) {
                console.warn('[Walk-In User Match Notice]:', userMatchErr.message);
            }
        }

        const customerDisplayName = trimmedName || (personalizationText && personalizationText.trim() ? `Walk-In (${personalizationText.trim()})` : `Walk-In #${randHex}`);
        const numTotal = parseFloat(totalAmount) || 0;
        const isCompleted = Boolean(req.body.isAlreadyCompleted);
        const isPaid = isCompleted || paymentStatus === 'paid' || paymentMethod === 'Cash';

        const initialStatus = isPaid ? 'In Queue' : 'Pending Payment';
        const initialProgress = isPaid ? 5 : 0;

        const orderData = {
            orderId,
            client: customerDisplayName,
            userId: walkInUserId,
            design: design || 'Walk-In Embroidery',
            items: Array.isArray(items) && items.length > 0 ? items : [{ name: design || 'Custom Embroidery', quantity: 1, price: numTotal }],
            totalAmount: numTotal,
            paymentMethod: paymentMethod || 'Cash',
            paymentStatus: isPaid ? 'paid' : 'unpaid',
            status: initialStatus,
            address: 'Physical Store (Eds Towels & Caps Pacific Mall Lucena)',
            deliveryTime: isCompleted ? 'Completed On-Site' : (isRush ? 'Rush Walk-In' : 'Standard Walk-In'),
            notes: notes || (isCompleted ? 'Quick Walk-In slip punch' : 'Walk-in counter order'),
            progress: initialProgress,
            isByog: Boolean(isByog),
            waiverSigned: true,
            isRush: Boolean(isRush),
            dueDate: dueDate ? new Date(dueDate) : null,
            personalization: {
                fulfillmentType: 'pickup',
                courier: 'Store Pick-up',
                trackingNumber: `WI-${orderId}`,
                customerPhone: clientPhone || null,
                customerEmail: clientEmail || null,
                text: personalizationText || '',
                color: threadColor || '',
                statusHistory: [
                    {
                        status: initialStatus,
                        timestamp: now.toISOString(),
                        actor: req.user?.username || 'Shop Counter',
                        hub: 'Eds Towels Pacific Mall Lucena Hub',
                        note: isCompleted
                            ? `Quick Slip Punch: Recorded completed on-site embroidery. Payment: ${paymentMethod || 'Cash'} (Paid).`
                            : `Walk-in order registered at counter. Payment: ${paymentMethod || 'Cash'} (${isPaid ? 'Paid' : 'Unpaid'}).`
                    }
                ]
            }
        };

        // Estimate production time using our local AI scheduler
        const { estimateProductionTime, recalculateQueuePriorities } = require('../../utils/aiScheduler');
        orderData.estimatedTime = Math.ceil(estimateProductionTime(orderData));

        const createdOrder = await prisma.$transaction(async (tx) => {
            const order = await tx.order.create({ data: orderData });

            const transaction = await tx.transaction.create({
                data: {
                    transactionID: secureTransactionId,
                    orderID: orderId,
                    amount: numTotal,
                    status: 'completed',
                    receiptLink: `/api/customer/receipt/${secureReceiptId}/download`,
                    receiptId: secureReceiptId,
                    userId: walkInUserId
                }
            });

            const receipt = await tx.receipt.create({
                data: {
                    receiptID: secureReceiptId,
                    orderID: orderId,
                    paymentMethod: paymentMethod || 'Cash',
                    amount: numTotal,
                    status: 'Paid',
                    aiVerificationStatus: 'verified',
                    userId: walkInUserId
                }
            });

            // If the order was already physically finished by Nanay from a paper slip,
            // immediately trigger inventory status transition so blanks & variant stock are deducted!
            if (isCompleted) {
                const { handleOrderStateTransition } = require('../../utils/inventoryManager');
                await handleOrderStateTransition(tx, order.id, 'Completed', req.user?.username || 'Shop Counter');
            }

            return await tx.order.update({
                where: { id: order.id },
                data: { transactionId: transaction.id, receiptId: receipt.id }
            });
        });

        // Trigger queue recalculation & socket updates
        const io = req.app.get('io');
        setImmediate(() => {
            recalculateQueuePriorities(io).catch(err => {
                console.error('[Walk-In AI Queue Error]:', err);
            });
        });

        // If client provided email and is paid, send confirmation email
        if (clientEmail && clientEmail.includes('@')) {
            const { sendOrderConfirmationEmail } = require('../../utils/emailService');
            if (typeof sendOrderConfirmationEmail === 'function') {
                sendOrderConfirmationEmail(clientEmail, clientName, createdOrder).catch(err => {
                    console.warn('[Walk-In Email Notice]:', err.message);
                });
            }
        }

        res.status(201).json({
            success: true,
            message: 'Walk-in order created successfully and added to production queue',
            order: createdOrder
        });
    } catch (err) {
        console.error('createWalkInOrder Error:', err);
        res.status(500).json({ message: 'Failed to create walk-in order', error: err.message });
    }
};


