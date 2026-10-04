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