const express = require('express');
const router = express.Router();
const aiController = require('../../controllers/postgres/aiController');
const auth = require('../../middleware/auth');

router.post('/chat', auth(), aiController.chat);
router.post('/verify-receipt', auth(), aiController.verifyReceipt);
router.get('/models', aiController.listModels);

module.exports = router;
