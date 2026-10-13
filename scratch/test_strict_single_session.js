const { setSessionCookies, clearAllSessionCookies, resolveToken } = require('../utils/tokenResolver');
const jwt = require('jsonwebtoken');
require('dotenv').config();

console.log('--- Testing Strict Single Session ---');

// Mock Express Response
function createMockRes() {
    const cleared = [];
    const setCookies = [];
    return {
        clearCookie: (name, opts) => cleared.push({ name, opts }),
        cookie: (name, val, opts) => setCookies.push({ name, val, opts }),
        _getCleared: () => cleared,
        _getSet: () => setCookies
    };
}

// Test 1: Customer Login purges all previous cookies
{
    const res = createMockRes();
    const customer = { id: 'c-1', role: 'customer', tenantId: null, tokenVersion: 1 };
    const token = setSessionCookies(res, customer, false);

    const clearedNames = res._getCleared().map(c => c.name);
    console.log('Test 1 - Customer Login Cleared Cookies:', clearedNames);
    if (!clearedNames.includes('admin_token') || !clearedNames.includes('employee_token') || !clearedNames.includes('customer_token') || !clearedNames.includes('token')) {
        throw new Error('Customer login failed to clear all session cookies!');
    }

    const setNames = res._getSet().map(c => c.name);
    console.log('Test 1 - Customer Login Set Cookies:', setNames);
    if (!setNames.includes('token') || !setNames.includes('customer_token')) {
        throw new Error('Customer login failed to set customer session cookies!');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'customer' || decoded.id !== 'c-1') {
        throw new Error('JWT payload mismatch!');
    }
}

// Test 2: Admin Login purges all previous cookies
{
    const res = createMockRes();
    const admin = { id: 'a-1', role: 'admin', tenantId: null, tokenVersion: 1 };
    const token = setSessionCookies(res, admin, false);

    const clearedNames = res._getCleared().map(c => c.name);
    console.log('Test 2 - Admin Login Cleared Cookies:', clearedNames);
    if (!clearedNames.includes('customer_token') || !clearedNames.includes('employee_token')) {
        throw new Error('Admin login failed to clear customer cookies!');
    }

    const setNames = res._getSet().map(c => c.name);
    console.log('Test 2 - Admin Login Set Cookies:', setNames);
    if (!setNames.includes('token') || !setNames.includes('admin_token')) {
        throw new Error('Admin login failed to set admin session cookies!');
    }
}

// Test 3: Logout purges all session cookies
{
    const res = createMockRes();
    clearAllSessionCookies(res);
    const clearedNames = res._getCleared().map(c => c.name);
    console.log('Test 3 - Logout Cleared Cookies:', clearedNames);
    if (!clearedNames.includes('admin_token') || !clearedNames.includes('customer_token') || !clearedNames.includes('token')) {
        throw new Error('Logout failed to clear all cookies!');
    }
}

console.log('\nALL STRICT SINGLE SESSION TESTS PASSED! ✅');
