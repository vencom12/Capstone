const express = require('express');
const router = express.Router();
const employeeController = require('../../controllers/postgres/employeeController');
const staffAuth = require('../../middleware/staffAuth');

router.get('/dashboard-state', staffAuth(), employeeController.getDashboardState);
router.patch('/orders/:id/status', staffAuth(), employeeController.updateOrderStatus);
router.patch('/inventory/:item', staffAuth(), employeeController.updateInventory);

module.exports = router;
