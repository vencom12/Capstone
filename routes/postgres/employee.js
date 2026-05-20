const express = require('express');
const router = express.Router();
const employeeController = require('../../controllers/postgres/employeeController');
const staffAuth = require('../../middleware/staffAuth');
const auditLogger = require('../../middleware/postgres/auditLogger');

router.get('/dashboard-state', staffAuth(), employeeController.getDashboardState);
router.patch('/orders/:id/status', staffAuth(), auditLogger('Order', 'UPDATE_ORDER_STATUS'), employeeController.updateOrderStatus);
router.patch('/inventory/:item', staffAuth(), auditLogger('Inventory', 'UPDATE_INVENTORY'), employeeController.updateInventory);

module.exports = router;
