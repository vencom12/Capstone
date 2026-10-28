/**
 * Token Bucket Rate Limiter & Workshop Production Capacity Throttling Engine
 *
 * Implements two complementary Token Bucket mechanisms:
 * 1. HTTP / API Request Token Bucket Middleware (`createTokenBucketLimiter`):
 *    - Protects routes against traffic spikes, brute-force attempts, and DDoS while allowing
 *      legitimate short bursts up to `capacity` tokens.
 *    - Refills tokens continuously at `refillRate` tokens/second using monotonic elapsed time:
 *        tokens = min(capacity, tokens + elapsedSeconds * refillRate)
 *    - Supports variable request token cost (`cost`: number or `(req) => number`).
 *    - Emits standard `X-RateLimit-*` and `Retry-After` headers.
 *
 * 2. Workshop Bulk Production Capacity Token Bucket (`calculateProductionTokenBucket`):
 *    - Models physical embroidery workshop capacity as a Token Bucket where 1 token = 1 garment slot.
 *    - Bucket burst capacity = `maxBulkPiecesPerPeriod` (e.g., 50 pieces).
 *    - Continuous refill rate = `capacity / periodDays` (e.g., 50 / 7 = 7.14 pieces/day for weekly,
 *      or 50 / 1 = 50 pieces/day for daily).
 *    - Active queued bulk orders consume tokens from the bucket; when an incoming order requests
 *      more tokens than currently available in the bucket, the token deficit determines the exact
 *      production wait time (`deficitTokens / refillRatePerDay`) before completion.
 */

class TokenBucket {
    /**
     * @param {number} capacity Maximum burst capacity (tokens)
     * @param {number} refillRatePerSecond Continuous token refill rate per second
     * @param {number} [initialTokens] Starting tokens (defaults to full capacity)
     */
    constructor(capacity, refillRatePerSecond, initialTokens = capacity) {
        this.capacity = Math.max(1, Number(capacity) || 1);
        this.refillRatePerSecond = Math.max(0.0001, Number(refillRatePerSecond) || 1);
        this.tokens = Math.min(this.capacity, Math.max(0, Number(initialTokens ?? this.capacity)));
        this.lastRefillTimestamp = Date.now();
        this.lastAccessTimestamp = Date.now();
    }

    /**
     * Refills the bucket based on elapsed wall-clock time since `lastRefillTimestamp`.
     * @param {number} [now] Current timestamp in ms
     * @returns {number} Updated token count
     */
    refill(now = Date.now()) {
        const elapsedMs = Math.max(0, now - this.lastRefillTimestamp);
        if (elapsedMs > 0) {
            const addedTokens = (elapsedMs / 1000) * this.refillRatePerSecond;
            this.tokens = Math.min(this.capacity, this.tokens + addedTokens);
            this.lastRefillTimestamp = now;
        }
        this.lastAccessTimestamp = now;
        return this.tokens;
    }

    /**
     * Attempts to consume `cost` tokens from the bucket.
     * @param {number} [cost=1] Number of tokens required
     * @param {number} [now=Date.now()] Current timestamp in ms
     * @returns {{
     *   allowed: boolean,
     *   remainingTokens: number,
     *   capacity: number,
     *   refillRatePerSecond: number,
     *   retryAfterSeconds: number,
     *   resetSeconds: number
     * }}
     */
    consume(cost = 1, now = Date.now()) {
        this.refill(now);
        const required = Math.max(0, Math.min(this.capacity, Number(cost) || 1));

        if (this.tokens >= required) {
            this.tokens -= required;
            const deficitToFull = Math.max(0, this.capacity - this.tokens);
            const resetSeconds = Math.ceil(deficitToFull / this.refillRatePerSecond);
            return {
                allowed: true,
                remainingTokens: Math.floor(this.tokens * 100) / 100,
                capacity: this.capacity,
                refillRatePerSecond: this.refillRatePerSecond,
                retryAfterSeconds: 0,
                resetSeconds
            };
        }

        const deficit = required - this.tokens;
        const retryAfterSeconds = Math.max(1, Math.ceil(deficit / this.refillRatePerSecond));
        const deficitToFull = Math.max(0, this.capacity - this.tokens);
        const resetSeconds = Math.ceil(deficitToFull / this.refillRatePerSecond);

        return {
            allowed: false,
            remainingTokens: Math.floor(this.tokens * 100) / 100,
            capacity: this.capacity,
            refillRatePerSecond: this.refillRatePerSecond,
            retryAfterSeconds,
            resetSeconds
        };
    }
}

// Global registry of active rate-limiter stores for diagnostics/cleanup
const activeStores = new Map();

/**
 * Extracts a normalized client identifier (IP + optional authenticated user ID).
 * @param {import('express').Request} req
 * @param {string} prefix
 * @returns {string}
 */
