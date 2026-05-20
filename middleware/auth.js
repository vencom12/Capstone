const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

const auth = (roles = []) => {
    return async (req, res, next) => {
        const token = req.cookies.admin_token || req.cookies.employee_token || req.cookies.customer_token || req.cookies.token;
        
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

            req.user = decoded;

            if (roles.length && !roles.includes(req.user.role)) {
                return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
            }

            next();
        } catch (err) {
            res.status(401).json({ message: 'Token is not valid' });
        }
    };
};

module.exports = auth;
