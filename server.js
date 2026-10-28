require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createTokenBucketLimiter, getRateLimiterDiagnostics } = require('./utils/tokenBucketLimiter');
const compression = require('compression');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

const auth = require('./middleware/auth');

const fs = require('fs');
const crypto = require('crypto');
const app = express();

// Trust reverse proxy headers (Render, Cloudflare, etc.)
app.set('trust proxy', 1);

// --- CRITICAL CORS Setup (Must be absolute first to cover rate limits and early errors) ---
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl)
        if (!origin) return callback(null, true);
        
        // Allow all local dev origins (localhost, 127.0.0.1, [::1]) regardless of port
        const isAllowed = origin.startsWith('http://localhost') || 
                          origin.startsWith('http://127.0.0.1') ||
                          origin.startsWith('http://[::1]') ||
                          /^https:\/\/[a-zA-Z0-9-]+\.onrender\.com$/.test(origin) ||
                          /^https:\/\/[a-zA-Z0-9-]+\.render\.com$/.test(origin);
                          
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    credentials: true
}));

// Ensure uploads and logs directories exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('[OK] Created missing uploads directory');
}
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('[OK] Created missing logs directory');
}

const logErr = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, 'logs', 'server_log.txt'), entry);
    console.error(msg);
};

// --- CRITICAL: Legacy Redirect (Must be first) ---


const server = http.createServer(app);
app.set('trust proxy', 1);

const ioOptions = { 
    cors: { origin: '*' },
    transports: ['websocket', 'polling']
};
const io = new Server(server, ioOptions);

// --- Scalability: Redis Adapter Prototype ---
if (process.env.REDIS_URL) {
    try {
        const { createAdapter } = require('@socket.io/redis-adapter');
        const { createClient } = require('redis');
        
        const pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = pubClient.duplicate();
        
        Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
            io.adapter(createAdapter(pubClient, subClient));
            console.log('[OK] Socket.IO Redis Adapter active (Horizontal Scale Ready)');
        }).catch(err => {
            console.error('[REDIS] Connection failed, falling back to in-memory adapter:', err.message);
        });
    } catch (err) {
        console.warn('[REDIS] Adapter libraries missing or error. Running in single-node mode.');
    }
} else {
    console.log('[INFO] No REDIS_URL found. Running Socket.IO in single-node mode.');
}

app.set('io', io);

// Socket.IO Authentication Middleware
io.use((socket, next) => {
    try {
        const cookieStr = socket.request.headers.cookie || '';
        const cookies = Object.fromEntries(cookieStr.split('; ').filter(c => c).map(c => {
            const idx = c.indexOf('=');
            return idx > -1 ? [c.slice(0, idx).trim(), c.slice(idx + 1).trim()] : [c.trim(), ''];
        }));
        
        // Portal-aware token selection to prevent customer/staff crosstalk in multi-tab testing
        const portal = socket.handshake.auth?.portal || socket.handshake.query?.portal;
        let token = null;
        if (portal === 'customer') {
            token = cookies.customer_token || cookies.token || cookies.employee_token || cookies.admin_token;
        } else if (portal === 'admin') {
            token = cookies.admin_token || cookies.token;
        } else if (portal === 'employee') {
            token = cookies.employee_token || cookies.admin_token || cookies.token;
        } else {
            token = cookies.customer_token || cookies.admin_token || cookies.employee_token || cookies.token;
        }

        if (!token) return next(); // Allow guest connections but they won't join rooms

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        console.error('[Socket.IO] Auth Error:', err.message);
        next(); // Still allow connection, just unauthenticated
    }
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    if (socket.user) {
        // Join private user room
        socket.join(`user:${socket.user.id}`);
        console.log(`[Socket.IO] User ${socket.user.id} joined room user:${socket.user.id}`);

        // Join staff room if applicable
        if (socket.user.role === 'admin' || socket.user.role === 'employee') {
            socket.join('staff');
            console.log(`[Socket.IO] Staff ${socket.user.id} joined room staff`);
        }
    }

    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});

console.log('>>> STITCH-OPT SERVER INITIALIZING <<<');

// Enable Gzip/Brotli compression for all responses
app.use(compression());

// Initialize Automated Background Tasks
const { initCronJobs } = require('./utils/cronJobs');
initCronJobs(io);

// --- Production Security Middleware ---

// Helmet: Sets secure HTTP headers (XSS protection, clickjack prevention, MIME sniff guard)
app.use(helmet({
    contentSecurityPolicy: false, // Disabled to allow inline scripts in PWA
    crossOriginEmbedderPolicy: false, // Allow loading cross-origin images (product photos)
    crossOriginOpenerPolicy: false, // CRITICAL: Disabled so Google/Firebase OAuth popups maintain window.opener communication without browser isolation
    crossOriginResourcePolicy: false // Allow cross-origin resources
}));