function defaultKeyGenerator(req, prefix = 'global') {
    const forwarded = req.headers?.['x-forwarded-for'];
    const rawIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
        || req.ip
        || req.socket?.remoteAddress
        || 'unknown-ip';
    const userId = req.user?.id ? `:u_${req.user.id}` : '';
    return `${prefix}:${rawIp}${userId}`;
}

/**
 * Creates an Express middleware implementing the Token Bucket rate-limiting algorithm.
 *
 * @param {Object} options
 * @param {string} [options.name='api'] Bucket namespace identifier
 * @param {number} [options.capacity=60] Maximum burst tokens the bucket can hold
 * @param {number} [options.refillRate=1] Tokens added per `refillIntervalMs` (default per 1000ms = 1s)
 * @param {number} [options.refillIntervalMs=1000] Interval in ms for `refillRate` (default 1000ms)
 * @param {number|((req: import('express').Request) => number)} [options.cost=1] Tokens consumed per request
 * @param {((req: import('express').Request) => boolean)} [options.skip] Optional predicate to bypass limiting
 * @param {((req: import('express').Request) => string)} [options.keyGenerator] Optional custom bucket key resolver
 * @param {Object|string|((req: import('express').Request, res: import('express').Response, info: Object) => any)} [options.message] Error payload on 429
 * @param {number} [options.idleTtlMs=600000] TTL before idle client buckets are garbage-collected
 * @returns {import('express').RequestHandler}
 */
function createTokenBucketLimiter(options = {}) {
    const {
        name = 'api',
        capacity = 60,
        refillRate = 1,
        refillIntervalMs = 1000,
        cost = 1,
        skip = null,
        keyGenerator = null,
        message = { message: 'Too many requests, please wait for your token bucket to refill.' },
        idleTtlMs = 10 * 60 * 1000
    } = options;

    const refillRatePerSecond = (Number(refillRate) || 1) / (Math.max(1, Number(refillIntervalMs) || 1000) / 1000);
    const buckets = new Map();
    activeStores.set(name, {
        name,
        capacity,
        refillRatePerSecond,
        buckets
    });

    // Periodic garbage collection for stale/full client buckets
    const cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets.entries()) {
            if (now - bucket.lastAccessTimestamp > idleTtlMs) {
                buckets.delete(key);
            }
        }
    }, Math.min(idleTtlMs, 60 * 1000));

    if (typeof cleanupTimer.unref === 'function') {
        cleanupTimer.unref();
    }

    return function tokenBucketMiddleware(req, res, next) {
        try {
            if (typeof skip === 'function' && skip(req)) {
                return next();
            }

            const key = typeof keyGenerator === 'function'
                ? keyGenerator(req)
                : defaultKeyGenerator(req, name);

            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = new TokenBucket(capacity, refillRatePerSecond);
                buckets.set(key, bucket);
            }

            const requestCost = typeof cost === 'function'
                ? Math.max(1, Number(cost(req)) || 1)
                : Math.max(1, Number(cost) || 1);

            const result = bucket.consume(requestCost);

            // Standard & Token Bucket diagnostic headers
            res.setHeader('X-RateLimit-Algorithm', 'TokenBucket');
            res.setHeader('X-RateLimit-Bucket', name);
            res.setHeader('X-RateLimit-Limit', String(result.capacity));
            res.setHeader('X-RateLimit-Remaining', String(Math.max(0, Math.floor(result.remainingTokens))));
            res.setHeader('X-RateLimit-Refill-Rate', `${Number(result.refillRatePerSecond.toFixed(4))}/s`);
            res.setHeader('X-RateLimit-Reset', String(result.resetSeconds));

            if (!result.allowed) {
                res.setHeader('Retry-After', String(result.retryAfterSeconds));
                const payload = typeof message === 'function'
                    ? message(req, res, result)
                    : typeof message === 'string'
                        ? { message, retryAfterSeconds: result.retryAfterSeconds }
                        : {
                            ...message,
                            retryAfterSeconds: result.retryAfterSeconds,
                            tokenBucket: {
                                bucket: name,
                                capacity: result.capacity,
                                remainingTokens: result.remainingTokens,
                                refillRatePerSecond: Number(result.refillRatePerSecond.toFixed(4)),
                                requiredTokens: requestCost,
                                retryAfterSeconds: result.retryAfterSeconds
                            }
                        };
                return res.status(429).json(payload);
            }

            return next();
        } catch (err) {
            // Fail open on unexpected limiter error so production traffic is never bricked
            console.error(`[TOKEN-BUCKET:${name}] Error:`, err.message);
            return next();
        }
    };
}

