const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const adminController = require('../controllers/adminController');
const employeeAuth = require('../middleware/employeeAuth');
const multer = require('multer');
const path = require('path');

// Configure Multer for Product Images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = path.resolve(__dirname, '../uploads');
        cb(null, dest);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ 
    storage,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

router.use(employeeAuth());

router.get('/dashboard-state', employeeController.getDashboardState);
router.put('/orders/:id', employeeController.updateOrderStatus);
router.patch('/inventory/:item', employeeController.updateInventory);

// Product Management (Staff Shared)
router.post('/products', upload.single('image'), adminController.createProduct);
router.patch('/products/:id', upload.single('image'), adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);

module.exports = router;
