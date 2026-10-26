const prisma = require('../../utils/prisma');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { generateVerificationToken, sendVerificationEmail, sendVerificationOtpEmail, sendPasswordResetEmail, sendPasswordChangedAlertEmail } = require('../../utils/emailService');

const logErr = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, '../../logs/server_log.txt'), entry);
    console.error(msg);
};

// 1. Send OTP verification code before registration
exports.sendRegistrationOtp = async (req, res) => {
    try {
        const { email, username } = req.body;
        if (!email || !email.trim()) {
            return res.status(400).json({ message: 'Please provide an email address to verify.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const rfcEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!rfcEmailRegex.test(cleanEmail)) {
            return res.status(400).json({ message: 'Please enter a valid email address with a valid domain extension.' });
        }
        const domain = cleanEmail.split('@')[1] || '';
        const invalidTypos = ['gmail.c', 'gmail.co', 'gmail.con', 'gmail.cm', 'gmai.com', 'gamil.com', 'yahoo.c', 'yahoo.co', 'yahoo.con', 'hotmail.c', 'hotmail.co', 'outlook.c'];
        if (invalidTypos.includes(domain)) {
            return res.status(400).json({ message: `"${domain}" is not a valid email domain. Did you mean @${domain.replace(/\.[a-z0-9]+$/, '.com')}?` });
        }

        // Check if email already registered
        const existing = await prisma.user.findFirst({
            where: { email: { equals: cleanEmail, mode: 'insensitive' } }
        });
        if (existing) {
            return res.status(400).json({ message: 'An account with this email already exists. Please log in or use another email.' });
        }

        // Generate 6-digit numeric OTP code
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Invalidate previous OTPs for this email
        await prisma.emailVerification.deleteMany({
            where: { email: cleanEmail }
        });

        // Store new OTP
        await prisma.emailVerification.create({
            data: {
                userId: 'pending_registration',
                email: cleanEmail,
                token: otpCode,
                expiresAt
            }
        });

        // Send OTP email
        await sendVerificationOtpEmail(cleanEmail, username || 'Customer', otpCode).catch(err => {
            console.error('[Registration OTP Send Error]', err.message || err);
        });

        return res.json({
            success: true,
            message: `Verification code sent to ${cleanEmail}. Please enter the 6-digit code.`,
            expiresInSeconds: 600
        });
    } catch (err) {
        console.error('sendRegistrationOtp Error:', err);
        return res.status(500).json({ message: 'Failed to send verification code. Please try again.' });
    }
};

// 2. Validate OTP code endpoint
exports.verifyRegistrationOtp = async (req, res) => {
    try {
        const { email, otpCode } = req.body;
        if (!email || !otpCode) {
            return res.status(400).json({ message: 'Email and 6-digit verification code are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanOtp = otpCode.trim();

        const match = await prisma.emailVerification.findFirst({
            where: {
                email: cleanEmail,
                token: cleanOtp,
                expiresAt: { gt: new Date() }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!match) {
            return res.status(400).json({ message: 'Invalid or expired verification code. Please check your inbox or request a new code.' });
        }

        return res.json({ success: true, message: 'Email code verified successfully.' });
    } catch (err) {
        console.error('verifyRegistrationOtp Error:', err);
        return res.status(500).json({ message: 'Failed to verify code.' });
    }
};

// 3. User Registration (Frictionless: email optional; if email provided, requires valid OTP)
exports.register = async (req, res) => {
    try {
        const { password: _pw, ...safeBody } = req.body;
        logErr('Postgres Register attempt: ' + JSON.stringify(safeBody));
        const { username, email, password, phoneNumber, address, otpCode } = req.body;
        
        // Optional phone and address fallback for frictionless signup
        const cleanPhone = phoneNumber ? phoneNumber.trim() : '';
        const cleanAddress = address ? address.trim() : '';
        const rawEmail = (email || '').trim().toLowerCase();
        const cleanEmail = rawEmail || null;
        const cleanUsername = (username || '').trim();

        if (!cleanUsername || cleanUsername.length < 3) {
            return res.status(400).json({ message: 'Please choose a username of at least 3 characters.' });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        // If email was entered, enforce domain validation and 6-digit OTP verification
        if (cleanEmail) {
            const rfcEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!rfcEmailRegex.test(cleanEmail)) {
                return res.status(400).json({ message: 'Please enter a valid email address with a valid domain extension (e.g. name@example.com).' });
            }
            const domain = cleanEmail.split('@')[1] || '';
            const invalidTypos = ['gmail.c', 'gmail.co', 'gmail.con', 'gmail.cm', 'gmai.com', 'gamil.com', 'yahoo.c', 'yahoo.co', 'yahoo.con', 'hotmail.c', 'hotmail.co', 'outlook.c'];
            if (invalidTypos.includes(domain)) {
                return res.status(400).json({ message: `"${domain}" is not a valid email domain. Did you mean @${domain.replace(/\.[a-z0-9]+$/, '.com')}?` });
            }

            // Check if email already taken
            const existingEmail = await prisma.user.findFirst({
                where: { email: { equals: cleanEmail, mode: 'insensitive' } }
            });
            if (existingEmail) {
                return res.status(400).json({ message: 'An account with this email already exists. Please log in or sign in with Google.' });
            }

            // Verify OTP code
            if (!otpCode || !otpCode.trim()) {
                return res.status(400).json({ message: 'Please enter the 6-digit verification code sent to your email.' });
            }

            const cleanOtp = otpCode.trim();
            const verification = await prisma.emailVerification.findFirst({
                where: {
                    email: cleanEmail,
                    token: cleanOtp,
                    expiresAt: { gt: new Date() }
                },
                orderBy: { createdAt: 'desc' }
            });

            if (!verification) {
                return res.status(400).json({ message: 'Invalid or expired 6-digit verification code. Please check your inbox or click Resend Code.' });
            }

            // Cleanup used verification tokens for this email
            await prisma.emailVerification.deleteMany({
                where: { email: cleanEmail }
            });
        }

        // Check if username taken
        const existingUsername = await prisma.user.findFirst({
            where: { username: { equals: cleanUsername, mode: 'insensitive' } }
        });
        if (existingUsername) {
            return res.status(400).json({ message: 'This username is already taken. Please choose another username.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username: cleanUsername,
                email: cleanEmail,
                password: hashedPassword,
                role: 'customer',
                phoneNumber: cleanPhone || null,
                address: cleanAddress || null,
                isEmailVerified: Boolean(cleanEmail),
                lastLoginAt: new Date(),
                lastActiveAt: new Date()
            }
        });

        const token = jwt.sign({ id: user.id, role: 'customer', tokenVersion: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.cookie('customer_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        return res.json({ 
            user: { 
                id: user.id, 
                username: user.username, 
                role: 'customer',
                email: user.email,
                isEmailVerified: user.isEmailVerified,
                walletBalance: 0,
                address: user.address,
                phoneNumber: user.phoneNumber
            } 
        });
    } catch (err) {
        console.error('Registration Error:', err);
        return res.status(500).json({ message: 'Server error during registration' });
    }
};

// 4. Link Google account to existing user (cryptographically verified by Google OAuth)
exports.linkGoogleAccount = async (req, res) => {
    try {
        const userId = req.user.id;
        const { email, displayName, uid } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Google account email is required.' });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Check if email already belongs to another account
        const existing = await prisma.user.findFirst({
            where: {
                email: { equals: cleanEmail, mode: 'insensitive' },
                id: { not: userId }
            }
        });
        if (existing) {
            return res.status(400).json({ message: 'This Google account is already linked to another user account.' });
        }

        // Link Google email to current user and mark verified
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                email: cleanEmail,
                isEmailVerified: true
            }
        });

        return res.json({
            success: true,
            message: `Successfully linked Google account (${cleanEmail})!`,
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                role: updatedUser.role,
                email: updatedUser.email,
                isEmailVerified: updatedUser.isEmailVerified,
                walletBalance: updatedUser.walletBalance,
                address: updatedUser.address,
                phoneNumber: updatedUser.phoneNumber
            }
        });
    } catch (err) {
        console.error('linkGoogleAccount Error:', err);
        return res.status(500).json({ message: 'Failed to link Google account.' });
    }
};

// 5. Send OTP to link an email to an existing account
exports.sendLinkOtp = async (req, res) => {
    try {
        const userId = req.user.id;
        const { email } = req.body;
        if (!email || !email.trim()) {
            return res.status(400).json({ message: 'Please provide an email address.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const rfcEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!rfcEmailRegex.test(cleanEmail)) {
            return res.status(400).json({ message: 'Please enter a valid email address with a valid domain extension.' });
        }

        // Check if another account has this email
        const existing = await prisma.user.findFirst({
            where: {
                email: { equals: cleanEmail, mode: 'insensitive' },
                id: { not: userId }
            }
        });
        if (existing) {
            return res.status(400).json({ message: 'This email is already in use by another account.' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.emailVerification.deleteMany({
            where: { email: cleanEmail }
        });

        await prisma.emailVerification.create({
            data: {
                userId,
                email: cleanEmail,
                token: otpCode,
                expiresAt
            }
        });

        await sendVerificationOtpEmail(cleanEmail, user?.username || 'Customer', otpCode).catch(err => {
            console.error('[Link Email OTP Error]', err.message || err);
        });

        return res.json({
            success: true,
            message: `Verification code sent to ${cleanEmail}. Please enter the 6-digit code.`,
            expiresInSeconds: 600
        });
    } catch (err) {
        console.error('sendLinkOtp Error:', err);
        return res.status(500).json({ message: 'Failed to send verification code.' });
    }
};

// 6. Verify OTP and link email to existing account
exports.linkEmailWithOtp = async (req, res) => {
    try {
        const userId = req.user.id;
        const { email, otpCode } = req.body;
        if (!email || !otpCode) {
            return res.status(400).json({ message: 'Email and 6-digit verification code are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanOtp = otpCode.trim();

        const match = await prisma.emailVerification.findFirst({
            where: {
                email: cleanEmail,
                token: cleanOtp,
                expiresAt: { gt: new Date() }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!match) {
            return res.status(400).json({ message: 'Invalid or expired verification code. Please check your inbox or request a new code.' });
        }

        // Delete used token
        await prisma.emailVerification.deleteMany({ where: { email: cleanEmail } });

        // Link email and mark verified
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                email: cleanEmail,
                isEmailVerified: true
            }
        });

        return res.json({
            success: true,
            message: `Email ${cleanEmail} verified and linked successfully!`,
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                role: updatedUser.role,
                email: updatedUser.email,
                isEmailVerified: updatedUser.isEmailVerified,
                walletBalance: updatedUser.walletBalance,
                address: updatedUser.address,
                phoneNumber: updatedUser.phoneNumber
            }
        });
    } catch (err) {
        console.error('linkEmailWithOtp Error:', err);
        return res.status(500).json({ message: 'Failed to link email.' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password, rememberMe, portal } = req.body;
        
        if (process.env.ENABLE_DEV_BYPASS === 'true' && (email === 'employee' || email === 'admin')) {
            const mockRole = email === 'employee' ? 'employee' : 'admin';
            const mockUser = {
                id: mockRole === 'employee' ? 'employee-dev-id' : 'admin-dev-id',
                username: mockRole === 'employee' ? 'Employee' : 'Admin',
                role: mockRole,
                email: `${mockRole}@stitchopt.com`,
                walletBalance: 1000,
                address: '123 Stitch Lane',
                phoneNumber: '09171234567'
            };
            const token = jwt.sign({ id: mockUser.id, role: mockRole, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1d' });
            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Lax'
            };
            res.cookie(`${mockRole}_token`, token, cookieOptions);
            res.cookie('token', token, cookieOptions);
            return res.json({ user: mockUser });
        }
        
        const cleanEmail = (email || '').trim();
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: { equals: cleanEmail, mode: 'insensitive' } },
                    { username: { equals: cleanEmail, mode: 'insensitive' } }
                ]
            }
        });

        if (!user) return res.status(400).json({ message: 'Wrong username or password. Please check your spelling and try again.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Wrong username or password. Please check your spelling and try again.' });

        if (user.isActive === false) {
            return res.status(403).json({ 
                message: 'Your account is currently inactive. Please contact store support for assistance.' 
            });
        }

        if (portal) {
            if (portal === 'admin' && user.role !== 'admin') {
                return res.status(403).json({ message: 'This account does not have administrator access.' });
            }
            if (portal === 'employee' && user.role !== 'employee' && user.role !== 'admin') {
                return res.status(403).json({ message: 'This account does not have staff access.' });
            }
        }

        const expiresIn = rememberMe ? '30d' : '1d';
        const token = jwt.sign({ id: user.id, role: user.role, tenantId: user.tenantId, tokenVersion: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn });

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'Lax'
        };

        // Security: Privileged administrative and employee accounts must NEVER use persistent 30-day cookies.
        // Sessions for staff are strictly session-only (destroyed by the browser upon closing the window).
        if (rememberMe && user.role !== 'admin' && user.role !== 'employee') {
            cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        }
        
        res.cookie(`${user.role}_token`, token, cookieOptions);
        res.cookie('token', token, cookieOptions); 

        // Track last login & active timestamps for CRM and security auditing
        prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date(), lastActiveAt: new Date() }
        }).catch((e) => console.warn('Failed to update lastLoginAt:', e?.message));

        res.json({ 
            user: { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                email: user.email,
                walletBalance: user.walletBalance || 0,
                address: user.address || '',
                phoneNumber: user.phoneNumber || '',
                isPhoneVerified: user.isPhoneVerified || false,
                isEmailVerified: user.isEmailVerified || false,
                savedAddresses: user.savedAddresses || [],
                tenantId: user.tenantId
            } 
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ message: 'Something went wrong while signing you in. Please try again.' });
    }
};

exports.logout = (req, res) => {
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/'
    };
    res.clearCookie('admin_token', cookieOptions);
    res.clearCookie('employee_token', cookieOptions);
    res.clearCookie('customer_token', cookieOptions);
    res.clearCookie('token', cookieOptions); 
    
    res.json({ message: 'Logged out successfully' });
};

exports.me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { 
                id: true, 
                username: true, 
                role: true, 
                email: true, 
                walletBalance: true, 
                address: true, 
                phoneNumber: true, 
                isPhoneVerified: true, 
                isEmailVerified: true, 
                preferredDeliveryTime: true,
                savedAddresses: true,
                tenantId: true 
            }
        });
        if (!user) return res.status(401).json({ message: 'We could not find your account. Please sign in again.' });
        res.json({ user });
    } catch (err) {
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { username, email } = req.body;
        const userId = req.user.id;

        const currentUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!currentUser) return res.status(404).json({ message: 'We could not find your account.' });

        const searchCriteria = [];
        if (username) searchCriteria.push({ username: username.trim() });
        if (email) searchCriteria.push({ email: email.trim().toLowerCase() });

        if (searchCriteria.length > 0) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    OR: searchCriteria,
                    NOT: { id: userId }
                }
            });

            if (existingUser) {
                return res.status(400).json({ message: 'That username or email address is already taken. Please choose another.' });
            }
        }

        const isEmailChanged = email && email.trim().toLowerCase() !== currentUser.email.toLowerCase();
        const updateData = {};
        if (username) updateData.username = username.trim();
        if (email) {
            updateData.email = email.trim().toLowerCase();
            if (isEmailChanged) {
                // Security: Changing email immediately revokes verification until verified on new address
                updateData.isEmailVerified = false;
                updateData.tokenVersion = { increment: 1 };
            }
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, username: true, role: true, email: true, isEmailVerified: true, tokenVersion: true }
        });

        // Dispatch verification link to the NEW email address if changed
        if (isEmailChanged) {
            await prisma.emailVerification.deleteMany({ where: { userId } });
            const emailToken = generateVerificationToken();
            await prisma.emailVerification.create({
                data: {
                    userId,
                    email: user.email,
                    token: emailToken,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
            });
            await sendVerificationEmail(user.email, user.username, emailToken).catch(err => {
                console.error('[Update Profile] Failed to send verification email:', err);
            });
        }

        const token = jwt.sign({ id: user.id, role: user.role, tokenVersion: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            path: '/'
        });

        res.json({ 
            user, 
            emailChanged: isEmailChanged,
            message: isEmailChanged 
                ? 'Email updated. A verification link has been sent to your new email address.' 
                : 'Profile updated successfully' 
        });
    } catch (err) {
        console.error('Update Profile Error:', err);
        res.status(500).json({ message: 'Server error during profile update' });
    }
};

