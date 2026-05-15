const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const customerController = require('../../controllers/postgres/customerController');
const auth = require('../../middleware/auth');

// dashboard-state uses OPTIONAL auth (guests need to see products too)
router.get('/dashboard-state', (req, res, next) => {
    const token = req.cookies.customer_token || req.cookies.token;
    if (token) {
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) { /* guest — continue without user */ }
    }
    next();
}, customerController.getDashboardState);

// All routes below require authentication
router.post('/wallet/topup', auth(), customerController.topupWallet);
router.post('/payment/validate', auth(), customerController.validatePayment);
router.post('/order/submit', auth(), customerController.submitOrder);
router.post('/favorites/:id', auth(), customerController.addFavorite);
router.delete('/favorites/:id', auth(), customerController.removeFavorite);
router.get('/receipt/:id', auth(), customerController.getReceipt);

module.exports = router;
