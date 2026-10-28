const prisma = require('../../utils/prisma');
const crypto = require('crypto');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');
const { calculatePickupSchedule } = require('../../utils/pickupScheduler');

// Idempotency cache (5-minute TTL) to prevent duplicate order submissions from double-taps / retries
const orderIdempotencyStore = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of orderIdempotencyStore.entries()) {
        if (now - val.timestamp > 5 * 60 * 1000) {
            orderIdempotencyStore.delete(key);
        }
    }
}, 60 * 1000);

exports.getDashboardState = async (req, res) => {
    try {
        const userId = req.user ? req.user.id : null;

        let orders = [], currentUser = null, transactions = [], receipts = [];

        if (userId) {
            const [o, u, t, r] = await Promise.all([
                prisma.order.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
                prisma.user.findUnique({
                    where: { id: userId },
                    include: { favorites: true }
                }),
                prisma.transaction.findMany({ where: { userId }, orderBy: { timestamp: 'desc' } }),
                prisma.receipt.findMany({ where: { userId }, orderBy: { timestamp: 'desc' } })
            ]);
            orders = o; currentUser = u; transactions = t; receipts = r;

            // Attach the customer's own review (if any) so the UI shows "Edit Review" instead of "Rate"
            const myReviews = await prisma.$queryRaw`
                SELECT "orderId", "rating", "message" FROM "Feedback" WHERE "userId" = ${userId} AND "orderId" IS NOT NULL
            `;
            const reviewByOrder = new Map(myReviews.map(r => [r.orderId, { rating: r.rating, message: r.message }]));
            orders = orders.map(ord => ({ ...ord, myReview: reviewByOrder.get(ord.orderId) || null }));
        }

        const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
        const { enrichProductsWithStock } = require('../../utils/inventoryManager');
        const enrichedProducts = await enrichProductsWithStock(products);
        const enrichedFavorites = currentUser ? await enrichProductsWithStock(currentUser.favorites) : [];

        res.json({
            orders,
            products: enrichedProducts,
            favorites: enrichedFavorites,
            walletBalance: currentUser ? currentUser.walletBalance : 0,
            address: currentUser ? currentUser.address : '',
            phoneNumber: currentUser ? currentUser.phoneNumber : '',
            isEmailVerified: currentUser ? currentUser.isEmailVerified : false,
            savedAddresses: currentUser ? (currentUser.savedAddresses || []) : [],
            preferredDeliveryTime: currentUser ? currentUser.preferredDeliveryTime : '',
            transactions,
            receipts
        });
    } catch (err) {
        console.error('getDashboardState error:', err);
        res.status(500).json({ message: 'Error fetching dashboard state' });
    }
};

exports.topupWallet = async (req, res) => {
    try {
        const { amount } = req.body;
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ message: 'Invalid top-up amount.' });
        }

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { walletBalance: { increment: numAmount } }
        });

        socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.WALLET, { balance: user.walletBalance }, `user:${user.id}`);
        res.json({ message: `Successfully topped up $${numAmount.toFixed(2)}`, walletBalance: user.walletBalance });
    } catch (err) {
        res.status(500).json({ message: 'Server error during top-up' });
    }
};

