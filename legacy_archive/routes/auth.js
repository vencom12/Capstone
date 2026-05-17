const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth'); // Keeping legacy auth middleware for shared me/profile for now

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', auth(), authController.me);
router.put('/profile', auth(), authController.updateProfile);

module.exports = router;
