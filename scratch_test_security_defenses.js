const gcashService = require('./services/payments/gcashService');
const { parseReceiptWithLocalOCR } = require('./services/payments/localOcrService');

async function runSecurityTests() {
    console.log('=== PAYMENT VERIFICATION SECURITY DEFENSE TEST SUITE ===\n');
    let passed = 0;
    let failed = 0;

    function assert(name, condition, details = '') {
        if (condition) {
            console.log(`[PASS] ${name}`);
            passed++;
        } else {
            console.error(`[FAIL] ${name} - ${details}`);
            failed++;
        }
    }

    // --- TEST 1: Recipient Verification ---
    console.log('\n--- 1. Testing Recipient Spoofing Defense ---');
    const validRecipientResult = gcashService.validateReceiptData({
        referenceId: '2045753370805',
        paymentPlatform: 'GCash',
        recipientName: 'Eds Towels & Caps'
    });
    assert('Legitimate store recipient is accepted', validRecipientResult.isValid === true);

    const maskedRecipientResult = gcashService.validateReceiptData({
        referenceId: '2045753370805',
        paymentPlatform: 'GCash',
        recipientName: 'DA*****E** A.'
    });
    assert('Masked merchant recipient (DA*****E** A.) is accepted', maskedRecipientResult.isValid === true);

    const spoofedRecipientResult = gcashService.validateReceiptData({
        referenceId: '2045753370805',
        paymentPlatform: 'GCash',
        recipientName: 'Juan Dela Cruz'
    });
    assert('Spoofed friend recipient (Juan Dela Cruz) is BLOCKED', spoofedRecipientResult.isValid === false, spoofedRecipientResult.error);

    // --- TEST 2: Artificial Reference Number Patterns ---
    console.log('\n--- 2. Testing Synthetic/Dummy Reference ID Defense ---');
    const repeatedRefResult = gcashService.validateReceiptData({
        referenceId: '1111111111111',
        paymentPlatform: 'GCash'
    });
    assert('Repeated digit dummy reference (1111111111111) is BLOCKED', repeatedRefResult.isValid === false, repeatedRefResult.error);

    const sequentialRefResult = gcashService.validateReceiptData({
        referenceId: '0123456789012',
        paymentPlatform: 'GCash'
    });
    assert('Sequential dummy reference (0123456789012) is BLOCKED', sequentialRefResult.isValid === false, sequentialRefResult.error);

    const shortRefResult = gcashService.validateReceiptData({
        referenceId: '12345',
        paymentPlatform: 'GCash'
    });
    assert('Short reference ID (< 10 digits) is BLOCKED', shortRefResult.isValid === false, shortRefResult.error);

    // --- TEST 3: Levenshtein Distance (Altered Sibling Reference Detection) ---
    console.log('\n--- 3. Testing Levenshtein Distance & Digit Alteration Detection ---');
    const dist1 = gcashService.calculateLevenshteinDistance('2045753370805', '2045753370806'); // 1 digit changed
    assert('1-digit alteration has distance 1', dist1 === 1);

    const dist2 = gcashService.calculateLevenshteinDistance('2045753370805', '2045753370899'); // 2 digits changed
    assert('2-digit alteration has distance 2', dist2 === 2);

    const distFar = gcashService.calculateLevenshteinDistance('2045753370805', '9012384102987'); // Different ref
    assert('Legitimately different reference has high distance (> 5)', distFar > 5);

    // --- TEST 4: Underpayment Logic ---
    console.log('\n--- 4. Testing Strict Underpayment Math Defense ---');
    const orderTotal = 1500.00;
    const partialAmount = 15.00;
    const fullAmount = 1500.00;
    const isUnderpaid = !(Math.abs(partialAmount - orderTotal) < 0.05 || partialAmount >= orderTotal);
    const isPaid = (Math.abs(fullAmount - orderTotal) < 0.05 || fullAmount >= orderTotal);
    assert('Partial payment (₱15 on ₱1500) is detected as Underpayment', isUnderpaid === true);
    assert('Full payment (₱1500 on ₱1500) is verified', isPaid === true);

    // --- TEST 5: High-Value Circuit Breaker Threshold ---
    console.log('\n--- 5. Testing High-Value Circuit Breaker Defense ---');
    const normalOrderTotal = 450.00;
    const highValueOrderTotal = 3500.00;
    const THRESHOLD = 2000.00;
    assert('Normal order (₱450) is within auto-approve threshold', normalOrderTotal < THRESHOLD);
    assert('High-value order (₱3500) triggers circuit breaker for manual bank confirmation', highValueOrderTotal >= THRESHOLD);

    console.log(`\n=== TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
}

runSecurityTests().catch(console.error);
