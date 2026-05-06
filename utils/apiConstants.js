/**
 * API Constants for Standardized Payloads
 * Format: { action, entity, payload }
 */

const ACTIONS = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    FETCH: 'FETCH',
    REFRESH: 'REFRESH'
};

const ENTITIES = {
    ORDER: 'ORDER',
    TRANSACTION: 'TRANSACTION',
    RECEIPT: 'RECEIPT',
    USER: 'USER',
    PRODUCT: 'PRODUCT',
    INVENTORY: 'INVENTORY',
    WALLET: 'WALLET'
};

module.exports = {
    ACTIONS,
    ENTITIES,
    API_VERSION: 'v1'
};