/**
 * Workshop Bulk Production Capacity Token Bucket Calculator
 *
 * Models the embroidery workshop's batch production capacity as a Token Bucket:
 * - `capacity` = `maxBulkPiecesPerPeriod` (e.g., 50 pieces burst capacity)
 * - `period` = `'week'` (7 days) or `'day'` (1 day)
 * - `refillRatePerDay` = `capacity / periodDays` (continuous token replenishment per day)
 * - `refillRatePerHour` = `refillRatePerDay / 10` (across 10 open store hours/day)
 * - `consumedTokens` = `queuedBulkPieces` currently in queue
 * - `availableTokens` = `Math.max(0, capacity - queuedBulkPieces)` immediate production slots
 * - For an incoming order of `requestedPieces`:
 *     - `immediateTokensUsed = Math.min(availableTokens, requestedPieces)`
 *     - `deficitTokens = Math.max(0, requestedPieces + Math.max(0, queuedBulkPieces - capacity) - availableTokens)`
 *     - `tokenRefillWaitDays = Math.ceil(deficitTokens / refillRatePerDay)`
 *
 * @param {Object} params
 * @param {number} [params.maxBulkPiecesPerPeriod=50] Bucket capacity (max burst pieces per period)
 * @param {string} [params.batchThrottlePeriod='week'] Refill period ('week' | 'day')
 * @param {number} [params.queuedBulkPieces=0] Currently active queued bulk pieces consuming bucket tokens
 * @param {number} [params.requestedPieces=0] Optional incoming order quantity to simulate consumption
 * @param {number} [params.preOrderPrepDays=0] Optional extra preparation lead days when stock is exceeded
 * @returns {Object} Token bucket state and wait-time projection
 */
function calculateProductionTokenBucket({
    maxBulkPiecesPerPeriod = 50,
    batchThrottlePeriod = 'week',
    queuedBulkPieces = 0,
    requestedPieces = 0,
    preOrderPrepDays = 0
} = {}) {
    const capacity = Math.max(1, Number(maxBulkPiecesPerPeriod) || 50);
    const period = batchThrottlePeriod === 'day' ? 'day' : 'week';
    const periodDays = period === 'week' ? 7 : 1;

    // Continuous token refill rate
    const refillRatePerDay = capacity / periodDays;
    const refillRatePerHour = refillRatePerDay / 10; // 10 store operating hours (10 AM - 8 PM)

    const queued = Math.max(0, Number(queuedBulkPieces) || 0);
    const requested = Math.max(0, Number(requestedPieces) || 0);
    const prepDays = Math.max(0, Number(preOrderPrepDays) || 0);

    // Available immediate tokens in the bucket right now
    const availableTokens = Math.max(0, capacity - queued);
    // Backlog overflow if queued pieces already exceed 1 full bucket capacity
    const existingBacklogDeficit = Math.max(0, queued - capacity);

    // If a customer places an order for `requested` pieces:
    const immediateTokensCovered = Math.min(availableTokens, requested);
    const uncoveredOrderTokens = Math.max(0, requested - availableTokens);
    const totalDeficitTokens = existingBacklogDeficit + uncoveredOrderTokens;

    // Exact refill wait time in days to replenish the deficit tokens
    const refillWaitDays = totalDeficitTokens > 0
        ? Math.ceil(totalDeficitTokens / refillRatePerDay)
        : 0;

    // Base production time for the order itself (at least 1 period window if bulk, or proportional days)
    const activeOrderProductionDays = requested > 0
        ? Math.max(1, Math.ceil((queued + requested) / refillRatePerDay))
        : (queued > 0 ? Math.ceil(queued / refillRatePerDay) : 0);

    const totalEstimatedDays = activeOrderProductionDays + prepDays;
    const utilizationPercent = Math.min(100, Math.round((queued / capacity) * 100));

    return {
        algorithm: 'TokenBucket',
        capacity,
        period,
        periodDays,
        availableTokens,
        consumedTokens: Math.min(capacity, queued),
        queuedBulkPieces: queued,
        overflowDeficitTokens: existingBacklogDeficit,
        refillRatePerDay: Number(refillRatePerDay.toFixed(2)),
        refillRatePerHour: Number(refillRatePerHour.toFixed(2)),
        utilizationPercent,
        isBucketDepleted: availableTokens === 0,
        // Order-specific simulation if requestedPieces > 0
        requestedPieces: requested,
        immediateTokensCovered,
        deficitTokensForOrder: totalDeficitTokens,
        refillWaitDays,
        preOrderPrepDays: prepDays,
        totalEstimatedDays
    };
}

/**
 * Returns diagnostic snapshot of all active HTTP Token Bucket limiters.
 */
function getRateLimiterDiagnostics() {
    const summary = {};
    for (const [name, store] of activeStores.entries()) {
        summary[name] = {
            capacity: store.capacity,
            refillRatePerSecond: Number(store.refillRatePerSecond.toFixed(4)),
            activeClientBuckets: store.buckets.size
        };
    }
    return summary;
}

module.exports = {
    TokenBucket,
    createTokenBucketLimiter,
    calculateProductionTokenBucket,
    getRateLimiterDiagnostics
};

