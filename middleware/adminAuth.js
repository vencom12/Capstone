const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

const adminAuth = () => {
    return async (req, res, next) => {
        // Resilience: Check both specific and legacy token names
        const token = req.cookies.admin_token || req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

        if (!token) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Token Versioning Check
            const user = await prisma.user.findUnique({ 
                where: { id: decoded.id }, 
                select: { tokenVersion: true } 
            });
            
            if (!user || user.tokenVersion !== decoded.tokenVersion) {
                return res.status(401).json({ message: 'Session expired or revoked. Please log in again.' });
            }

            if (decoded.role !== 'admin') {
                return res.status(403).json({ message: 'Access denied: Admin only' });
            }
            req.user = decoded;
            next();
        } catch (err) {
            res.status(401).json({ message: 'Token is not valid' });
        }
    };
};

module.exports = adminAuth;