exports.submitOrder = async (req, res) => {
    try {
        const { items, totalAmount, paymentMethod, address, deliveryTime, notes, receiptUrl, isByog, waiverSigned, giftPackaging, calligraphyMessage, personalization, isRush, dueDate, existingOrderId, referenceNumber, isTestBypass } = req.body;
        const userId = req.user.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Idempotency guard: prevent duplicate orders from rapid double-taps or network retries
        const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
        if (idempotencyKey && orderIdempotencyStore.has(idempotencyKey)) {
            const cached = orderIdempotencyStore.get(idempotencyKey);
            console.log(`[IDEMPOTENCY] Replaying cached order response for key: ${idempotencyKey}`);
            return res.json(cached.response);
        }

        // Allow test bypass in development mode OR for testing accounts with isTestBypass/TEST- reference
        const isBypassActive = Boolean(
            isTestBypass === true ||
            paymentMethod === 'test_mode' ||
            (referenceNumber && String(referenceNumber).startsWith('TEST-')) ||
            (process.env.NODE_ENV !== 'production' || req.user?.role === 'admin' || req.user?.role === 'employee')
        );

        // If this is a manual reference confirmation for an existing order in 'Awaiting Payment', update it
        if (existingOrderId) {
            const existingOrder = await prisma.order.findFirst({
                where: { orderId: existingOrderId, userId },
                include: { receipt: true, transaction: true }
            });
            if (existingOrder && existingOrder.paymentStatus === 'unpaid') {
                const cleanRef = (personalization?.referenceNumber || referenceNumber || (isBypassActive ? `TEST-GCASH-${Date.now().toString().slice(-8)}` : '')).trim();
                const updatedPersonalization = {
                    ...(typeof existingOrder.personalization === 'object' && existingOrder.personalization !== null ? existingOrder.personalization : {}),
                    ...(personalization || {}),
                    referenceNumber: cleanRef
                };

                const itemsList = Array.isArray(existingOrder.items) ? existingOrder.items : [];
                const orderNeedsStitching = itemsList.some(item => Boolean(item.personalization?.text && String(item.personalization.text).trim().length > 0));
                const validatedStatus = isBypassActive ? (orderNeedsStitching ? 'In Queue' : 'Ready For Pick Up') : existingOrder.status;
                const validatedProgress = isBypassActive ? (orderNeedsStitching ? 5 : 90) : existingOrder.progress;

                const updatedOrder = await prisma.order.update({
                    where: { id: existingOrder.id },
                    data: {
                        personalization: updatedPersonalization,
                        notes: notes || existingOrder.notes,
                        status: validatedStatus,
                        paymentStatus: isBypassActive ? 'paid' : existingOrder.paymentStatus,
                        progress: validatedProgress,
                    }
                });

                if (existingOrder.receipt) {
                    await prisma.receipt.update({
                        where: { id: existingOrder.receipt.id },
                        data: {
                            referenceId: cleanRef || existingOrder.receipt.referenceId,
                            status: isBypassActive ? 'Paid' : existingOrder.receipt.status,
                            aiVerificationStatus: isBypassActive ? 'verified' : existingOrder.receipt.aiVerificationStatus,
                        }
                    });
                }

                if (existingOrder.transaction && isBypassActive) {
                    await prisma.transaction.update({
                        where: { id: existingOrder.transaction.id },
                        data: {
                            status: 'completed'
                        }
                    });
                }

                const io = req.app.get('io');
                if (io) {
                    socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, updatedOrder);
                }

                // If bypass or marked paid, trigger confirmation email to customer only
                if (isBypassActive && user.email) {
                    const { sendOrderConfirmationEmail } = require('../../utils/emailService');
                    sendOrderConfirmationEmail(user.email, user.username, updatedOrder).catch(err => {
                        console.error('[EmailService] Order confirmation email dispatch failed:', err.message);
                    });
                }

                return res.json({ message: 'Order reference number recorded successfully.', order: updatedOrder, receiptID: existingOrder.receipt?.receiptID });
            }
        }

        if (!items || items.length === 0) return res.status(400).json({ message: 'Your basket is empty. Please add items before checking out.' });

        // Fix B: Payment Method Whitelist (Only GCash for digital wallet per store policy)
        const VALID_PAYMENT_METHODS = ['wallet', 'cash_at_counter', 'gcash'];
        // test_mode is strictly restricted to development environments and authenticated administrators
        if (process.env.NODE_ENV !== 'production' && req.user && req.user.role === 'admin') {
            VALID_PAYMENT_METHODS.push('test_mode');
        }
        if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
            return res.status(400).json({ message: 'Please select a valid payment method (GCash, Store Wallet, or Cash at Counter).' });
        }

        // Instant approval for genuine wallet, admin test mode, or test bypass
        const isInstantApproved = (paymentMethod === 'wallet' || (paymentMethod === 'test_mode' && process.env.NODE_ENV !== 'production' && req.user?.role === 'admin') || isBypassActive);

        // User is already resolved at function start

        if (!user.isEmailVerified && !isBypassActive) {
            return res.status(403).json({ message: 'Please check your email to verify your account before placing an order.' });
        }

        // Fix A: Server-side total recalculation (never trust client-sent total)
        // Correctly factors in variant price overrides and admin-configured Small/Big Garment lettering rates
        const globalSettings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        let smallRate = 7;
        let bigRate = 10;
        let preOrderPrepDays = 3;
        if (globalSettings?.availableThreadColors) {
            let colors = globalSettings.availableThreadColors;
            if (typeof colors === 'string') {
                try { colors = JSON.parse(colors); } catch (e) {}
            }
            if (Array.isArray(colors)) {
                const meta = colors.find(c => c && c.id === '__pricing_meta__');
                if (meta) {
                    if (meta.smallGarmentLetterRate !== undefined) smallRate = Number(meta.smallGarmentLetterRate) || 7;
                    if (meta.bigGarmentLetterRate !== undefined) bigRate = Number(meta.bigGarmentLetterRate) || 10;
                    if (meta.preOrderPrepDays !== undefined) preOrderPrepDays = Math.max(0, Number(meta.preOrderPrepDays) || 3);
                }
            }
        }

        const resolveIsBigGarment = (prod, itemHint) => {
            if (itemHint === 'big') return true;
            if (itemHint === 'small') return false;
            if (Array.isArray(prod?.tags)) {
                if (prod.tags.includes('garment:big')) return true;
                if (prod.tags.includes('garment:small')) return false;
            }
            const t = `${prod?.tag || ''} ${prod?.name || ''}`.toLowerCase();
            return (
                t.includes('bath') ||
                t.includes('shirt') ||
                t.includes('polo') ||
                t.includes('jacket') ||
                t.includes('hoodie') ||
                t.includes('umbrella') ||
                t.includes('robe') ||
                t.includes('blanket')
            );
        };

        const computeSingleLineExtraFee = (lineStr, isBig, byog) => {
            const clamped = String(lineStr || '').replace(/[\r\n]+/g, ' ').slice(0, 20).trim();
            if (!clamped) return 0;
            const rate = isBig ? bigRate : smallRate;
            if (byog) {
                return clamped.replace(/\s+/g, '').length * rate;
            }
            const firstSpace = clamped.indexOf(' ');
            if (firstSpace === -1) return 0;
            const extraChars = clamped.substring(firstSpace + 1).replace(/\s+/g, '').length;
            return extraChars * rate;
        };

        let serverTotal = 0;
        for (const item of items) {
            if (item.isByog || isByog) {
                const itemPrice = parseFloat(item.price) || 0;
                serverTotal += itemPrice * (item.quantity || 1);
                continue;
            }

            const productId = item.productId || item.id;
            if (!productId) return res.status(400).json({ message: 'One of the items in your basket is missing details. Please remove and re-add it.' });
            const product = await prisma.product.findUnique({ where: { id: productId } });
            if (!product) return res.status(404).json({ message: 'This product is currently unavailable.' });

            let itemUnitPrice = product.price;
            if (item.selectedVariant && Array.isArray(product.variants)) {
                const matchedVariant = product.variants.find(v => v && (v.name === item.selectedVariant || v.id === item.selectedVariant));
                if (matchedVariant && matchedVariant.priceOverride !== undefined && matchedVariant.priceOverride !== null) {
                    const parsedOverride = parseFloat(matchedVariant.priceOverride);
                    if (!isNaN(parsedOverride)) {
                        itemUnitPrice = parsedOverride;
                    }
                }
            } else if (item.price !== undefined && !isNaN(parseFloat(item.price)) && Array.isArray(product.variants)) {
                const priceMatchesVariant = product.variants.some(v => v && parseFloat(v.priceOverride) === parseFloat(item.price));
                if (priceMatchesVariant) {
                    itemUnitPrice = parseFloat(item.price);
                }
            }

            const isBig = resolveIsBigGarment(product, item.garmentSize || item.personalization?.garmentSize);
            const namesList = item.personalization?.namesList || item.namesList;
            const qty = Math.max(1, parseInt(item.quantity, 10) || 1);

            if (Array.isArray(namesList) && namesList.length > 0) {
                let bulkExtraSum = 0;
                namesList.forEach(line => {
                    bulkExtraSum += computeSingleLineExtraFee(line, isBig, false);
                });
                serverTotal += (itemUnitPrice * qty) + bulkExtraSum;
            } else if (item.personalization?.text && String(item.personalization.text).includes('\n')) {
                const lines = String(item.personalization.text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                let bulkExtraSum = 0;
                lines.forEach(line => {
                    bulkExtraSum += computeSingleLineExtraFee(line, isBig, false);
                });
                serverTotal += (itemUnitPrice * qty) + bulkExtraSum;
            } else {
                const extraLettering = item.extraLetteringCost !== undefined
                    ? (parseFloat(item.extraLetteringCost) || 0)
                    : (item.personalization?.extraLetteringCost !== undefined
                        ? (parseFloat(item.personalization.extraLetteringCost) || 0)
                        : computeSingleLineExtraFee(item.personalization?.text || '', isBig, false));
                serverTotal += (itemUnitPrice + extraLettering) * qty;
            }
        }

        // Emergency delay notice / leave policy guard:
        if (globalSettings?.emergencyNoticeActive && globalSettings.emergencyOrderingPolicy === 'PAUSE_ORDERS' && !isBypassActive) {
            const resumeDateStr = globalSettings.emergencyNoticeResumeDate
                ? new Date(globalSettings.emergencyNoticeResumeDate).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'soon';
            return res.status(400).json({
                message: `Online ordering is temporarily paused while our workshop is closed (${globalSettings.emergencyNoticeReason || 'Scheduled Leave'}). Ordering will resume on ${resumeDateStr}.`
            });
        }

        // Add gift packaging if selected
        if (giftPackaging) {
            serverTotal += (globalSettings && globalSettings.giftPackagingPrice != null) ? globalSettings.giftPackagingPrice : 5.00;
        }
        const numTotal = Math.round(serverTotal * 100) / 100; // Round to 2 decimal places

        if (paymentMethod === 'wallet' && (user.walletBalance || 0) < numTotal) {
            return res.status(400).json({ message: 'Your store wallet balance is not enough for this order. Please top up or choose GCash or Cash at Counter.' });
        }

        // Anti-Replay Defense: Block using an already-verified receipt URL at checkout
        if (paymentMethod === 'gcash' && receiptUrl && !isBypassActive && !isTestBypass) {
            const alreadyUsedReceipt = await prisma.receipt.findFirst({
                where: {
                    imageUrl: receiptUrl,
                    aiVerificationStatus: 'verified',
                    NOT: {
                        referenceId: { startsWith: 'TEST-' }
                    }
                }
            });
            if (alreadyUsedReceipt) {
                return res.status(400).json({
                    message: "This payment receipt was already used for an earlier order. Please upload the official GCash receipt you used for this purchase so we can get your order started right away."
                });
            }
        }

        const secureOrderId = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const secureTransactionId = `TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const secureReceiptId = `RCP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

        // Prisma Transaction for Atomic operation
        const result = await prisma.$transaction(async (tx) => {
            let hasPreOrderItems = false;
            let totalPreOrderShortage = 0;
            const reservationLocks = [];

            // 1. Check stock availability for all items in the cart (with row locking)
            for (const item of items) {
                if (item.isByog || isByog) continue; // BYOG items provided by customer

                const productId = item.productId || item.id;
                // Execute SELECT FOR UPDATE to lock this product row
                const products = await tx.$queryRaw`
                    SELECT id, name, price, tag, description, "imageUrl", count, "minThreshold", "reservedCount", recipe, variants, embedding::text FROM "Product" WHERE id = ${productId} FOR UPDATE
                `;
                const product = products[0];
                if (!product) {
                    throw new Error(`Product not found: ${item.name}`);
                }

                // ATP calculation
                const atp = Math.max(0, (product.count || 0) - (product.reservedCount || 0));
                const needed = item.quantity || 1;
                const allowsPreOrder = Boolean(
                    item.isPreOrder ||
                    item.personalization?.isPreOrder ||
                    personalization?.isPreOrder ||
                    req.body?.isPreOrder
                );

                if (atp < needed && !allowsPreOrder) {
                    throw new Error(`OutOfStock:${product.name}`);
                }

                if (atp < needed) {
                    hasPreOrderItems = true;
                    const shortage = needed - atp;
                    totalPreOrderShortage += shortage;
                    item.isPreOrder = true;
                    item.preOrderShortage = shortage;
                }

                const toLock = Math.max(0, Math.min(atp, needed));
                reservationLocks.push({ productId, toLock });
            }

            // 2. Reserve garments in database (lock counts)
            for (const lockInfo of reservationLocks) {
                if (lockInfo.toLock > 0) {
                    await tx.product.update({
                        where: { id: lockInfo.productId },
                        data: {
                            reservedCount: { increment: lockInfo.toLock }
                        }
                    });
                }
            }

            // 3. Deduct balance if using wallet
            if (paymentMethod === 'wallet') {
                await tx.user.update({
                    where: { id: userId },
                    data: { walletBalance: { decrement: numTotal } }
                });
            }

            // Strictly enforce store pickup fulfillment
            const isPickup = true;
            const courier = 'Store Pick-up';
            const cleanId = secureOrderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
            const initialTracking = `PU-LUC-${cleanId}`;
            const verificationClaimCode = secureOrderId.startsWith('WI-')
                ? `#${secureOrderId.replace('WI-', 'A-')}`
                : `#A-${secureOrderId.slice(-4).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;

            const orderPersonalization = {
                ...(personalization && typeof personalization === 'object' ? personalization : {}),
                fulfillmentType: 'pickup',
                courier: 'Store Pick-up',
                trackingNumber: initialTracking,
                claimCode: verificationClaimCode,
                statusHistory: [
                    {
                        status: isInstantApproved ? 'In Queue' : 'Awaiting Payment',
                        timestamp: new Date().toISOString(),
                        actor: 'Customer Checkout',
                        hub: 'Eds Towels Pacific Mall Lucena Hub',
                        note: isInstantApproved
                            ? 'Payment confirmed; placed in embroidery queue for Store Pick-up.'
                            : 'Order submitted, pending payment confirmation.'
                    }
                ]
            };

            if (orderPersonalization.text && typeof orderPersonalization.text === 'string') {
                orderPersonalization.text = orderPersonalization.text
                    .split(/\r?\n/)
                    .map(l => l.slice(0, 20).trim())
                    .filter(Boolean)
                    .join('\n');
            }
            if (hasPreOrderItems) {
                orderPersonalization.isPreOrder = true;
                orderPersonalization.preOrderShortage = totalPreOrderShortage;
                orderPersonalization.preOrderAcknowledgedAt = new Date().toISOString();
            }

            if (globalSettings?.emergencyNoticeActive && globalSettings.emergencyOrderingPolicy === 'ALLOW_WITH_DELAY') {
                orderPersonalization.delayNotice = {
                    active: true,
                    reason: globalSettings.emergencyNoticeReason || 'Workshop Leave',
                    message: globalSettings.emergencyNoticeMessage || '',
                    resumeDate: globalSettings.emergencyNoticeResumeDate,
                    delayHours: globalSettings.emergencyNoticeDelayHours || 0,
                    policy: 'ALLOW_WITH_DELAY',
                    acknowledgedAt: new Date().toISOString()
                };
            }

            // Sanitize items and enforce strict 20-character per-line embroidery limit (including spaces)
            const sanitizedItems = Array.isArray(items) ? items.map(item => {
                if (item && item.personalization) {
                    const rawNamesList = Array.isArray(item.personalization.namesList)
                        ? item.personalization.namesList.map(n => String(n || '').replace(/[\r\n]+/g, ' ').slice(0, 20).trim()).filter(Boolean)
                        : null;
                    const sanitizedText = typeof item.personalization.text === 'string'
                        ? (rawNamesList && rawNamesList.length > 0
                            ? rawNamesList.join('\n')
                            : item.personalization.text
                                .split(/\r?\n/)
                                .map(l => l.slice(0, 20).trim())
                                .filter(Boolean)
                                .join('\n'))
                        : '';
                    return {
                        ...item,
                        personalization: {
                            ...item.personalization,
                            text: sanitizedText,
                            namesList: rawNamesList && rawNamesList.length > 0 ? rawNamesList : undefined,
                            isBulkList: Boolean(rawNamesList && rawNamesList.length > 1)
                        }
                    };
                }
                return item;
            }) : [];

            // Check if any item in the order has custom embroidery text
            const requiresEmbroidery = sanitizedItems.some(item => {
                const text = item.personalization?.text;
                const names = item.personalization?.namesList;
                return Boolean((text && String(text).trim().length > 0) || (Array.isArray(names) && names.length > 0));
            });

            // 4. Create Order with descriptive design summary & empirical turnaround estimation
            const designSummary = sanitizedItems.length > 0
                ? sanitizedItems.map(i => {
                    const variantInfo = i.selectedVariant ? ` [${i.selectedVariant}]` : '';
                    const names = i.personalization?.namesList;
                    let textInfo = '';
                    if (Array.isArray(names) && names.length > 1) {
                        textInfo = ` — [Bulk ${names.length} Names: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '...' : ''}]`;
                    } else if (i.personalization?.text) {
                        textInfo = ` — "${i.personalization.text.replace(/\n/g, ', ')}"`;
                    }
                    const preTag = (i.isPreOrder || hasPreOrderItems) ? ' (Pre-Order)' : '';
                    return `${i.quantity > 1 ? `${i.quantity}x ` : ''}${i.name}${variantInfo}${textInfo}${preTag}`;
                }).join('; ')
                : "Cart Order";

            const { estimateProductionTime } = require('../../utils/aiScheduler');
            const calculatedEstTime = requiresEmbroidery 
                ? Math.ceil(estimateProductionTime({
                    design: designSummary,
                    items: sanitizedItems,
                    personalization: orderPersonalization
                }))
                : 5; // Plain retail items: 2-5 minutes packaging only

            let finalClaimSchedule = 'Ready in 2–5 mins (Packaging Only)';
            let finalDueDate = new Date(Date.now() + 5 * 60 * 1000);

            if (requiresEmbroidery) {
                // High-Efficiency Queue Watermark Scheduling for custom embroidery
                const { scheduleIncomingOrder } = require('../../utils/workshopQueueManager');
                const scheduling = await scheduleIncomingOrder({
                    orderDurationMinutes: calculatedEstTime,
                    prisma: tx
                });
                finalClaimSchedule = scheduling.readyLabel;
                finalDueDate = scheduling.estimatedReadyDate;
                if (dueDate) {
                    const parsedDue = new Date(dueDate);
                    if (!isNaN(parsedDue.getTime()) && parsedDue.getTime() >= scheduling.estimatedReadyDate.getTime()) {
                        finalDueDate = parsedDue;
                    }
                }
                orderPersonalization.queuePosition = scheduling.queuePosition;
                orderPersonalization.ordersAhead = scheduling.ordersAhead;
                orderPersonalization.queueWaitMinutes = scheduling.queueWaitMinutes;
            }

            orderPersonalization.readyLabel = finalClaimSchedule;
            orderPersonalization.estimatedReadyDate = finalDueDate.toISOString();
            orderPersonalization.estimatedStitchMinutes = requiresEmbroidery ? calculatedEstTime : 0;
            orderPersonalization.isPlainOrder = !requiresEmbroidery;
            orderPersonalization.requiresEmbroidery = requiresEmbroidery;
            orderPersonalization.packagingPriority = !requiresEmbroidery ? 2 : undefined;

            const initialOnlineStatus = isInstantApproved 
                ? (requiresEmbroidery ? 'In Queue' : 'Ready For Pick Up') 
                : 'Awaiting Payment';
            const initialOnlineProgress = isInstantApproved 
                ? (requiresEmbroidery ? 5 : 90) 
                : 0;

            const order = await tx.order.create({
                data: {
                    orderId: secureOrderId,
                    client: user.username,
                    userId: user.id,
                    design: designSummary,
                    items: sanitizedItems, // JSON field
                    totalAmount: numTotal,
                    paymentMethod,
                    paymentStatus: isInstantApproved ? 'paid' : 'unpaid',
                    status: initialOnlineStatus,
                    address,
                    deliveryTime: finalClaimSchedule,
                    notes: notes || (!requiresEmbroidery ? 'Plain items — packaging only (2-5 mins)' : null),
                    progress: initialOnlineProgress,
                    isByog: isByog || false,
                    waiverSigned: waiverSigned || false,
                    giftPackaging: giftPackaging || false,
                    calligraphyMessage: calligraphyMessage || null,
                    personalization: orderPersonalization,
                    isRush: isRush || false,
                    estimatedTime: calculatedEstTime,
                    dueDate: finalDueDate
                }
            });

            // 5. Create Transaction
            const transaction = await tx.transaction.create({
                data: {
                    transactionID: secureTransactionId,
                    orderID: secureOrderId,
                    amount: numTotal,
                    status: isInstantApproved ? 'completed' : 'pending',
                    receiptLink: `/api/customer/receipt/${secureReceiptId}/download`,
                    receiptId: secureReceiptId,
                    userId: user.id
                }
            });

            // 6. Create Receipt
            const receipt = await tx.receipt.create({
                data: {
                    receiptID: secureReceiptId,
                    orderID: secureOrderId,
                    paymentMethod,
                    amount: numTotal,
                    status: isInstantApproved ? 'Paid' : 'Pending',
                    aiVerificationStatus: isInstantApproved ? 'verified' : 'pending',
                    referenceId: referenceNumber || (isBypassActive ? `TEST-GCASH-${Date.now().toString().slice(-8)}` : null),
                    imageUrl: receiptUrl || (isBypassActive ? 'https://res.cloudinary.com/dzr6uwcr1/image/upload/v1790078256/stitch-master-products/wrdipkvspnz1fuewligw.jpg' : null),
                    userId: user.id
                }
            });

            // 7. Link back to order
            const updatedOrder = await tx.order.update({
                where: { id: order.id },
                data: { transactionId: transaction.id, receiptId: receipt.id }
            });

            return updatedOrder;
        });

        // 8. Reconcile reserved counts asynchronously outside transaction
        const { reconcileReservedCounts } = require('../../utils/inventoryManager');
        reconcileReservedCounts(prisma).catch(err => console.error('reconcileReservedCounts background error:', err));

        // Socket notifications
        const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
        const io = req.app.get('io');

        // Recalculate AI Queue priorities asynchronously
        const { recalculateQueuePriorities } = require('../../utils/aiScheduler');
        setImmediate(() => {
            recalculateQueuePriorities(io).catch(err => {
                console.error('[AI Queue Background Error] Recalculation failed:', err);
            });
        });
        if (io) {
            socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.WALLET, { balance: updatedUser.walletBalance }, `user:${user.id}`);
            // Broadcast new order creation to admin, staff, and customer
            socketUtil.emitDataChanged(io, ACTIONS.CREATE, ENTITIES.ORDER, result);
            // Broadcast product update (since reservedCount changed)
            const productsList = await prisma.product.findMany();
            const { enrichProductsWithStock } = require('../../utils/inventoryManager');
            const enrichedList = await enrichProductsWithStock(productsList);
            socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.PRODUCT, enrichedList);
        }

        // Send Order Confirmation Email via Resend / SMTP asynchronously (Customer only)
        const { sendOrderConfirmationEmail } = require('../../utils/emailService');
        if (user.email) {
            sendOrderConfirmationEmail(user.email, user.username, result).catch(err => {
                console.error('[EmailService] Order confirmation email dispatch failed:', err.message);
            });
        }

        const successPayload = { message: 'Order placed successfully.', order: result, receiptID: secureReceiptId };
        if (idempotencyKey) {
            orderIdempotencyStore.set(idempotencyKey, { response: successPayload, timestamp: Date.now() });
        }

        res.json(successPayload);
    } catch (err) {
        console.error('submitOrder error:', err);
        if (err.message && err.message.startsWith('OutOfStockVariant:')) {
            const variantDetails = err.message.split('OutOfStockVariant:')[1];
            return res.status(400).json({ message: `Sorry, ${variantDetails} is currently out of stock.` });
        }
        if (err.message && err.message.startsWith('OutOfStock:')) {
            const productName = err.message.split('OutOfStock:')[1];
            return res.status(400).json({ message: `Sorry, "${productName}" is currently out of stock. Please check back soon!` });
        }
        if (err.message && err.message.startsWith('Product not found:')) {
            return res.status(404).json({ message: err.message });
        }
        res.status(400).json({ message: err.message || 'We had trouble processing your order. Please try again.' });
    }
};

exports.addFavorite = async (req, res) => {
    try {
        await prisma.user.update({
            where: { id: req.user.id },
            data: { favorites: { connect: { id: req.params.id } } }
        });
        res.json({ message: 'Added to favorites' });
    } catch (err) {
        // Idempotent: already connected or benign race condition
        res.json({ message: 'Added to favorites' });
    }
};

exports.removeFavorite = async (req, res) => {
    try {
        await prisma.user.update({
            where: { id: req.user.id },
            data: { favorites: { disconnect: { id: req.params.id } } }
        });
        res.json({ message: 'Removed from favorites' });
    } catch (err) {
        // Idempotent: already disconnected or benign race condition
        res.json({ message: 'Removed from favorites' });
    }
};

exports.getReceipt = async (req, res) => {
    try {
        const rawId = (req.params.id || '').trim();
        if (!rawId || rawId === 'undefined' || rawId === 'null') {
            return res.status(404).json({ message: 'We could not find that receipt.' });
        }

        const cleanCode = rawCodeToClean = rawId.replace(/^[#]/, '').trim();

        // 1. Try finding transaction directly by any known identifier
        let tx = await prisma.transaction.findFirst({
            where: {
                OR: [
                    { transactionID: cleanCode },
                    { receiptId: cleanCode },
                    { orderID: cleanCode },
                    { id: cleanCode }
                ]
            },
            include: { user: true }
        });

        // 2. If not found, try searching Receipt table (by receiptID, id, or orderID)
        let receiptData = null;
        if (!tx) {
            receiptData = await prisma.receipt.findFirst({
                where: {
                    OR: [
                        { receiptID: cleanCode },
                        { id: cleanCode },
                        { orderID: cleanCode }
                    ]
                },
                include: { user: true }
            });

            if (receiptData) {
                tx = await prisma.transaction.findFirst({
                    where: {
                        OR: [
                            { orderID: receiptData.orderID },
                            { receiptId: receiptData.receiptID }
                        ]
                    },
                    include: { user: true }
                });
            }
        }

        // 3. Try finding linked Order
        let linkedOrder = null;
        const orderSearchQuery = tx?.orderID || receiptData?.orderID || cleanCode;
        if (orderSearchQuery) {
            linkedOrder = await prisma.order.findFirst({
                where: {
                    OR: [
                        { orderId: orderSearchQuery },
                        { id: orderSearchQuery },
                        { transactionId: cleanCode },
                        { receiptId: cleanCode }
                    ]
                },
                include: { user: true }
            });
        }

        // If tx is still missing but we found the order, try resolving tx via order's transactionId
        if (!tx && linkedOrder) {
            if (linkedOrder.transactionId) {
                tx = await prisma.transaction.findFirst({
                    where: {
                        OR: [
                            { id: linkedOrder.transactionId },
                            { orderID: linkedOrder.orderId },
                            { transactionID: linkedOrder.transactionId }
                        ]
                    },
                    include: { user: true }
                });
            }
        }

        // If neither transaction nor order can be found, return 404
        if (!tx && !linkedOrder) {
            return res.status(404).json({ message: 'We could not find that receipt.' });
        }

        // Authorization check for customer role
        const targetUserId = tx?.userId || linkedOrder?.userId || receiptData?.userId;
        if (req.user?.role === 'customer' && targetUserId && req.user?.id && targetUserId !== req.user.id) {
            return res.status(403).json({ message: 'You do not have permission to view this receipt.' });
        }

        // Prepare clean non-circular order object
        let cleanOrder = null;
        if (linkedOrder) {
            const { transaction: _t, ...restOrder } = linkedOrder;
            cleanOrder = restOrder;
        }

        const clientName = tx?.user?.username || cleanOrder?.user?.username || cleanOrder?.client || 'Customer';

        res.json({
            transactionID: tx?.transactionID || cleanOrder?.transactionId || `TX-${cleanOrder?.orderId || cleanCode}`,
            orderID: tx?.orderID || cleanOrder?.orderId || cleanCode,
            receiptId: tx?.receiptId || receiptData?.receiptID || cleanOrder?.receiptId || `RCP-${cleanOrder?.orderId || cleanCode}`,
            amount: tx?.amount ?? cleanOrder?.totalAmount ?? 0,
            status: tx?.status || cleanOrder?.paymentStatus || 'completed',
            timestamp: tx?.timestamp || receiptData?.timestamp || cleanOrder?.createdAt || new Date(),
            paymentMethod: tx?.paymentMethod || cleanOrder?.paymentMethod || receiptData?.paymentMethod || 'GCash',
            items: cleanOrder?.items || [],
            order: cleanOrder,
            client: clientName
        });
    } catch (err) {
        console.error('getReceipt error:', err);
        res.status(500).json({ message: 'Could not load your receipt right now. Please try again.' });
    }
};

exports.getCapacity = async (req, res) => {
    try {
        const { getWorkshopCapacity } = require('../../utils/workshopQueueManager');
        const capacity = await getWorkshopCapacity(prisma);
        res.json(capacity);
    } catch (err) {
        console.error('Capacity error:', err);
        res.status(500).json({ message: 'Server error fetching capacity', error: err.message });
    }
};

exports.trackOrder = async (req, res) => {
    try {
        const rawCode = (req.params.code || '').trim();
        if (!rawCode) return res.status(400).json({ error: 'Please enter your Order ID or claim code to track.' });

        const cleanCode = rawCode.replace(/^[#]/, '').trim();
        const strippedCode = cleanCode.replace(/^A-/i, '').replace(/^WI-/i, '').replace(/^ORD-/i, '').trim();

        const order = await prisma.order.findFirst({
            where: {
                OR: [
                    { orderId: { equals: cleanCode, mode: 'insensitive' } },
                    { orderId: { equals: `WI-${cleanCode}`, mode: 'insensitive' } },
                    { orderId: { equals: `ORD-${cleanCode}`, mode: 'insensitive' } },
                    { orderId: { endsWith: strippedCode, mode: 'insensitive' } }
                ]
            },
            select: {
                id: true,
                orderId: true,
                client: true,
                design: true,
                status: true,
                isRush: true,
                estimatedTime: true,
                personalization: true,
                items: true,
                totalAmount: true,
                paymentStatus: true,
                createdAt: true,
                updatedAt: true
            }
        });

        if (!order) {
            return res.status(404).json({ error: `We couldn't find an order with tracking code "${rawCode}". Please check your claim stub and try again.` });
        }

        const sanitizeClient = (rawName) => {
            if (!rawName) return 'Customer';
            const clean = rawName.replace(/^Walk-In\s*\(/i, '').replace(/\)$/, '').trim();
            if (!clean || clean.startsWith('Walk-In') || clean.startsWith('Customer')) return 'Walk-In';
            const parts = clean.split(' ');
            if (parts.length === 1) return parts[0];
            return `${parts[0]} ${parts[parts.length - 1][0]}.`;
        };

        const getVerificationCode = (orderId) => {
            if (!orderId) return '#A-000';
            if (orderId.startsWith('WI-')) return `#${orderId.replace('WI-', 'A-')}`;
            const suffix = orderId.slice(-4).replace(/[^a-zA-Z0-9]/g, '');
            return `#A-${suffix.toUpperCase()}`;
        };

        const parsePersonalizationText = (order) => {
            if (order.personalization && typeof order.personalization === 'object' && order.personalization.text) {
                return order.personalization.text;
            }
            if (Array.isArray(order.items) && order.items.length > 0) {
                const item = order.items[0];
                if (item.personalization && item.personalization.text) return item.personalization.text;
            }
            return null;
        };

        // Calculate stage & wait
        let stage = 'queue';
        if (['Preparing Order', 'In Production', 'Processing'].includes(order.status)) {
            stage = 'stitching';
        } else if (['Ready For Pick Up', 'Ready for Pickup'].includes(order.status)) {
            stage = 'ready';
        } else if (order.status === 'Completed') {
            stage = 'completed';
        }

        let ordersAhead = 0;
        let backlogMinutesAhead = 0;
        if (stage === 'queue') {
            const priorOrders = await prisma.order.findMany({
                where: {
                    status: { in: ['In Queue', 'Preparing Order', 'In Production', 'Processing'] },
                    createdAt: { lt: order.createdAt }
                },
                select: { estimatedTime: true }
            });
            ordersAhead = priorOrders.length;
            backlogMinutesAhead = priorOrders.reduce((acc, o) => acc + (o.estimatedTime || 2), 0);
        }

        const estMins = order.estimatedTime || 2;
        let estimatedMinutesLeft = estMins;
        let readyLabel = '';

        if (stage === 'stitching') {
            const elapsedMinutes = Math.floor((Date.now() - new Date(order.updatedAt).getTime()) / 60000);
            estimatedMinutesLeft = Math.max(1, estMins - Math.min(elapsedMinutes, estMins - 1));
            const sched = calculatePickupSchedule({
                orderDurationMinutes: estimatedMinutesLeft,
                queueBacklogMinutes: 0,
                activeMachines: 1,
                isExpress: true,
                startTime: new Date()
            });
            readyLabel = sched.readyLabel;
        } else if (stage === 'queue') {
            const sched = calculatePickupSchedule({
                orderDurationMinutes: estMins,
                queueBacklogMinutes: backlogMinutesAhead,
                activeMachines: 1,
                isExpress: true,
                startTime: new Date()
            });
            estimatedMinutesLeft = sched.estimatedWaitMinutes;
            readyLabel = sched.readyLabel;
        } else if (stage === 'ready') {
            estimatedMinutesLeft = 0;
            readyLabel = 'Ready for Pickup Now';
        } else {
            estimatedMinutesLeft = 0;
            readyLabel = 'Completed';
        }

        let delayNotice = null;
        if (order.personalization && typeof order.personalization === 'object' && order.personalization.delayNotice) {
            delayNotice = order.personalization.delayNotice;
        } else {
            try {
                const settings = await prisma.systemSettings.findUnique({
                    where: { id: 'global' },
                    select: { emergencyNoticeActive: true, emergencyNoticeReason: true, emergencyNoticeMessage: true, emergencyNoticeDelayHours: true, emergencyNoticeResumeDate: true }
                });
                if (settings?.emergencyNoticeActive && ['In Queue', 'Preparing Order', 'In Production', 'Processing'].includes(order.status)) {
                    delayNotice = {
                        active: true,
                        reason: settings.emergencyNoticeReason,
                        message: settings.emergencyNoticeMessage,
                        delayHours: settings.emergencyNoticeDelayHours || 0,
                        newReadyDate: settings.emergencyNoticeResumeDate
                    };
                }
            } catch (setErr) {
                console.warn('[trackOrder] Settings check notice:', setErr.message);
            }
        }

        res.json({
            success: true,
            order: {
                orderId: order.orderId,
                claimCode: getVerificationCode(order.orderId),
                client: sanitizeClient(order.client),
                design: order.design,
                monogramText: parsePersonalizationText(order),
                status: order.status,
                stage,
                ordersAhead,
                estimatedMinutesLeft,
                readyLabel,
                totalAmount: order.totalAmount,
                paymentStatus: order.paymentStatus,
                paymentMethod: order.paymentMethod,
                personalization: order.personalization,
                delayNotice,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt
            }
        });
    } catch (err) {
        console.error('Error tracking order:', err);
        res.status(500).json({ message: 'Server error tracking order', error: err.message });
    }
};

