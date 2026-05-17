const fs = require('fs');
const path = require('path');

function logAiChange(user, action, details) {
    try {
        const logPath = path.resolve(process.cwd(), 'logs/ai_changes.json');
        const logDir = path.dirname(logPath);
        
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        let logs = [];
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            try {
                logs = JSON.parse(content);
            } catch (e) {
                logs = [];
            }
        }
        
        const newEntry = {
            id: Math.random().toString(36).substring(2, 9).toUpperCase(),
            timestamp: new Date().toISOString(),
            user: user || 'StitchMaster AI',
            action,
            details
        };
        
        logs.unshift(newEntry); // Newest log first
        
        // Keep logs capped at 100 entries to prevent file size bloat
        if (logs.length > 100) {
            logs = logs.slice(0, 100);
        }
        
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf8');
        return newEntry;
    } catch (err) {
        console.error('[AI Logger Error]: Failed to log AI change:', err);
        return null;
    }
}

module.exports = {
    logAiChange
};
