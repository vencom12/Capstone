const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const customerAuth = require('../middleware/customerAuth');

router.use(customerAuth());

router.get('/dashboard-state', customerController.getDashboardState);
router.post('/wallet/topup', (req, res, next) => req.app.get('verifyCSRF')(req, res, next), customerController.topupWallet);
router.post('/payment/validate', (req, res, next) => req.app.get('verifyCSRF')(req, res, next), customerController.validatePayment);
router.post('/order/submit', (req, res, next) => req.app.get('verifyCSRF')(req, res, next), customerController.submitOrder);
router.get('/favorites', customerController.getFavorites);
router.post('/favorites/:id', customerController.addFavorite);
router.delete('/favorites/:id', customerController.removeFavorite);
router.patch('/settings', customerController.updateSettings);
router.get('/receipt/:id', customerController.getReceipt);
router.get('/receipt/:id/download', customerController.generateReceiptPDF);

module.exports = router;
