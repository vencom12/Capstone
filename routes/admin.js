const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

router.use(adminAuth());

router.get('/dashboard-state', adminController.getDashboardState);
router.get('/users', adminController.getAllUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.get('/analytics', adminController.getAnalytics);
router.post('/orders/batch-status', adminController.updateOrdersStatus);

module.exports = router;
