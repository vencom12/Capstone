const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const customerAuth = require('../middleware/customerAuth');
const { validate, schemas } = require('../utils/validation');

router.get('/dashboard-state', (req, res, next) => {
    // Optional Auth: Try to decode token if it exists
    const token = req.cookies.customer_token || req.cookies.token;
    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            req.user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) {}
    }
    next();
}, customerController.getDashboardState);

router.use(customerAuth());

router.post('/wallet/topup', (req, res, next) => req.app.get('verifyCSRF')(req, res, next), validate(schemas.topup), customerController.topupWallet);
router.post('/payment/validate', (req, res, next) => req.app.get('verifyCSRF')(req, res, next), customerController.validatePayment);
router.post('/order/submit', (req, res, next) => req.app.get('verifyCSRF')(req, res, next), validate(schemas.order), customerController.submitOrder);
router.get('/favorites', customerController.getFavorites);
router.post('/favorites/:id', customerController.addFavorite);
router.delete('/favorites/:id', customerController.removeFavorite);
router.patch('/settings', customerController.updateSettings);
router.get('/receipt/:id', customerController.getReceipt);
router.get('/receipt/:id/download', customerController.generateReceiptPDF);

module.exports = router;
