const { AsyncLocalStorage } = require('async_hooks');
const tenantStorage = new AsyncLocalStorage();
module.exports = tenantStorage;
