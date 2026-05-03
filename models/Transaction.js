const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    provider: {
        type: String,
        enum: ['wallet', 'cash', 'stripe_stub', 'paypal_stub'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    receiptId: {
        type: String,
        unique: true,
        required: true
    },
    metadata: {
        type: Object,
        default: {}
    }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
