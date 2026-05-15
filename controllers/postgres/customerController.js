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
        const { items, totalAmount, paymentMethod, address, deliveryTime, notes, receiptUrl } = req.body;
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
                    receiptLink: receiptUrl || `/api/customer/receipt/${secureReceiptId}/download`,
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
                    imageUrl: receiptUrl || null,
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
        const id = req.params.id;
        // 1. Try Receipt table first (by receiptID)
        let receiptData = await prisma.receipt.findFirst({
            where: { receiptID: id },
            include: { user: true }
        });

        let tx;
        if (receiptData) {
            tx = await prisma.transaction.findFirst({
                where: { orderID: receiptData.orderID },
                include: { order: true, user: true }
            });
        } else {
            // 2. Try finding by transactionID
            tx = await prisma.transaction.findFirst({
                where: { transactionID: id },
                include: { order: true, user: true }
            });

            // 3. Try finding by orderId
            if (!tx) {
                const order = await prisma.order.findFirst({
                    where: { orderId: id },
                    include: { transaction: true, user: true }
                });
                if (order && order.transaction) {
                    tx = order.transaction;
                    tx.order = order;
                    tx.user = order.user;
                }
            }
        }

        if (!tx) return res.status(404).json({ message: 'Receipt not found' });
        
        // Check authorization if it's a customer
        if (req.user.role === 'customer' && tx.userId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        res.json({
            transactionID: tx.transactionID,
            orderID: tx.orderID,
            amount: tx.amount,
            status: tx.status,
            timestamp: tx.timestamp,
            items: tx.order ? tx.order.items : [],
            client: tx.user?.username || 'Customer'
        });
    } catch (err) {
        console.error('getReceipt error:', err);
        res.status(500).json({ message: 'Error fetching receipt' });
    }
};

const PDFDocument = require('pdfkit');

exports.downloadReceipt = async (req, res) => {
    try {
        const id = req.params.id;
        
        let tx = await prisma.transaction.findFirst({
            where: { OR: [{ transactionID: id }, { orderID: id }] },
            include: { order: true, user: true }
        });

        if (!tx) {
            const receiptRecord = await prisma.receipt.findFirst({ where: { receiptID: id } });
            if (receiptRecord) {
                tx = await prisma.transaction.findFirst({
                    where: { orderID: receiptRecord.orderID },
                    include: { order: true, user: true }
                });
            }
        }

        if (!tx) return res.status(404).send('Receipt not found');

        const date = new Date(tx.timestamp);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString();
        const items = tx.order?.items || [];
        const subtotal = parseFloat(tx.amount);
        const tax = subtotal * 0.12; 
        const total = subtotal + tax;

        // Create PDF
        const doc = new PDFDocument({ size: [300, 600], margin: 20 });
        
        res.setHeader('Content-disposition', `attachment; filename=STITCH_OPT_RECEIPT_${id}.pdf`);
        res.setHeader('Content-type', 'application/pdf');
        
        doc.pipe(res);

        const pageWidth = 300;
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);

        // Header
        doc.font('Helvetica-Bold').fontSize(16).text('STITCH-OPT DESIGNS', { align: 'center' });
        doc.font('Helvetica').fontSize(9).text('Premium Embroidery Services', { align: 'center' });
        doc.text('123 Digital Thread Lane, Manila', { align: 'center' });
        doc.text('Contact: +63 (02) 888-THREAD', { align: 'center' });
        doc.moveDown(0.5);
        doc.text('------------------------------------------', { align: 'center' });
        doc.moveDown(0.5);

        // Details - Use Courier for that "Receipt Printer" look
        doc.font('Courier').fontSize(8);
        const drawDetail = (label, value) => {
            doc.text(label.padEnd(12) + ': ' + value, { align: 'center' });
        };

        drawDetail('RECEIPT', id);
        drawDetail('DATE', dateStr);
        drawDetail('TIME', timeStr);
        drawDetail('CASHIER', 'StitchMaster AI');
        drawDetail('CUSTOMER', tx.user?.username || 'Valued Client');
        
        doc.moveDown(1);
        doc.font('Helvetica').text('------------------------------------------', { align: 'center' });
        doc.moveDown(0.5);

        // Table Header
        doc.font('Courier-Bold').fontSize(9);
        const tableLine = 'ITEM'.padEnd(18) + 'QTY'.padEnd(6) + 'PRICE'.padStart(8);
        doc.text(tableLine, { align: 'center' });
        doc.font('Courier').fontSize(8);
        doc.moveDown(0.5);

        // Items
        items.forEach(item => {
            const name = (item.name || 'Design').substring(0, 17).padEnd(18);
            const qty = '1'.padEnd(6);
            const price = `$${parseFloat(item.price).toFixed(2)}`.padStart(8);
            doc.text(name + qty + price, { align: 'center' });
            doc.moveDown(0.2);
        });

        doc.moveDown(0.5);
        doc.font('Helvetica').text('------------------------------------------', { align: 'center' });
        
        // Totals Section
        doc.font('Courier').fontSize(9);
        doc.moveDown(0.5);
        
        const subtotalLine = 'SUBTOTAL:'.padEnd(20) + `$${subtotal.toFixed(2)}`.padStart(12);
        const vatLine      = 'VAT (12%):'.padEnd(20) + `$${tax.toFixed(2)}`.padStart(12);
        const totalLine    = 'TOTAL:'.padEnd(20) + `$${total.toFixed(2)}`.padStart(12);

        doc.text(subtotalLine, { align: 'center' });
        doc.text(vatLine, { align: 'center' });
        doc.moveDown(0.5);
        doc.font('Courier-Bold').fontSize(11).text(totalLine, { align: 'center' });

        // Footer
        doc.moveDown(3);
        doc.font('Helvetica').fontSize(8).text('------------------------------------------', { align: 'center' });
        doc.moveDown(1);
        doc.font('Helvetica-Bold').fontSize(10).text('Thank you for choosing us!', { align: 'center' });
        doc.font('Helvetica').fontSize(8).text('Visit again for more designs!', { align: 'center' });
        doc.fillColor('blue').text('www.stitch-opt.com', { align: 'center' });

        doc.end();

    } catch (err) {
        console.error('downloadReceipt error:', err);
        res.status(500).send('Error generating PDF');
    }
};

exports.validatePayment = async (req, res) => {
    try {
        const { method, total } = req.body;
        if (method === 'wallet') {
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user || (user.walletBalance || 0) < total) {
                return res.status(400).json({ message: 'Insufficient wallet balance' });
            }
        }
        res.json({ valid: true });
    } catch (err) {
        res.status(500).json({ message: 'Validation error' });
    }
};
