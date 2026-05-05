const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    client: { type: String, required: true },
    design: { type: String, required: true },
    items: [{
        name: String,
        price: Number,
        quantity: { type: Number, default: 1 }
    }],
    status: { type: String, default: 'Pending Payment' },
    progress: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    paymentMethod: { type: String, enum: ['wallet', 'cash_at_counter', 'stripe_stub', 'paypal_stub', 'none'], default: 'none' },
    address: { type: String },
    deliveryTime: { type: String },
    notes: { type: String },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    receiptRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Receipt' },
    totalAmount: { type: Number, default: 0 },
    date: { type: Date, default: Date.now, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }
});

module.exports = mongoose.model('Order', orderSchema);
