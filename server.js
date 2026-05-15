require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');

const User = require('./models/User');
const Order = require('./models/Order');
const Inventory = require('./models/Inventory');
const Product = require('./models/Product');
const SiteTraffic = require('./models/SiteTraffic');
const Transaction = require('./models/Transaction');
const auth = require('./middleware/auth');

const fs = require('fs');
const crypto = require('crypto');
const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('[OK] Created missing uploads directory');
}

const logErr = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, 'server_log.txt'), entry);
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

// NoSQL Injection Prevention: Strips $ and . from request payloads
if (process.env.DB_TYPE !== 'postgres') {
    app.use(mongoSanitize());
}

// Global Rate Limiter: Max 300 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
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
// v1 Rate Limiters
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// Core Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow all origins in development, or specific ones in production
        if (!origin || origin.includes('render.com') || origin.includes('localhost')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
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

// Force no-cache for all requests to ensure PWA updates
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// --- Serve Vanilla Frontend ---
app.use(express.static(path.join(__dirname, 'public', 'legacy'), { extensions: ['html'] }));
// Fallback for assets in public root
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root route serves the legacy storefront
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'legacy', 'index.html'));
});

// Fallback for .html routes
app.get('/:page.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'legacy', `${req.params.page}.html`));
});

console.log('>>> MIDDLEWARE INITIALIZED <<<');

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

const DB_TYPE = process.env.DB_TYPE || 'mongodb';

if (DB_TYPE === 'mongodb') {
    const dbOptions = {
        autoIndex: true,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    };

    mongoose.connect(process.env.MONGODB_URI, dbOptions)
        .then(() => console.log('Connected to MongoDB Atlas'))
        .catch(err => console.error('CRITICAL: MongoDB connection failed:', err));
} else {
    console.log('[INFO] Database Mode: PostgreSQL (Supabase)');
}

// --- Modular Routes ---
let authRoutes, customerRoutes, adminRoutes, employeeRoutes, aiRoutes;

if (DB_TYPE === 'postgres') {
    authRoutes = require('./routes/postgres/auth');
    adminRoutes = require('./routes/postgres/admin');
    customerRoutes = require('./routes/postgres/customer');
    employeeRoutes = require('./routes/postgres/employee');
    aiRoutes = require('./routes/postgres/aiRoutes');
} else {
    authRoutes = require('./routes/auth');
    adminRoutes = require('./routes/admin');
    customerRoutes = require('./routes/customer');
    employeeRoutes = require('./routes/employee');
    aiRoutes = require('./routes/aiRoutes');
}

// Legacy Routes (for compatibility)
// Health check for diagnostics
app.get('/api/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    res.json({ 
        status: 'ok', 
        database: dbStatus,
        timestamp: new Date().toISOString()
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/ai', aiRoutes);

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
        if (process.env.DB_TYPE === 'postgres') {
            const prisma = require('./utils/prisma');
            const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
            res.json(products);
        } else {
            const products = await Product.find().sort({ createdAt: -1 });
            res.json(products);
        }
    } catch (err) {
        console.error('API Products Error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/payments/receipt/:transactionID', auth(), async (req, res) => {
    try {
        const tx = await Transaction.findOne({ transactionID: req.params.transactionID })
            .populate('orderRef')
            .populate('userID', 'username');

        if (!tx) return res.status(404).json({ message: 'Receipt not found' });
        
        if (tx.userID._id.toString() !== req.user.id && req.user.role === 'customer') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Transform data for frontend expectations
        const receiptData = {
            transactionID: tx.transactionID,
            orderID: tx.orderID,
            timestamp: tx.timestamp,
            amount: tx.amount,
            status: tx.status,
            client: tx.orderRef?.client || tx.userID?.username || 'Guest',
            items: tx.orderRef?.items || []
        };

        res.json(receiptData);
    } catch (err) {
        console.error('Receipt error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/analytics/visit', async (req, res) => {
    try {
        const visit = new SiteTraffic({ path: req.body.path || '/', userAgent: req.headers['user-agent'] });
        await visit.save();
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
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[OK] Server listening on port ${PORT}`);
    console.log(`[OK] Socket.IO real-time engine active`);
    console.log(`[OK] Routes ready: /api/auth/profile (PUT), /api/products (GET), etc.`);
});