// Google full-window sign-in: serve Firebase's auth helper from our own domain.
// Isolated module - see middleware/firebaseAuthProxy.js. Must stay before body parsers.
app.use(require('./middleware/firebaseAuthProxy'));

// Running strictly in PostgreSQL mode

// --- Token Bucket Rate Limiting Architecture ---
// Global API Token Bucket: Capacity 60 tokens (burst), refills continuously at 1 token/sec (60 tokens / min)
const globalLimiter = createTokenBucketLimiter({
    name: 'global-api',
    capacity: 60,
    refillRate: 1,
    refillIntervalMs: 1000,
    message: { message: 'Too many requests from this IP, please wait a moment for your token bucket to refill.' }
});
app.use('/api/', globalLimiter);

// Strict Auth Token Bucket: Capacity 10 burst attempts, refills 20 tokens per 15 minutes (~1 token per 45s)
const authLimiter = createTokenBucketLimiter({
    name: 'auth-strict',
    capacity: 10,
    refillRate: 20,
    refillIntervalMs: 15 * 60 * 1000,
    message: { message: 'Too many authentication attempts. Please wait for your security token bucket to refill.' }
});

// Strict Email & OTP Token Bucket: Protects Brevo (300/day), Resend (100/day), & Gmail SMTP quotas
// Capacity 3 burst emails per IP, refills 1 token every 2 minutes (5 tokens per 10 minutes)
const emailOtpLimiter = createTokenBucketLimiter({
    name: 'email-otp',
    capacity: 3,
    refillRate: 5,
    refillIntervalMs: 10 * 60 * 1000,
    message: { message: 'Too many email/OTP requests. Please wait a couple of minutes before requesting another code.' }
});

// Dashboard State Token Bucket: Capacity 20 burst fetches, refills 50 tokens per 10 minutes
const dashboardLimiter = createTokenBucketLimiter({
    name: 'dashboard-state',
    capacity: 20,
    refillRate: 50,
    refillIntervalMs: 10 * 60 * 1000,
    message: { message: 'Dashboard refresh limit reached. Please wait a few seconds before refreshing.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/send-otp', emailOtpLimiter);
app.use('/api/auth/email/send-link-otp', emailOtpLimiter);
app.use('/api/auth/email/resend', emailOtpLimiter);
app.use('/api/auth/password/forgot', emailOtpLimiter);
app.use('/api/customer/dashboard-state', dashboardLimiter);

// Anti-enumeration Token Bucket: Capacity 20 burst checks, refills 1 token/sec (60/min)
const availabilityLimiter = createTokenBucketLimiter({
    name: 'auth-availability',
    capacity: 20,
    refillRate: 60,
    refillIntervalMs: 60 * 1000,
    message: { message: 'Too many availability checks from this IP. Please slow down.' }
});
app.use('/api/auth/check-availability', availabilityLimiter);
app.use('/api/v1/auth/check-availability', availabilityLimiter);

// Strict Checkout Token Bucket: Capacity 5 burst submissions, refills 5 tokens/minute (1 token per 12s)
const checkoutLimiter = createTokenBucketLimiter({
    name: 'order-checkout',
    capacity: 5,
    refillRate: 5,
    refillIntervalMs: 60 * 1000,
    message: { message: 'Checkout rate limit reached. Please wait a few seconds before submitting another order.' }
});
app.use('/api/customer/order/submit', checkoutLimiter);
app.use('/api/v1/customer/order/submit', checkoutLimiter);
app.use('/api/order/submit', checkoutLimiter);
app.use('/api/v1/order/submit', checkoutLimiter);
// v1 Rate Limiters
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/send-otp', emailOtpLimiter);
app.use('/api/v1/auth/email/send-link-otp', emailOtpLimiter);
app.use('/api/v1/auth/email/resend', emailOtpLimiter);
app.use('/api/v1/auth/password/forgot', emailOtpLimiter);

// Core Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'stitch_dev_secret'));

// CSRF Protection: Issue a token to the client
app.get('/api/auth/csrf-token', (req, res) => {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrfToken', token, { 
        httpOnly: false, // Must be accessible by JS to send in header
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax'
    });
    res.json({ csrfToken: token });
});

// Middleware to verify CSRF token for sensitive operations
const verifyCSRF = (req, res, next) => {
    const clientToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies.csrfToken;
    if (!clientToken || clientToken !== cookieToken) {
        return res.status(403).json({ message: 'CSRF token mismatch or missing.' });
    }
    next();
};
app.set('verifyCSRF', verifyCSRF);

