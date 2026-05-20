const express = require('express');
const router = express.Router();
const machineController = require('../../controllers/postgres/machineController');
const auth = require('../../middleware/auth');

router.get('/', machineController.getMachines);

// Admin only routes
router.post('/', auth(['admin']), machineController.createMachine);
router.put('/:id', auth(['admin', 'employee']), machineController.updateMachine);
router.delete('/:id', auth(['admin']), machineController.deleteMachine);

module.exports = router;
