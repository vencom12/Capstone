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

        req.app.get('io').to(`user:${user._id}`).emit('dataChanged', { type: 'wallet', balance: user.walletBalance });
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

        // Deduct wallet balance using atomic update (bypasses schema validation on unrelated fields)
        if (paymentMethod === 'wallet') {
            await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: -numTotal } }, { session });
        }

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
            receiptLink: `/api/payments/receipt/${secureTransactionId}`
        });
        await transaction.save({ session });

        newOrder.transactionId = transaction._id;
        await newOrder.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Refresh the user's balance for the response
        const updatedUser = await User.findById(req.user.id);

        const io = req.app.get('io');
        io.to(`user:${user._id}`).to('staff').emit('ordersUpdated');
        io.to(`user:${user._id}`).emit('transactionsUpdated');
        io.to(`user:${user._id}`).emit('dataChanged', { type: 'wallet', balance: updatedUser.walletBalance });

        res.json({ message: 'Order placed successfully.', order: newOrder });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('submitOrder error:', err);
        const fs = require('fs');
        const path = require('path');
        fs.appendFileSync(path.join(__dirname, '..', 'server_log.txt'), `[${new Date().toISOString()}] submitOrder error: ${err.message}\n`);
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
