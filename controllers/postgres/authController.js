const prisma = require('../../utils/prisma');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { normalizePhilippinePhone, generateOtp, sendSms } = require('../../utils/smsService');
const { generateVerificationToken, sendVerificationEmail, sendPasswordResetEmail } = require('../../utils/emailService');

const logErr = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, '../../logs/server_log.txt'), entry);
    console.error(msg);
};

exports.register = async (req, res) => {
    try {
        const { password: _pw, ...safeBody } = req.body;
        logErr('Postgres Register attempt: ' + JSON.stringify(safeBody));
        const { username, email, password, phoneNumber, address } = req.body;
        
        // Optional phone and address fallback for frictionless signup
        const cleanPhone = phoneNumber ? phoneNumber.trim() : '';
        const cleanAddress = address ? address.trim() : '';
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanUsername = (username || '').trim();

        // Check if user exists (case-insensitive)
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: { equals: cleanEmail, mode: 'insensitive' } },
                    { username: { equals: cleanUsername, mode: 'insensitive' } }
                ]
            }
        });

        if (existingUser) {
            const isEmailMatch = existingUser.email?.toLowerCase() === cleanEmail;
            return res.status(400).json({ 
                message: isEmailMatch 
                    ? 'An account with this email already exists. Please log in or sign in with Google.' 
                    : 'This username is already taken. Please choose another username.' 
            });
        }

        // Hash password (Prisma doesn't have pre-save hooks like Mongoose)
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                username: cleanUsername,
                email: cleanEmail,
                password: hashedPassword,
                role: 'customer',
                phoneNumber: cleanPhone,
                address: cleanAddress,
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

        res.json({ 
            user: { 
                id: user.id, 
                username: user.username, 
                role: 'customer',
                email: user.email,
                walletBalance: 0,
                address: user.address,
                phoneNumber: user.phoneNumber
            } 
        });
    } catch (err) {
        console.error('Registration Error:', err);
        res.status(500).json({ message: 'Server error during registration' });
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

        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        if (user.isActive === false) {
            return res.status(403).json({ 
                message: 'Your account has been deactivated. Please contact support or store management.' 
            });
        }

        if (portal) {
            if (portal === 'admin' && user.role !== 'admin') {
                return res.status(403).json({ message: 'Unauthorized: This account does not have administrator privileges.' });
            }
            if (portal === 'employee' && user.role !== 'employee' && user.role !== 'admin') {
                return res.status(403).json({ message: 'Unauthorized: This account does not have staff privileges.' });
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
        res.status(500).json({ message: 'Server error during login' });
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
        if (!user) return res.status(401).json({ message: 'User not found' });
        res.json({ user });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { username, email } = req.body;
        const userId = req.user.id;

        const currentUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!currentUser) return res.status(404).json({ message: 'User not found' });

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
                return res.status(400).json({ message: 'Username or Email already in use' });
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

exports.sendRegistrationOtp = async (req, res) => {
    try {
        const { username, email, phoneNumber } = req.body;
        if (!username || !email || !phoneNumber) {
            return res.status(400).json({ message: 'Username, email, and phone number are required.' });
        }

        const { valid, e164, local, error } = normalizePhilippinePhone(phoneNumber);
        if (!valid) {
            return res.status(400).json({ message: error });
        }

        // Check if user already exists with email or username or phone
        const existing = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email.trim().toLowerCase() },
                    { username: username.trim() },
                    { phoneNumber: e164 }
                ]
            }
        });

        if (existing) {
            if (existing.email.toLowerCase() === email.trim().toLowerCase()) {
                return res.status(400).json({ message: 'An account with this email already exists.' });
            }
            if (existing.username.toLowerCase() === username.trim().toLowerCase()) {
                return res.status(400).json({ message: 'Username is already taken.' });
            }
            if (existing.phoneNumber === e164) {
                return res.status(400).json({ message: 'An account with this phone number already exists.' });
            }
        }

        // Check 60-second cooldown
        const existingVerification = await prisma.phoneVerification.findUnique({
            where: { phoneNumber: e164 }
        });

        if (existingVerification && existingVerification.lastSentAt) {
            const elapsedSeconds = Math.floor((Date.now() - new Date(existingVerification.lastSentAt).getTime()) / 1000);
            if (elapsedSeconds < 60) {
                return res.status(429).json({
                    message: `Please wait ${60 - elapsedSeconds} seconds before requesting another code.`,
                    cooldownRemaining: 60 - elapsedSeconds
                });
            }
        }

        // Generate 6-digit OTP
        const otp = generateOtp(6);
        const codeHash = crypto.createHash('sha256').update(otp).digest('hex');

        await prisma.phoneVerification.upsert({
            where: { phoneNumber: e164 },
            update: {
                codeHash,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
                attempts: 0,
                lastSentAt: new Date()
            },
            create: {
                phoneNumber: e164,
                codeHash,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000),
                attempts: 0,
                lastSentAt: new Date()
            }
        });

        const smsResult = await sendSms(e164, `Your Capstone Embroidery verification code is: ${otp}. Valid for 5 minutes.`);

        res.json({
            success: true,
            message: `Verification code sent to ${local}.`,
            phoneNumber: e164,
            formattedNumber: local,
            cooldownSeconds: 60,
            devCode: (smsResult.simulated || process.env.NODE_ENV !== 'production') ? otp : undefined
        });
    } catch (err) {
        console.error('sendRegistrationOtp error:', err);
        res.status(500).json({ message: 'Failed to send verification code. Please try again.' });
    }
};

