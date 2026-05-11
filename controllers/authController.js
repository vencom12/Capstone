const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const logErr = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, '../server_log.txt'), entry);
    console.error(msg);
};

exports.register = async (req, res) => {
    try {
        logErr('Register attempt: ' + JSON.stringify(req.body));
        const { username, email, password, phoneNumber, address } = req.body;
        
        if (!phoneNumber || !address) {
            return res.status(400).json({ message: 'Phone number and address are required' });
        }

        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        user = new User({ username, email, password, role: 'customer', phoneNumber, address });
        await user.save();

        const token = jwt.sign({ id: user._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.cookie('customer_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({ user: { id: user._id, username, role: 'customer' } });
    } catch (err) {
        const message = err.name === 'ValidationError' 
            ? Object.values(err.errors).map(val => val.message).join(', ')
            : 'Server error';
        res.status(500).json({ message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password, rememberMe, portal } = req.body;
        const user = await User.findOne({ $or: [{ email: email }, { username: email }] });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        if (portal && user.role !== portal) {
            return res.status(403).json({ message: `Unauthorized: This account is not authorized for the ${portal} portal.` });
        }

        const expiresIn = rememberMe ? '30d' : '1d';
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn });

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'Lax',
            maxAge: (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000
        };
        
        // Multi-Token Strategy: Set both names to prevent session loss

        res.cookie(`${user.role}_token`, token, cookieOptions);
        res.cookie('token', token, cookieOptions); 

        res.json({ user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.logout = (req, res) => {
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax'
    };
    // Clear all possible portal tokens
    res.clearCookie('admin_token', cookieOptions);
    res.clearCookie('employee_token', cookieOptions);
    res.clearCookie('customer_token', cookieOptions);
    res.clearCookie('token', cookieOptions); // Legacy cleanup
    
    res.json({ message: 'Logged out successfully' });
};

exports.me = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('username role');
        if (!user) return res.status(401).json({ message: 'User not found' });
        res.json({ user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { username, email } = req.body;
        const userId = req.user.id;

        const existingUser = await User.findOne({
            $or: [{ username }, { email }],
            _id: { $ne: userId }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Username or Email already in use' });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { username, email },
            { new: true }
        ).select('-password');

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({ user: { id: user._id, username: user.username, role: user.role, email: user.email } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};