// Cache-Control: Allow browsers to cache static assets (favicon, images, CSS, JS)
// but force no-cache for API and HTML responses to ensure PWA updates
app.use((req, res, next) => {
    const isStaticAsset = /\.(ico|png|svg|jpg|jpeg|gif|webp|css|js|woff2?|ttf|webmanifest)$/i.test(req.path);
    if (isStaticAsset) {
        res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
    } else {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});

// --- Serve Next.js Framework Frontend (Static Export) ---
const frontendOutPath = path.join(__dirname, 'frontend', 'out');
app.use(express.static(frontendOutPath, { extensions: ['html'] }));

// Fallback for assets in public root
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root route serves the framework storefront
app.get('/', async (req, res) => {
    // Auto-log visit for root landing
    try {
        const prisma = require('./utils/prisma');
        await prisma.siteTraffic.create({
            data: { path: '/', userAgent: req.headers['user-agent'] || 'Unknown' }
        });
    } catch (e) { /* ignore tracking errors */ }
    
    res.sendFile(path.join(frontendOutPath, 'index.html'));
});

// Fallback for .html routes
app.get('/:page.html', async (req, res) => {
    const page = req.params.page;

    // Redirect legacy URLs to their new clean-URL framework counterparts
    if (page === 'user' || page === 'dashboard') {
        return res.redirect('/dashboard');
    }
    if (page === 'admin') {
        return res.redirect('/admin');
    }
    if (page === 'employee') {
        return res.redirect('/employee');
    }
    if (page === 'index') {
        return res.redirect('/');
    }

    // Auto-log visit for specific pages
    try {
        if (!['login', 'register', 'admin', 'employee'].includes(page)) {
            const prisma = require('./utils/prisma');
            await prisma.siteTraffic.create({
                data: { path: `/${page}.html`, userAgent: req.headers['user-agent'] || 'Unknown' }
            });
        }
    } catch (e) { /* ignore tracking errors */ }
    
    const pageHtmlPath = path.join(frontendOutPath, `${page}.html`);
    if (fs.existsSync(pageHtmlPath)) {
        return res.sendFile(pageHtmlPath);
    }
    
    // Default to main index.html for SPA if the specific page doesn't exist
    res.sendFile(path.join(frontendOutPath, 'index.html'));
});

console.log('>>> MIDDLEWARE INITIALIZED <<<');

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

console.log(`[SYSTEM] Starting in PostgreSQL mode...`);

// --- Modular Routes ---
const authRoutes = require('./routes/postgres/auth');
const adminRoutes = require('./routes/postgres/admin');
const customerRoutes = require('./routes/postgres/customer');
const employeeRoutes = require('./routes/postgres/employee');
const aiRoutes = require('./routes/postgres/aiRoutes');

// Health check for diagnostics
// Reports connectivity AND whether the database still matches prisma/schema.prisma.
// A bare "SELECT 1" only proves the socket is open, so it reported "Connected"
// while User.isEmailVerified and the EmailVerification table were missing and
// every admin dashboard request failed with P2022.
// Always answers 200 so Render does not restart-loop on a schema mismatch;
// alert on database !== 'Connected' instead.
app.get('/api/health', async (req, res) => {
    let dbStatus = 'Connected';
    let schema = { checked: false, ok: true, missingTables: [], missingColumns: [] };
    let error = null;

    try {
        const prisma = require('./utils/prisma');
        await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
        dbStatus = 'Unreachable';
        error = e.message.split('\n')[0];
        console.error('[HEALTH] Database connectivity check failed:', error);
    }

    if (dbStatus === 'Connected') {
        try {
            const { checkSchemaSync } = require('./utils/schemaHealth');
            schema = await checkSchemaSync();
            if (schema.checked && !schema.ok) {
                dbStatus = 'Schema out of sync';
            }
        } catch (e) {
            error = e.message.split('\n')[0];
            console.error('[HEALTH] Schema drift check failed:', error);
        }
    }

    res.json({
        status: dbStatus === 'Connected' ? 'ok' : 'degraded',
        database: dbStatus,
        dbType: 'supabase',
        schema,
        rateLimiters: getRateLimiterDiagnostics(),
        ...(error ? { error } : {}),
        timestamp: new Date().toISOString()
    });
});

app.use('/api/admin', adminRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/machines', require('./routes/postgres/machine'));
app.patch('/api/orders/:id/location', require('./controllers/postgres/customerController').updateOrderLocation);

// Versioned API v1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customer', customerRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/employee', employeeRoutes);

// --- Shared/Public Routes ---
app.get('/api/products', async (req, res) => {
    try {
        const prisma = require('./utils/prisma');
        const { enrichProductsWithStock } = require('./utils/inventoryManager');
        const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
        const enriched = await enrichProductsWithStock(products);
        res.json(enriched);
    } catch (err) {
        console.error('API Products Error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/payments/receipt/:transactionID', auth(), async (req, res) => {
    try {
        const prisma = require('./utils/prisma');
        const id = req.params.transactionID;
        let tx = await prisma.transaction.findFirst({
            where: {
                OR: [
                    { transactionID: id },
                    { orderID: id },
                    { receiptId: id },
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

        if (!tx) return res.status(404).json({ message: 'Receipt not found' });
        
        if (tx.Order) {
            tx.order = tx.Order;
        }

        if (tx.userId !== req.user.id && req.user.role === 'customer') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        return res.json({
            transactionID: tx.transactionID,
            orderID: tx.orderID,
            receiptId: tx.receiptId,
            timestamp: tx.timestamp,
            amount: tx.amount,
            status: tx.status,
            paymentMethod: tx.paymentMethod || tx.order?.paymentMethod || 'GCash',
            client: tx.order?.client || tx.user?.username || 'Guest',
            items: tx.order?.items || [],
            order: tx.order || null
        });
    } catch (err) {
        console.error('Receipt error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/analytics/visit', async (req, res) => {
    try {
        const prisma = require('./utils/prisma');
        await prisma.siteTraffic.create({
            data: { 
                path: req.body.path || '/', 
                userAgent: req.headers['user-agent'] || 'Unknown' 
            }
        });
        res.status(204).send();
    } catch (err) { res.status(500).send(); }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('GLOBAL ERROR HANDLER:', err);
    
    // Specific handling for Multer (File Upload) errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            message: 'Validation Error',
            error: 'Image file is too large! Maximum allowed size is 2MB.'
        });
    }

    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        message: 'Internal Server Error',
        error: err.message || 'An unexpected error occurred',
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
    });
});

const PORT = process.env.PORT || 5001;

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`[PORT] Port ${PORT} is temporarily busy. Auto-retrying in 1.5 seconds...`);
        setTimeout(() => {
            try { server.close(); } catch (e) {}
            server.listen(PORT);
        }, 1500);
    } else {
        console.error('[SERVER ERROR]', err);
    }
});

server.listen(PORT, async () => {
    console.log(`[OK] Server listening on port ${PORT}`);
    console.log(`[OK] Socket.IO real-time engine active`);
    console.log(`[OK] Routes ready: /api/auth/profile (PUT), /api/products (GET), etc.`);

    // Self-healing: reconcile reserved counts on startup
    try {
        const { reconcileReservedCounts } = require('./utils/inventoryManager');
        const prisma = require('./utils/prisma');
        await reconcileReservedCounts(prisma);
        console.log(`[OK] Inventory reservations reconciled successfully on startup.`);
    } catch (err) {
        console.error('Failed to reconcile inventory reservations on startup:', err);
    }

    // 150-Day Global Audit Log Auto-Pruning Job
    // Runs once every 24 hours to clear old logs and protect Supabase free tier storage
    setInterval(async () => {
        try {
            const prisma = require('./utils/prisma');
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 150);
            
            const result = await prisma.globalAuditLog.deleteMany({
                where: { timestamp: { lt: cutoffDate } }
            });
            
            if (result.count > 0) {
                console.log(`[AUDIT] Pruned ${result.count} audit logs older than 150 days.`);
            }
        } catch (err) {
            console.error('[AUDIT] Failed to prune audit logs:', err.message);
        }
    }, 24 * 60 * 60 * 1000); // 24 hours
});

// Graceful Shutdown to prevent Supabase connection leaks on nodemon restarts or process termination

// Fallback for Next.js Clean URLs (SPA Router Fallback)
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/__') || req.path.includes('.')) {
        return next();
    }
    const cleanPath = req.path.replace(/\/$/, "");
    const pageHtmlPath = path.join(frontendOutPath, `${cleanPath}.html`);
    if (fs.existsSync(pageHtmlPath)) {
        return res.sendFile(pageHtmlPath);
    }
    res.sendFile(path.join(frontendOutPath, 'index.html'));
});

const gracefulShutdown = async (signal) => {
    console.log(`[SYSTEM] Received ${signal}. Starting graceful shutdown...`);
    try {
        const prisma = require('./utils/prisma');
        await prisma.$disconnect();
        console.log('[OK] Prisma database connections closed.');
    } catch (err) {
        console.error('Error disconnecting Prisma on shutdown:', err.message);
    }
    server.close(() => {
        console.log('[OK] HTTP server closed.');
        process.exit(0);
    });
    
    setTimeout(() => {
        console.warn('[WARNING] Graceful shutdown timed out, force exiting.');
        process.exit(1);
    }, 3000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.once('SIGUSR2', async () => {
    console.log('[SYSTEM] Received SIGUSR2 (Nodemon reload). Cleaning connections...');
    try {
        const prisma = require('./utils/prisma');
        await prisma.$disconnect();
        console.log('[OK] Prisma database connections closed (Nodemon reload).');
    } catch (err) {
        console.error('Error disconnecting Prisma on nodemon reload:', err.message);
    }
    process.kill(process.pid, 'SIGUSR2');
});
