const prisma = require('../../utils/prisma');
const crypto = require('crypto');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');

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
        const { items, totalAmount, paymentMethod, address, deliveryTime, notes, receiptUrl, isByog, waiverSigned, giftPackaging, calligraphyMessage, personalization, isRush, dueDate, existingOrderId, referenceNumber } = req.body;
        const userId = req.user.id;

        // If this is a manual reference confirmation for an existing order in 'Awaiting Payment', update it
        if (existingOrderId) {
            const existingOrder = await prisma.order.findFirst({
                where: { orderId: existingOrderId, userId },
                include: { receipt: true, transaction: true }
            });
            if (existingOrder && existingOrder.paymentStatus === 'unpaid') {
                const cleanRef = (personalization?.referenceNumber || referenceNumber || '').trim();
                const updatedPersonalization = {
                    ...(typeof existingOrder.personalization === 'object' && existingOrder.personalization !== null ? existingOrder.personalization : {}),
                    ...(personalization || {}),
                    referenceNumber: cleanRef
                };
                
                await prisma.order.update({
                    where: { id: existingOrder.id },
                    data: {
                        personalization: updatedPersonalization,
                        notes: notes || existingOrder.notes
                    }
                });

                if (existingOrder.receipt) {
                    await prisma.receipt.update({
                        where: { id: existingOrder.receipt.id },
                        data: {
                            referenceId: cleanRef || existingOrder.receipt.referenceId
                        }
                    });
                }

                return res.json({ message: 'Order reference number recorded successfully.', order: existingOrder, receiptID: existingOrder.receipt?.receiptID });
            }
        }

        if (!items || items.length === 0) return res.status(400).json({ message: 'Cart is empty' });

        // Fix B: Payment Method Whitelist (Only GCash for digital wallet per store policy)
        const VALID_PAYMENT_METHODS = ['wallet', 'cash_at_counter', 'gcash'];
        // test_mode is strictly restricted to development environments and authenticated administrators
        if (process.env.NODE_ENV !== 'production' && req.user && req.user.role === 'admin') {
            VALID_PAYMENT_METHODS.push('test_mode');
        }
        if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
            return res.status(400).json({ message: 'Invalid payment method. Only GCash, Store Wallet, or Cash at Counter are accepted.' });
        }

        // Security Hardening: Never allow client parameter bypasses. Only genuine wallet transactions or admin dev test mode.
        const isInstantApproved = (paymentMethod === 'wallet' || (paymentMethod === 'test_mode' && process.env.NODE_ENV !== 'production' && req.user?.role === 'admin'));

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.isEmailVerified) {
            return res.status(403).json({ message: 'Please verify your email address before placing an order.' });
        }

        // Fix A: Server-side total recalculation (never trust client-sent total)
        // Correctly factors in variant price overrides (e.g. promotional/test variants)
        let serverTotal = 0;
        for (const item of items) {
            const productId = item.productId || item.id;
            if (!productId) return res.status(400).json({ message: `Invalid product in cart item: ${item.name || 'Unknown'}` });
            const product = await prisma.product.findUnique({ where: { id: productId } });
            if (!product) return res.status(404).json({ message: `Product not found: ${item.name || productId}` });
            
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

            serverTotal += itemUnitPrice * (item.quantity || 1);
        }
        // Add gift packaging if selected
        if (giftPackaging) {
            const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
            serverTotal += settings ? settings.giftPackagingPrice : 5.00;
        }
        const numTotal = Math.round(serverTotal * 100) / 100; // Round to 2 decimal places

        if (paymentMethod === 'wallet' && (user.walletBalance || 0) < numTotal) {
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        // Anti-Replay Defense: Block using an already-verified receipt URL at checkout
        if (paymentMethod === 'gcash' && receiptUrl) {
            const alreadyUsedReceipt = await prisma.receipt.findFirst({
                where: { imageUrl: receiptUrl, aiVerificationStatus: 'verified' }
            });
            if (alreadyUsedReceipt) {
                return res.status(400).json({
                    message: "This payment receipt was already used for an earlier order. Please upload the official GCash receipt you used for this purchase so we can get your order started right away! 🧵"
                });
            }
        }

        const secureOrderId = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const secureTransactionId = `TX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const secureReceiptId = `RCP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

        // Prisma Transaction for Atomic operation
        const result = await prisma.$transaction(async (tx) => {
            // 1. Check stock availability for all items in the cart (with row locking)
            for (const item of items) {
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
                const atp = product.count - product.reservedCount;
                const needed = item.quantity || 1;

                if (atp < needed) {
                    throw new Error(`OutOfStock:${product.name}`);
                }

                // Note: Variants share the product's unified stock pool since inventory is acquired in assorted colors.

                // Check and lock recipe thread inventory items
                if (product.recipe && Array.isArray(product.recipe)) {
                    const { getReservedThreadCounts } = require('../../utils/inventoryManager');
                    const reservedThreads = await getReservedThreadCounts(tx);
                    for (const component of product.recipe) {
                        const neededMaterial = Math.ceil(component.quantity * needed);
                        
                        // SELECT FOR UPDATE to lock the inventory row
                        const invItems = await tx.$queryRaw`
                            SELECT * FROM "Inventory" WHERE id = ${component.inventoryId} FOR UPDATE
                        `;
                        const inventoryItem = invItems[0];
                        const invCount = inventoryItem ? inventoryItem.count : 0;
                        const reservedCount = reservedThreads[component.inventoryId] || 0;
                        const availableMaterial = Math.max(0, invCount - reservedCount);
                        
                        if (availableMaterial < neededMaterial) {
                            throw new Error(`OutOfStockMaterial:${product.name}:${component.name}`);
                        }
                    }
                }
            }

            // 2. Reserve garments in database (lock counts)
            for (const item of items) {
                const productId = item.productId || item.id;
                const needed = item.quantity || 1;
                await tx.product.update({
                    where: { id: productId },
                    data: {
                        reservedCount: { increment: needed }
                    }
                });
            }

            // 3. Deduct balance if using wallet
            if (paymentMethod === 'wallet') {
                await tx.user.update({
                    where: { id: userId },
                    data: { walletBalance: { decrement: numTotal } }
                });
            }

            // Detect pickup fulfillment
            const isPickup = personalization?.fulfillmentType === 'pickup' || (typeof address === 'string' && address.toLowerCase().includes('pick-up'));
            const courier = isPickup ? 'Store Pick-up' : (personalization?.courier || 'J&T Express');
            const cleanId = secureOrderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
            const initialTracking = isPickup ? `PU-LUC-${cleanId}` : `JNT-PH-78${cleanId}`;

            const orderPersonalization = {
                ...(personalization && typeof personalization === 'object' ? personalization : {}),
                fulfillmentType: isPickup ? 'pickup' : 'delivery',
                courier,
                trackingNumber: initialTracking,
                statusHistory: [
                    {
                        status: isInstantApproved ? 'In Queue' : 'Awaiting Payment',
                        timestamp: new Date().toISOString(),
                        actor: 'Customer Checkout',
                        hub: 'Eds Towels Pacific Mall Lucena Hub',
                        note: isInstantApproved 
                            ? (isPickup ? 'Payment confirmed; placed in embroidery queue for Store Pick-up.' : 'Payment confirmed; placed in embroidery queue for J&T Delivery.') 
                            : 'Order submitted, pending payment confirmation.'
                    }
                ]
            };

            // 4. Create Order with descriptive design summary
            const designSummary = Array.isArray(items) && items.length > 0
                ? items.map(i => {
                    const variantInfo = i.selectedVariant ? ` [${i.selectedVariant}]` : '';
                    const textInfo = i.personalization?.text ? ` — "${i.personalization.text}"` : '';
                    return `${i.quantity > 1 ? `${i.quantity}x ` : ''}${i.name}${variantInfo}${textInfo}`;
                }).join('; ')
                : "Cart Order";

            const order = await tx.order.create({
                data: {
                    orderId: secureOrderId,
                    client: user.username,
                    userId: user.id,
                    design: designSummary,
                    items: items, // JSON field
                    totalAmount: numTotal,
                    paymentMethod,
                    paymentStatus: isInstantApproved ? 'paid' : 'unpaid',
                    status: isInstantApproved ? 'In Queue' : 'Awaiting Payment',
                    address,
                    deliveryTime: deliveryTime || user.preferredDeliveryTime || 'As soon as possible',
                    notes,
                    progress: isInstantApproved ? 5 : 0,
                    isByog: isByog || false,
                    waiverSigned: waiverSigned || false,
                    giftPackaging: giftPackaging || false,
                    calligraphyMessage: calligraphyMessage || null,
                    personalization: orderPersonalization,
                    isRush: isRush || false,
                    dueDate: dueDate ? new Date(dueDate) : null
                }
            });

            // 5. Create Transaction
            const transaction = await tx.transaction.create({
                data: {
                    transactionID: secureTransactionId,
                    orderID: secureOrderId,
                    amount: numTotal,
                    status: isInstantApproved ? 'completed' : 'pending',
                    receiptLink: receiptUrl || `/api/customer/receipt/${secureReceiptId}/download`,
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
                    imageUrl: receiptUrl || null,
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
        socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.WALLET, { balance: updatedUser.walletBalance }, `user:${user.id}`);
        // Broadcast product update (since reservedCount changed)
        const productsList = await prisma.product.findMany();
        const { enrichProductsWithStock } = require('../../utils/inventoryManager');
        const enrichedList = await enrichProductsWithStock(productsList);
        // Send Order Confirmation Email via Resend / SMTP asynchronously
        const { sendOrderConfirmationEmail } = require('../../utils/emailService');
        if (user.email) {
            sendOrderConfirmationEmail(user.email, user.username, result).catch(err => {
                console.error('[EmailService] Order confirmation email dispatch failed:', err.message);
            });
        }

        res.json({ message: 'Order placed successfully.', order: result, receiptID: secureReceiptId });
    } catch (err) {
        console.error('submitOrder error:', err);
        if (err.message && err.message.startsWith('OutOfStockMaterial:')) {
            const parts = err.message.split('OutOfStockMaterial:')[1].split(':');
            const productName = parts[0];
            const materialName = parts[1];
            return res.status(400).json({ message: `Sorry, "${productName}" cannot be ordered (insufficient "${materialName}" thread in inventory).` });
        }
        if (err.message && err.message.startsWith('OutOfStockVariant:')) {
            const variantDetails = err.message.split('OutOfStockVariant:')[1];
            return res.status(400).json({ message: `Sorry, ${variantDetails} is currently out of stock.` });
        }
        if (err.message && err.message.startsWith('OutOfStock:')) {
            const productName = err.message.split('OutOfStock:')[1];
            return res.status(400).json({ message: `Sorry, "${productName}" is currently out of stock (insufficient blank garments on hand).` });
        }
        if (err.message && err.message.startsWith('Product not found:')) {
            return res.status(404).json({ message: err.message });
        }
        res.status(400).json({ message: err.message || 'Failed to place order' });
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
        res.status(500).json({ message: 'Server error' });
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
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getReceipt = async (req, res) => {
    try {
        const id = req.params.id;
        // 1. Try Receipt table first (by receiptID)
        let receiptData = await prisma.receipt.findFirst({
            where: { receiptID: id },
            include: { user: true }
        });

        let tx;
        if (receiptData) {
            tx = await prisma.transaction.findFirst({
                where: { orderID: receiptData.orderID },
                include: { Order: true, user: true }
            });
        } else {
            // 2. Try finding by transactionID or id (UUID)
            tx = await prisma.transaction.findFirst({
                where: {
                    OR: [
                        { transactionID: id },
                        { id: id }
                    ]
                },
                include: { Order: true, user: true }
            });

            // 3. Try finding by orderId
            if (!tx) {
                const order = await prisma.order.findFirst({
                    where: { orderId: id },
                    include: { transaction: true, user: true }
                });
                if (order && order.transaction) {
                    tx = order.transaction;
                    tx.order = order;
                    tx.user = order.user;
                }
            }
        }

        if (!tx) return res.status(404).json({ message: 'Receipt not found' });
        
        if (tx.Order) {
            tx.order = tx.Order;
        }
        
        // Check authorization if it's a customer
        if (req.user.role === 'customer' && tx.userId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        res.json({
            transactionID: tx.transactionID,
            orderID: tx.orderID,
            amount: tx.amount,
            status: tx.status,
            timestamp: tx.timestamp,
            items: tx.order ? tx.order.items : [],
            client: tx.user?.username || 'Customer'
        });
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ message: 'Error downloading receipt' });
    }
};

exports.getCapacity = async (req, res) => {
  try {
    // Only real production orders actively waiting for or on the embroidery machines
    const queuedOrders = await prisma.order.findMany({
      where: {
        status: { in: ['In Queue', 'Preparing Order', 'In Production', 'Processing'] }
      },
      select: {
        estimatedTime: true
      }
    });

    const activeOrders = queuedOrders.length;

    const activeMachines = await prisma.machine.count({
      where: {
        status: { in: ['Running', 'Idle'] } // Active machines available in the shop
      }
    });

    const machineCount = Math.max(1, activeMachines);

    // Sum actual estimated stitch times recorded on queued orders, fallback 15 mins per order
    const totalQueueMinutes = queuedOrders.reduce((sum, ord) => sum + (ord.estimatedTime || 15), 0);
    const estimatedMinutes = activeOrders === 0 ? 10 : Math.ceil(totalQueueMinutes / machineCount);

    res.json({
      activeOrders,
      activeMachines,
      estimatedMinutes
    });
  } catch (err) {
    console.error('Capacity error:', err);
    res.status(500).json({ error: 'Server error fetching capacity' });
  }
};

exports.trackOrder = async (req, res) => {
  try {
    const rawCode = (req.params.code || '').trim();
    if (!rawCode) return res.status(400).json({ error: 'Tracking code is required' });

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
      return res.status(404).json({ error: `Order '${rawCode}' not found. Please check your claim stub.` });
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
    if (stage === 'queue') {
      ordersAhead = await prisma.order.count({
        where: {
          status: { in: ['In Queue', 'Preparing Order', 'In Production', 'Processing'] },
          createdAt: { lt: order.createdAt }
        }
      });
    }

    const estMins = order.estimatedTime || 15;
    let estimatedMinutesLeft = estMins;
    if (stage === 'stitching') {
      const elapsedMinutes = Math.floor((Date.now() - new Date(order.updatedAt).getTime()) / 60000);
      estimatedMinutesLeft = Math.max(1, estMins - Math.min(elapsedMinutes, estMins - 1));
    } else if (stage === 'queue') {
      estimatedMinutesLeft = (ordersAhead + 1) * estMins;
    } else {
      estimatedMinutesLeft = 0;
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
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }
    });
  } catch (err) {
    console.error('Error tracking order:', err);
    res.status(500).json({ error: 'Server error tracking order' });
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
        const estMins = order.estimatedTime || 15;
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
          estimatedMinutes: order.estimatedTime || (isExpress ? 15 : 30)
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
    res.status(500).json({ error: 'Server error fetching live queue' });
  }
};

exports.getPublicSettings = async (req, res) => {
    try {
        const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        res.json({ 
            giftPackagingPrice: settings ? settings.giftPackagingPrice : 5.00,
            deliveryEnabled: settings ? settings.deliveryEnabled : false,
            businessLogoUrl: settings?.businessLogoUrl || null,
            gcashQrCodeUrl: settings?.gcashQrCodeUrl || null
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching public settings' });
    }
};

exports.getManifest = async (req, res) => {
    try {
        let settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
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
        res.status(500).json({ error: 'Server error' });
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
        const subtotal = parseFloat(tx.amount);
        const tax = subtotal * 0.12; 
        const total = subtotal + tax;

        // Fetch dynamic business settings
        const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        const bizName = settings?.businessName || 'STITCH-OPT DESIGNS';
        const bizTagline = settings?.receiptTagline || 'Premium Embroidery Services';
        const bizAddress = settings?.businessAddress || '123 Digital Thread Lane, Manila';
        const bizContact = settings?.businessContact || '+63 (02) 888-THREAD';
        const bizWebsite = settings?.businessWebsite || 'www.stitch-opt.com';

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
                    https.get(logoUrl, (response) => {
                        if (response.statusCode !== 200) return reject(new Error('Failed to fetch image'));
                        const data = [];
                        response.on('data', (chunk) => data.push(chunk));
                        response.on('end', () => resolve(Buffer.concat(data)));
                    }).on('error', reject);
                });
                // Image dimensions and centering
                const logoWidth = 40;
                doc.image(buffer, (pageWidth - logoWidth) / 2, doc.y, { fit: [logoWidth, 60] });
                doc.y += 65; // Push text down so it doesn't overlap with the absolutely positioned image
                doc.moveDown(0.5);
            } catch (err) {
                console.error('Failed to load logo for PDF:', err);
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
        drawDetail('CASHIER', 'StitchMaster AI');
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
            const name = displayName.substring(0, 20).padEnd(20);
            const qty = String(item.quantity || 1).padEnd(4);
            const price = `$${(parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)}`.padStart(8);
            doc.text(name + qty + price, { align: 'center' });
            doc.moveDown(0.2);
        });

        doc.moveDown(0.5);
        doc.font('Helvetica').text('------------------------------------------', { align: 'center' });
        
        // Totals Section
        doc.font('Courier').fontSize(9);
        doc.moveDown(0.5);
        
        const subtotalLine = 'SUBTOTAL:'.padEnd(20) + `$${subtotal.toFixed(2)}`.padStart(12);
        const vatLine      = 'VAT (12%):'.padEnd(20) + `$${tax.toFixed(2)}`.padStart(12);
        const totalLine    = 'TOTAL:'.padEnd(20) + `$${total.toFixed(2)}`.padStart(12);

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
        if (username) updateData.username = username;
        if (email) updateData.email = email;
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

        const safeUser = { ...updatedUser };
        delete safeUser.password;
        res.json({ message: 'Settings updated successfully', user: safeUser });
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