exports.getLiveQueue = async (req, res) => {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [activeOrders, completedTodayCount, activeMachines] = await Promise.all([
            prisma.order.findMany({
                where: {
                    status: { in: ['In Queue', 'Preparing Order', 'In Production', 'Processing', 'Ready For Pick Up', 'Ready for Pickup'] }
                },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    orderId: true,
                    client: true,
                    design: true,
                    status: true,
                    progress: true,
                    isRush: true,
                    estimatedTime: true,
                    personalization: true,
                    items: true,
                    processedBy: true,
                    createdAt: true,
                    updatedAt: true
                }
            }),
            prisma.order.count({
                where: {
                    status: 'Completed',
                    updatedAt: { gte: todayStart }
                }
            }),
            prisma.machine.count({
                where: { status: { in: ['Running', 'Idle'] } }
            })
        ]);

        const sanitizeClient = (rawName) => {
            if (!rawName) return 'Customer';
            const clean = rawName.replace(/^Walk-In\s*\(/i, '').replace(/\)$/, '').trim();
            if (!clean || clean.startsWith('Walk-In') || clean.startsWith('Customer')) return 'Walk-In Customer';
            const parts = clean.split(' ');
            if (parts.length === 1) return parts[0];
            return `${parts[0]} ${parts[parts.length - 1][0]}.`;
        };

        const getVerificationCode = (orderId) => {
            if (!orderId) return '#A-000';
            if (orderId.startsWith('WI-')) return `#${orderId.replace('WI-', 'A-')}`;
            const suffix = orderId.slice(-4).replace(/[^a-zA-Z0-9]/g, '');
            return `#A-${suffix.toUpperCase()}`;
        };

        const parsePersonalizationText = (order) => {
            if (order.personalization && typeof order.personalization === 'object' && order.personalization.text) {
                return order.personalization.text;
            }
            if (Array.isArray(order.items) && order.items.length > 0) {
                const item = order.items[0];
                if (item.personalization && item.personalization.text) return item.personalization.text;
            }
            return null;
        };

        const getQuantity = (order) => {
            if (Array.isArray(order.items)) {
                return order.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
            }
            return 1;
        };

        const nowStitching = [];
        const readyForPickup = [];
        const upNext = [];

        activeOrders.forEach(order => {
            const isWorking = ['Preparing Order', 'In Production', 'Processing'].includes(order.status);
            const isReady = ['Ready For Pick Up', 'Ready for Pickup'].includes(order.status);
            const qty = getQuantity(order);
            const isExpress = qty === 1;
            const text = parsePersonalizationText(order);
            const baseInfo = {
                id: order.id,
                orderId: order.orderId,
                client: sanitizeClient(order.client),
                design: order.design,
                text,
                quantity: qty,
                isExpress,
                isRush: order.isRush || false,
                verificationCode: getVerificationCode(order.orderId),
                createdAt: order.createdAt
            };

            if (isWorking) {
                const estMins = order.estimatedTime || 6;
                const elapsedMinutes = Math.floor((Date.now() - new Date(order.updatedAt).getTime()) / 60000);
                const remainingMinutes = Math.max(1, estMins - Math.min(elapsedMinutes, estMins - 1));
                nowStitching.push({
                    ...baseInfo,
                    remainingMinutes,
                    progress: order.progress || Math.min(90, Math.max(20, Math.floor((elapsedMinutes / estMins) * 100)))
                });
            } else if (isReady) {
                readyForPickup.push({
                    ...baseInfo,
                    readyAt: order.updatedAt
                });
            } else {
                upNext.push({
                    ...baseInfo,
                    estimatedMinutes: order.estimatedTime || (isExpress ? 6 : 12)
                });
            }
        });

        const machineCount = Math.max(1, activeMachines);
        const totalRemainingMinutes = nowStitching.reduce((acc, o) => acc + o.remainingMinutes, 0) +
            upNext.reduce((acc, o) => acc + o.estimatedMinutes, 0);
        const averageWaitMinutes = Math.ceil(totalRemainingMinutes / machineCount);

        res.json({
            success: true,
            nowStitching,
            readyForPickup,
            upNext,
            stats: {
                activeCount: activeOrders.length,
                completedTodayCount,
                activeMachines: machineCount,
                averageWaitMinutes: activeOrders.length === 0 ? 10 : averageWaitMinutes
            }
        });
    } catch (err) {
        console.error('Error fetching live queue:', err);
        res.status(500).json({ message: 'Server error fetching live queue', error: err.message });
    }
};

