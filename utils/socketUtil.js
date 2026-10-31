const logger = require('./logger');
const { ENTITIES } = require('./apiConstants');

const socketUtil = {
    emitDataChanged: (io, action, entity, payload, rooms = null) => {
        // Automatically purge matching in-memory cache entries on entity mutation synchronously
        try {
            const cacheManager = require('./cacheManager');
            if (entity === ENTITIES.PRODUCT || entity === ENTITIES.INVENTORY || entity === 'INVENTORY_BATCH' || entity === 'INVENTORY_LOG' || entity === 'FEEDBACK') {
                cacheManager.delPattern('catalog:');
                cacheManager.delPattern('guest:');
            } else if (entity === ENTITIES.ORDER) {
                cacheManager.delPattern('catalog:');
                cacheManager.delPattern('guest:');
                cacheManager.delPattern('workshop:');
            } else if (entity === ENTITIES.SETTINGS || entity === 'SETTINGS') {
                cacheManager.delPattern('settings:');
                cacheManager.delPattern('workshop:');
            }
        } catch (cacheErr) {
            // Non-blocking safeguard
        }

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
