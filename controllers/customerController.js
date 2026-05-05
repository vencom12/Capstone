const User = require('../models/User');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const mongoose = require('mongoose');
const crypto = require('crypto');

exports.getDashboardState = async (req, res) => {
    try {
        const userId = req.user.id;
        const [orders, currentUser, transactions, products] = await Promise.all([
            Order.find({ userId }).sort({ date: -1 }).limit(50),
            User.findById(userId).select('favorites walletBalance address').populate('favorites'),
            Transaction.find({ userID: userId }).sort({ timestamp: -1 }).limit(50),
            Product.find().sort({ createdAt: -1 }).limit(100)
        ]);

        res.json({
            orders,
            products,
            favorites: currentUser ? currentUser.favorites : [],
            walletBalance: currentUser ? currentUser.walletBalance : 0,
            address: currentUser ? currentUser.address : '',
            transactions
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching dashboard state' });
    }
};

exports.topupWallet = async (req, res) => {
    try {
        const { amount } = req.body;
        if (!/^\d+(\.\d+)?$/.test(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ message: 'Invalid top-up amount. Use positive digits only.' });
        }

        const user = await User.findById(req.user.id);
        const oldBalance = user.walletBalance || 0;
        user.walletBalance = oldBalance + parseFloat(amount);
        await user.save();

        req.app.get('io').to(`user:${user._id}`).emit('dataChanged', { type: 'wallet', balance: user.walletBalance });
        res.json({ message: `Successfully topped up $${parseFloat(amount).toFixed(2)}`, walletBalance: user.walletBalance });
    } catch (err) {
        res.status(500).json({ message: 'Server error during top-up' });
    }
};

exports.validatePayment = async (req, res) => {
    try {
        const { method, total } = req.body;
        if (method === 'wallet') {
            const user = await User.findById(req.user.id);
            if (user.walletBalance < total) {
                return res.status(400).json({ 
                    message: `Insufficient balance. You have $${user.walletBalance.toFixed(2)} but need $${total.toFixed(2)}.` 
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
        
        if (!items || items.length === 0) throw new Error('Cart is empty');
        const user = await User.findById(req.user.id).session(session);

        if (paymentMethod === 'wallet' && user.walletBalance < totalAmount) {
            throw new Error('Insufficient wallet balance');
        }

        const secureOrderId = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const secureTransactionId = `TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

        if (paymentMethod === 'wallet') {
            user.walletBalance -= totalAmount;
            await user.save({ session });
        }

        const newOrder = new Order({
            orderId: secureOrderId,
            client: user.username,
            userId: user._id,
            design: "Cart Order",
            items,
            totalAmount,
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
            amount: totalAmount,
            status: (paymentMethod === 'wallet') ? 'completed' : 'pending',
            receiptLink: `/api/payments/receipt/${secureTransactionId}`
        });
        await transaction.save({ session });

        newOrder.transactionId = transaction._id;
        await newOrder.save({ session });

        await session.commitTransaction();
        session.endSession();

        const io = req.app.get('io');
        io.to(`user:${user._id}`).to('staff').emit('ordersUpdated');
        io.to(`user:${user._id}`).emit('transactionsUpdated');
        io.to(`user:${user._id}`).emit('dataChanged', { type: 'wallet', balance: user.walletBalance });

        res.json({ message: 'Order placed successfully.', order: newOrder });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ message: err.message });
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