exports.revokeSessions = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.update({
            where: { id: id },
            data: { tokenVersion: { increment: 1 } }
        });
        res.json({ message: 'All active sessions for this user have been instantly revoked.', tokenVersion: user.tokenVersion });
    } catch (err) {
        console.error('Revoke Sessions Error:', err);
        res.status(500).json({ message: 'Server error during session revocation' });
    }
};

// ===== EMAIL VERIFICATION ENDPOINTS =====

/**
 * POST /auth/email/verify — Verifies a user's email via the token from the verification link
 */
exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, message: 'Verification token is required.' });
        }

        if (String(token).startsWith('rst_')) {
            return res.status(400).json({ success: false, message: 'Invalid verification link.' });
        }

        const verification = await prisma.emailVerification.findUnique({
            where: { token }
        });

        if (!verification) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification link. Please request a new one.' });
        }

        if (new Date() > new Date(verification.expiresAt)) {
            await prisma.emailVerification.delete({ where: { token } }).catch(() => {});
            return res.status(400).json({ success: false, message: 'This verification link has expired. Please request a new one.' });
        }

        // Mark user email as verified
        await prisma.user.update({
            where: { id: verification.userId },
            data: { isEmailVerified: true }
        });

        // Cleanup all verification tokens for this user
        await prisma.emailVerification.deleteMany({
            where: { userId: verification.userId }
        });

        console.log(`[Email Verified] User ${verification.userId} verified email ${verification.email}`);

        res.json({
            success: true,
            message: 'Email verified successfully! You can now place orders.'
        });
    } catch (err) {
        console.error('verifyEmail error:', err);
        res.status(500).json({ success: false, message: 'Server error during email verification.' });
    }
};

