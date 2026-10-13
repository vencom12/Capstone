const jwt = require('jsonwebtoken');

/**
 * Clears ALL session cookies across all roles to enforce Strict Single Session.
 *
 * @param {import('express').Response} res
 */
function clearAllSessionCookies(res) {
    if (!res) return;
    const clearOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/'
    };
    res.clearCookie('admin_token', clearOptions);
    res.clearCookie('employee_token', clearOptions);
    res.clearCookie('customer_token', clearOptions);
    res.clearCookie('token', clearOptions);
}

/**
 * Enforces Strict Single Session by purging any previously held role cookies
 * and setting cookies strictly for the current authenticated user.
 *
 * @param {import('express').Response} res
 * @param {object} user
 * @param {boolean} [rememberMe=false]
 * @returns {string} The signed JWT
 */
function setSessionCookies(res, user, rememberMe = false) {
    // 1. Strict single-session enforcement: wipe any previous role sessions in the browser
    clearAllSessionCookies(res);

    // 2. Generate signed token
    const expiresIn = (rememberMe && user.role !== 'admin' && user.role !== 'employee') ? '30d' : '1d';
    const token = jwt.sign(
        { id: user.id, role: user.role, tenantId: user.tenantId, tokenVersion: user.tokenVersion || 0 },
        process.env.JWT_SECRET,
        { expiresIn }
    );

    // 3. Set cookie options
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/'
    };

    if (rememberMe && user.role !== 'admin' && user.role !== 'employee') {
        cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    res.cookie('token', token, cookieOptions);
    res.cookie(`${user.role}_token`, token, cookieOptions);

    return token;
}

/**
 * Resolves the appropriate JWT token from request cookies and headers
 * based on route context, headers, and requested roles.
 *
 * @param {import('express').Request} req
 * @param {string[]} [roles]
 * @returns {string|null}
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

    // Check if context is customer
    const isCustomerContext = portalHeader === 'customer' || 
                              path.includes('/api/customer') || 
                              (Array.isArray(roles) && roles.length === 1 && roles.includes('customer'));

    // Check if context is admin
    const isAdminContext = portalHeader === 'admin' || 
                           path.includes('/api/admin') || 
                           (Array.isArray(roles) && roles.length === 1 && roles.includes('admin'));

    // Check if context is employee / staff
    const isEmployeeContext = portalHeader === 'employee' || 
                             path.includes('/api/employee') || 
                             (Array.isArray(roles) && roles.length === 1 && roles.includes('employee'));

    if (isCustomerContext) {
        // Customer requests MUST prioritize customer_token
        return cookies.customer_token || cookies.token || cookies.employee_token || cookies.admin_token || null;
    }

    if (isAdminContext) {
        // Admin requests prioritize admin_token
        return cookies.admin_token || cookies.token || null;
    }

    if (isEmployeeContext) {
        // Employee requests prioritize employee_token
        return cookies.employee_token || cookies.admin_token || cookies.token || null;
    }

    // Role-specific check if roles array is specified
    if (Array.isArray(roles) && roles.length > 0) {
        if (roles.includes('customer') && !roles.includes('admin')) {
            return cookies.customer_token || cookies.token || cookies.admin_token || null;
        }
        if (roles.includes('admin') && !roles.includes('customer')) {
            return cookies.admin_token || cookies.token || null;
        }
        if (roles.includes('employee') && !roles.includes('customer')) {
            return cookies.employee_token || cookies.admin_token || cookies.token || null;
        }
    }

    // Default fallback order: customer_token before admin_token for customer safety
    return cookies.customer_token || cookies.admin_token || cookies.employee_token || cookies.token || null;
}

module.exports = { 
    resolveToken, 
    setSessionCookies, 
    clearAllSessionCookies 
};
