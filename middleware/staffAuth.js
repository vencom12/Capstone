const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

/**
 * Middleware to authorize any staff member (Admin or Employee)
 */
const staffAuth = () => {
    return async (req, res, next) => {
        const token = req.cookies.admin_token || 
                      req.cookies.employee_token || 
                      req.cookies.token || 
                      (req.headers.authorization && req.headers.authorization.split(' ')[1]);

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

            if (decoded.role !== 'admin' && decoded.role !== 'employee') {
                return res.status(403).json({ message: 'Access denied: Staff only' });
            }
            req.user = decoded;
            next();
        } catch (err) {
            res.status(401).json({ message: 'Token is not valid' });
        }
    };
};

module.exports = staffAuth;
