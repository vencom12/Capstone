const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const customerAuth = require('../middleware/customerAuth');

router.use(customerAuth());

router.get('/dashboard-state', customerController.getDashboardState);
router.post('/wallet/topup', customerController.topupWallet);
router.post('/payment/validate', customerController.validatePayment);
router.post('/order/submit', customerController.submitOrder);
router.get('/favorites', customerController.getFavorites);
router.post('/favorites/:id', customerController.addFavorite);
router.delete('/favorites/:id', customerController.removeFavorite);
router.patch('/settings', customerController.updateSettings);
router.get('/receipt/:id', customerController.getReceipt);

module.exports = router;