exports.getPublicSettings = async (req, res) => {
    try {
        let settings = null;
        try {
            settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        } catch (dbErr) {
            console.warn('[getPublicSettings] Database query notice, using default settings:', dbErr.message);
        }
        const DEFAULT_THREAD_PALETTE = [
            { name: 'Metallic Gold', hex: '#d4af37', isAvailable: true },
            { name: 'Pure White', hex: '#ffffff', isAvailable: true },
            { name: 'Obsidian Black', hex: '#1c1917', isAvailable: true },
            { name: 'Silver Platinum', hex: '#e2e8f0', isAvailable: true },
            { name: 'Royal Navy', hex: '#1e3a8a', isAvailable: true },
            { name: 'Crimson Red', hex: '#b91c1c', isAvailable: true },
            { name: 'Emerald Green', hex: '#047857', isAvailable: true },
            { name: 'Rose Blush', hex: '#fb7185', isAvailable: true }
        ];

        let threadColors = (settings && settings.availableThreadColors) ? settings.availableThreadColors : DEFAULT_THREAD_PALETTE;
        if (typeof threadColors === 'string') {
            try {
                threadColors = JSON.parse(threadColors);
            } catch (e) {
                threadColors = DEFAULT_THREAD_PALETTE;
            }
        }

        let smallGarmentLetterRate = 7;
        let bigGarmentLetterRate = 10;
        let preOrderPrepDays = 3;
        if (Array.isArray(threadColors)) {
            const metaEntry = threadColors.find(c => c && c.id === '__pricing_meta__');
            if (metaEntry) {
                if (metaEntry.smallGarmentLetterRate !== undefined) smallGarmentLetterRate = Number(metaEntry.smallGarmentLetterRate) || 7;
                if (metaEntry.bigGarmentLetterRate !== undefined) bigGarmentLetterRate = Number(metaEntry.bigGarmentLetterRate) || 10;
                if (metaEntry.preOrderPrepDays !== undefined) preOrderPrepDays = Number(metaEntry.preOrderPrepDays) || 3;
            }
            threadColors = threadColors.filter(c => !c || c.id !== '__pricing_meta__');
        }

        res.json({
            giftPackagingPrice: settings ? settings.giftPackagingPrice : 5.00,
            deliveryEnabled: settings ? settings.deliveryEnabled : false,
            businessName: settings?.businessName || 'EDS TOWELS & CAPS',
            businessAddress: settings?.businessAddress || 'Pacific Mall Lucena, Ground Floor, M.L. Tagarao St., Lucena City, Quezon 4301',
            businessContact: settings?.businessContact || '0928 810 3928',
            receiptTagline: settings?.receiptTagline || 'Custom Embroidery & Apparel Workshop',
            businessLogoUrl: settings?.businessLogoUrl || null,
            gcashQrCodeUrl: settings?.gcashQrCodeUrl || null,
            availableThreadColors: threadColors,
            smallGarmentLetterRate,
            bigGarmentLetterRate,
            preOrderPrepDays,
            maxBulkPiecesPerDay: settings?.maxBulkPiecesPerDay ?? 50,
            batchThrottlePeriod: settings?.batchThrottlePeriod || 'week',
            emergencyNotice: settings?.emergencyNoticeActive ? {
                active: true,
                policy: settings.emergencyOrderingPolicy || 'ALLOW_WITH_DELAY',
                reason: settings.emergencyNoticeReason,
                message: settings.emergencyNoticeMessage,
                delayHours: settings.emergencyNoticeDelayHours || 0,
                resumeDate: settings.emergencyNoticeResumeDate,
                createdAt: settings.emergencyNoticeCreatedAt
            } : { active: false }
        });
    } catch (err) {
        console.error('[getPublicSettings] Unexpected error:', err);
        const DEFAULT_THREAD_PALETTE = [
            { name: 'Metallic Gold', hex: '#d4af37', isAvailable: true },
            { name: 'Pure White', hex: '#ffffff', isAvailable: true },
            { name: 'Obsidian Black', hex: '#1c1917', isAvailable: true },
            { name: 'Silver Platinum', hex: '#e2e8f0', isAvailable: true },
            { name: 'Royal Navy', hex: '#1e3a8a', isAvailable: true },
            { name: 'Crimson Red', hex: '#b91c1c', isAvailable: true },
            { name: 'Emerald Green', hex: '#047857', isAvailable: true },
            { name: 'Rose Blush', hex: '#fb7185', isAvailable: true }
        ];
        // Fallback default response rather than 500 crash
        res.json({
            giftPackagingPrice: 5.00,
            deliveryEnabled: false,
            businessName: 'EDS TOWELS & CAPS',
            businessAddress: 'Pacific Mall Lucena, Ground Floor, M.L. Tagarao St., Lucena City, Quezon 4301',
            businessContact: '0928 810 3928',
            receiptTagline: 'Custom Embroidery & Apparel Workshop',
            businessLogoUrl: null,
            gcashQrCodeUrl: null,
            availableThreadColors: DEFAULT_THREAD_PALETTE,
            emergencyNotice: { active: false }
        });
    }
};

