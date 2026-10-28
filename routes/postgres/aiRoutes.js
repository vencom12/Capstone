const express = require('express');
const router = express.Router();
const { createTokenBucketLimiter } = require('../../utils/tokenBucketLimiter');
const aiController = require('../../controllers/postgres/aiController');
const auth = require('../../middleware/auth');

// Strict Token Bucket for AI Vision Receipt Verification (expensive API calls: capacity 5 burst, refills 5/min)
const verifyReceiptLimiter = createTokenBucketLimiter({
    name: 'ai-verify-receipt',
    capacity: 5,
    refillRate: 5,
    refillIntervalMs: 60 * 1000,
    message: { success: false, message: 'Too many verification attempts. Please wait a moment for your token bucket to refill.' }
});

// Token Bucket Rate Limiter for Staff Assistant Chat (Admin & Employee: capacity 15 burst, refills 30/min = 0.5/sec)
const staffChatLimiter = createTokenBucketLimiter({
    name: 'ai-staff-chat',
    capacity: 15,
    refillRate: 30,
    refillIntervalMs: 60 * 1000,
    message: { 
        success: false, 
        reply: "⚠️ Slow down: You've sent too many messages in a short time. Please pause for a few seconds while your chat tokens refill." 
    }
});

// Token Bucket Rate Limiter for Public Storefront Chat (Anonymous Visitors & Bots: capacity 8 burst, refills 15/min = 0.25/sec)
const storefrontChatLimiter = createTokenBucketLimiter({
    name: 'ai-storefront-chat',
    capacity: 8,
    refillRate: 15,
    refillIntervalMs: 60 * 1000,
    message: { 
        success: false, 
        reply: "You are chatting too fast! Please wait a few seconds for your chat token bucket to refill before sending another message." 
    }
});

router.post('/chat', auth(), staffChatLimiter, aiController.chat);
router.get('/logs', auth(), aiController.getLogs);
router.post('/verify-receipt', auth(), verifyReceiptLimiter, aiController.verifyReceipt);
router.get('/models', aiController.listModels);

// Public storefront chatbot — protected with anti-bot rate limiting
router.post('/storefront-chat', storefrontChatLimiter, aiController.storefrontChat);

module.exports = router;
