const { createWorker } = require('tesseract.js');
let cachedWorker = null;
async function getWorker() {
    if (!cachedWorker) {
        cachedWorker = await createWorker('eng');
    }
    return cachedWorker;
}
async function parseReceiptWithLocalOCR(imageSource) {
    try {
        const worker = await getWorker();
        const { data } = await worker.recognize(imageSource);
        const text = data.text || '';
        const isGcash = /gcash|sent\s*via\s*gcash|instapay/i.test(text);
        let referenceId = null;
        const refMatch = text.match(/(?:ref(?:\.|erence)?\s*(?:no\.?|number)?[:\s]*)([0-9\s]{10,18})/i);
        if (refMatch && refMatch[1]) {
            const sanitized = refMatch[1].replace(/\s+/g, '');
            if (sanitized.length >= 10 && sanitized.length <= 16) {
                referenceId = sanitized;
            }
        }
        if (!referenceId) {
            const digitSequenceMatch = text.match(/\b(20\d{10,12}|90\d{10,12}|50\d{10,12})\b/);
            if (digitSequenceMatch) {
                referenceId = digitSequenceMatch[1].replace(/\s+/g, '');
            }
        }
        let extractedAmount = null;
        const totalAmountMatch = text.match(/(?:total\s*amount\s*sent|amount(?:\s*sent)?)[^\d\n]*([\d,]+\.\d{2})/i);
        if (totalAmountMatch && totalAmountMatch[1]) {
            const cleanNumber = totalAmountMatch[1].replace(/[^\d.]/g, '');
            const parsed = parseFloat(cleanNumber);
            if (!isNaN(parsed) && parsed > 0) {
                extractedAmount = parsed;
            }
        }
        if (extractedAmount === null) {
            const amountMatches = text.match(/\b\d+\.\d{2}\b/g);
            if (amountMatches && amountMatches.length > 0) {
                extractedAmount = parseFloat(amountMatches[amountMatches.length - 1]);
            }
        }
        let recipientName = null;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const sentViaIdx = lines.findIndex(l => /sent\s*via\s*gcash/i.test(l));
        if (sentViaIdx > 0) {
            const candidate1 = lines[sentViaIdx - 1];
            const candidate2 = sentViaIdx >= 2 ? lines[sentViaIdx - 2] : null;
            if (candidate2 && !/^(total|amount|ref|php|₱|\+63|09)/i.test(candidate2) && candidate2.length > 2) {
                recipientName = candidate2;
            } else if (candidate1 && !/^(total|amount|ref|php|₱)/i.test(candidate1)) {
                recipientName = candidate1;
            }
        }

        let transactionDate = null;
        const dateMatch = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)?/i);
        if (dateMatch) {
            transactionDate = dateMatch[0];
        }

        const hasFinData = Boolean(referenceId && extractedAmount !== null);
        const isValidReceipt = isGcash || hasFinData;
        let confidence = 0.50;
        if (isGcash) confidence += 0.20;
        if (referenceId) confidence += 0.15;
        if (extractedAmount !== null) confidence += 0.15;
        return {
            isValidReceipt,
            extractedAmount,
            referenceId,
            recipientName,
            transactionDate,
            paymentPlatform: isGcash ? 'GCash' : 'InstaPay / E-Wallet',
            confidence: Math.min(1.0, confidence),
            rawText: text,
            engine: 'In-House Local OCR (Tesseract.js)'
        };
    } catch (err) {
        console.error('[Local OCR Error]:', err);
        return {
            isValidReceipt: false,
            extractedAmount: null,
            referenceId: null,
            paymentPlatform: 'Unknown',
            confidence: 0,
            rawText: '',
            error: err.message,
            engine: 'In-House Local OCR (Tesseract.js)'
        };
    }
}
module.exports = { parseReceiptWithLocalOCR };