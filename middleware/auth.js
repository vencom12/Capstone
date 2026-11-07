const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { resolveToken } = require('../utils/tokenResolver');

const auth = (roles = []) => {
    return async (req, res, next) => {
        const primary = resolveToken(req, roles);
        const candidates = [primary];

        if (Array.isArray(roles) && roles.length > 0 && !roles.includes('customer')) {
            if (roles.includes('admin')) candidates.push(req.cookies?.admin_token);
            if (roles.includes('employee')) candidates.push(req.cookies?.employee_token);
            candidates.push(req.cookies?.token);
        } else {
            candidates.push(
                req.cookies?.admin_token,
                req.cookies?.employee_token,
                req.cookies?.customer_token,
                req.cookies?.token
            );
        }

        const uniqueTokens = [...new Set(candidates.filter(Boolean))];

        if (uniqueTokens.length === 0) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        let lastError = null;
        for (const token of uniqueTokens) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                if (roles.length && !roles.includes(decoded.role)) {
                    lastError = { status: 403, body: { message: 'Forbidden: Insufficient permissions' } };
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
                    lastError = { status: 403, body: { message: 'Your account has been deactivated. Please contact management.' } };
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

module.exports = auth;