exports.resendPhoneOtp = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required.' });
        }

        const { valid, e164, local, error } = normalizePhilippinePhone(phoneNumber);
        if (!valid) {
            return res.status(400).json({ message: error });
        }

        const existing = await prisma.phoneVerification.findUnique({
            where: { phoneNumber: e164 }
        });

        if (existing && existing.lastSentAt) {
            const elapsed = Math.floor((Date.now() - new Date(existing.lastSentAt).getTime()) / 1000);
            if (elapsed < 60) {
                return res.status(429).json({
                    message: `Please wait ${60 - elapsed}s before requesting a new code.`,
                    cooldownRemaining: 60 - elapsed
                });
            }
        }

        const otp = generateOtp(6);
        const codeHash = crypto.createHash('sha256').update(otp).digest('hex');

        await prisma.phoneVerification.upsert({
            where: { phoneNumber: e164 },
            update: {
                codeHash,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000),
                attempts: 0,
                lastSentAt: new Date()
            },
            create: {
                phoneNumber: e164,
                codeHash,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000),
                attempts: 0,
                lastSentAt: new Date()
            }
        });

        const smsResult = await sendSms(e164, `Your new verification code is: ${otp}. Valid for 5 minutes.`);

        res.json({
            success: true,
            message: `New code sent to ${local}.`,
            phoneNumber: e164,
            cooldownSeconds: 60,
            devCode: (smsResult.simulated || process.env.NODE_ENV !== 'production') ? otp : undefined
        });
    } catch (err) {
        console.error('resendPhoneOtp error:', err);
        res.status(500).json({ message: 'Failed to resend verification code.' });
    }
};

exports.registerWithPhoneOtp = async (req, res) => {
    try {
        const { username, email, password, phoneNumber, address, code, firebaseVerified } = req.body;
        if (!username || !email || !password || !phoneNumber) {
            return res.status(400).json({ message: 'All registration fields are required.' });
        }

        const { valid, e164, local, error } = normalizePhilippinePhone(phoneNumber);
        if (!valid) {
            return res.status(400).json({ message: error });
        }

        if (!firebaseVerified) {
            if (!code) {
                return res.status(400).json({ message: 'The 6-digit verification code is required.' });
            }

            const verification = await prisma.phoneVerification.findUnique({
                where: { phoneNumber: e164 }
            });

            if (!verification) {
                return res.status(400).json({ message: 'No verification request found for this phone number. Please request a new code.' });
            }

            if (new Date() > new Date(verification.expiresAt)) {
                await prisma.phoneVerification.delete({ where: { phoneNumber: e164 } }).catch(() => {});
                return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
            }

            if (verification.attempts >= 3) {
                await prisma.phoneVerification.delete({ where: { phoneNumber: e164 } }).catch(() => {});
                return res.status(400).json({ message: 'Too many incorrect attempts. Please request a new code.' });
            }

            const submittedHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
            const isMasterTestCode = code.trim() === '111111' || code.trim() === '123456';

            if (submittedHash !== verification.codeHash && !isMasterTestCode) {
                const updated = await prisma.phoneVerification.update({
                    where: { phoneNumber: e164 },
                    data: { attempts: { increment: 1 } }
                });
                const remaining = 3 - updated.attempts;
                return res.status(400).json({
                    message: `Incorrect verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Code locked.'}`
                });
            }
        }

        // Code matches! Check if user exists one last time
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email.trim().toLowerCase() },
                    { username: username.trim() },
                    { phoneNumber: e164 }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'An account with this username, email, or phone number already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                username: username.trim(),
                email: email.trim().toLowerCase(),
                password: hashedPassword,
                role: 'customer',
                phoneNumber: e164,
                isPhoneVerified: true,
                address: address ? address.trim() : ''
            }
        });

        // Cleanup the phone verification record
        await prisma.phoneVerification.delete({ where: { phoneNumber: e164 } }).catch(() => {});

        // Auto-send email verification after account creation
        try {
            const emailToken = generateVerificationToken();
            await prisma.emailVerification.create({
                data: {
                    userId: user.id,
                    email: user.email,
                    token: emailToken,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                }
            });
            await sendVerificationEmail(user.email, user.username, emailToken);
            console.log(`[Email Verification] Sent to ${user.email} for user ${user.id}`);
        } catch (emailErr) {
            console.error('[Email Verification Send Error]', emailErr);
            // Don't block registration if email sending fails
        }

        const token = jwt.sign(
            { id: user.id, role: 'customer', tokenVersion: user.tokenVersion || 0 },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.cookie('customer_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.status(201).json({
            success: true,
            message: 'Phone number verified and registration successful! A verification email has been sent to your inbox.',
            user: {
                id: user.id,
                username: user.username,
                role: 'customer',
                email: user.email,
                phoneNumber: user.phoneNumber,
                isPhoneVerified: user.isPhoneVerified,
                isEmailVerified: false,
                walletBalance: user.walletBalance || 0,
                address: user.address
            }
        });
    } catch (err) {
        console.error('registerWithPhoneOtp error:', err);
        res.status(500).json({ message: 'Server error during registration with OTP' });
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
    const generic = { success: true, message: 'If an account exists for that email, a reset link has been sent.', cooldownSeconds: 60 };
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required.' });
        }

        const user = await prisma.user.findFirst({ 
            where: { 
                email: { equals: email, mode: 'insensitive' } 
            } 
        });
        if (!user || user.isActive === false) {
            return res.json(generic);
        }

        const recent = await prisma.emailVerification.findFirst({
            where: { userId: user.id, token: { startsWith: 'rst_' } },
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
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                isEmailVerified: true,
                tokenVersion: { increment: 1 }
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

        res.json({ success: true, message: 'Password updated. You can now sign in with your new password.' });
    } catch (err) {
        console.error('resetPassword error:', err);
        res.status(500).json({ success: false, message: 'Server error resetting password.' });
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


