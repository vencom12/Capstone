const prisma = require('../../utils/prisma');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const logErr = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, '../../logs/server_log.txt'), entry);
    console.error(msg);
};

exports.register = async (req, res) => {
    try {
        logErr('Postgres Register attempt: ' + JSON.stringify(req.body));
        const { username, email, password, phoneNumber, address } = req.body;
        
        if (!phoneNumber || !address) {
            return res.status(400).json({ message: 'Phone number and address are required' });
        }

        // Check if user exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { username }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password (Prisma doesn't have pre-save hooks like Mongoose)
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword,
                role: 'customer',
                phoneNumber,
                address
            }
        });

        const token = jwt.sign({ id: user.id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1d' });

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
            const token = jwt.sign({ id: mockUser.id, role: mockRole }, process.env.JWT_SECRET, { expiresIn: '1d' });
            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Lax'
            };
            res.cookie(`${mockRole}_token`, token, cookieOptions);
            res.cookie('token', token, cookieOptions);
            return res.json({ user: mockUser });
        }
        
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email },
                    { username: email }
                ]
            }
        });

        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        if (portal && user.role !== portal) {
            return res.status(403).json({ message: `Unauthorized: This account is not authorized for the ${portal} portal.` });
        }

        const expiresIn = rememberMe ? '30d' : '1d';
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn });

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'Lax'
        };

        if (rememberMe) {
            cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        }
        
        res.cookie(`${user.role}_token`, token, cookieOptions);
        res.cookie('token', token, cookieOptions); 

        res.json({ 
            user: { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                email: user.email,
                walletBalance: user.walletBalance || 0,
                address: user.address || '',
                phoneNumber: user.phoneNumber || ''
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
            select: { id: true, username: true, role: true }
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

        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username },
                    { email }
                ],
                NOT: { id: userId }
            }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Username or Email already in use' });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { username, email },
            select: { id: true, username: true, role: true, email: true }
        });

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            path: '/'
        });

        res.json({ user });
    } catch (err) {
        console.error('Update Profile Error:', err);
        res.status(500).json({ message: 'Server error during profile update' });
    }
};
