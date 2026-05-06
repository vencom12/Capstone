const mongoose = require('mongoose');

const ReceiptSchema = new mongoose.Schema({
    receiptID: {
        type: String,
        required: true,
        unique: true
    },
    orderID: {
        type: String,
        required: true
    },
    orderRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    userID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    paymentMethod: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['Paid', 'Pending', 'Failed'],
        default: 'Pending'
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    metadata: {
        type: Map,
        of: String
    }
});

// Optimization: Index userID for fast customer dashboard loads
ReceiptSchema.index({ userID: 1, timestamp: -1 });
ReceiptSchema.index({ orderID: 1 });

module.exports = mongoose.model('Receipt', ReceiptSchema);
