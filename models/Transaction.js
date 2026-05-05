const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiptId: { type: String, required: true, unique: true },
    provider: { type: String, required: true, enum: ['wallet', 'cash_at_counter', 'stripe_stub', 'paypal_stub'] },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    receiptLink: { type: String },
    createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Transaction', transactionSchema);
