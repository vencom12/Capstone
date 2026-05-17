const User = require('../models/User');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Receipt = require('../models/Receipt');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const mongoose = require('mongoose');
const crypto = require('crypto');
const socketUtil = require('../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../utils/apiConstants');

exports.getDashboardState = async (req, res) => {
    try {
        const userId = req.user ? req.user.id : null;
        
        let orders = [], currentUser = null, transactions = [], receipts = [];

        if (userId) {
            const [o, u, t, r] = await Promise.all([
                Order.find({ userId }).sort({ date: -1 }).lean(),
                User.findById(userId).populate({ path: 'favorites', select: 'name price tag imageUrl' }).lean(),
                Transaction.find({ userID: userId }).sort({ timestamp: -1 }).lean(),
                Receipt.find({ userID: userId }).sort({ timestamp: -1 }).lean()
            ]);
            orders = o; currentUser = u; transactions = t; receipts = r;
        }

        const products = await Product.find().sort({ createdAt: -1 }).lean();

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
            return res.status(400).json({ message: 'Invalid top-up amount. Use positive digits only.' });
        }

        // Use findByIdAndUpdate to bypass strict schema validation on unmodified fields
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $inc: { walletBalance: numAmount } },
            { new: true }
        );

        if (!user) return res.status(404).json({ message: 'User not found' });
        
        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.WALLET, { balance: user.walletBalance }, `user:${user._id}`);
        res.json({ message: `Successfully topped up $${numAmount.toFixed(2)}`, walletBalance: user.walletBalance });
    } catch (err) {
        res.status(500).json({ message: 'Server error during top-up' });
    }
};

exports.validatePayment = async (req, res) => {
    try {
        const { method, total } = req.body;
        const numTotal = parseFloat(total);

        if (isNaN(numTotal) || numTotal <= 0) {
            return res.status(400).json({ message: 'Invalid order total for validation.' });
        }

        if (method === 'wallet') {
            const user = await User.findById(req.user.id);
            if (!user) return res.status(404).json({ message: 'User not found' });

            const balance = user.walletBalance || 0;
            if (balance < numTotal) {
                return res.status(400).json({
                    message: `Insufficient balance. You have $${balance.toFixed(2)} but need $${numTotal.toFixed(2)}.`
                });
            }
        }
        res.json({ status: 'Verified', message: 'Payment method is valid and ready.' });
    } catch (err) {
        res.status(500).json({ message: 'Validation error' });
    }
};

exports.submitOrder = async (req, res) => {
    try {
        const { items, totalAmount, paymentMethod, address, deliveryTime, notes } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'Cart is empty' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const numTotal = parseFloat(totalAmount);
        if (paymentMethod === 'wallet' && (user.walletBalance || 0) < numTotal) {
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        const secureOrderId = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const secureTransactionId = `TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const secureReceiptId = `RCP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

        // Phase 1: Deduct wallet balance
        if (paymentMethod === 'wallet') {
            await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: -numTotal } });
        }

        // Phase 2: Create Order, Transaction, and Receipt
        const newOrder = new Order({
            orderId: secureOrderId,
            client: user.username,
            userId: user._id,
            design: "Cart Order",
            items,
            totalAmount: numTotal,
            paymentMethod,
            paymentStatus: (paymentMethod === 'wallet') ? 'paid' : 'unpaid',
            status: (paymentMethod === 'wallet') ? 'In Queue' : 'Awaiting Payment',
            address: address || user.address,
            deliveryTime,
            notes,
            progress: (paymentMethod === 'wallet') ? 5 : 0
        });
        await newOrder.save();

        const transaction = new Transaction({
            transactionID: secureTransactionId,
            orderID: secureOrderId,
            orderRef: newOrder._id,
            userID: user._id,
            amount: numTotal,
            status: (paymentMethod === 'wallet') ? 'processing' : 'pending',
            receiptLink: `/api/customer/receipt/${secureReceiptId}/download`,
            receiptId: secureReceiptId
        });
        await transaction.save();

        const receipt = new Receipt({
            receiptID: secureReceiptId,
            orderID: secureOrderId,
            orderRef: newOrder._id,
            userID: user._id,
            paymentMethod,
            amount: numTotal,
            status: (paymentMethod === 'wallet') ? 'Paid' : 'Pending',
            timestamp: new Date()
        });
        await receipt.save();

        newOrder.transactionId = transaction._id;
        newOrder.receiptRef = receipt._id;
        await newOrder.save();

        // Success Phase: Emit events
        const updatedUser = await User.findById(req.user.id);
        const io = req.app.get('io');
        socketUtil.emitDataChanged(io, ACTIONS.CREATE, ENTITIES.ORDER, newOrder, [`user:${user._id}`, 'staff']);
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.WALLET, { balance: updatedUser.walletBalance }, `user:${user._id}`);
        socketUtil.emitDataChanged(io, ACTIONS.CREATE, ENTITIES.TRANSACTION, transaction, `user:${user._id}`);

        res.json({ message: 'Order placed successfully.', order: newOrder, receiptID: secureReceiptId });

    } catch (err) {
        console.error('submitOrder error:', err);
        res.status(400).json({ message: err.message || 'Failed to place order' });
    }
};


