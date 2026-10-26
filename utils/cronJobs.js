const prisma = require('./prisma');
// the cronjobs has different version thats why it is not being read by the system 
// cuz the system is using the newer version of the react framework
// Cleans up old logs to keep the Supabase 500MB Free Tier from filling up
const runDatabaseCleanup = async () => {
    try {
        console.log('[CRON] Running daily database cleanup...');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const deletedTraffic = await prisma.siteTraffic.deleteMany({
            where: { timestamp: { lt: thirtyDaysAgo } }
        });

        const deletedLogs = await prisma.globalAuditLog.deleteMany({
            where: { timestamp: { lt: thirtyDaysAgo } }
        });

        console.log(`[CRON] Cleanup Complete. Deleted ${deletedTraffic.count} traffic logs and ${deletedLogs.count} audit logs older than 30 days.`);
    } catch (error) {
        console.error('[CRON] Database cleanup failed:', error);
    }
};

// Prevents Render Free Tier from sleeping by self-pinging every 14 minutes
const startKeepAwakePing = () => {
    const RENDER_URL = 'https://capstone-btr7.onrender.com/api/health';
    
    // 14 minutes = 14 * 60 * 1000 = 840000 ms
    setInterval(() => {
        try {
            const fetch = require('node-fetch'); // Use node-fetch for older Node versions or native fetch
            const fetchFn = global.fetch || fetch;
            fetchFn(RENDER_URL)
                .then(res => console.log(`[KEEP-AWAKE] Pinged ${RENDER_URL} - Status: ${res.status}`))
                .catch(err => console.error(`[KEEP-AWAKE] Ping failed:`, err.message));
        } catch (error) {
            console.error('[KEEP-AWAKE] Failed to execute ping:', error.message);
        }
    }, 840000);

    console.log(`[OK] Keep-Awake pinger initialized for ${RENDER_URL}`);
};

// Automatically expires orders left in unpaid/pending payment states for more than 24 hours
const expireStaleOrders = async () => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const staleOrders = await prisma.order.findMany({
            where: {
                status: { in: ['Awaiting Payment', 'Pending Payment'] },
                paymentStatus: 'unpaid',
                createdAt: { lt: twentyFourHoursAgo }
            },
            take: 50
        });

        if (staleOrders.length === 0) return;

        console.log(`[CRON] Expiring ${staleOrders.length} abandoned orders older than 24 hours...`);

        for (const ord of staleOrders) {
            const currentPers = ord.personalization && typeof ord.personalization === 'object' ? ord.personalization : {};
            const history = Array.isArray(currentPers.statusHistory) ? [...currentPers.statusHistory] : [];
            history.push({
                status: 'Cancelled - Payment Expired',
                timestamp: new Date().toISOString(),
                actor: 'System Auto-Expire',
                hub: 'Stitch-Opt Automation',
                note: 'Order automatically cancelled after 24h grace window without payment confirmation.'
            });

            await prisma.order.update({
                where: { id: ord.id },
                data: {
                    status: 'Cancelled - Payment Expired',
                    personalization: {
                        ...currentPers,
                        statusHistory: history
                    }
                }
            });
        }

        console.log(`[CRON] Successfully expired ${staleOrders.length} abandoned orders.`);
    } catch (err) {
        console.error('[CRON] Stale order expiration check failed:', err.message);
    }
};

const socketUtil = require('./socketUtil');
const { ACTIONS } = require('./apiConstants');
let globalIo = null;

// Automatically replies to 3, 4, and 5-star customer reviews after a period of time (default: 5 minutes)
// 1 and 2-star reviews are strictly EXCLUDED and require manual intervention by the admin
const processScheduledAutoReplies = async (ioInstance, options = {}) => {
    try {
        const io = ioInstance || globalIo;
        const forceNow = !!options.forceNow;

        // Check if auto-reply feature is enabled in system settings
        const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        const isAutoReplyOn = settings ? settings.autoReplyReviews !== false : true;
        if (!isAutoReplyOn && !forceNow) return 0;

        // Grace period: 5 minutes (or 0 if forceNow triggered by admin)
        const delayMs = forceNow ? 0 : 5 * 60 * 1000;
        const cutoffTime = new Date(Date.now() - delayMs);

        // Fetch eligible reviews:
        // - rating >= 3 (3, 4, 5 stars)
        // - merchantReply IS NULL OR empty
        // - createdAt <= cutoffTime (at least 5 minutes old)
        // NOTICE: 1 and 2 star reviews are EXCLUDED (require manual admin intervention)
        const eligible = await prisma.$queryRaw`
            SELECT "id", "rating", "customerName", "message", "status"
            FROM "Feedback"
            WHERE "rating" >= 3
              AND ("merchantReply" IS NULL OR TRIM("merchantReply") = '')
              AND "createdAt" <= ${cutoffTime}
            ORDER BY "createdAt" ASC
            LIMIT 50
        `;

        if (!eligible || eligible.length === 0) return 0;

        console.log(`[AutoReply CRON] Found ${eligible.length} eligible reviews (3-5 stars, older than 5m). Processing...`);

        // Lazy-require feedbackController to avoid circular dependency
        const { getSmartReplyTemplate } = require('../controllers/postgres/feedbackController');

        let repliedCount = 0;
        for (const rev of eligible) {
            const reply = getSmartReplyTemplate(rev.rating, rev.customerName);
            const now = new Date();

            await prisma.$executeRaw`
                UPDATE "Feedback"
                SET "merchantReply" = ${reply},
                    "merchantReplyAt" = ${now},
                    "status" = 'Reviewed',
                    "updatedAt" = ${now}
                WHERE "id" = ${rev.id}
                  AND ("merchantReply" IS NULL OR TRIM("merchantReply") = '')
            `;

            repliedCount++;

            if (io) {
                try {
                    const [updated] = await prisma.$queryRaw`SELECT * FROM "Feedback" WHERE "id" = ${rev.id}`;
                    socketUtil.emitDataChanged(io, ACTIONS.UPDATE, 'FEEDBACK', updated);
                } catch (sockErr) {}
            }
        }

        console.log(`[AutoReply CRON] Successfully processed ${repliedCount} automated review replies.`);
        return repliedCount;
    } catch (err) {
        console.error('[AutoReply CRON] Failed to process auto-replies:', err.message);
        return 0;
    }
};

const initCronJobs = (io) => {
    if (io) globalIo = io;

    // Run immediately on server start
    runDatabaseCleanup();
    expireStaleOrders();
    processScheduledAutoReplies(globalIo);

    // Database cleanup every 24 hours
    setInterval(runDatabaseCleanup, 24 * 60 * 60 * 1000);

    // Stale order check every 60 minutes (60 * 60 * 1000)
    setInterval(expireStaleOrders, 60 * 60 * 1000);

    // Scheduled auto-reply processor runs every 60 seconds (checks for reviews >= 5 minutes old)
    setInterval(() => {
        processScheduledAutoReplies(globalIo);
    }, 60 * 1000);
    
    // Start self-pinging
    startKeepAwakePing();
    
    console.log('[OK] Cron jobs initialized (Daily Cleanup, Hourly Order Expiration & Review Auto-Reply active)');
};

module.exports = { initCronJobs, processScheduledAutoReplies };

