const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR);
}

// Rotate logs if they exceed 5MB to preserve host disk space
const rotateIfLarge = (filename) => {
    try {
        const fullPath = path.join(LOG_DIR, filename);
        if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            if (stats.size > 5 * 1024 * 1024) {
                const oldPath = path.join(LOG_DIR, `${filename}.old`);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                fs.renameSync(fullPath, oldPath);
            }
        }
    } catch (e) { /* ignore rotation errors */ }
};

rotateIfLarge('socket_events.log');
rotateIfLarge('rollbacks.log');

const socketLogStream = fs.createWriteStream(path.join(LOG_DIR, 'socket_events.log'), { flags: 'a' });
const rollbackLogStream = fs.createWriteStream(path.join(LOG_DIR, 'rollbacks.log'), { flags: 'a' });

const logger = {
    logSocketEvent: (event, size, data) => {
        const entry = {
            timestamp: new Date().toISOString(),
            event,
            sizeBytes: size,
            entity: data.entity,
            action: data.action
        };
        socketLogStream.write(JSON.stringify(entry) + '\n');
        if (size > 1024 * 10) { // Log large payloads to console for visibility
            console.warn(`[Logger] Large payload detected: ${event} (${(size / 1024).toFixed(2)} KB)`);
        }
    },
    logRollback: (reason, data) => {
        const entry = {
            timestamp: new Date().toISOString(),
            reason,
            data
        };
        rollbackLogStream.write(JSON.stringify(entry) + '\n');
        console.error(`[Logger] Rollback Triggered: ${reason}`);
    }
};

module.exports = logger;
