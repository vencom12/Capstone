const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const auth = require('../middleware/auth');

// All AI routes require authentication
router.use(auth());

router.post('/chat', aiController.chat);
router.get('/logs', aiController.getLogs);
router.get('/models', aiController.listModels);

module.exports = router;
