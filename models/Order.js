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
    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    paymentMethod: { type: String },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    totalAmount: { type: Number, required: true },
    progress: { type: Number, default: 0 },
    date: { type: Date, default: Date.now, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }
});

module.exports = mongoose.model('Order', orderSchema);
