const prisma = require('../../utils/prisma');
const crypto = require('crypto');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');

exports.getDashboardState = async (req, res) => {
    try {
        const userId = req.user ? req.user.id : null;
        
        let orders = [], currentUser = null, transactions = [], receipts = [];

        if (userId) {
            const [o, u, t, r] = await Promise.all([
                prisma.order.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
                prisma.user.findUnique({ 
                    where: { id: userId }, 
                    include: { favorites: true } 
                }),
                prisma.transaction.findMany({ where: { userId }, orderBy: { timestamp: 'desc' } }),
                prisma.receipt.findMany({ where: { userId }, orderBy: { timestamp: 'desc' } })
            ]);
            orders = o; currentUser = u; transactions = t; receipts = r;
        }

        const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });

        res.json({
            orders,
            products,
            favorites: currentUser ? currentUser.favorites : [],
            walletBalance: currentUser ? currentUser.walletBalance : 0,
            address: currentUser ? currentUser.address : '',
            transactions,
            receipts
        });
    } catch (err) {
        console.error('getDashboardState error:', err);
        res.status(500).json({ message: 'Error fetching dashboard state' });
    }
};

exports.topupWallet = async (req, res) => {
    try {
        const { amount } = req.body;
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ message: 'Invalid top-up amount.' });
        }

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { walletBalance: { increment: numAmount } }
        });

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.WALLET, { balance: user.walletBalance }, `user:${user.id}`);
        res.json({ message: `Successfully topped up $${numAmount.toFixed(2)}`, walletBalance: user.walletBalance });
    } catch (err) {
        res.status(500).json({ message: 'Server error during top-up' });
    }
};

exports.submitOrder = async (req, res) => {
    try {
        const { items, totalAmount, paymentMethod, address, deliveryTime, notes } = req.body;
        const userId = req.user.id;

        if (!items || items.length === 0) return res.status(400).json({ message: 'Cart is empty' });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const numTotal = parseFloat(totalAmount);
        if (paymentMethod === 'wallet' && (user.walletBalance || 0) < numTotal) {
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        const secureOrderId = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const secureTransactionId = `TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const secureReceiptId = `RCP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

        // Prisma Transaction for Atomic operation
        const result = await prisma.$transaction(async (tx) => {
            // 1. Deduct balance if using wallet
            if (paymentMethod === 'wallet') {
                await tx.user.update({
                    where: { id: userId },
                    data: { walletBalance: { decrement: numTotal } }
                });
            }

            // 2. Create Order
            const order = await tx.order.create({
                data: {
                    orderId: secureOrderId,
                    client: user.username,
                    userId: user.id,
                    design: "Cart Order",
                    items: items, // JSON field
                    totalAmount: numTotal,
                    paymentMethod,
                    paymentStatus: (paymentMethod === 'wallet') ? 'paid' : 'unpaid',
                    status: (paymentMethod === 'wallet') ? 'In Queue' : 'Awaiting Payment',
                    address,
                    deliveryTime,
                    notes,
                    progress: (paymentMethod === 'wallet') ? 5 : 0
                }
            });

            // 3. Create Transaction
            const transaction = await tx.transaction.create({
                data: {
                    transactionID: secureTransactionId,
                    orderID: secureOrderId,
                    amount: numTotal,
                    status: (paymentMethod === 'wallet') ? 'completed' : 'pending',
                    receiptLink: `/api/customer/receipt/${secureReceiptId}/download`,
                    receiptId: secureReceiptId,
                    userId: user.id
                }
            });

            // 4. Create Receipt
            const receipt = await tx.receipt.create({
                data: {
                    receiptID: secureReceiptId,
                    orderID: secureOrderId,
                    paymentMethod,
                    amount: numTotal,
                    status: (paymentMethod === 'wallet') ? 'Paid' : 'Pending',
                    userId: user.id
                }
            });

            // 5. Link back to order
            return await tx.order.update({
                where: { id: order.id },
                data: { transactionId: transaction.id, receiptId: receipt.id }
            });
        });

        // Socket notifications
        const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
        const io = req.app.get('io');
        socketUtil.emitDataChanged(io, ACTIONS.CREATE, ENTITIES.ORDER, result, [`user:${user.id}`, 'staff']);
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.WALLET, { balance: updatedUser.walletBalance }, `user:${user.id}`);

        res.json({ message: 'Order placed successfully.', order: result, receiptID: secureReceiptId });
    } catch (err) {
        console.error('submitOrder error:', err);
        res.status(400).json({ message: 'Failed to place order' });
    }
};

exports.addFavorite = async (req, res) => {
    try {
        await prisma.user.update({
            where: { id: req.user.id },
            data: { favorites: { connect: { id: req.params.id } } }
        });
        res.json({ message: 'Added to favorites' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.removeFavorite = async (req, res) => {
    try {
        await prisma.user.update({
            where: { id: req.user.id },
            data: { favorites: { disconnect: { id: req.params.id } } }
        });
        res.json({ message: 'Removed from favorites' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getReceipt = async (req, res) => {
    try {
        const tx = await prisma.transaction.findFirst({
            where: { transactionID: req.params.id, userId: req.user.id },
            include: { order: true }
        });
        if (!tx) return res.status(404).json({ message: 'Receipt not found' });
        res.json({
            transactionID: tx.transactionID,
            orderID: tx.orderID,
            amount: tx.amount,
            status: tx.status,
            timestamp: tx.timestamp,
            items: tx.order ? tx.order.items : [],
            client: req.user.username
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching receipt' });
    }
};
