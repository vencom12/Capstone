const jwt = require('jsonwebtoken');

/**
 * Resolves the appropriate JWT token from request cookies and headers
 * based on route context, headers, and requested roles.
 */
function resolveToken(req, roles = []) {
    if (!req) return null;

    // 1. Authorization header (Bearer token)
    const authHeader = req.headers?.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const bearer = authHeader.slice(7).trim();
        if (bearer) return bearer;
    }

    const cookies = req.cookies || {};
    const portalHeader = req.headers?.['x-portal'];
    const path = req.originalUrl || req.baseUrl || req.url || '';

    // 1. Explicit Portal Header Context (Highest priority to avoid cookie crosstalk)
    if (portalHeader === 'admin') {
        return cookies.admin_token || cookies.token || null;
    }
    if (portalHeader === 'employee') {
        return cookies.employee_token || cookies.admin_token || cookies.token || null;
    }
    if (portalHeader === 'customer') {
        return cookies.customer_token || cookies.token || cookies.employee_token || cookies.admin_token || null;
    }

    // 2. Role-specific check if roles array is specified
    if (Array.isArray(roles) && roles.length > 0) {
        if (roles.includes('admin') && roles.includes('employee') && !roles.includes('customer')) {
            return cookies.admin_token || cookies.employee_token || cookies.token || null;
        }
        if (roles.includes('admin') && !roles.includes('customer')) {
            return cookies.admin_token || cookies.token || null;
        }
        if (roles.includes('employee') && !roles.includes('customer')) {
            return cookies.employee_token || cookies.admin_token || cookies.token || null;
        }
        if (roles.includes('customer') && !roles.includes('admin')) {
            return cookies.customer_token || cookies.token || cookies.admin_token || null;
        }
    }

    // 3. Path-based context if no explicit portal header was sent
    if (path.includes('/api/admin')) {
        return cookies.admin_token || cookies.employee_token || cookies.token || null;
    }
    if (path.includes('/api/employee')) {
        return cookies.employee_token || cookies.admin_token || cookies.token || null;
    }
    if (path.includes('/api/ai/chat') || path.includes('/api/ai/logs')) {
        return cookies.admin_token || cookies.employee_token || cookies.token || null;
    }
    if (path.includes('/api/customer')) {
        return cookies.customer_token || cookies.token || cookies.employee_token || cookies.admin_token || null;
    }

    // 4. Default fallback order
    return cookies.customer_token || cookies.admin_token || cookies.employee_token || cookies.token || null;
}

module.exports = { resolveToken };
