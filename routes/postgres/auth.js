const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authController = require('../../controllers/postgres/authController');
const auth = require('../../middleware/auth'); 

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    next();
};

const registerValidation = [
    body('username').trim().isLength({ min: 3 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('phoneNumber').trim().escape(),
    body('address').trim().escape(),
    validate
];

const loginValidation = [
    // We do not enforce isEmail() on login since usernames or legacy 'admin' might be used
    body('email').trim().notEmpty().escape(),
    body('password').notEmpty(),
    validate
];

const profileValidation = [
    body('username').optional().trim().isLength({ min: 3 }).escape(),
    body('email').optional().isEmail().normalizeEmail(),
    validate
];

router.post('/register', registerValidation, authController.register);
router.post('/phone/send-otp', authController.sendRegistrationOtp);
router.post('/phone/resend-otp', authController.resendPhoneOtp);
router.post('/register-with-otp', authController.registerWithPhoneOtp);
router.post('/email/verify', authController.verifyEmail);
router.post('/email/resend', auth(), authController.resendVerificationEmail);
router.get('/email/status', auth(), authController.emailVerificationStatus);
router.post('/google', authController.googleAuth);
router.post('/google/complete', authController.googleComplete);
router.post('/password/forgot', authController.forgotPassword);
router.post('/password/reset', authController.resetPassword);
router.post('/login', loginValidation, authController.login);
router.post('/logout', authController.logout);
router.get('/me', auth(), authController.me);
router.put('/profile', auth(), profileValidation, authController.updateProfile);
router.post('/revoke-sessions/:id', auth(['admin']), authController.revokeSessions);

module.exports = router;
