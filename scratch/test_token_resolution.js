const { resolveToken } = require('../utils/tokenResolver');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const adminPayload = { id: '765bfc15-81cc-48d1-b47e-cf1f3a2b1f1c', role: 'admin', username: 'ryven' };
const customerPayload = { id: 'bf596262-aab5-4ee5-8608-f1ddae0e4aaf', role: 'customer', username: 'julie' };

const adminToken = jwt.sign(adminPayload, process.env.JWT_SECRET);
const customerToken = jwt.sign(customerPayload, process.env.JWT_SECRET);

console.log('--- Testing Token Resolution ---');

// Test 1: Both cookies present on customer route
{
    const req = {
        cookies: {
            admin_token: adminToken,
            customer_token: customerToken
        },
        originalUrl: '/api/customer/order/submit',
        headers: {}
    };
    const token = resolveToken(req);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Test 1 - Customer Route with both cookies:');
    console.log('  Resolved username:', decoded.username, '(expected: julie)');
    console.log('  Resolved role:', decoded.role, '(expected: customer)');
    if (decoded.username !== 'julie') throw new Error('Test 1 failed!');
}

// Test 2: Both cookies present on customer dashboard-state
{
    const req = {
        cookies: {
            admin_token: adminToken,
            customer_token: customerToken
        },
        originalUrl: '/api/customer/dashboard-state',
        headers: {}
    };
    const token = resolveToken(req, ['customer']);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Test 2 - Dashboard State with both cookies:');
    console.log('  Resolved username:', decoded.username, '(expected: julie)');
    if (decoded.username !== 'julie') throw new Error('Test 2 failed!');
}

// Test 3: Both cookies present on admin route
{
    const req = {
        cookies: {
            admin_token: adminToken,
            customer_token: customerToken
        },
        originalUrl: '/api/admin/dashboard-state',
        headers: {}
    };
    const token = resolveToken(req, ['admin']);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Test 3 - Admin Route with both cookies:');
    console.log('  Resolved username:', decoded.username, '(expected: ryven)');
    if (decoded.username !== 'ryven') throw new Error('Test 3 failed!');
}

// Test 4: Both cookies present with X-Portal header
{
    const req = {
        cookies: {
            admin_token: adminToken,
            customer_token: customerToken
        },
        originalUrl: '/api/auth/me',
        headers: {
            'x-portal': 'customer'
        }
    };
    const token = resolveToken(req);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Test 4 - Auth Route with X-Portal: customer:');
    console.log('  Resolved username:', decoded.username, '(expected: julie)');
    if (decoded.username !== 'julie') throw new Error('Test 4 failed!');
}

console.log('\nALL TOKEN RESOLUTION TESTS PASSED! ✅');
