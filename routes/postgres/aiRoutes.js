const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const aiController = require('../../controllers/postgres/aiController');
const auth = require('../../middleware/auth');

// Strict rate limiter for AI Vision (expensive API calls)
const verifyReceiptLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many verification attempts. Please wait a minute before trying again.' }
});

// Anti-DDoS Rate Limiter for Staff Assistant Chat (Admin & Employee)
const staffChatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // Max 30 prompts/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
        success: false, 
        reply: "⚠️ Slow down: You've sent too many messages in a short time. Please pause for a few seconds before trying again." 
    }
});

// Anti-DDoS Rate Limiter for Public Storefront Chat (Anonymous Visitors & Bots)
const storefrontChatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 15, // Max 15 messages/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
        success: false, 
        reply: "You are chatting too fast! Please wait a moment before sending another message." 
    }
});

router.post('/chat', auth(), staffChatLimiter, aiController.chat);
router.get('/logs', auth(), aiController.getLogs);
router.post('/verify-receipt', auth(), verifyReceiptLimiter, aiController.verifyReceipt);
router.get('/models', aiController.listModels);

// Public storefront chatbot — protected with anti-bot rate limiting
router.post('/storefront-chat', storefrontChatLimiter, aiController.storefrontChat);

module.exports = router;
