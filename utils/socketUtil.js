const logger = require('./logger');

const socketUtil = {
    emitDataChanged: (io, action, entity, payload, rooms = null) => {
        const data = { action, entity, payload };
        const payloadSize = Buffer.byteLength(JSON.stringify(data));
        
        logger.logSocketEvent('dataChanged', payloadSize, data);
        
        let emitter = io;
        if (rooms) {
            if (Array.isArray(rooms)) {
                rooms.forEach(room => { emitter = emitter.to(room); });
            } else {
                emitter = emitter.to(rooms);
            }
        }
        emitter.emit('dataChanged', data);
    }
};

module.exports = socketUtil;