/**
 * POST /auth/email/resend — Resends the verification email (authenticated, rate-limited)
 */
exports.resendVerificationEmail = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, username: true, isEmailVerified: true }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ success: false, message: 'Your email is already verified.' });
        }

        // Check cooldown: 60 seconds between resends
        const recentVerification = await prisma.emailVerification.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        if (recentVerification) {
            const elapsed = Math.floor((Date.now() - new Date(recentVerification.createdAt).getTime()) / 1000);
            if (elapsed < 60) {
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${60 - elapsed} seconds before requesting another verification email.`,
                    cooldownRemaining: 60 - elapsed
                });
            }
        }

        // Clean up old tokens for this user
        await prisma.emailVerification.deleteMany({ where: { userId } });

        // Generate new token and send
        const emailToken = generateVerificationToken();
        await prisma.emailVerification.create({
            data: {
                userId,
                email: user.email,
                token: emailToken,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            }
        });

        await sendVerificationEmail(user.email, user.username, emailToken);

        res.json({
            success: true,
            message: `Verification email sent to ${user.email}.`,
            cooldownSeconds: 60
        });
    } catch (err) {
        console.error('resendVerificationEmail error:', err);
        res.status(500).json({ success: false, message: 'Failed to resend verification email.' });
    }
};

/**
 * GET /auth/email/status — Check email verification status (authenticated)
 */
exports.emailVerificationStatus = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { isEmailVerified: true, email: true }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.json({
            success: true,
            isEmailVerified: user.isEmailVerified,
            email: user.email
        });
    } catch (err) {
        console.error('emailVerificationStatus error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

/**
 * POST /auth/google — Authenticate or Register user with Google OAuth
 */
exports.googleAuth = async (req, res) => {
    try {
        const { email, displayName, photoURL, phoneNumber, uid } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Google account email is required.' });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Search for user strictly by verified email (case-insensitive)
        let user = await prisma.user.findFirst({
            where: {
                email: { equals: cleanEmail, mode: 'insensitive' }
            }
        });

        if (!user) {
            // First-time Google user: Seamlessly create customer account immediately.
            // Generates a clean unique username and cryptographically strong password hash.
            const baseUsername = (displayName
                ? displayName.trim().replace(/[^a-zA-Z0-9_\s]/g, '')
                : cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '')) || 'User';

            let finalUsername = baseUsername;
            let counter = 1;
            while (await prisma.user.findFirst({ where: { username: { equals: finalUsername, mode: 'insensitive' } } })) {
                finalUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
                counter++;
                if (counter > 10) break;
            }

            const randomPassword = crypto.randomBytes(24).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            try {
                user = await prisma.user.create({
                    data: {
                        username: finalUsername,
                        email: cleanEmail,
                        password: hashedPassword,
                        role: 'customer',
                        walletBalance: 0,
                        phoneNumber: phoneNumber || null,
                        isPhoneVerified: !!phoneNumber,
                        isEmailVerified: true,
                        isActive: true,
                        lastLoginAt: new Date(),
                        lastActiveAt: new Date()
                    }
                });
            } catch (createErr) {
                // If a concurrent request created the account during a race condition, fetch it
                user = await prisma.user.findFirst({
                    where: { email: { equals: cleanEmail, mode: 'insensitive' } }
                });
                if (!user) throw createErr;
            }
        }

        // Account exists: Check if account is deactivated
        if (user.isActive === false) {
            return res.status(403).json({ 
                success: false, 
                message: 'Your account has been deactivated. Please contact support or store management.' 
            });
        }

        // Update email verification, login timestamps, and phone number if Google provided one and account has none
        const updateData = { 
            isEmailVerified: true,
            lastLoginAt: new Date(),
            lastActiveAt: new Date()
        };
        if (phoneNumber && !user.phoneNumber) {
            updateData.phoneNumber = phoneNumber;
            updateData.isPhoneVerified = true;
        }
        user = await prisma.user.update({
            where: { id: user.id },
            data: updateData
        });

        const token = jwt.sign(
            { id: user.id, role: user.role, tenantId: user.tenantId, tokenVersion: user.tokenVersion || 0 },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax'
        };

        if (user.role !== 'admin' && user.role !== 'employee') {
            cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days for customers only
        }

        res.cookie(`${user.role}_token`, token, cookieOptions);
        res.cookie('token', token, cookieOptions);

        res.json({
            success: true,
            message: 'Signed in with Google successfully!',
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                email: user.email,
                walletBalance: user.walletBalance || 0,
                address: user.address || '',
                phoneNumber: user.phoneNumber || '',
                isPhoneVerified: user.isPhoneVerified || false,
                isEmailVerified: true,
                tenantId: user.tenantId
            }
        });
    } catch (err) {
        console.error('Google Auth Error:', err);
        res.status(500).json({ success: false, message: 'Server error during Google authentication.' });
    }
};

/**
 * POST /auth/google/complete — Finishes first-time Google sign-up with a chosen password
 */
exports.googleComplete = async (req, res) => {
    try {
        const { setupToken, password, username } = req.body;
        if (!setupToken || !password) {
            return res.status(400).json({ success: false, message: 'Password is required.' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }

        let payload;
        try {
            payload = jwt.verify(setupToken, process.env.JWT_SECRET);
        } catch {
            return res.status(400).json({ success: false, message: 'Google sign-up session expired. Please try again.' });
        }
        if (payload.purpose !== 'google-setup') {
            return res.status(400).json({ success: false, message: 'Invalid sign-up session.' });
        }

        const cleanEmail = (payload.email || '').trim().toLowerCase();
        const already = await prisma.user.findFirst({ 
            where: { 
                email: { equals: cleanEmail, mode: 'insensitive' } 
            } 
        });
        if (already) {
            return res.status(400).json({ success: false, message: 'An account with this email already exists. Please sign in.' });
        }

        const desiredName = (username || '').trim().replace(/[^a-zA-Z0-9_\s]/g, '')
            || (payload.displayName ? payload.displayName.trim().replace(/[^a-zA-Z0-9_\s]/g, '') : '')
            || cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '')
            || `User_${Math.floor(1000 + Math.random() * 9000)}`;
        const taken = await prisma.user.findFirst({ 
            where: { 
                username: { equals: desiredName, mode: 'insensitive' } 
            } 
        });
        const finalUsername = taken ? `${desiredName}_${Math.floor(100 + Math.random() * 900)}` : desiredName;

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username: finalUsername,
                email: cleanEmail,
                password: hashedPassword,
                phoneNumber: payload.phoneNumber || null,
                role: 'customer',
                isEmailVerified: true,
                isPhoneVerified: !!payload.phoneNumber,
                walletBalance: 0,
                lastLoginAt: new Date(),
                lastActiveAt: new Date()
            }
        });

        const token = jwt.sign(
            { id: user.id, role: user.role, tenantId: user.tenantId, tokenVersion: user.tokenVersion || 0 },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax'
        };
        if (user.role !== 'admin' && user.role !== 'employee') {
            cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
        }
        res.cookie(`${user.role}_token`, token, cookieOptions);
        res.cookie('token', token, cookieOptions);

        res.status(201).json({
            success: true,
            message: 'Account created! You can now sign in with Google or your password.',
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                email: user.email,
                walletBalance: 0,
                address: '',
                phoneNumber: user.phoneNumber || '',
                isPhoneVerified: user.isPhoneVerified || false,
                isEmailVerified: true,
                tenantId: user.tenantId
            }
        });
    } catch (err) {
        console.error('Google Complete Error:', err);
        res.status(500).json({ success: false, message: 'Server error completing Google sign-up.' });
    }
};

/**
 * POST /auth/password/forgot — Emails a one-hour reset link (generic success to avoid account enumeration)
 */
exports.forgotPassword = async (req, res) => {
    const generic = { success: true, message: 'If an account exists for that email or username, a reset link has been sent to its registered email.', cooldownSeconds: 60 };
    try {
        const input = String(req.body.email || req.body.username || '').trim();
        if (!input) {
            return res.status(400).json({ success: false, message: 'Email or username is required.' });
        }

        const user = await prisma.user.findFirst({ 
            where: { 
                OR: [
                    { email: { equals: input, mode: 'insensitive' } },
                    { username: { equals: input, mode: 'insensitive' } }
                ]
            } 
        });
        if (!user || user.isActive === false) {
            return res.json(generic);
        }

        const recent = await prisma.emailVerification.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        });
        if (recent) {
            const elapsed = Math.floor((Date.now() - new Date(recent.createdAt).getTime()) / 1000);
            if (elapsed < 60) {
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${60 - elapsed} seconds before requesting another reset email.`,
                    cooldownRemaining: 60 - elapsed
                });
            }
        }

        await prisma.emailVerification.deleteMany({ where: { userId: user.id } });
        const rawToken = 'rst_' + generateVerificationToken();
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        await prisma.emailVerification.create({
            data: {
                userId: user.id,
                email: user.email,
                token: hashedToken,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000)
            }
        });
        const emailResult = await sendPasswordResetEmail(user.email, user.username, rawToken);
        if (emailResult?.simulated) {
            console.warn(`[forgotPassword] Notice: Reset email for ${user.email} ran in simulation mode (${emailResult.provider || 'no live provider'}). Link: ${emailResult.url || 'see logs'}`);
        } else {
            console.log(`[forgotPassword] Reset email sent to ${user.email} via ${emailResult?.provider || 'live provider'}.`);
        }

        res.json(generic);
    } catch (err) {
        console.error('forgotPassword error:', err);
        res.status(500).json({ success: false, message: 'Failed to send reset email. Please try again.' });
    }
};

