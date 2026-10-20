const prisma = require('../../utils/prisma');
const { randomUUID } = require('crypto');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS } = require('../../utils/apiConstants');

// Smart Star-Calibrated Merchant Reply Templates
// Formulated specifically for personalized embroidery, thread durability, and customer care
const SMART_REPLY_TEMPLATES = {
    5: [
        "Thank you so much for the 5-star review! We are thrilled to hear that you love the embroidery craftsmanship on your custom piece. We take immense pride in every stitch and look forward to creating your next order!",
        "Thank you for choosing Stitch-Opt! We're delighted that our embroidery quality and detailing met your expectations. Enjoy your custom textile!",
        "We truly appreciate your glowing review! Knowing that our high-tensile stitching and fabric quality impressed you motivates our atelier team every day."
    ],
    4: [
        "Thank you for the wonderful 4-star feedback! We're glad you enjoyed your custom order and are committed to continuous refinement to make your next experience a full 5 stars.",
        "Thank you for your valuable feedback and support! Our production team appreciates your review, and we're always working to deliver top-tier embroidery with rapid turnaround."
    ],
    3: [
        "Thank you for sharing your honest feedback. We take all customer impressions seriously and will review your comments with our quality and production team to ensure even higher stitch precision.",
        "Thank you for your feedback! We strive for excellence on every order and appreciate your input as we work on perfecting our turnaround times and custom detailing."
    ],
    2: [
        "We sincerely apologize that your custom order did not meet your expectations. Quality and craftsmanship are our highest priorities. Our quality assurance team has been notified to investigate and ensure this standard is corrected.",
        "We are truly sorry that you were not completely satisfied with your piece. Our support and management team has recorded your review for quality recovery."
    ],
    1: [
        "We are deeply sorry for your disappointing experience. This falls far short of our embroidery standards. A management alert has been triggered so our team can review this order and improve our process.",
        "Please accept our sincere apologies for your experience. We take quality defects and customer dissatisfaction very seriously. Our team has flagged this order for immediate review."
    ]
};

function getSmartReplyTemplate(rating, customerName) {
    const r = Math.max(1, Math.min(5, Math.round(rating || 5)));
    const templates = SMART_REPLY_TEMPLATES[r] || SMART_REPLY_TEMPLATES[5];
    const randomIndex = Math.floor(Math.random() * templates.length);
    let chosen = templates[randomIndex];
    if (customerName && customerName !== 'Valued Customer' && customerName !== 'Verified Customer') {
        chosen = `Hi ${customerName}! ${chosen}`;
    }
    return chosen;
}

exports.SMART_REPLY_TEMPLATES = SMART_REPLY_TEMPLATES;
exports.getSmartReplyTemplate = getSmartReplyTemplate;

// Expose templates to Admin & Employee UI for 1-click preset selection
exports.getFeedbackTemplates = async (req, res) => {
    res.json({
        success: true,
        templates: SMART_REPLY_TEMPLATES
    });
};

