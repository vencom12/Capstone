const prisma = require('../../utils/prisma');
const { randomUUID } = require('crypto');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');

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

        // One review per order per customer: update the existing one instead of duplicating
        if (userId && orderId) {
            const [existing] = await prisma.$queryRaw`
                SELECT "id" FROM "Feedback" WHERE "orderId" = ${orderId.trim()} AND "userId" = ${userId} LIMIT 1
            `;
            if (existing) {
                await prisma.$executeRaw`
                    UPDATE "Feedback" SET "rating" = ${cleanRating}, "message" = ${cleanMessage}, "updatedAt" = NOW()
                    WHERE "id" = ${existing.id}
                `;
                const [updated] = await prisma.$queryRaw`SELECT * FROM "Feedback" WHERE "id" = ${existing.id}`;
                try { req.app.get('io') && socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, 'FEEDBACK', updated); } catch (e) {}
                return res.json({ success: true, message: 'Your review has been updated.', feedback: updated });
            }
        }

        await prisma.$executeRaw`
            INSERT INTO "Feedback" (
                "id", "category", "rating", "message", "status",
                "customerName", "customerEmail", "orderId", "userId", "productId",
                "createdAt", "updatedAt"
            ) VALUES (
                ${id}, ${cleanCategory}, ${cleanRating}, ${cleanMessage}, 'Pending',
                ${finalName}, ${finalEmail}, ${orderId?.trim() || null}, ${userId}, ${resolvedProductId},
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

        // Fetch all verified feedback matching this productId
        const reviews = await prisma.$queryRawUnsafe(`
            SELECT 
                f.id,
                f.rating,
                f.message,
                f."customerName",
                f."orderId",
                f."createdAt",
                CASE 
                    WHEN f."orderId" IS NOT NULL THEN true 
                    ELSE false 
                END as "isVerifiedPurchase"
            FROM "Feedback" f
            WHERE f."productId" = $1
            ORDER BY f."createdAt" DESC
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
        console.error('Error fetching product reviews:', err);
        res.status(500).json({ message: 'Failed to load product reviews' });
    }
};

// Get Feedbacks with Filters and Aggregate Metrics (Staff & Admin)
exports.getFeedbacks = async (req, res) => {
    try {
        const { status, rating, category, search, page = 1, limit = 10 } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, Math.min(50, parseInt(limit) || 10));
        const offset = (pageNum - 1) * limitNum;

        // Fetch all to compute accurate metrics & pagination
        // (Postgres will optimize this efficiently)
        const allRows = await prisma.$queryRaw`
            SELECT * FROM "Feedback" ORDER BY "createdAt" DESC
        `;

        // Compute system-wide feedback metrics
        const totalCount = allRows.length;
        const pendingCount = allRows.filter(r => r.status === 'Pending').length;
        const reviewedCount = allRows.filter(r => r.status === 'Reviewed').length;
        const resolvedCount = allRows.filter(r => r.status === 'Resolved').length;
        const fiveStarCount = allRows.filter(r => r.rating === 5).length;
        const positiveCount = allRows.filter(r => r.rating >= 4).length;
        const avgRating = totalCount > 0
            ? (allRows.reduce((acc, r) => acc + (r.rating || 5), 0) / totalCount).toFixed(1)
            : '5.0';
        const sentimentRate = totalCount > 0
            ? Math.round((positiveCount / totalCount) * 100)
            : 100;

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
                reviewedCount,
                resolvedCount,
                fiveStarCount,
                averageRating: parseFloat(avgRating),
                sentimentRate
            }
        });
    } catch (err) {
        console.error('Error fetching feedbacks:', err);
        res.status(500).json({ message: 'Failed to retrieve feedback data' });
    }
};

// Update Feedback Status & Staff Notes (Staff & Admin)
exports.updateFeedbackStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, staffNotes } = req.body;

        const [existing] = await prisma.$queryRaw`
            SELECT * FROM "Feedback" WHERE "id" = ${id}
        `;

        if (!existing) {
            return res.status(404).json({ message: 'Feedback record not found' });
        }

        const validStatuses = ['Pending', 'Reviewed', 'Resolved'];
        const newStatus = (status && validStatuses.includes(status)) ? status : existing.status;
        const newNotes = staffNotes !== undefined ? staffNotes : existing.staffNotes;

        await prisma.$executeRaw`
            UPDATE "Feedback"
            SET "status" = ${newStatus}, "staffNotes" = ${newNotes}, "updatedAt" = NOW()
            WHERE "id" = ${id}
        `;

        const [updated] = await prisma.$queryRaw`
            SELECT * FROM "Feedback" WHERE "id" = ${id}
        `;

        res.json({
            success: true,
            message: `Feedback marked as ${newStatus}`,
            feedback: updated
        });
    } catch (err) {
        console.error('Error updating feedback status:', err);
        res.status(500).json({ message: 'Failed to update feedback status' });
    }
};
