const express = require('express');
const router = express.Router();
const employeeController = require('../../controllers/postgres/employeeController');
const staffAuth = require('../../middleware/staffAuth');
const auditLogger = require('../../middleware/postgres/auditLogger');

router.get('/dashboard-state', staffAuth(), employeeController.getDashboardState);
router.patch('/orders/:id/status', staffAuth(), auditLogger('Order', 'UPDATE_ORDER_STATUS'), employeeController.updateOrderStatus);
router.patch('/orders/:id/garments-received', staffAuth(), auditLogger('Order', 'RECEIVE_CLIENT_GARMENTS'), employeeController.receiveGarments);
router.post('/orders/scan-claim', staffAuth(), auditLogger('Order', 'COUNTER_CLAIM_SCAN'), employeeController.scanClaimHandover);
router.patch('/inventory/:item', staffAuth(), auditLogger('Inventory', 'UPDATE_INVENTORY'), employeeController.updateInventory);
router.put('/shift', staffAuth(), employeeController.toggleShift);

// Customer Support & Feedbacks
const feedbackController = require('../../controllers/postgres/feedbackController');
router.get('/feedback', staffAuth(), feedbackController.getFeedbacks);
router.get('/feedback/templates', staffAuth(), feedbackController.getFeedbackTemplates);
router.patch('/feedback/:id', staffAuth(), auditLogger('Feedback', 'UPDATE_FEEDBACK_STATUS'), feedbackController.updateFeedbackStatus);
router.post('/feedback/:id/reply', staffAuth(), auditLogger('Feedback', 'STAFF_REPLY_FEEDBACK'), feedbackController.replyFeedback);

// Equipment Incident & Maintenance Tickets
const maintenanceController = require('../../controllers/postgres/maintenanceController');
router.get('/maintenance', staffAuth(), maintenanceController.getTickets);
router.post('/maintenance', staffAuth(), auditLogger('Machine', 'REPORT_MAINTENANCE_INCIDENT'), maintenanceController.createTicket);
router.patch('/maintenance/:id', staffAuth(), auditLogger('Machine', 'RESOLVE_MAINTENANCE_INCIDENT'), maintenanceController.updateTicket);

module.exports = router;
