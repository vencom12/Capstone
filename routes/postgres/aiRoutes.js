const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const aiController = require('../../controllers/postgres/aiController');
const auth = require('../../middleware/auth');

// Strict rate limiter for AI Vision (expensive API calls)
const verifyReceiptLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many verification attempts. Please wait a minute before trying again.' }
});

router.post('/chat', auth(), aiController.chat);
router.get('/logs', auth(), aiController.getLogs);
router.post('/verify-receipt', auth(), verifyReceiptLimiter, aiController.verifyReceipt);
router.get('/models', aiController.listModels);

// Public storefront chatbot — no auth required (guests can use it)
router.post('/storefront-chat', aiController.storefrontChat);

module.exports = router;
