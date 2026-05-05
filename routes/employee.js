const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const employeeAuth = require('../middleware/employeeAuth');

router.use(employeeAuth());

router.get('/dashboard-state', employeeController.getDashboardState);
router.put('/orders/:id', employeeController.updateOrderStatus);
router.patch('/inventory/:item', employeeController.updateInventory);

module.exports = router;
