const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR);
}

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