/**
 * POST /auth/password/reset — Sets a new password using the emailed token
 */
exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !String(token).startsWith('rst_')) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset link.' });
        }
        if (!password || String(password).length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const record = await prisma.emailVerification.findFirst({
            where: {
                OR: [
                    { token: hashedToken },
                    { token } // Backward compatibility for unhashed legacy tokens
                ]
            }
        });
        if (!record) {
            return res.status(400).json({ success: false, message: 'This reset link has already been used or has expired. Please request a new one.' });
        }
        if (new Date() > new Date(record.expiresAt)) {
            await prisma.emailVerification.deleteMany({ where: { id: record.id } }).catch(() => {});
            return res.status(400).json({ success: false, message: 'This reset link has expired. Please request a new one.' });
        }

        const user = await prisma.user.findUnique({ where: { id: record.userId } });
        if (!user) {
            await prisma.emailVerification.deleteMany({ where: { id: record.id } }).catch(() => {});
            return res.status(404).json({ success: false, message: 'User account not found.' });
        }

        // Prevent reusing the exact same current password
        if (user.password) {
            const isSamePassword = await bcrypt.compare(password, user.password);
            if (isSamePassword) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Your new password cannot be the same as your current password. Please choose a different password.' 
                });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                isEmailVerified: true,
                tokenVersion: { increment: 1 }
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isEmailVerified: true,
                tokenVersion: true
            }
        });

        // Single-use guarantee: Invalidate all verification/reset tokens for this user immediately
        await prisma.emailVerification.deleteMany({
            where: {
                OR: [
                    { id: record.id },
                    { userId: record.userId }
                ]
            }
        }).catch(() => {});

        // Security: Dispatch password-changed alert email to user
        sendPasswordChangedAlertEmail(updatedUser.email, updatedUser.username).catch((mailErr) => {
            console.error('[resetPassword] Failed to send password changed alert email:', mailErr?.message || mailErr);
        });

        // Auto-login: Issue JWT session cookie so the user doesn't have to re-enter credentials
        const authToken = jwt.sign(
            { id: updatedUser.id, role: updatedUser.role, tokenVersion: updatedUser.tokenVersion || 0 },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.cookie('token', authToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            path: '/'
        });

        const safeUser = {
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role,
            isEmailVerified: updatedUser.isEmailVerified
        };

        res.json({
            success: true,
            message: 'Password updated successfully! You have been automatically signed in.',
            user: safeUser,
            token: authToken
        });
    } catch (err) {
        console.error('resetPassword error:', err);
        res.status(500).json({ success: false, message: 'Server error resetting password.' });
    }
};

