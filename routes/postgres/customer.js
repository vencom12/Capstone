const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const customerController = require('../../controllers/postgres/customerController');
const auth = require('../../middleware/auth');
const multer = require('multer');
const { storage } = require('../../utils/cloudinary');

const { body, validationResult } = require('express-validator');

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG and WEBP images are allowed.'), false);
        }
    }
});

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    next();
};

const orderValidation = [
    body('address').optional().trim().escape(),
    body('notes').optional().trim().escape(),
    body('deliveryTime').optional().trim().escape(),
    validate
];

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

router.get('/capacity', customerController.getCapacity);
router.get('/settings', customerController.getPublicSettings);
router.get('/manifest.json', customerController.getManifest);
router.get('/favicon.ico', customerController.getFavicon);

// All routes below require authentication
router.post('/wallet/topup', auth(), customerController.topupWallet);
router.post('/payment/validate', auth(), customerController.validatePayment);
router.post('/order/submit', auth(), orderValidation, customerController.submitOrder);
router.post('/favorites/:id', auth(), customerController.addFavorite);
router.delete('/favorites/:id', auth(), customerController.removeFavorite);
router.post('/upload-receipt', auth(), upload.single('receipt'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    res.json({ success: true, url: req.file.path });
});
router.get('/receipt/:id', auth(), customerController.getReceipt);
router.get('/receipt/:id/download', auth(), customerController.downloadReceipt);
router.patch('/settings', auth(), customerController.updateSettings);

const forecastingController = require('../../controllers/postgres/forecastingController');
router.post('/products/:id/track-view', forecastingController.trackProductView);

module.exports = router;
