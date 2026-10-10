const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/postgres/adminController');
const forecastingController = require('../../controllers/postgres/forecastingController');
const adminAuth = require('../../middleware/adminAuth');
const staffAuth = require('../../middleware/staffAuth');
const auditLogger = require('../../middleware/postgres/auditLogger');
const { validate, schemas } = require('../../utils/validation');
const multer = require('multer');

const { storage } = require('../../utils/cloudinary');
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG and WEBP images are allowed.'), false);
        }
    }
});

// --- Admin Only Routes ---
router.get('/dashboard-state', adminAuth(), adminController.getDashboardState);
router.get('/users', adminAuth(), adminController.getAllUsers);
router.post('/users', adminAuth(), auditLogger('User', 'CREATE_USER'), adminController.createUser);
router.put('/users/:id', adminAuth(), auditLogger('User', 'UPDATE_USER'), adminController.updateUser);
router.delete('/users/:id', adminAuth(), auditLogger('User', 'DELETE_USER'), adminController.deleteUser);
router.get('/audit-logs', adminAuth(), adminController.getGlobalAuditLogs);
router.get('/analytics', adminAuth(), adminController.getAnalytics);

// Product Catalog & Pricing Management (Admin Only)
router.post('/products', adminAuth(), upload.single('image'), auditLogger('Product', 'CREATE_PRODUCT'), adminController.createProduct);
router.patch('/products/:id', adminAuth(), upload.single('image'), auditLogger('Product', 'UPDATE_PRODUCT'), adminController.updateProduct);
router.delete('/products/:id', adminAuth(), auditLogger('Product', 'DELETE_PRODUCT'), adminController.deleteProduct);

// Material Pool Deletion, Creation & Global Thresholds (Admin Only)
router.post('/inventory', adminAuth(), auditLogger('Inventory', 'CREATE_INVENTORY'), adminController.createInventoryItem);
router.delete('/inventory/:id', adminAuth(), auditLogger('Inventory', 'DELETE_INVENTORY'), adminController.deleteInventoryItem);
router.patch('/inventory/global', adminAuth(), auditLogger('Inventory', 'UPDATE_GLOBAL_THRESHOLD'), adminController.updateGlobalThreshold);

// Settings Mutation (Admin Only)
router.patch('/settings', adminAuth(), auditLogger('Settings', 'UPDATE_SETTINGS'), adminController.updateSettings);
router.put('/settings', adminAuth(), auditLogger('Settings', 'UPDATE_SETTINGS'), adminController.updateSettings);
router.post('/settings/logo', adminAuth(), upload.single('logo'), auditLogger('Settings', 'UPLOAD_LOGO'), adminController.uploadBusinessLogo);
router.post('/settings/gcash-qr', adminAuth(), upload.single('qr'), auditLogger('Settings', 'UPLOAD_GCASH_QR'), adminController.uploadGCashQr);
router.post('/settings/test-ai', adminAuth(), adminController.testAISettings);

// Intelligence & Forecasting (Admin Only)
router.get('/intelligence/suggestions', adminAuth(), forecastingController.getSuggestions);
router.post('/intelligence/execute', adminAuth(), forecastingController.executeSuggestionAction);
router.post('/intelligence/decline', adminAuth(), forecastingController.declineSuggestionAction);
router.get('/purchase-orders', staffAuth(), forecastingController.getPurchaseOrders);
router.post('/purchase-orders', staffAuth(), auditLogger('PurchaseOrder', 'CREATE_PURCHASE_ORDER'), forecastingController.createPurchaseOrder);
router.put('/purchase-orders/:id/status', staffAuth(), auditLogger('PurchaseOrder', 'UPDATE_PO_STATUS'), forecastingController.updatePurchaseOrderStatus);
router.post('/purchase-orders/:id/email', staffAuth(), auditLogger('PurchaseOrder', 'EMAIL_PO'), forecastingController.emailPurchaseOrder);
router.get('/purchase-orders/:id/pdf', staffAuth(), forecastingController.downloadPurchaseOrderPdf);
router.put('/purchase-orders/:id/approve', adminAuth(), forecastingController.approvePurchaseOrder);

// --- Staff (Admin + Employee) Routes ---
// Operational stockpile tracking, order processing, and read access
router.get('/settings', staffAuth(), adminController.getSettings);
router.get('/orders/history', staffAuth(), adminController.getOrderHistory);
router.post('/orders/batch-status', staffAuth(), validate(schemas.statusUpdate), auditLogger('Order', 'BATCH_UPDATE_STATUS'), adminController.updateOrdersStatus);
router.get('/inventory/logs', staffAuth(), adminController.getInventoryLogs);
router.get('/inventory/shopping-list/pdf', staffAuth(), adminController.downloadShoppingListPdf);
// Stock count adjustment (+ / -) -> Staff permitted
router.patch('/inventory/:id', staffAuth(), auditLogger('Inventory', 'UPDATE_INVENTORY'), adminController.updateInventoryItem);

// Walk-In Counter Mode Order Creation (Staff permitted)
router.post('/orders/walk-in', staffAuth(), auditLogger('Order', 'CREATE_WALKIN_ORDER'), adminController.createWalkInOrder);

module.exports = router;
