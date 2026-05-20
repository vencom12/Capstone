const prisma = require('../../utils/prisma');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');
const { handleOrderStateTransition } = require('../../utils/inventoryManager');

exports.getDashboardState = async (req, res) => {
    try {
        const [orders, inventory, products, machines] = await Promise.all([
            prisma.order.findMany({ 
                include: { transaction: true },
                orderBy: { createdAt: 'desc' }, 
                take: 100 
            }),
            prisma.inventory.findMany(),
            prisma.product.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
            prisma.machine.findMany({ include: { assignedUser: true } })
        ]);

        res.json({
            orders,
            inventory,
            products,
            machines,
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
        const { status, machineId } = req.body;
        const orderId = req.params.id;
        const username = req.user?.username || 'Employee';

        let updatedOrder;
        try {
            updatedOrder = await prisma.$transaction(async (tx) => {
                return await handleOrderStateTransition(tx, orderId, status, username);
            });
        } catch (err) {
            if (err.isStockError) {
                // Insufficient stock occurred. Broadcast changes and return 400
                const io = req.app.get('io');
                io.to('staff').emit('ordersUpdated');
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, err.heldOrder);
                return res.status(400).json({ message: err.message });
            }
            throw err;
        }

        // If machineId is specified (either a string or null), update the order's machine association
        if (machineId !== undefined) {
            updatedOrder = await prisma.order.update({
                where: { id: updatedOrder.id },
                data: { machineId },
                include: { transaction: true }
            });
        }

        // Broadcast both products and raw materials changes along with order update
        const io = req.app.get('io');
        io.to(`user:${updatedOrder.userId}`).to('staff').emit('ordersUpdated');
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, updatedOrder);
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.INVENTORY, await prisma.inventory.findMany());
        const productsList = await prisma.product.findMany();
        const { enrichProductsWithStock } = require('../../utils/inventoryManager');
        const enrichedProducts = await enrichProductsWithStock(productsList);
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.PRODUCT, enrichedProducts);

        res.json(updatedOrder);
    } catch (err) {
        console.error('Employee Order Update Error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateInventory = async (req, res) => {
    try {
        const { count } = req.body;
        const inventory = await prisma.inventory.update({
            where: { id: req.params.item },
            data: { 
                count: parseInt(count), 
                minThreshold: req.body.minThreshold !== undefined ? parseInt(req.body.minThreshold) : undefined,
                lastUpdated: new Date() 
            }
        });
        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.INVENTORY, inventory);
        res.json(inventory);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.toggleShift = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { shiftStatus: true } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const newStatus = user.shiftStatus === 'clocked_in' ? 'offline' : 'clocked_in';

        await prisma.user.update({
            where: { id: userId },
            data: { shiftStatus: newStatus }
        });

        res.json({ shiftStatus: newStatus });
    } catch (err) {
        console.error('Shift toggle error:', err);
        res.status(500).json({ message: 'Server error toggling shift' });
    }
};
