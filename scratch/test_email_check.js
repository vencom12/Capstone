const { sendPasswordResetEmail, sendOrderConfirmationEmail } = require('../utils/emailService');
require('dotenv').config();

console.log('--- Testing Email Service Status ---');
console.log('RESEND_API_KEY present:', Boolean(process.env.RESEND_API_KEY));
console.log('GMAIL_USER present:', Boolean(process.env.GMAIL_USER || process.env.EMAIL_USER));
console.log('GMAIL_APP_PASSWORD present:', Boolean(process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS));

async function run() {
    const res = await sendPasswordResetEmail('test@gmail.com', 'TestUser', 'rst_test123');
    console.log('Result:', res);
}

run().then(() => process.exit(0));
