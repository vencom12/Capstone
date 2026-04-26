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
const auth = require('./middleware/auth');

const fs = require('fs');
const app = express();

// --- CRITICAL: Legacy Redirect (Must be first) ---


const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
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
app.use('/api/auth/', authLimiter);

// Core Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'stitch_dev_secret'));

// Force no-cache for all requests to ensure PWA updates
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// --- Legacy Static Assets ---
// Serve Framework Frontend (Next.js Export)
app.use(express.static(path.join(__dirname, 'frontend', 'out'), { extensions: ['html'] }));
// Fallback to legacy public for assets (icons, etc)
app.use(express.static(path.join(__dirname, 'public')));

// Root route serves the Next.js storefront
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'out', 'index.html'));
});

// Fallback for .html routes (for consistency)
app.get('/:page.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'out', `${req.params.page}.html`));
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

// --- Auth Routes ---

app.post('/api/auth/register', async (req, res) => {
    try {
        logErr('Register attempt: ' + JSON.stringify(req.body));
        const { username, email, password, role } = req.body;
        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) {
            logErr('User already exists: ' + email);
            return res.status(400).json({ message: 'User already exists' });
        }

        user = new User({ username, email, password, role: 'customer' });
        await user.save();
        logErr('User registered successfully');

        const token = jwt.sign({ id: user._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });

        res.json({ user: { id: user._id, username, role: 'customer' } });
    } catch (err) {
        logErr('Register Server error: ' + err.message);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        const user = await User.findOne({ $or: [{ email: email }, { username: email }] });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        // Remember Me: 30-day token vs. 1-day session token
        const expiresIn = rememberMe ? '30d' : '1d';
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn });

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            // Persistent cookie if rememberMe; session cookie (no maxAge) otherwise
            ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {})
        };
        res.cookie('token', token, cookieOptions);

        res.json({ user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict'
    });
    res.json({ message: 'Logged out successfully' });
});

