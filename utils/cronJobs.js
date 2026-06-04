const prisma = require('./prisma');

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

const initCronJobs = () => {
    // Run immediately on server start
    runDatabaseCleanup();

    // Then run every 24 hours (24 * 60 * 60 * 1000)
    setInterval(runDatabaseCleanup, 24 * 60 * 60 * 1000);
    
    // Start self-pinging
    startKeepAwakePing();
    
    console.log('[OK] Cron jobs initialized (Daily Database Cleanup active)');
};

module.exports = { initCronJobs };
