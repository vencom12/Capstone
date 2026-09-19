const logger = require('./logger');
const { ENTITIES } = require('./apiConstants');

const socketUtil = {
    emitDataChanged: (io, action, entity, payload, rooms = null) => {
        if (!io) return;
        (async () => {
            let processedPayload = payload;
            if (entity === ENTITIES.PRODUCT) {
                try {
                    const { enrichProductsWithStock } = require('./inventoryManager');
                    if (Array.isArray(payload)) {
                        processedPayload = await enrichProductsWithStock(payload);
                    } else if (payload && typeof payload === 'object' && payload.id) {
                        const [enriched] = await enrichProductsWithStock([payload]);
                        processedPayload = enriched;
                    }
                } catch (err) {
                    console.error('Error enriching products in socketUtil:', err);
                }
            }

            const data = { action, entity, payload: processedPayload };
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
        })();
    }
};

module.exports = socketUtil;
