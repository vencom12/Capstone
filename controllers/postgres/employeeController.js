const prisma = require('../../utils/prisma');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');
const { handleOrderStateTransition } = require('../../utils/inventoryManager');

exports.getDashboardState = async (req, res) => {
    try {
        const [orders, inventory, products, machines] = await Promise.all([
            prisma.order.findMany({ 
                include: { transaction: true, receipt: true },
                orderBy: [
                    { priorityScore: 'desc' },
                    { createdAt: 'asc' }
                ], 
                take: 100 
            }),
            prisma.inventory.findMany({ orderBy: { item: 'asc' } }),
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
        const { status, machineId, trackingNumber, hub, note, courier } = req.body;
        const orderId = req.params.id;
        const username = req.user?.username || 'Employee';

        let updatedOrder;
        try {
            updatedOrder = await prisma.$transaction(async (tx) => {
                return await handleOrderStateTransition(tx, orderId, status, username, { trackingNumber, hub, note, courier });
            });
        } catch (err) {
            if (err.isStockError) {
                // Insufficient stock occurred. Broadcast changes and return 400
                await prisma.order.update({
                    where: { id: orderId },
                    data: { status: "On Hold - Awaiting Materials", progress: 5 }
                });
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

        // Broadcast order update immediately to staff and user
        const io = req.app.get('io');
        if (io) {
            const orderPayload = {
                orderId: updatedOrder.orderId,
                status: updatedOrder.status,
                progress: updatedOrder.progress,
                id: updatedOrder.id,
                order: updatedOrder
            };
            io.emit('ordersUpdated', orderPayload);
            io.to(`user:${updatedOrder.userId}`).to('staff').emit('ordersUpdated', orderPayload);
            socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, updatedOrder);
        }

        // Return immediately to client so UI feels instantaneous (sub-50ms)
        res.json(updatedOrder);

        // Run heavy inventory queries, product enrichment, and queue recalculations in the background
        setImmediate(async () => {
            try {
                if (io) {
                    const invList = await prisma.inventory.findMany();
                    socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.INVENTORY, invList);
                    const productsList = await prisma.product.findMany();
                    const { enrichProductsWithStock } = require('../../utils/inventoryManager');
                    const enrichedProducts = await enrichProductsWithStock(productsList);
                    socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.PRODUCT, enrichedProducts);
                }

                // Invalidate workshop queue watermark so capacity and scheduling recalculate cleanly
                const { invalidateQueue } = require('../../utils/workshopQueueManager');
                invalidateQueue();

                // Recalculate AI Queue priorities asynchronously
                const { recalculateQueuePriorities } = require('../../utils/aiScheduler');
                await recalculateQueuePriorities(io);
            } catch (bgErr) {
                console.error('[AI Queue / Inventory Background Error]:', bgErr);
            }
        });
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

        const io = req.app.get('io');
        if (io) {
            socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.USER, { id: userId, shiftStatus: newStatus });
        }

        res.json({ shiftStatus: newStatus });
    } catch (err) {
        console.error('Shift toggle error:', err);
        res.status(500).json({ message: 'Server error toggling shift' });
    }
};

/**
 * Marks physical client garments as received at the Pacific Mall kiosk counter.
 * This officially activates the production schedule and due date for BYOG orders.
 */
exports.receiveGarments = async (req, res) => {
    try {
        const orderId = req.params.id;
        const username = req.user?.username || 'Staff';

        // Support lookup by either database UUID (id) or human orderId
        const order = await prisma.order.findFirst({
            where: {
                OR: [
                    { id: orderId },
                    { orderId: orderId }
                ]
            }
        });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const now = new Date();
        const { calculatePickupSchedule, estimateArtisanProductionTime } = require('../../utils/pickupScheduler');
        
        // Fetch calibration settings with robust fallback
        let calibration = {};
        try {
            if (prisma.systemSettings) {
                const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
                if (settings) {
                    calibration = {
                        secondsPerLetter: settings.artisanSecondsPerLetter,
                        handlingMinutes: settings.artisanHandlingMinutes,
                        capOffsetMinutes: settings.artisanCapOffsetMinutes
                    };
                }
            }
        } catch (settingsErr) {
            console.warn('SystemSettings query notice, using default calibration:', settingsErr.message);
        }

        const estMinutes = order.estimatedTime || estimateArtisanProductionTime(order, calibration);
        const schedule = calculatePickupSchedule({
            orderDurationMinutes: estMinutes,
            startTime: now,
            isExpress: !order.isRush ? (Array.isArray(order.items) && order.items.length <= 3) : true,
            calibration
        });

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: {
                garmentsReceivedAt: now,
                garmentsReceivedBy: username,
                status: 'In Queue',
                progress: 15,
                dueDate: schedule.estimatedReadyDate
            },
            include: { transaction: true }
        });

        const io = req.app.get('io');
        if (io) {
            io.emit('ordersUpdated', { orderId: updatedOrder.orderId, status: updatedOrder.status, id: updatedOrder.id });
            socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, updatedOrder);
        }

        res.json({
            success: true,
            order: updatedOrder,
            readyLabel: schedule.readyLabel,
            message: `Garments received. Target pick-up: ${schedule.readyLabel}`
        });
    } catch (err) {
        console.error('Error receiving garments:', err);
        res.status(500).json({ message: 'Error marking garments as received' });
    }
};

