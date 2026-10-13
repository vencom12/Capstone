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

const initCronJobs = () => {
    // Run immediately on server start
    runDatabaseCleanup();
    expireStaleOrders();

    // Database cleanup every 24 hours
    setInterval(runDatabaseCleanup, 24 * 60 * 60 * 1000);

    // Stale order check every 60 minutes (60 * 60 * 1000)
    setInterval(expireStaleOrders, 60 * 60 * 1000);
    
    // Start self-pinging
    startKeepAwakePing();
    
    console.log('[OK] Cron jobs initialized (Daily Cleanup & Hourly Order Expiration active)');
};

module.exports = { initCronJobs };
