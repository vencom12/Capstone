const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');
const staffAuth = require('../middleware/staffAuth');
const { validate, schemas } = require('../utils/validation');
const multer = require('multer');
const path = require('path');

const { storage } = require('../utils/cloudinary');
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// --- Admin Only Routes ---
router.get('/dashboard-state', adminAuth(), adminController.getDashboardState);
router.get('/users', adminAuth(), adminController.getAllUsers);
router.post('/users', adminAuth(), adminController.createUser);
router.put('/users/:id', adminAuth(), adminController.updateUser);
router.delete('/users/:id', adminAuth(), adminController.deleteUser);
router.get('/analytics', adminAuth(), adminController.getAnalytics);

// --- Staff (Admin + Employee) Routes ---
router.post('/orders/batch-status', staffAuth(), validate(schemas.statusUpdate), adminController.updateOrdersStatus);
router.post('/products', staffAuth(), upload.single('image'), adminController.createProduct);
router.patch('/products/:id', staffAuth(), upload.single('image'), adminController.updateProduct);
router.delete('/products/:id', staffAuth(), adminController.deleteProduct);
router.patch('/inventory/:id', staffAuth(), adminController.updateInventoryItem);

module.exports = router;
