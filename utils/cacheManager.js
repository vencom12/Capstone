/**
 * cacheManager.js
 * In-memory High-Performance TTL Cache with Event-Driven Pattern Invalidation
 * 
 * Provides sub-millisecond data retrieval (<0.05ms) for high-frequency endpoints
 * (such as public storefront catalogs, settings, and queue metrics) to shield
 * PostgreSQL from redundant, heavy database queries during peak traffic.
 */

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };

        // Automatic sweep of expired keys every 60 seconds
        this.sweepInterval = setInterval(() => {
            this.purgeExpired();
        }, 60 * 1000);

        // Do not prevent process exit in test or CLI scripts
        if (this.sweepInterval && typeof this.sweepInterval.unref === 'function') {
            this.sweepInterval.unref();
        }
    }

    /**
     * Retrieve a value from the cache
     * @param {string} key
     * @returns {any|null}
     */
    get(key) {
        if (!key || typeof key !== 'string') return null;

        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return null;
        }

        // Check TTL expiration
        if (item.expiresAt && Date.now() > item.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.value;
    }

    /**
     * Store a value in the cache with a time-to-live
     * @param {string} key
     * @param {any} value
     * @param {number} ttlSeconds - Duration in seconds (default: 120s)
     * @returns {any}
     */
    set(key, value, ttlSeconds = 120) {
        if (!key || typeof key !== 'string') return value;

        const expiresAt = ttlSeconds > 0 ? Date.now() + (ttlSeconds * 1000) : null;
        this.cache.set(key, { value, expiresAt });
        this.stats.sets++;
        return value;
    }

    /**
     * Delete an exact key
     * @param {string} key
     * @returns {boolean}
     */
    del(key) {
        if (!key || typeof key !== 'string') return false;
        const existed = this.cache.delete(key);
        if (existed) this.stats.deletes++;
        return existed;
    }

    /**
     * Invalidate all keys matching a prefix pattern (e.g. 'catalog:', 'workshop:', 'settings:')
     * @param {string} prefix
     * @returns {number} Number of deleted keys
     */
    delPattern(prefix) {
        if (!prefix || typeof prefix !== 'string') return 0;
        let count = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
                count++;
            }
        }
        this.stats.deletes += count;
        return count;
    }

    /**
     * Clear all cached keys
     */
    flush() {
        this.cache.clear();
    }

    /**
     * Sweep expired keys to reclaim memory
     */
    purgeExpired() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (item.expiresAt && now > item.expiresAt) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Get diagnostic telemetry for monitoring and tests
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            keysCount: this.cache.size,
            hitRate: total > 0 ? `${((this.stats.hits / total) * 100).toFixed(1)}%` : '0%'
        };
    }
}

const cacheManager = new CacheManager();
module.exports = cacheManager;