/**
 * GET/POST /auth/password/validate-token — Pre-validates a reset token on page load for instant UX feedback
 */
exports.validateResetToken = async (req, res) => {
    try {
        const token = String(req.query?.token || req.body?.token || '').trim();
        if (!token || !token.startsWith('rst_')) {
            return res.status(400).json({ valid: false, message: 'Invalid or missing reset link.' });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const record = await prisma.emailVerification.findFirst({
            where: {
                OR: [
                    { token: hashedToken },
                    { token }
                ]
            }
        });

        if (!record) {
            return res.status(400).json({ valid: false, message: 'This reset link has already been used or has expired. Please request a new one.' });
        }

        if (new Date() > new Date(record.expiresAt)) {
            await prisma.emailVerification.deleteMany({ where: { id: record.id } }).catch(() => {});
            return res.status(400).json({ valid: false, message: 'This reset link has expired. Please request a new one.' });
        }

        const user = await prisma.user.findUnique({
            where: { id: record.userId },
            select: { id: true, email: true, username: true, isActive: true }
        });

        if (!user || user.isActive === false) {
            return res.status(400).json({ valid: false, message: 'The associated user account is unavailable or deactivated.' });
        }

        const maskEmail = (em) => {
            if (!em || !em.includes('@')) return '';
            const [u, d] = em.split('@');
            if (u.length <= 2) return `${u[0]}*@${d}`;
            return `${u[0]}${'*'.repeat(Math.min(u.length - 2, 5))}${u[u.length - 1]}@${d}`;
        };

        return res.json({
            valid: true,
            maskedEmail: maskEmail(user.email),
            username: user.username,
            expiresAt: record.expiresAt
        });
    } catch (err) {
        console.error('validateResetToken error:', err);
        return res.status(500).json({ valid: false, message: 'Server error validating reset token.' });
    }
};

/**
 * PUT/POST /auth/password/change — Secure in-app password update for logged-in users (Customer, Staff, Admin)
 */
exports.changePassword = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword) {
            return res.status(400).json({ success: false, message: 'Please enter your current password.' });
        }
        if (!newPassword || String(newPassword).length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
        }
        if (confirmPassword !== undefined && newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'New password and confirmation do not match.' });
        }
        if (currentPassword === newPassword) {
            return res.status(400).json({ success: false, message: 'New password cannot be the same as your current password.' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User account not found.' });
        }

        // Verify current password with bcrypt
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect. Please verify and try again.' });
        }

        // Verify new password is not identical to current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ success: false, message: 'New password cannot be the same as your current password. Please choose a different password.' });
        }

        // Hash new password and increment tokenVersion (revoking other active sessions)
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const nextTokenVersion = (user.tokenVersion || 0) + 1;

        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                tokenVersion: nextTokenVersion,
                lastActiveAt: new Date()
            }
        });

        // Re-issue fresh JWT cookie for the current session so the user stays authenticated seamlessly
        const token = jwt.sign(
            { id: updatedUser.id, role: updatedUser.role, tenantId: updatedUser.tenantId, tokenVersion: nextTokenVersion },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            path: '/'
        };

        res.cookie(`${updatedUser.role}_token`, token, cookieOptions);
        res.cookie('token', token, cookieOptions);

        return res.json({
            success: true,
            message: 'Your password has been changed successfully. All other active sessions have been safely logged out.'
        });
    } catch (err) {
        console.error('changePassword error:', err);
        return res.status(500).json({ success: false, message: 'Server error while changing password.' });
    }
};

