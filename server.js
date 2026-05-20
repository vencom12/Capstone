require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

const auth = require('./middleware/auth');

const fs = require('fs');
const crypto = require('crypto');
const app = express();

// --- CRITICAL CORS Setup (Must be absolute first to cover rate limits and early errors) ---
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl)
        if (!origin) return callback(null, true);
        
        // Exact match or strict subdomain regex matching
        const isAllowed = origin === 'http://localhost:3000' || 
                          /^https:\/\/[a-zA-Z0-9-]+\.onrender\.com$/.test(origin) ||
                          /^https:\/\/[a-zA-Z0-9-]+\.render\.com$/.test(origin);
                          
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
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
        const cookies = Object.fromEntries(cookieStr.split('; ').filter(c => c).map(c => c.split('=')));
        
        // Check for any of the portal-specific tokens
        const token = cookies.admin_token || cookies.employee_token || cookies.customer_token || cookies.token;

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

// --- Production Security Middleware ---

// Helmet: Sets secure HTTP headers (XSS protection, clickjack prevention, MIME sniff guard)
app.use(helmet({
    contentSecurityPolicy: false, // Disabled to allow inline scripts in PWA
    crossOriginEmbedderPolicy: false // Allow loading cross-origin images (product photos)
}));

// Running strictly in PostgreSQL mode

// Global Rate Limiter: Max 3000 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes.' }
});
app.use('/api/', globalLimiter);

// Strict Auth Rate Limiter: Max 20 login/register attempts per 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

// Dashboard Rate Limiter: Max 50 requests per 10 minutes (for heavy state fetches)
const dashboardLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Dashboard refresh limit reached. Please wait a few minutes.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Strict Checkout Rate Limiter: Max 5 checkout requests per minute
const checkoutLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Checkout rate limit reached. Please wait a minute.' }
});
app.use('/api/order/submit', checkoutLimiter);
app.use('/api/v1/order/submit', checkoutLimiter);
// v1 Rate Limiters
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

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
app.get('/api/health', async (req, res) => {
    let dbStatus = 'Disconnected';
    try {
        const prisma = require('./utils/prisma');
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'Connected';
    } catch (e) { dbStatus = 'Error'; }

    res.json({ 
        status: 'ok', 
        database: dbStatus,
        dbType: 'postgres',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/admin', adminRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/machines', require('./routes/postgres/machine'));

// --- Development Tools (Only in Dev) ---
if (process.env.NODE_ENV === 'development') {
    try {
        app.use('/api/dev', require('./development/dev_routes'));
    } catch (err) {
        console.warn('[DEV] Development routes enabled but files missing. Skipping...');
    }
}

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
        const tx = await prisma.transaction.findUnique({
            where: { transactionID: req.params.transactionID },
            include: { order: true, user: true }
        });
        if (!tx) return res.status(404).json({ message: 'Receipt not found' });
        
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
            client: tx.order?.client || tx.user?.username || 'Guest',
            items: tx.order?.items || []
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
server.listen(PORT, '0.0.0.0', async () => {
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
    if (req.path.startsWith('/api') || req.path.includes('.')) {
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