// Session validation — called by AuthGuard on every page load
app.get('/api/auth/me', auth(), async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('username role');
        if (!user) return res.status(401).json({ message: 'User not found' });
        res.json({ user: { id: user._id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/auth/profile', auth(), async (req, res) => {
    try {
        const { username, email } = req.body;
        console.log(`Updating profile for user ${req.user.id}:`, { username, email });
        const userId = req.user.id;

        // Check if username/email already taken by someone ELSE
        const existingUser = await User.findOne({
            $or: [{ username }, { email }],
            _id: { $ne: userId }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Username or Email already in use' });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { username, email },
            { new: true }
        ).select('-password');

        // Re-sign token if needed, or just return updated user
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, username: user.username, role: user.role, email: user.email } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Production API Routes ---

app.get('/api/orders', auth(), async (req, res) => {
    try {
        // Optimization: Customers only see their own orders. Admins/Employees see all.
        const query = (req.user.role === 'customer') ? { userId: req.user.id } : {};
        const orders = await Order.find(query).sort({ date: -1 }).limit(100);
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/orders', auth(['customer', 'admin']), async (req, res) => {
    try {
        const { _id, ...orderData } = req.body;
        const newOrder = new Order({ ...orderData, userId: req.user.id });
        await newOrder.save();
        io.emit('dataChanged', { type: 'orders' });
        res.json(newOrder);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/orders/:id', auth(['admin', 'employee']), async (req, res) => {
    try {
        const updateData = {};
        if (req.body.client !== undefined) updateData.client = req.body.client;
        if (req.body.design !== undefined) updateData.design = req.body.design;
        if (req.body.status !== undefined) updateData.status = req.body.status;
        if (req.body.progress !== undefined) updateData.progress = req.body.progress;

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true }
        );
        if (!order) return res.status(404).json({ message: 'Order not found' });
        io.emit('dataChanged', { type: 'orders' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/orders/:id', auth(['admin', 'employee']), async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        io.emit('dataChanged', { type: 'orders' });
        res.json({ message: 'Order cancelled successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});


app.get('/api/inventory', auth(), async (req, res) => {
    try {
        const inventory = await Inventory.find();
        res.json(inventory);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.patch('/api/inventory/:item', auth(['admin', 'employee']), async (req, res) => {
    try {
        const { count } = req.body;
        const inventory = await Inventory.findOneAndUpdate(
            { item: req.params.item },
            { count, lastUpdated: Date.now() },
            { new: true, upsert: true }
        );
        io.emit('dataChanged', { type: 'inventory' });
        res.json(inventory);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Admin User Management ---

app.get('/api/admin/users', auth(['admin']), async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/admin/users', auth(['admin']), async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) return res.status(400).json({ message: 'User already exists' });

        user = new User({ username, email, password, role });
        await user.save();

        res.json({ message: 'User created successfully', user: { id: user._id, username, role } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/admin/users/:id', auth(['admin']), async (req, res) => {
    try {
        const { username, email, role, password } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (username) user.username = username;
        if (email) user.email = email;
        if (role) user.role = role;

        // If password is provided, trigger pre-save hook to hash it securely
        if (password && password.trim() !== '') {
            user.password = password;
        }

        await user.save();

        // Strip password before returning
        const safeUser = user.toObject();
        delete safeUser.password;

        res.json(safeUser);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/admin/users/:id', auth(['admin']), async (req, res) => {
    try {
        // Prevent deleting self (optional but safer)
        if (req.params.id === req.user.id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});


// --- Favorites Management ---

app.get('/api/favorites', auth(), async (req, res) => {
    try {
        // Optimization: Lean projection to only fetch favorites field
        const user = await User.findById(req.user.id)
            .select('favorites')
            .populate('favorites');
        res.json(user.favorites || []);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/favorites/:id', auth(), async (req, res) => {
    try {
        // Optimization: Atomic $addToSet prevents duplicates and is much faster
        await User.findByIdAndUpdate(req.user.id, {
            $addToSet: { favorites: req.params.id }
        });
        res.json({ message: 'Added to favorites' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/favorites/:id', auth(), async (req, res) => {
    try {
        // Optimization: Atomic $pull is much faster than filter + save
        await User.findByIdAndUpdate(req.user.id, {
            $pull: { favorites: req.params.id }
        });
        res.json({ message: 'Removed from favorites' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Performance: Batch Dashboard State ---
app.get('/api/dashboard-state', auth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        // Run all queries in parallel for maximum speed
        const [orders, inventory, products, userWithFavorites, totalUsers, totalRevenue, adminUsers] = await Promise.all([
            Order.find(role === 'customer' ? { userId } : {}).sort({ date: -1 }).limit(50),
            Inventory.find(),
            Product.find().sort({ createdAt: -1 }).limit(100),
            User.findById(userId).select('favorites').populate('favorites'),
            // Analytics (Admin/Employee only)
            (role !== 'customer') ? User.countDocuments() : Promise.resolve(0),
            (role !== 'customer') ? Order.aggregate([{ $group: { _id: null, total: { $sum: { $convert: { input: "$price", to: "double", onError: 0, onNull: 0 } } } } }]) : Promise.resolve([{ total: 0 }]),
            (role === 'admin') ? User.find().select('-password').sort({ createdAt: -1 }) : Promise.resolve([])
        ]);

        const analytics = (role !== 'customer') ? {
            userCount: totalUsers,
            revenue: totalRevenue[0]?.total || 0,
            activeOrders: orders.filter(o => o.status !== 'Completed' && o.status !== 'Order Canceled').length,
            lowStock: inventory.filter(i => i.count < 10).length
        } : null;

        res.json({
            orders,
            inventory,
            products,
            favorites: userWithFavorites ? userWithFavorites.favorites : [],
            analytics,
            users: adminUsers
        });
    } catch (err) {
        console.error('Dashboard state error:', err);
        res.status(500).json({ message: 'Server error fetching batch state' });
    }
});

// --- Batch Operations (Admin/Employee) ---
app.post('/api/orders/batch-status', auth(['admin', 'employee']), async (req, res) => {
    try {
        const { orderIds, status } = req.body;
        if (!Array.isArray(orderIds) || !status) {
            return res.status(400).json({ message: 'Invalid batch data' });
        }

        await Order.updateMany(
            { _id: { $in: orderIds } },
            { $set: { status, progress: status === 'Completed' ? 100 : undefined } }
        );

        io.emit('dataChanged', { type: 'orders' });
        res.json({ message: `Successfully updated ${orderIds.length} orders` });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Product Management ---

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/products', auth(['admin', 'employee']), async (req, res) => {
    try {
        const { name, price, tag, description, imageUrl } = req.body;
        const newProduct = new Product({ name, price, tag, description, imageUrl });
        await newProduct.save();
        io.emit('dataChanged', { type: 'products' });
        res.json(newProduct);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/products/:id', auth(['admin', 'employee']), async (req, res) => {
    try {
        const { name, price, tag, description, imageUrl } = req.body;
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { name, price, tag, description, imageUrl },
            { new: true }
        );
        if (!product) return res.status(404).json({ message: 'Product not found' });
        io.emit('dataChanged', { type: 'products' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/products/:id', auth(['admin', 'employee']), async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        io.emit('dataChanged', { type: 'products' });
        res.json({ message: 'Product removed' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Analytics Tracking ---
app.post('/api/analytics/visit', async (req, res) => {
    try {
        const visit = new SiteTraffic({
            path: req.body.path || '/',
            userAgent: req.headers['user-agent']
        });
        await visit.save();
        res.status(204).send();
    } catch (err) {
        res.status(500).send();
    }
});

app.post('/api/analytics/product-view/:id', async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
        res.status(204).send();
    } catch (err) {
        res.status(500).send();
    }
});

// --- Admin Analytics Reports ---
app.get('/api/admin/analytics', auth(['admin']), async (req, res) => {
    try {
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        // 1. Monthly Order Trends
        const orderTrends = await Order.aggregate([
            { $match: { date: { $gte: twelveMonthsAgo } } },
            {
                $project: {
                    date: 1,
                    orderTotal: {
                        $reduce: {
                            input: "$items",
                            initialValue: 0,
                            in: { $add: ["$$value", { $multiply: ["$$this.price", "$$this.quantity"] }] }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                    count: { $sum: 1 },
                    revenue: { $sum: "$orderTotal" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // 2. Status Distribution
        const statusDistribution = await Order.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        // 3. Top 5 Most Ordered (by volume)
        const topOrdered = await Order.aggregate([
            { $unwind: "$items" },
            { $group: { _id: "$items.name", count: { $sum: "$items.quantity" } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // 4. Top 5 Most Liked
        const topLiked = await User.aggregate([
            { $unwind: "$favorites" },
            { $group: { _id: "$favorites", likeCount: { $sum: 1 } } },
            { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
            { $unwind: "$product" },
            { $project: { name: "$product.name", likeCount: 1 } },
            { $sort: { likeCount: -1 } },
            { $limit: 5 }
        ]);

        // 5. Site Traffic (Last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const trafficStats = await SiteTraffic.aggregate([
            { $match: { timestamp: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                    visits: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            orderTrends,
            statusDistribution,
            topOrdered,
            topLiked,
            trafficStats
        });
    } catch (err) {
        console.error('Analytics Error:', err);
        res.status(500).json({ message: 'Server error fetching analytics' });
    }
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[OK] Server listening on port ${PORT}`);
    console.log(`[OK] Socket.IO real-time engine active`);
    console.log(`[OK] Routes ready: /api/auth/profile (PUT), /api/products (GET), etc.`);
});