exports.getFavorites = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('favorites').populate('favorites');
        res.json(user.favorites || []);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.addFavorite = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { $addToSet: { favorites: req.params.id } });
        res.json({ message: 'Added to favorites' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.removeFavorite = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { $pull: { favorites: req.params.id } });
        res.json({ message: 'Removed from favorites' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};
exports.updateSettings = async (req, res) => {
    try {
        const { username, email, address, phoneNumber, currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (username) user.username = username;
        if (email) user.email = email;
        if (address) user.address = address;
        if (phoneNumber) user.phoneNumber = phoneNumber;

        if (newPassword) {
            if (!currentPassword) return res.status(400).json({ message: 'Current password required to change password' });
            const isMatch = await user.comparePassword(currentPassword);
            if (!isMatch) return res.status(400).json({ message: 'Incorrect current password' });
            user.password = newPassword;
        }

        await user.save();
        const safeUser = user.toObject();
        delete safeUser.password;
        res.json({ message: 'Settings updated successfully', user: safeUser });
    } catch (err) {
        res.status(500).json({ message: 'Error updating settings' });
    }
};

exports.getReceipt = async (req, res) => {
    try {
        const query = { transactionID: req.params.id };
        if (req.user.role === 'customer') {
            query.userID = req.user.id;
        }
        let transaction = await Transaction.findOne(query).populate('orderRef');

        // Fallback 1: Try finding by orderID or receiptId in transactions
        if (!transaction) {
            const fallbackQuery = {
                $or: [
                    { orderID: req.params.id },
                    { receiptId: req.params.id }
                ]
            };
            if (req.user.role === 'customer') {
                fallbackQuery.userID = req.user.id;
            }
            transaction = await Transaction.findOne(fallbackQuery).populate('orderRef');
        }

        // Fallback 2: Look up Order directly and get its transaction reference
        if (!transaction) {
            const isMongooseId = mongoose.Types.ObjectId.isValid(req.params.id);
            const orderQuery = isMongooseId
                ? { $or: [{ _id: req.params.id }, { orderId: req.params.id }] }
                : { orderId: req.params.id };

            if (req.user.role === 'customer') {
                orderQuery.userId = req.user.id;
            }

            const foundOrder = await Order.findOne(orderQuery);
            if (foundOrder) {
                const txQuery = { orderRef: foundOrder._id };
                if (req.user.role === 'customer') {
                    txQuery.userID = req.user.id;
                }
                transaction = await Transaction.findOne(txQuery).populate('orderRef');
            }
        }

        if (!transaction) return res.status(404).json({ message: 'Receipt not found' });

        // Retrieve correct client username if queried by an admin/employee
        let clientName = req.user.username;
        if (req.user.role !== 'customer') {
            const clientUser = await User.findById(transaction.userID);
            if (clientUser) clientName = clientUser.username;
        }

        // Return structured data for a receipt view
        res.json({
            transactionID: transaction.transactionID,
            orderID: transaction.orderID,
            receiptId: transaction.receiptId,
            amount: transaction.amount,
            status: transaction.status,
            timestamp: transaction.timestamp,
            items: transaction.orderRef ? transaction.orderRef.items : [],
            client: clientName
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching receipt' });
    }
};

exports.generateReceiptPDF = async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const query = { receiptID: req.params.id };
        if (req.user.role === 'customer') {
            query.userID = req.user.id;
        }
        const receipt = await Receipt.findOne(query).populate('orderRef');
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=receipt-${receipt.receiptID}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(20).text('STITCH MASTER AI', { align: 'center' });
        doc.fontSize(10).text('Official Order Receipt', { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Receipt Info
        doc.fontSize(12).text(`Receipt ID: ${receipt.receiptID}`);
        doc.text(`Order ID: ${receipt.orderID}`);
        doc.text(`Date: ${new Date(receipt.timestamp).toLocaleString()}`);
        doc.text(`Customer: ${req.user.username}`);
        doc.text(`Payment Method: ${receipt.paymentMethod}`);
        doc.text(`Status: ${receipt.status}`);
        doc.moveDown();

        // Items Table Header
        const tableTop = doc.y;
        doc.font('Helvetica-Bold');
        doc.text('Item', 50, tableTop);
        doc.text('Qty', 350, tableTop);
        doc.text('Price', 400, tableTop);
        doc.text('Total', 480, tableTop);
        doc.font('Helvetica');
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Items
        if (receipt.orderRef && receipt.orderRef.items) {
            receipt.orderRef.items.forEach(item => {
                const y = doc.y;
                doc.text(item.name, 50, y);
                doc.text(item.quantity.toString(), 350, y);
                doc.text(`$${item.price.toFixed(2)}`, 400, y);
                doc.text(`$${(item.price * item.quantity).toFixed(2)}`, 480, y);
                doc.moveDown();
            });
        }

        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Total
        doc.fontSize(14).font('Helvetica-Bold').text(`TOTAL AMOUNT: $${receipt.amount.toFixed(2)}`, { align: 'right' });
        
        doc.moveDown(2);
        doc.fontSize(10).font('Helvetica').text('Thank you for choosing Stitch Master AI!', { align: 'center', oblique: true });

        doc.end();
    } catch (err) {
        console.error('PDF Generation error:', err);
        res.status(500).send('Error generating PDF');
    }
};
