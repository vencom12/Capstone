const prisma = require('../../utils/prisma');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');

exports.getDashboardState = async (req, res) => {
    try {
        const [orders, inventory, products] = await Promise.all([
            prisma.order.findMany({ 
                include: { transaction: true },
                orderBy: { createdAt: 'desc' }, 
                take: 100 
            }),
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
        const orderId = req.params.id;

        // Auto-deduction logic for 'Preparing Order'
        if (status === 'Preparing Order') {
            const order = await prisma.order.findUnique({ where: { id: orderId } });
            if (order && order.status !== 'Preparing Order') { // Avoid double deduction
                const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
                const logEnabled = settings ? settings.inventoryAuditLog : true;
                const items = Array.isArray(order.items) ? order.items : [];

                for (const item of items) {
                    const product = await prisma.product.findUnique({ where: { id: item.productId } });
                    if (!product) continue;

                    const garmentQuantity = item.quantity || 1;

                    // NEGATIVE STOCK SAFEGUARD: Route to Hold Queue if physical stock is insufficient
                    if (product.count < garmentQuantity) {
                        await prisma.order.update({
                            where: { id: orderId },
                            data: { status: "On Hold - Awaiting Materials", progress: 5 }
                        });
                        req.app.get('io').to('staff').emit('ordersUpdated');
                        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.ORDER, await prisma.order.findUnique({ where: { id: orderId } }));
                        
                        return res.status(400).json({
                            message: `Insufficient physical stock for "${product.name}". Needed: ${garmentQuantity}, Available: ${product.count}. Order routed to Hold Queue.`
                        });
                    }

                    // 1. Deduct Product physical stock and release reservation lock
                    await prisma.product.update({
                        where: { id: product.id },
                        data: {
                            count: { decrement: garmentQuantity },
                            reservedCount: { decrement: garmentQuantity }
                        }
                    });

                    // 2. Explode Recipe BOM and deduct raw material thread spools
                    if (product.recipe && Array.isArray(product.recipe)) {
                        for (const component of product.recipe) {
                            const totalDeduction = Math.ceil(component.quantity * garmentQuantity);

                            // Verify inventory spool exists
                            const inventoryItem = await prisma.inventory.findUnique({ where: { id: component.inventoryId } });
                            if (inventoryItem) {
                                const updatedInv = await prisma.inventory.update({
                                    where: { id: component.inventoryId },
                                    data: { count: { decrement: totalDeduction } }
                                });
                                if (logEnabled) {
                                    await prisma.inventoryLog.create({
                                        data: {
                                            inventoryId: component.inventoryId,
                                            action: 'Deduct',
                                            amount: totalDeduction,
                                            newTotal: updatedInv.count,
                                            userId: req.user?.username || 'Employee (Auto)'
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
                
                // Broadcast both products and raw materials changes
                const io = req.app.get('io');
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.INVENTORY, await prisma.inventory.findMany());
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.PRODUCT, await prisma.product.findMany());
            }
        }

        // Cancellation Rollback Logic
        if (status === 'Order Canceled') {
            const order = await prisma.order.findUnique({ where: { id: orderId } });
            if (order && order.status !== 'Order Canceled') { // Avoid double cancellation
                const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
                const logEnabled = settings ? settings.inventoryAuditLog : true;
                const items = Array.isArray(order.items) ? order.items : [];

                const physicalDeductedStates = ['Preparing Order', 'Completed', 'Shipped', 'Ready for Pickup', 'Out for Delivery'];
                const reservedStates = ['In Queue', 'Awaiting Payment', 'Pending Payment', 'On Hold - Awaiting Materials'];

                if (physicalDeductedStates.includes(order.status)) {
                    // Scenario B: Physical stock was already deducted. Restock both garments and threads!
                    for (const item of items) {
                        const product = await prisma.product.findUnique({ where: { id: item.productId } });
                        if (!product) continue;

                        const garmentQuantity = item.quantity || 1;

                        // Restore physical Product stock
                        await prisma.product.update({
                            where: { id: product.id },
                            data: { count: { increment: garmentQuantity } }
                        });

                        // Restore raw thread spools
                        if (product.recipe && Array.isArray(product.recipe)) {
                            for (const component of product.recipe) {
                                const totalDeduction = Math.ceil(component.quantity * garmentQuantity);
                                const updatedInv = await prisma.inventory.update({
                                    where: { id: component.inventoryId },
                                    data: { count: { increment: totalDeduction } }
                                });
                                if (logEnabled) {
                                    await prisma.inventoryLog.create({
                                        data: {
                                            inventoryId: component.inventoryId,
                                            action: 'Add',
                                            amount: totalDeduction,
                                            newTotal: updatedInv.count,
                                            userId: `Rollback (${req.user?.username || 'Auto'})`
                                        }
                                    });
                                }
                            }
                        }
                    }
                } else if (reservedStates.includes(order.status)) {
                    // Scenario A: Only reservation was locked. Release the garment reservation count!
                    for (const item of items) {
                        const product = await prisma.product.findUnique({ where: { id: item.productId } });
                        if (!product) continue;

                        const garmentQuantity = item.quantity || 1;

                        // Release garment reservation count (prevent negative reservedCount)
                        const newReserved = Math.max(0, product.reservedCount - garmentQuantity);
                        await prisma.product.update({
                            where: { id: product.id },
                            data: { reservedCount: newReserved }
                        });
                    }
                }

                // Broadcast both products and raw materials changes
                const io = req.app.get('io');
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.INVENTORY, await prisma.inventory.findMany());
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.PRODUCT, await prisma.product.findMany());
            }
        }

        const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: { status, progress }
        });
        
        req.app.get('io').to(`user:${updatedOrder.userId}`).to('staff').emit('ordersUpdated');
        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.ORDER, updatedOrder);
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