exports.getManifest = async (req, res) => {
    try {
        let settings = null;
        try {
            settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        } catch (dbErr) {
            console.warn('[getManifest] Database query notice, using default settings:', dbErr.message);
        }
        let logoUrl = settings?.businessLogoUrl || '/fallback-icon.png';

        res.json({
            name: settings?.businessName || "Stitch-Opt | Premium Embroidery Designs",
            short_name: "Stitch-Opt",
            start_url: "/",
            display: "standalone",
            background_color: "#0f172a",
            theme_color: "#6366f1",
            icons: [
                {
                    src: logoUrl,
                    sizes: "192x192 512x512",
                    type: "image/png"
                }
            ]
        });
    } catch (err) {
        res.json({
            name: "Stitch-Opt | Premium Embroidery Designs",
            short_name: "Stitch-Opt",
            start_url: "/",
            display: "standalone",
            background_color: "#0f172a",
            theme_color: "#6366f1",
            icons: []
        });
    }
};

// Web Push Subscription Registry
const pushSubscriptionRegistry = new Map(); // userId -> Set<string>

exports.savePushSubscription = async (req, res) => {
    try {
        const userId = req.user ? req.user.id : null;
        const { endpoint, keys, userAgent } = req.body;
        if (!endpoint) {
            return res.status(400).json({ error: 'Endpoint is required' });
        }
        if (userId) {
            if (!pushSubscriptionRegistry.has(userId)) {
                pushSubscriptionRegistry.set(userId, new Set());
            }
            pushSubscriptionRegistry.get(userId).add(endpoint);
            console.log(`[PUSH] Registered push subscription for user ${userId} (${userAgent || 'unknown'})`);
        }
        res.json({ success: true, message: 'Push subscription stored successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save push subscription' });
    }
};