/**
 * 1-Scan Counter Handover Verification:
 * Cashier scans customer's phone QR claim code at the Pacific Mall kiosk counter.
 * Automatically verifies anti-fraud code, transitions order to 'Completed', and releases shelf cubby.
 */
exports.scanClaimHandover = async (req, res) => {
    try {
        const rawInput = (req.body.claimCode || req.body.code || req.body.token || '').toString().trim();
        if (!rawInput) {
            return res.status(400).json({ message: 'Valid claim code or QR token required' });
        }

        let cleanCode = rawInput;
        if (cleanCode.includes('/')) {
            cleanCode = cleanCode.split('/').pop().trim();
        }
        if (cleanCode.includes('=')) {
            cleanCode = cleanCode.split('=').pop().trim();
        }

        const upperCode = cleanCode.toUpperCase();
        const codeWithHash = upperCode.startsWith('#') ? upperCode : `#${upperCode}`;
        const codeWithoutHash = upperCode.startsWith('#') ? upperCode.slice(1) : upperCode;
        const pureSuffix = codeWithoutHash.replace(/^A-?/i, '');
        const standardClaimCode = `#A-${pureSuffix}`;
        const username = req.user?.username || 'Counter Staff';

        // 1. Try matching active staged order first (Ready For Pick Up / In Queue / Preparing)
        let order = await prisma.order.findFirst({
            where: {
                OR: [
                    { orderId: { equals: upperCode, mode: 'insensitive' } },
                    { orderId: { equals: codeWithoutHash, mode: 'insensitive' } },
                    { orderId: { endsWith: pureSuffix, mode: 'insensitive' } },
                    { id: cleanCode },
                    { personalization: { path: ['claimCode'], equals: upperCode } },
                    { personalization: { path: ['claimCode'], equals: codeWithHash } },
                    { personalization: { path: ['claimCode'], equals: codeWithoutHash } },
                    { personalization: { path: ['claimCode'], equals: standardClaimCode } },
                    { personalization: { path: ['claimCode'], equals: `#${pureSuffix}` } },
                    { personalization: { path: ['trackingNumber'], equals: upperCode } },
                    { personalization: { path: ['trackingNumber'], equals: standardClaimCode } }
                ],
                status: { notIn: ['Completed', 'Order Delivered', 'Order Canceled'] }
            },
            include: { transaction: true },
            orderBy: { createdAt: 'desc' }
        });

        // 2. If no active order matches, check if it was an already-completed order to inform staff
        if (!order) {
            order = await prisma.order.findFirst({
                where: {
                    OR: [
                        { orderId: { equals: upperCode, mode: 'insensitive' } },
                        { orderId: { equals: codeWithoutHash, mode: 'insensitive' } },
                        { orderId: { endsWith: pureSuffix, mode: 'insensitive' } },
                        { id: cleanCode },
                        { personalization: { path: ['claimCode'], equals: standardClaimCode } },
                        { personalization: { path: ['claimCode'], equals: upperCode } }
                    ]
                },
                include: { transaction: true, receipt: true },
                orderBy: { createdAt: 'desc' }
            });
        }

        if (!order) {
            return res.status(404).json({ message: `No active order found matching code: ${cleanCode}` });
        }

        if (order.status === 'Completed' || order.status === 'Order Delivered') {
            return res.status(400).json({
                message: `Order #${order.orderId} was already claimed and completed.`,
                order,
                alreadyClaimed: true
            });
        }

        // Auto-transition to Completed via atomic state manager
        const updatedOrder = await prisma.$transaction(async (tx) => {
            return await handleOrderStateTransition(tx, order.id, 'Completed', username, {
                note: `Claim slip verified. Handed over to customer (${order.client}).`
            });
        });

        const io = req.app.get('io');
        if (io) {
            io.emit('ordersUpdated', { orderId: updatedOrder.orderId, status: updatedOrder.status, id: updatedOrder.id });
            socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, updatedOrder);
        }

        res.json({
            success: true,
            order: updatedOrder,
            client: order.client,
            message: `Verified! Hand over packaged order to ${order.client}.`
        });
    } catch (err) {
        console.error('Scan Claim Handover Error:', err);
        res.status(500).json({ message: 'Error processing counter claim handover' });
    }
};