// Submit Customer Feedback / Product Review (Guest or Authenticated)
exports.submitFeedback = async (req, res) => {
    try {
        const { category, rating, message, customerName, customerEmail, orderId, productId } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ message: 'Feedback message is required' });
        }

        const cleanRating = Math.max(1, Math.min(5, parseInt(rating) || 5));
        const cleanCategory = (category && category.trim()) || 'General';
        const cleanMessage = message.trim();
        const id = randomUUID();

        let finalName = customerName?.trim() || null;
        let finalEmail = customerEmail?.trim() || null;
        let userId = null;

        if (req.user) {
            userId = req.user.id || null;
            if (!finalName) finalName = req.user.username || 'Valued Customer';
            if (!finalEmail) finalEmail = req.user.email || null;
        }

        if (!finalName) finalName = 'Valued Customer';

        // Auto-resolve productId from order items if only orderId was provided
        let resolvedProductId = productId?.trim() || null;
        if (orderId && !resolvedProductId) {
            try {
                const order = await prisma.order.findUnique({ where: { orderId: orderId.trim() } });
                if (order && Array.isArray(order.items) && order.items.length > 0) {
                    resolvedProductId = order.items[0].productId || order.items[0].id || null;
                }
            } catch (e) {
                // non-blocking lookup failure
            }
        }

        // Determine if Auto-Reply is enabled in SystemSettings
        let autoReply = null;
        let autoReplyAt = null;
        try {
            const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
            const isAutoReplyOn = settings ? settings.autoReplyReviews !== false : true;
            if (isAutoReplyOn) {
                autoReply = getSmartReplyTemplate(cleanRating, finalName);
                autoReplyAt = new Date();
            }
        } catch (settingsErr) {
            console.warn('[Feedback] Could not check autoReplyReviews setting; defaulting to enabled:', settingsErr?.message);
            autoReply = getSmartReplyTemplate(cleanRating, finalName);
            autoReplyAt = new Date();
        }

        // One review per order per customer: update the existing one instead of duplicating
        if (userId && orderId) {
            const [existing] = await prisma.$queryRaw`
                SELECT "id", "merchantReply" FROM "Feedback" WHERE "orderId" = ${orderId.trim()} AND "userId" = ${userId} LIMIT 1
            `;
            if (existing) {
                // If it already had a reply, retain it; otherwise attach autoReply if enabled
                const replyToKeep = existing.merchantReply || autoReply;
                await prisma.$executeRaw`
                    UPDATE "Feedback" 
                    SET "rating" = ${cleanRating}, 
                        "message" = ${cleanMessage},
                        "merchantReply" = ${replyToKeep},
                        "merchantReplyAt" = CASE WHEN ${replyToKeep} IS NOT NULL AND "merchantReplyAt" IS NULL THEN NOW() ELSE "merchantReplyAt" END,
                        "updatedAt" = NOW()
                    WHERE "id" = ${existing.id}
                `;
                const [updated] = await prisma.$queryRaw`SELECT * FROM "Feedback" WHERE "id" = ${existing.id}`;
                try { req.app.get('io') && socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, 'FEEDBACK', updated); } catch (e) {}
                return res.json({ success: true, message: 'Your review has been updated.', feedback: updated });
            }
        }

        // 4★ and 5★ reviews are auto-published as verified storefront social proof.
        // Only 1★ and 2★ reviews are flagged as 'Pending' Quality Alerts for staff service recovery.
        const initialStatus = cleanRating >= 3 ? 'Reviewed' : 'Pending';

        await prisma.$executeRaw`
            INSERT INTO "Feedback" (
                "id", "category", "rating", "message", "status",
                "customerName", "customerEmail", "orderId", "userId", "productId",
                "merchantReply", "merchantReplyAt",
                "isFeatured",
                "createdAt", "updatedAt"
            ) VALUES (
                ${id}, ${cleanCategory}, ${cleanRating}, ${cleanMessage}, ${initialStatus},
                ${finalName}, ${finalEmail}, ${orderId?.trim() || null}, ${userId}, ${resolvedProductId},
                ${autoReply}, ${autoReplyAt},
                false,
                NOW(), NOW()
            )
        `;

        const [created] = await prisma.$queryRaw`
            SELECT * FROM "Feedback" WHERE "id" = ${id}
        `;

        // Broadcast telemetry so product reviews and staff feed update in real-time
        try {
            const io = req.app.get('io');
            if (io) {
                socketUtil.emitDataChanged(io, ACTIONS.CREATE, 'FEEDBACK', created);
            }
        } catch (e) {}

        res.status(201).json({
            success: true,
            message: 'Thank you! Your verified review has been received.',
            feedback: created
        });
    } catch (err) {
        console.error('Error submitting feedback:', err);
        res.status(500).json({ message: 'Failed to submit feedback. Please try again later.' });
    }
};

// Get Public Reviews & Aggregate Rating Breakdown for a Product (Amazon / Shopee Gold Standard)
exports.getProductReviews = async (req, res) => {
    try {
        const { id: productId } = req.params;

        if (!productId) {
            return res.status(400).json({ message: 'Product ID is required' });
        }

        // Fetch all verified feedback matching this productId, sorted by featured then newest
        const reviews = await prisma.$queryRawUnsafe(`
            SELECT 
                f.id,
                f.rating,
                f.message,
                f."customerName",
                f."orderId",
                f."createdAt",
                f."merchantReply",
                f."merchantReplyAt",
                COALESCE(f."isFeatured", false) as "isFeatured",
                CASE 
                    WHEN f."orderId" IS NOT NULL THEN true 
                    ELSE false 
                END as "isVerifiedPurchase"
            FROM "Feedback" f
            WHERE f."productId" = $1
            ORDER BY COALESCE(f."isFeatured", false) DESC, f."createdAt" DESC
        `, productId);

        const totalReviews = reviews.length;
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let sumRating = 0;

        for (const r of reviews) {
            const rInt = Math.max(1, Math.min(5, Math.round(r.rating || 5)));
            distribution[rInt] = (distribution[rInt] || 0) + 1;
            sumRating += (r.rating || 5);
        }

        const averageRating = totalReviews > 0 ? parseFloat((sumRating / totalReviews).toFixed(1)) : null;

        res.json({
            success: true,
            productId,
            averageRating,
            totalReviews,
            distribution,
            reviews
        });
    } catch (err) {
        console.error('Error fetching product reviews:', err?.message || err);
        res.json({
            success: true,
            productId: req.params.id || null,
            averageRating: null,
            totalReviews: 0,
            distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
            reviews: []
        });
    }
};