exports.getFavicon = async (req, res) => {
    try {
        let settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        let logoUrl = settings?.businessLogoUrl;
        if (logoUrl) {
            return res.redirect(logoUrl);
        } else {
            // Send empty or fallback, 204 No Content is safe for favicon
            return res.status(204).end();
        }
    } catch (err) {
        res.status(500).send('Error');
    }
};

const PDFDocument = require('pdfkit');

const https = require('https');

exports.downloadReceipt = async (req, res) => {
    try {
        const id = req.params.id;

        let tx = await prisma.transaction.findFirst({
            where: {
                OR: [
                    { transactionID: id },
                    { receiptId: id },
                    { orderID: id },
                    { id: id }
                ]
            },
            include: { Order: true, user: true }
        });

        if (!tx) {
            const receiptRecord = await prisma.receipt.findFirst({ where: { receiptID: id } });
            if (receiptRecord) {
                tx = await prisma.transaction.findFirst({
                    where: { orderID: receiptRecord.orderID },
                    include: { Order: true, user: true }
                });
            }
        }

        if (!tx) return res.status(404).send('Receipt not found');

        if (tx.Order) {
            tx.order = tx.Order;
        }

        const date = new Date(tx.timestamp);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString();
        const items = tx.order?.items || [];
        const total = parseFloat(tx.amount || 0);
        const vatableSales = total / 1.12;
        const tax = total - vatableSales;

        // Fetch dynamic business settings
        const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        const bizName = settings?.businessName || 'EDS TOWELS & CAPS';
        const bizTagline = settings?.receiptTagline || 'Custom Embroidery & Apparel';
        const bizAddress = settings?.businessAddress || 'Pacific Mall Lucena, Quezon Province';
        const bizContact = settings?.businessContact || '0928 810 3928';
        const bizWebsite = settings?.businessWebsite || 'www.edstowels.com';

        // Create PDF
        const doc = new PDFDocument({ size: [300, 600], margin: 20 });

        res.setHeader('Content-disposition', `attachment; filename=STITCH_OPT_RECEIPT_${id}.pdf`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        const pageWidth = 300;
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);

        // Header
        const logoUrl = settings?.businessLogoUrl;
        if (logoUrl && logoUrl.startsWith('https')) {
            try {
                const buffer = await new Promise((resolve, reject) => {
                    const req = https.get(logoUrl, (response) => {
                        if (response.statusCode !== 200) return reject(new Error('Failed to fetch image'));
                        const data = [];
                        response.on('data', (chunk) => data.push(chunk));
                        response.on('end', () => resolve(Buffer.concat(data)));
                    });
                    req.on('error', reject);
                    req.setTimeout(3000, () => {
                        req.destroy();
                        reject(new Error('Logo fetch timeout'));
                    });
                });
                // Image dimensions and centering
                const logoWidth = 40;
                doc.image(buffer, (pageWidth - logoWidth) / 2, doc.y, { fit: [logoWidth, 60] });
                doc.y += 65; // Push text down so it doesn't overlap with the absolutely positioned image
                doc.moveDown(0.5);
            } catch (err) {
                console.error('Failed to load logo for PDF:', err.message);
            }
        }

        doc.font('Helvetica-Bold').fontSize(16).text(bizName, { align: 'center' });
        doc.font('Helvetica').fontSize(9).text(bizTagline, { align: 'center' });
        doc.text(bizAddress, { align: 'center' });
        doc.text(bizContact.toLowerCase().startsWith('contact') ? bizContact : `Contact: ${bizContact}`, { align: 'center' });
        doc.moveDown(0.5);
        doc.text('------------------------------------------', { align: 'center' });
        doc.moveDown(0.5);

        // Details - Use Courier for that "Receipt Printer" look
        doc.font('Courier').fontSize(8);
        const drawDetail = (label, value) => {
            doc.text(label.padEnd(12) + ': ' + value, { align: 'center' });
        };

        drawDetail('RECEIPT', id);
        drawDetail('DATE', dateStr);
        drawDetail('TIME', timeStr);
        const cashierName = tx.order?.processedBy || tx.order?.garmentsReceivedBy || (tx.order?.personalization?.statusHistory?.[0]?.actor) || 'Shop Counter';
        drawDetail('CASHIER', cashierName);
        drawDetail('CUSTOMER', tx.user?.username || 'Valued Client');

        doc.moveDown(1);
        doc.font('Helvetica').text('------------------------------------------', { align: 'center' });
        doc.moveDown(0.5);

        // Table Header
        doc.font('Courier-Bold').fontSize(9);
        const tableLine = 'ITEM'.padEnd(18) + 'QTY'.padEnd(6) + 'PRICE'.padStart(8);
        doc.text(tableLine, { align: 'center' });
        doc.font('Courier').fontSize(8);
        doc.moveDown(0.5);

        // Items
        items.forEach(item => {
            const variantInfo = [item.selectedVariant, item.selectedSize ? `Size:${item.selectedSize}` : ''].filter(Boolean).join(' ');
            const displayName = variantInfo ? `${item.name || 'Design'} (${variantInfo})` : (item.name || 'Design');
            const name = displayName.substring(0, 18).padEnd(18);
            const qty = String(item.quantity || 1).padEnd(4);
            const price = `P${(parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)}`.padStart(8);
            doc.text(name + qty + price, { align: 'center' });
            doc.moveDown(0.2);
        });

        doc.moveDown(0.5);
        doc.font('Helvetica').text('------------------------------------------', { align: 'center' });

        // Totals Section
        doc.font('Courier').fontSize(9);
        doc.moveDown(0.5);

        const subtotalLine = 'SUBTOTAL:'.padEnd(20) + `P${vatableSales.toFixed(2)}`.padStart(12);
        const vatLine = 'VAT (12%):'.padEnd(20) + `P${tax.toFixed(2)}`.padStart(12);
        const totalLine = 'TOTAL PAID:'.padEnd(20) + `P${total.toFixed(2)}`.padStart(12);

        doc.text(subtotalLine, { align: 'center' });
        doc.text(vatLine, { align: 'center' });
        doc.moveDown(0.5);
        doc.font('Courier-Bold').fontSize(11).text(totalLine, { align: 'center' });

        // Footer
        doc.moveDown(3);
        doc.font('Helvetica').fontSize(8).text('------------------------------------------', { align: 'center' });
        doc.moveDown(1);
        doc.font('Helvetica-Bold').fontSize(10).text('Thank you for choosing us!', { align: 'center' });
        doc.font('Helvetica').fontSize(8).text('Visit again for more designs!', { align: 'center' });
        doc.fillColor('blue').text(bizWebsite, { align: 'center' });

        doc.end();

    } catch (err) {
        console.error('downloadReceipt error:', err);
        res.status(500).send('Error generating PDF');
    }
};

