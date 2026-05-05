const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    transactionID: { type: String, required: true, unique: true },
    orderID: { type: String, required: true }, // External ID
    orderRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // Internal Ref
    userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    receiptLink: { type: String },
    receiptId: { type: String, unique: true, sparse: true }, // Added to resolve stale index conflicts in Atlas
    timestamp: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Transaction', transactionSchema);
