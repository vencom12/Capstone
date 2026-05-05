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

const logErr = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, 'server_log.txt'), entry);
    console.error(msg);
};

// --- CRITICAL: Legacy Redirect (Must be first) ---


const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

// Socket.IO Authentication Middleware
io.use((socket, next) => {
    try {
        const cookieStr = socket.request.headers.cookie || '';
        const cookies = Object.fromEntries(cookieStr.split('; ').filter(c => c).map(c => c.split('=')));
        const token = cookies.token;

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
app.use(mongoSanitize());

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
// app.use('/api/auth/', authLimiter);

// Core Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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

// MongoDB Connection - Optimized for Atlas Free Cluster
const dbOptions = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4, // Force IPv4
    maxPoolSize: 10 // Recommended for free tier
};

mongoose.connect(process.env.MONGODB_URI, dbOptions)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('CRITICAL: MongoDB connection failed:', err));

// --- Modular Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/employee', require('./routes/employee'));

// --- Shared/Public Routes ---
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/payments/receipt/:transactionID', auth(), async (req, res) => {
    try {
        const tx = await Transaction.findOne({ transactionID: req.params.transactionID });
        if (!tx) return res.status(404).json({ message: 'Receipt not found' });
        if (tx.userID.toString() !== req.user.id && req.user.role === 'customer') {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        res.json(tx);
    } catch (err) {
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

const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[OK] Server listening on port ${PORT}`);
    console.log(`[OK] Socket.IO real-time engine active`);
    console.log(`[OK] Routes ready: /api/auth/profile (PUT), /api/products (GET), etc.`);
});
