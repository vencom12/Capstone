const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/postgres/customerController');
const auth = require('../../middleware/auth');

router.get('/dashboard-state', auth(), customerController.getDashboardState);
router.post('/topup', auth(), customerController.topupWallet);
router.post('/submit-order', auth(), customerController.submitOrder);
router.post('/favorites/:id', auth(), customerController.addFavorite);
router.delete('/favorites/:id', auth(), customerController.removeFavorite);
router.get('/receipt/:id', auth(), customerController.getReceipt);

module.exports = router;