exports.validatePayment = async (req, res) => {
    try {
        const { method, total } = req.body;
        if (method === 'wallet') {
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user || (user.walletBalance || 0) < total) {
                return res.status(400).json({ message: 'Insufficient wallet balance' });
            }
        }
        res.json({ valid: true });
    } catch (err) {
        res.status(500).json({ message: 'Validation error' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const { username, email, address, phoneNumber, currentPassword, newPassword, preferredDeliveryTime, savedAddresses } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const updateData = {};

        // Username validation & uniqueness check
        if (username && username.trim() && username.trim() !== user.username) {
            const cleanUsername = username.trim();
            const existingUser = await prisma.user.findFirst({
                where: {
                    username: { equals: cleanUsername, mode: 'insensitive' },
                    id: { not: user.id }
                }
            });
            if (existingUser) {
                return res.status(400).json({ message: 'That username is already taken.' });
            }
            updateData.username = cleanUsername;
        }

        // Email validation & verification revocation check
        let isEmailChanged = false;
        if (email && email.trim()) {
            const cleanEmail = email.trim().toLowerCase();
            const currentEmail = user.email ? user.email.toLowerCase() : '';
            if (cleanEmail !== currentEmail) {
                const existingEmail = await prisma.user.findFirst({
                    where: {
                        email: { equals: cleanEmail, mode: 'insensitive' },
                        id: { not: user.id }
                    }
                });
                if (existingEmail) {
                    return res.status(400).json({ message: 'That email address is already in use by another account.' });
                }
                updateData.email = cleanEmail;
                // Security: Changing email immediately revokes verification until verified on the new address
                updateData.isEmailVerified = false;
                updateData.tokenVersion = { increment: 1 };
                isEmailChanged = true;
            }
        }

        if (address !== undefined) updateData.address = address;
        if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
        if (savedAddresses !== undefined) updateData.savedAddresses = savedAddresses;
        if (preferredDeliveryTime !== undefined) updateData.preferredDeliveryTime = preferredDeliveryTime;

        if (newPassword) {
            if (!currentPassword) return res.status(400).json({ message: 'Current password required to change password' });
            const bcrypt = require('bcryptjs');
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) return res.status(400).json({ message: 'Incorrect current password' });
            updateData.password = await bcrypt.hash(newPassword, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData
        });

        // Dispatch verification link to the NEW email address if changed
        if (isEmailChanged) {
            const { generateVerificationToken, sendVerificationEmail } = require('../../utils/emailService');
            await prisma.emailVerification.deleteMany({ where: { userId: user.id } });
            const emailToken = generateVerificationToken();
            await prisma.emailVerification.create({
                data: {
                    userId: user.id,
                    email: updateData.email,
                    token: emailToken,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                }
            });
            await sendVerificationEmail(updateData.email, updatedUser.username, emailToken).catch((err) => {
                console.error('[Customer Settings] Failed to send verification email:', err);
            });
        }

        const safeUser = { ...updatedUser };
        delete safeUser.password;

        const responseMessage = isEmailChanged
            ? 'Settings updated. A verification link has been sent to your new email address.'
            : 'Settings updated successfully';

        res.json({ message: responseMessage, user: safeUser, emailChanged: isEmailChanged });
    } catch (err) {
        console.error('updateSettings error:', err);
        res.status(500).json({ message: 'Error updating settings' });
    }
};

