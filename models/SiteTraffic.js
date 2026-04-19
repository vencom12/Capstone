const mongoose = require('mongoose');

const siteTrafficSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now, index: true },
    path: { type: String, default: '/' },
    userAgent: { type: String },
    isUnique: { type: Boolean, default: true } // Can be expanded for session tracking
});

module.exports = mongoose.model('SiteTraffic', siteTrafficSchema);