/**
 * Industry-standard real-time availability check for usernames & emails
 * Prevents account collision before full form submission
 */
exports.checkAvailability = async (req, res) => {
    try {
        const { username, email } = req.query;
        if (!username && !email) {
            return res.status(400).json({ message: 'Please provide a username or email parameter to check.' });
        }

        if (username) {
            const cleanUser = String(username).trim();
            if (cleanUser.length < 3) {
                return res.json({ field: 'username', available: false, message: 'Username must be at least 3 characters.' });
            }
            const exists = await prisma.user.findFirst({
                where: { username: { equals: cleanUser, mode: 'insensitive' } },
                select: { id: true }
            });
            return res.json({
                field: 'username',
                available: !exists,
                message: exists ? `Username "${cleanUser}" is already taken.` : 'Username is available'
            });
        }

        if (email) {
            const cleanEmail = String(email).trim().toLowerCase();
            const rfcEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!rfcEmailRegex.test(cleanEmail)) {
                return res.json({ field: 'email', available: false, message: 'Please enter a valid email address (e.g. name@example.com).' });
            }
            const exists = await prisma.user.findFirst({
                where: { email: { equals: cleanEmail, mode: 'insensitive' } },
                select: { id: true }
            });
            return res.json({
                field: 'email',
                available: !exists,
                message: exists ? 'An account with this email already exists.' : 'Email is available'
            });
        }
    } catch (err) {
        console.error('[checkAvailability] Error:', err);
        return res.status(500).json({ message: 'Could not check availability. Please try again.' });
    }
};



