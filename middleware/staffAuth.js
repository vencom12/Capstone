const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { resolveToken } = require('../utils/tokenResolver');

/**
 * Middleware to authorize any staff member (Admin or Employee).
 * Resiliently checks portal-resolved token first, then falls back across available staff cookies
 * so a stale admin_token cookie never blocks an active employee_token session (or vice versa).
 */
const staffAuth = () => {
    return async (req, res, next) => {
        const primary = resolveToken(req, ['admin', 'employee']);
        const candidates = [
            primary,
            req.cookies?.employee_token,
            req.cookies?.admin_token,
            req.cookies?.token,
            req.headers?.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null
        ].filter(Boolean);

        const uniqueTokens = [...new Set(candidates)];

        if (uniqueTokens.length === 0) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        let lastError = null;
        for (const token of uniqueTokens) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded.role !== 'admin' && decoded.role !== 'employee') {
                    lastError = { status: 403, body: { message: 'Access denied: Staff only' } };
                    continue;
                }

                const user = await prisma.user.findUnique({
                    where: { id: decoded.id },
                    select: { tokenVersion: true, isActive: true }
                });

                if (!user || user.tokenVersion !== decoded.tokenVersion) {
                    lastError = {
                        status: 401,
                        body: {
                            code: 'SESSION_TERMINATED_CONCURRENT_LOGIN',
                            message: 'This account has been logged in on another device.'
                        }
                    };
                    continue;
                }

                if (user.isActive === false) {
                    lastError = { status: 403, body: { message: 'Staff account has been deactivated. Please contact management.' } };
                    continue;
                }

                req.user = decoded;
                return next();
            } catch (err) {
                lastError = { status: 401, body: { message: 'Token is not valid' } };
            }
        }

        return res.status(lastError?.status || 401).json(lastError?.body || { message: 'Token is not valid' });
    };
};

module.exports = staffAuth;