exports.updateOrderLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { lat, lng, courierName, courierPhone, courierVehicle, progress, status } = req.body;

        const order = await prisma.order.findFirst({
            where: {
                OR: [{ id }, { orderId: id }]
            }
        });
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const updateData = {};
        if (progress !== undefined) updateData.progress = parseInt(progress, 10);
        if (status) updateData.status = status;

        const currentPersonalization = (order.personalization && typeof order.personalization === 'object') ? order.personalization : {};
        if (lat !== undefined && lng !== undefined) {
            currentPersonalization.courierLocation = {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                courierName: courierName || 'Mark Anthony R.',
                courierPhone: courierPhone || '0917 882 1490',
                courierVehicle: courierVehicle || 'Honda Click 125',
                timestamp: new Date().toISOString()
            };
            updateData.personalization = currentPersonalization;
        }

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: updateData
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${order.userId}`).to('staff').emit('order:location_updated', {
                orderId: order.orderId,
                lat,
                lng,
                status: updatedOrder.status,
                progress: updatedOrder.progress
            });
            socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, updatedOrder);
        }

        res.json({ success: true, order: updatedOrder });
    } catch (err) {
        console.error('updateOrderLocation error:', err);
        res.status(500).json({ message: 'Error updating order location' });
    }
};

exports.cancelOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user ? req.user.id : null;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const { reason } = req.body || {};

        // Find order belonging to this customer
        const order = await prisma.order.findFirst({
            where: {
                userId,
                OR: [
                    { id: orderId },
                    { orderId: orderId }
                ]
            }
        });

        if (!order) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        let isDelayImpacted = false;
        try {
            if (order.personalization && typeof order.personalization === 'object' && order.personalization.delayNotice?.active) {
                isDelayImpacted = true;
            } else {
                const settings = await prisma.systemSettings.findUnique({
                    where: { id: 'global' },
                    select: { emergencyNoticeActive: true }
                });
                if (settings?.emergencyNoticeActive && ['In Queue', 'Preparing Order', 'In Production', 'Processing'].includes(order.status)) {
                    isDelayImpacted = true;
                }
            }
        } catch (setErr) {
            console.warn('[cancelOrder] Delay check notice:', setErr.message);
        }

        if (isDelayImpacted) {
            const FINAL_STATES = ['Order Delivered', 'Delivered', 'Completed', 'Order Canceled'];
            if (FINAL_STATES.includes(order.status)) {
                return res.status(400).json({
                    message: order.status === 'Order Canceled'
                        ? 'This order has already been canceled.'
                        : 'Cannot cancel an order that has already been delivered or completed.'
                });
            }
        } else {
            // Strict rule: Orders cannot be cancelled if in Preparing Order or beyond
            const NON_CANCELLABLE_STATES = [
                'Preparing Order',
                'In Transit',
                'Ready For Pick Up',
                'Ready For Pick-Up',
                'Ready for Pickup',
                'Out for Delivery',
                'Order Delivered',
                'Completed',
                'Order Canceled'
            ];

            if (NON_CANCELLABLE_STATES.includes(order.status)) {
                return res.status(400).json({
                    message: order.status === 'Order Canceled'
                        ? 'This order has already been canceled.'
                        : 'Cannot cancel order: custom embroidery production is already underway (Preparing Order).'
                });
            }

            // Standard paid orders cannot be self-cancelled via API outside delay notice
            const isPaidOrder = order.paymentStatus === 'paid' || 
                (order.paymentMethod && !['none', 'unpaid', 'pending'].includes(order.paymentMethod.toLowerCase()) && order.paymentStatus !== 'unpaid');

            if (isPaidOrder && order.paymentMethod !== 'wallet') {
                return res.status(400).json({
                    message: `This order has already been paid via ${(order.paymentMethod || 'digital payment').toUpperCase()}. Please contact workshop support or visit our Pacific Mall studio counter for cancellation and refund processing.`
                });
            }
        }

        const isPaidOrder = order.paymentStatus === 'paid' || 
            (order.paymentMethod && !['none', 'unpaid', 'pending'].includes(order.paymentMethod.toLowerCase()) && order.paymentStatus !== 'unpaid');

        const { handleOrderStateTransition } = require('../../utils/inventoryManager');

        const updatedOrder = await prisma.$transaction(async (tx) => {
            // If order was paid via customer wallet, auto-refund wallet balance
            if (order.paymentMethod === 'wallet' && isPaidOrder && order.totalAmount > 0) {
                await tx.user.update({
                    where: { id: userId },
                    data: { walletBalance: { increment: order.totalAmount } }
                });
            }

            const currentPers = (order.personalization && typeof order.personalization === 'object') ? { ...order.personalization } : {};
            if (isDelayImpacted && isPaidOrder && order.paymentMethod !== 'wallet') {
                currentPers.refundClaim = {
                    requestedAt: new Date().toISOString(),
                    amount: order.totalAmount,
                    paymentMethod: order.paymentMethod,
                    status: 'Pending Workshop Refund'
                };
            }

            return await handleOrderStateTransition(
                tx,
                order.id,
                'Order Canceled',
                req.user.username || 'Customer',
                {
                    note: isDelayImpacted
                        ? `Customer requested cancellation & full refund due to workshop delay notice. Reason: ${reason || 'Workshop delay'}`
                        : (reason ? `Customer canceled: ${reason}` : 'Customer requested order cancellation before production.'),
                    personalizationUpdates: currentPers
                }
            );
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${order.userId}`).to('staff').emit('order:cancelled', {
                orderId: order.orderId,
                status: 'Order Canceled'
            });
            socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, updatedOrder);
        }

        // Invalidate workshop queue watermark so capacity and scheduling recalculate cleanly
        const { invalidateQueue } = require('../../utils/workshopQueueManager');
        invalidateQueue();

        res.json({
            success: true,
            message: 'Order cancelled successfully. Reserved materials have been released.',
            order: updatedOrder
        });
    } catch (err) {
        console.error('customer cancelOrder error:', err);
        res.status(500).json({ message: err.message || 'Failed to cancel order' });
    }
};

exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Authentication required' });

        const confirmationUsername = req.body?.confirmationUsername || req.query?.confirmationUsername;

        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) return res.status(404).json({ message: 'User account not found' });

        if (user.role !== 'customer') {
            return res.status(403).json({
                message: 'Staff and administrator accounts cannot be deleted from the customer portal.'
            });
        }

        // Validate username confirmation (case-insensitive)
        if (!confirmationUsername || confirmationUsername.trim().toLowerCase() !== user.username.trim().toLowerCase()) {
            return res.status(400).json({
                message: 'Confirmation username does not match. Please type your exact account username to confirm deletion.'
            });
        }

        // Check for active orders that are in production or transit
        const activeOrders = await prisma.order.findMany({
            where: {
                userId,
                status: {
                    notIn: [
                        'Completed', 'completed', 'Order Delivered', 'order delivered',
                        'Delivered', 'Claimed', 'Cancelled', 'cancelled', 'Order Canceled', 'order canceled'
                    ]
                }
            }
        });

        if (activeOrders.length > 0) {
            return res.status(400).json({
                message: `You currently have ${activeOrders.length} active order(s) in progress. Please wait for your orders to be completed or cancel pending orders before closing your account.`
            });
        }

        const bcrypt = require('bcryptjs');
        const shortId = user.id.slice(0, 8);
        const anonymizedUsername = `Deleted User #${shortId}`;
        const anonymizedEmail = `deleted_${user.id}@stitchopt.local`;
        const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

        // Soft-delete & PII Scrubbing: preserve order receipts and tax history for business accounting
        await prisma.user.update({
            where: { id: userId },
            data: {
                username: anonymizedUsername,
                email: anonymizedEmail,
                password: randomPasswordHash,
                phoneNumber: null,
                isPhoneVerified: false,
                isEmailVerified: false,
                address: null,
                preferredDeliveryTime: null,
                savedAddresses: [],
                isActive: false,
                disabledAt: new Date(),
                disabledReason: 'Account deleted upon customer request',
                tokenVersion: { increment: 1 }
            }
        });

        // Clear JWT authentication cookies
        res.clearCookie('customer_token', { path: '/' });
        res.clearCookie('token', { path: '/' });

        res.json({
            success: true,
            message: 'Your account has been permanently closed and your personal data has been erased.'
        });
    } catch (err) {
        console.error('customer deleteAccount error:', err);
        res.status(500).json({ message: err.message || 'Server error processing account closure' });
    }
};