// Get Feedbacks with Filters and Aggregate Metrics (Staff & Admin)
exports.getFeedbacks = async (req, res) => {
    try {
        const { status, rating, category, search, page = 1, limit = 10, isFeatured, hasReply } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, Math.min(50, parseInt(limit) || 10));
        const offset = (pageNum - 1) * limitNum;

        // Fetch all rows to compute accurate live metrics
        const allRows = await prisma.$queryRaw`
            SELECT * FROM "Feedback" ORDER BY COALESCE("isFeatured", false) DESC, "createdAt" DESC
        `;

        // Compute system-wide feedback metrics & distribution
        const totalCount = allRows.length;
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let verifiedCount = 0;
        let merchantRepliedCount = 0;
        let featuredCount = 0;
        const highlightCounts = {};

        allRows.forEach(r => {
            const rInt = Math.max(1, Math.min(5, Math.round(r.rating || 5)));
            distribution[rInt] = (distribution[rInt] || 0) + 1;
            if (r.orderId) verifiedCount++;
            if (r.merchantReply && r.merchantReply.trim()) merchantRepliedCount++;
            if (r.isFeatured) featuredCount++;

            // Extract sentiment highlights
            const match = r.message && r.message.match(/\[Highlights:\s*(.+?)\]/i);
            if (match && match[1]) {
                const tags = match[1].split(',').map(t => t.trim());
                tags.forEach(t => {
                    if (t) highlightCounts[t] = (highlightCounts[t] || 0) + 1;
                });
            }
        });

        // Format highlights into sorted list
        const sentimentHighlights = Object.entries(highlightCounts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);

        // Quality alerts that require staff resolution (1★ & 2★ not yet resolved)
        const criticalAlertsCount = allRows.filter(r => r.rating <= 2 && r.status !== 'Resolved').length;
        const pendingCount = criticalAlertsCount;
        const reviewedCount = allRows.filter(r => r.status === 'Reviewed').length;
        const resolvedCount = allRows.filter(r => r.status === 'Resolved').length;
        const fiveStarCount = distribution[5];
        const fourStarCount = distribution[4];
        const positiveCount = fiveStarCount + fourStarCount;
        const avgRating = totalCount > 0
            ? (allRows.reduce((acc, r) => acc + (r.rating || 5), 0) / totalCount).toFixed(1)
            : '5.0';
        const sentimentRate = totalCount > 0
            ? Math.round((positiveCount / totalCount) * 100)
            : 100;
        const responseRate = totalCount > 0
            ? Math.round((merchantRepliedCount / totalCount) * 100)
            : 0;

        // Apply filters in memory
        let filtered = allRows;

        if (status && status !== 'all') {
            filtered = filtered.filter(r => r.status?.toLowerCase() === status.toLowerCase());
        }

        if (rating && rating !== 'all') {
            if (rating === 'critical') {
                filtered = filtered.filter(r => r.rating <= 2);
            } else {
                const rInt = parseInt(rating);
                filtered = filtered.filter(r => r.rating === rInt);
            }
        }

        if (isFeatured === 'true') {
            filtered = filtered.filter(r => !!r.isFeatured);
        }

        if (hasReply === 'true') {
            filtered = filtered.filter(r => !!(r.merchantReply && r.merchantReply.trim()));
        } else if (hasReply === 'false') {
            filtered = filtered.filter(r => !(r.merchantReply && r.merchantReply.trim()));
        }

        if (category && category !== 'all') {
            filtered = filtered.filter(r => r.category?.toLowerCase() === category.toLowerCase());
        }

        if (search && search.trim()) {
            const query = search.trim().toLowerCase();
            filtered = filtered.filter(r =>
                (r.customerName && r.customerName.toLowerCase().includes(query)) ||
                (r.customerEmail && r.customerEmail.toLowerCase().includes(query)) ||
                (r.orderId && r.orderId.toLowerCase().includes(query)) ||
                (r.message && r.message.toLowerCase().includes(query)) ||
                (r.merchantReply && r.merchantReply.toLowerCase().includes(query)) ||
                (r.staffNotes && r.staffNotes.toLowerCase().includes(query))
            );
        }

        const filteredTotal = filtered.length;
        const paginated = filtered.slice(offset, offset + limitNum);

        res.json({
            success: true,
            feedbacks: paginated,
            pagination: {
                total: filteredTotal,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(filteredTotal / limitNum) || 1
            },
            metrics: {
                totalCount,
                pendingCount,
                criticalAlertsCount,
                reviewedCount,
                resolvedCount,
                fiveStarCount,
                fourStarCount,
                distribution,
                verifiedCount,
                merchantRepliedCount,
                responseRate,
                featuredCount,
                averageRating: parseFloat(avgRating),
                sentimentRate,
                sentimentHighlights
            }
        });
    } catch (err) {
        console.error('Error fetching feedbacks:', err);
        res.status(500).json({ message: 'Failed to retrieve feedback data' });
    }
};

