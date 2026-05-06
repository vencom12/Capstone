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
        
        // If guest, only fetch products
        if (!userId) {
            const products = await Product.find().sort({ createdAt: -1 }).limit(100);
            return res.json({
                orders: [],
                products,
                favorites: [],
                walletBalance: 0,
                address: '',
                transactions: [],
                receipts: []
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15; // User requested 15 per page
        const skip = (page - 1) * limit;

        const productPage = parseInt(req.query.productPage) || 1;
        const productLimit = 15;
        const productSkip = (productPage - 1) * productLimit;

        const [orders, currentUser, transactions, products, receipts, totalOrders, totalProducts] = await Promise.all([
            Order.find({ userId }).sort({ date: -1 }).skip(skip).limit(limit).lean(),
            User.findById(userId).populate({ path: 'favorites', select: 'name price tag imageUrl' }).lean(),
            Transaction.find({ userID: userId }).sort({ timestamp: -1 }).limit(20).lean(),
            Product.find().sort({ createdAt: -1 }).skip(productSkip).limit(productLimit).lean(),
            Receipt.find({ userID: userId }).sort({ timestamp: -1 }).limit(20).lean(),
            Order.countDocuments({ userId }),
            Product.countDocuments()
        ]);

        res.json({
            orders,
            products,
            favorites: currentUser ? currentUser.favorites : [],
            walletBalance: currentUser ? currentUser.walletBalance : 0,
            address: currentUser ? currentUser.address : '',
            transactions,
            receipts,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalOrders / limit),
                totalOrders
            }
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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { items, totalAmount, paymentMethod, address, deliveryTime, notes } = req.body;
        
        if (!items || items.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Cart is empty' });
        }

        const user = await User.findById(req.user.id).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'User not found' });
        }

        const numTotal = parseFloat(totalAmount);
        if (paymentMethod === 'wallet' && (user.walletBalance || 0) < numTotal) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        const secureOrderId = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const secureTransactionId = `TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const secureReceiptId = `RCP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

        // Phase 1: Deduct wallet balance
        if (paymentMethod === 'wallet') {
            await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: -numTotal } }, { session });
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
            address,
            deliveryTime,
            notes,
            progress: (paymentMethod === 'wallet') ? 5 : 0
        });
        await newOrder.save({ session });

        const transaction = new Transaction({
            transactionID: secureTransactionId,
            orderID: secureOrderId,
            orderRef: newOrder._id,
            userID: user._id,
            amount: numTotal,
            status: (paymentMethod === 'wallet') ? 'completed' : 'pending',
            receiptLink: `/api/customer/receipt/${secureReceiptId}/download`,
            receiptId: secureReceiptId
        });
        await transaction.save({ session });

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
        await receipt.save({ session });

        newOrder.transactionId = transaction._id;
        newOrder.receiptRef = receipt._id;
        await newOrder.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Success Phase: Emit events (outside transaction for reliability)
        const updatedUser = await User.findById(req.user.id);
        const io = req.app.get('io');
        socketUtil.emitDataChanged(io, ACTIONS.CREATE, ENTITIES.ORDER, newOrder, [`user:${user._id}`, 'staff']);
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.WALLET, { balance: updatedUser.walletBalance }, `user:${user._id}`);
        socketUtil.emitDataChanged(io, ACTIONS.CREATE, ENTITIES.TRANSACTION, transaction, `user:${user._id}`);

        res.json({ message: 'Order placed successfully.', order: newOrder, receiptID: secureReceiptId });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
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
        const transaction = await Transaction.findOne({ transactionID: req.params.id, userID: req.user.id }).populate('orderRef');
        if (!transaction) return res.status(404).json({ message: 'Receipt not found' });

        // Return structured data for a receipt view
        res.json({
            transactionID: transaction.transactionID,
            orderID: transaction.orderID,
            amount: transaction.amount,
            status: transaction.status,
            timestamp: transaction.timestamp,
            items: transaction.orderRef ? transaction.orderRef.items : [],
            client: req.user.username
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
