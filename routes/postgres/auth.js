const express = require('express');
const router = express.Router();
const authController = require('../../controllers/postgres/authController');
const auth = require('../../middleware/auth'); 

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', auth(), authController.me);
router.put('/profile', auth(), authController.updateProfile);

module.exports = router;