// Update Feedback Status, Staff Notes, Root Cause & Quality Recovery (Staff & Admin)
exports.updateFeedbackStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, staffNotes, rootCause, resolutionAction, resolvedBy, merchantReply } = req.body;

        const [existing] = await prisma.$queryRaw`
            SELECT * FROM "Feedback" WHERE "id" = ${id}
        `;

        if (!existing) {
            return res.status(404).json({ message: 'Feedback record not found' });
        }

        const validStatuses = ['Pending', 'Reviewed', 'Resolved'];
        const newStatus = (status && validStatuses.includes(status)) ? status : existing.status;
        const newNotes = staffNotes !== undefined ? staffNotes : existing.staffNotes;
        const newRootCause = rootCause !== undefined ? rootCause : existing.rootCause;
        const newResolutionAction = resolutionAction !== undefined ? resolutionAction : existing.resolutionAction;
        const newResolvedBy = resolvedBy !== undefined ? resolvedBy : (req.user?.username || existing.resolvedBy);
        
        let newMerchantReply = existing.merchantReply;
        let newMerchantReplyAt = existing.merchantReplyAt;

        if (merchantReply !== undefined) {
            newMerchantReply = merchantReply ? merchantReply.trim() : null;
            newMerchantReplyAt = newMerchantReply ? new Date() : null;
        }

        await prisma.$executeRaw`
            UPDATE "Feedback"
            SET "status" = ${newStatus},
                "staffNotes" = ${newNotes},
                "rootCause" = ${newRootCause},
                "resolutionAction" = ${newResolutionAction},
                "resolvedBy" = ${newResolvedBy},
                "merchantReply" = ${newMerchantReply},
                "merchantReplyAt" = ${newMerchantReplyAt},
                "updatedAt" = NOW()
            WHERE "id" = ${id}
        `;

        const [updated] = await prisma.$queryRaw`
            SELECT * FROM "Feedback" WHERE "id" = ${id}
        `;

        try {
            const io = req.app.get('io');
            if (io) {
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, 'FEEDBACK', updated);
            }
        } catch (e) {}

        res.json({
            success: true,
            message: `Feedback updated successfully`,
            feedback: updated
        });
    } catch (err) {
        console.error('Error updating feedback status:', err);
        res.status(500).json({ message: 'Failed to update feedback status' });
    }
};

// Post or Edit Official Merchant Reply (Public on Storefront)
exports.replyFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        const { reply } = req.body;

        const [existing] = await prisma.$queryRaw`
            SELECT * FROM "Feedback" WHERE "id" = ${id}
        `;

        if (!existing) {
            return res.status(404).json({ message: 'Feedback record not found' });
        }

        const cleanReply = reply && reply.trim() ? reply.trim() : null;
        const replyAt = cleanReply ? new Date() : null;

        await prisma.$executeRaw`
            UPDATE "Feedback"
            SET "merchantReply" = ${cleanReply},
                "merchantReplyAt" = ${replyAt},
                "updatedAt" = NOW()
            WHERE "id" = ${id}
        `;

        const [updated] = await prisma.$queryRaw`
            SELECT * FROM "Feedback" WHERE "id" = ${id}
        `;

        try {
            const io = req.app.get('io');
            if (io) {
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, 'FEEDBACK', updated);
            }
        } catch (e) {}

        res.json({
            success: true,
            message: cleanReply ? 'Official merchant reply published' : 'Merchant reply removed',
            feedback: updated
        });
    } catch (err) {
        console.error('Error saving merchant reply:', err);
        res.status(500).json({ message: 'Failed to save merchant reply' });
    }
};

// Toggle Featured Review on Storefront Showcase
exports.toggleFeatureFeedback = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await prisma.$queryRaw`
            SELECT * FROM "Feedback" WHERE "id" = ${id}
        `;

        if (!existing) {
            return res.status(404).json({ message: 'Feedback record not found' });
        }

        const nextFeatured = !existing.isFeatured;

        await prisma.$executeRaw`
            UPDATE "Feedback"
            SET "isFeatured" = ${nextFeatured},
                "updatedAt" = NOW()
            WHERE "id" = ${id}
        `;

        const [updated] = await prisma.$queryRaw`
            SELECT * FROM "Feedback" WHERE "id" = ${id}
        `;

        try {
            const io = req.app.get('io');
            if (io) {
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, 'FEEDBACK', updated);
            }
        } catch (e) {}

        res.json({
            success: true,
            message: nextFeatured ? 'Review pinned to Storefront Showcase' : 'Review unpinned from Showcase',
            feedback: updated
        });
    } catch (err) {
        console.error('Error toggling featured feedback:', err);
        res.status(500).json({ message: 'Failed to toggle featured status' });
    }
};
