/**
 * Dynamic Workshop Queue & Pickup Scheduling Engine
 * Calibrated specifically for Eds Towels & Caps (Pacific Mall Lucena)
 * 
 * Shop Operating Parameters:
 * - Store Hours: 10:00 AM - 8:00 PM (10 hours total elapsed)
 * - Lunch Break: 12:00 PM - 12:15 PM (15 minutes pause)
 * - Active Production Time: 585 minutes / day (120 min morning + 465 min afternoon)
 * - Artisan Stitch Rate: 12 seconds per letter (5 letters = 1 minute)
 * - Standard Handling: ~1.0 minute per piece (hooping, alignment, trim & pack)
 */

const SHOP_OPEN_HOUR = 10;       // 10:00 AM
const SHOP_OPEN_MINUTE = 0;
const SHOP_CLOSE_HOUR = 20;      // 8:00 PM
const SHOP_CLOSE_MINUTE = 0;
const LUNCH_START_HOUR = 12;     // 12:00 PM
const LUNCH_START_MINUTE = 0;
const LUNCH_END_HOUR = 12;       // 12:15 PM
const LUNCH_END_MINUTE = 15;

/**
 * Checks whether a given Date falls inside the 15-minute lunch break.
 * @param {Date} date 
 * @returns {boolean}
 */
function isLunchBreak(date) {
    const h = date.getHours();
    const m = date.getMinutes();
    const curMins = h * 60 + m;
    const lunchStart = LUNCH_START_HOUR * 60 + LUNCH_START_MINUTE;
    const lunchEnd = LUNCH_END_HOUR * 60 + LUNCH_END_MINUTE;
    return curMins >= lunchStart && curMins < lunchEnd;
}

/**
 * Checks whether a given Date falls within open store hours (10:00 AM - 8:00 PM).
 * @param {Date} date 
 * @returns {boolean}
 */
function isStoreOpen(date) {
    const h = date.getHours();
    const m = date.getMinutes();
    const curMins = h * 60 + m;
    const openMins = SHOP_OPEN_HOUR * 60 + SHOP_OPEN_MINUTE;
    const closeMins = SHOP_CLOSE_HOUR * 60 + SHOP_CLOSE_MINUTE;
    return curMins >= openMins && curMins < closeMins;
}

/**
 * Fast-forwards a Date to the next active workshop operating minute:
 * - If before 10:00 AM -> 10:00 AM today
 * - If at/after 8:00 PM -> 10:00 AM tomorrow
 * - If during 12:00 PM - 12:15 PM lunch -> 12:15 PM today
 * @param {Date} date 
 * @returns {Date} Adjusted active Date
 */
function fastForwardToActiveTime(date) {
    const cur = new Date(date);
    const h = cur.getHours();
    const m = cur.getMinutes();
    const curMins = h * 60 + m;
    const openMins = SHOP_OPEN_HOUR * 60 + SHOP_OPEN_MINUTE;
    const closeMins = SHOP_CLOSE_HOUR * 60 + SHOP_CLOSE_MINUTE;
    const lunchStart = LUNCH_START_HOUR * 60 + LUNCH_START_MINUTE;
    const lunchEnd = LUNCH_END_HOUR * 60 + LUNCH_END_MINUTE;

    if (curMins < openMins) {
        // Before 10:00 AM today -> advance to 10:00 AM today
        cur.setHours(SHOP_OPEN_HOUR, SHOP_OPEN_MINUTE, 0, 0);
        return cur;
    }

    if (curMins >= closeMins) {
        // At or after 8:00 PM -> advance to 10:00 AM tomorrow
        cur.setDate(cur.getDate() + 1);
        cur.setHours(SHOP_OPEN_HOUR, SHOP_OPEN_MINUTE, 0, 0);
        return cur;
    }

    if (curMins >= lunchStart && curMins < lunchEnd) {
        // Inside lunch break -> advance to 12:15 PM today
        cur.setHours(LUNCH_END_HOUR, LUNCH_END_MINUTE, 0, 0);
        return cur;
    }

    return cur;
}

/**
 * Adds a specific number of active production minutes to a starting timestamp,
 * honoring store hours (10:00 AM - 8:00 PM), the 15-minute lunch break, and overnight rollovers.
 * 
 * @param {Date} startTime Initial timestamp (defaults to now)
 * @param {number} activeMinutesNeeded Production minutes to consume
 * @returns {Date} Target completion Date
 */
function addActiveProductionMinutes(startTime, activeMinutesNeeded) {
    let cur = fastForwardToActiveTime(startTime || new Date());
    let remaining = Math.max(1, Math.ceil(activeMinutesNeeded));

    while (remaining > 0) {
        cur = fastForwardToActiveTime(cur);

        const h = cur.getHours();
        const m = cur.getMinutes();
        const curMins = h * 60 + m;
        const lunchStart = LUNCH_START_HOUR * 60 + LUNCH_START_MINUTE;
        const closeMins = SHOP_CLOSE_HOUR * 60 + SHOP_CLOSE_MINUTE;

        // How many active minutes are available in the current block before next interruption?
        let minutesAvailableInBlock;
        if (curMins < lunchStart) {
            // Morning block: time until 12:00 PM lunch
            minutesAvailableInBlock = lunchStart - curMins;
        } else {
            // Afternoon block: time until 8:00 PM closing
            minutesAvailableInBlock = closeMins - curMins;
        }

        if (remaining <= minutesAvailableInBlock) {
            // Remaining work completes within current active block
            cur.setMinutes(cur.getMinutes() + remaining);
            remaining = 0;
        } else {
            // Consume entire block, advance to boundary, and continue in next block
            cur.setMinutes(cur.getMinutes() + minutesAvailableInBlock);
            remaining -= minutesAvailableInBlock;
            // Next iteration will automatically fast-forward across lunch or overnight closing
        }
    }

    return cur;
}

/**
 * Calculates human-readable pickup label (e.g., "Today at 2:30 PM", "Tomorrow at 10:15 AM")
 * @param {Date} targetDate 
 * @param {Date} baseDate 
 * @returns {string}
 */
function formatPickupLabel(targetDate, baseDate = new Date()) {
    const isSameDay = targetDate.toDateString() === baseDate.toDateString();
    
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = targetDate.toDateString() === tomorrow.toDateString();

    const timeStr = targetDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    if (isSameDay) {
        return `Today at ${timeStr}`;
    }
    if (isTomorrow) {
        return `Tomorrow at ${timeStr}`;
    }
    const dayStr = targetDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
    return `${dayStr} at ${timeStr}`;
}

/**
 * Estimates production time per order based on artisan sewing machine speeds:
 * - secondsPerLetter (default 12s = 0.20 minutes)
 * - handlingMinutes (default 1.0m: 0.6 hoop + 0.4 trim/pack)
 * - capOffsetMinutes (default 0.5m)
 * 
 * @param {Object} order 
 * @param {Object} [calibration] Optional calibration overrides from SystemSettings
 * @returns {number} Estimated minutes
 */
function estimateArtisanProductionTime(order, calibration = {}) {
    if (!order) return 2;

    const secPerLetter = typeof calibration.secondsPerLetter === 'number' ? calibration.secondsPerLetter : 12.0;
    const letterRateMins = secPerLetter / 60.0;
    const handlingMins = typeof calibration.handlingMinutes === 'number' ? calibration.handlingMinutes : 1.0;
    const capOffset = typeof calibration.capOffsetMinutes === 'number' ? calibration.capOffsetMinutes : 0.5;

    let items = [];
    if (Array.isArray(order.items)) {
        items = order.items;
    } else if (order.items && typeof order.items === 'object') {
        items = [order.items];
    }

    if (items.length === 0) {
        // Fallback: check top-level text / monogram / namesList
        const namesList = order.personalization?.namesList || order.namesList;
        if (Array.isArray(namesList) && namesList.length > 0) {
            let total = 0;
            namesList.forEach(name => {
                const letters = String(name || '').replace(/\s+/g, '').length || 5;
                total += handlingMins + (letters * letterRateMins);
            });
            return Math.max(2, Math.ceil(total));
        }

        const rawText = order.personalization?.text || order.monogramText || '';
        const letters = rawText.replace(/\s+/g, '').length || 5;
        const stitchMins = letters * letterRateMins;
        return Math.max(2, Math.ceil(handlingMins + stitchMins));
    }

    let totalMinutes = 0;
    items.forEach(item => {
        const qty = Math.max(1, item.quantity || 1);
        const designLower = (item.name || item.design || '').toLowerCase();
        const isCap = designLower.includes('cap') || designLower.includes('hat');
        const capBonus = isCap ? capOffset : 0.0;

        // Check if item has an explicit list of different names
        const namesList = item.personalization?.namesList || item.namesList;
        if (Array.isArray(namesList) && namesList.length > 0) {
            namesList.forEach(name => {
                const letters = String(name || '').replace(/\s+/g, '').length || 5;
                totalMinutes += handlingMins + (letters * letterRateMins) + capBonus;
            });
            return;
        }

        const itemText = (item.personalization?.text || '').replace(/\s+/g, '');
        const hasMonogram = itemText.length > 0;
        
        let perItemMinutes = 0;
        if (hasMonogram) {
            const stitchTime = itemText.length * letterRateMins;
            perItemMinutes = handlingMins + stitchTime + capBonus;
        } else {
            // Plain retail item: inspection & packaging only
            perItemMinutes = 0.5;
        }

        totalMinutes += perItemMinutes * qty;
    });

    return Math.max(2, Math.ceil(totalMinutes));
}

/**
 * Main Scheduler API:
 * Calculates exact pickup schedule and ready timestamp given current shop state.
 * 
 * @param {Object} params
 * @param {number} params.orderDurationMinutes Estimated stitch duration of incoming order
 * @param {number} params.queueBacklogMinutes Sum of active orders ahead in queue
 * @param {number} params.activeMachines Count of running/idle machines (default: 1)
 * @param {boolean} params.isExpress True if order qualifies for express priority (1-3 items)
 * @param {Date} [params.startTime] Starting time anchor (defaults to now)
 * @param {Object} [params.calibration] Dynamic workshop calibration parameters
 * @returns {Object} { estimatedReadyDate, readyLabel, estimatedWaitMinutes, isOvernightRollover, ordersAhead }
 */
function calculatePickupSchedule({
    orderDurationMinutes = 2,
    queueBacklogMinutes = 0,
    activeMachines = 1,
    isExpress = false,
    startTime = new Date(),
    calibration = {}
}) {
    const machines = Math.max(1, activeMachines);
    
    // Real workshop FIFO queue calculation:
    // Every order placed ahead in the queue requires active artisan machine time.
    // Total backlog minutes are distributed across functional embroidery machines.
    const effectiveBacklog = Math.ceil(Math.max(0, queueBacklogMinutes) / machines);

    // Total production time = waiting in queue + time to embroider incoming order
    const orderStitchMinutes = Math.max(2, Math.ceil(orderDurationMinutes));
    const activeMinutesNeeded = effectiveBacklog + orderStitchMinutes;
    const estimatedReadyDate = addActiveProductionMinutes(startTime, activeMinutesNeeded);

    const nowMs = startTime.getTime();
    const readyMs = estimatedReadyDate.getTime();
    const totalElapsedWaitMinutes = Math.max(1, Math.round((readyMs - nowMs) / 60000));

    const readyLabel = formatPickupLabel(estimatedReadyDate, startTime);
    const isOvernightRollover = estimatedReadyDate.toDateString() !== startTime.toDateString();

    return {
        estimatedReadyDate,
        readyLabel,
        estimatedWaitMinutes: totalElapsedWaitMinutes,
        activeProductionMinutes: activeMinutesNeeded,
        isOvernightRollover,
        isStoreOpenNow: isStoreOpen(startTime) && !isLunchBreak(startTime)
    };
}

/**
 * Mathematically slices a large bulk order into daily production batches
 * so the bulk order does not monopolize the machine in one continuous multi-day block.
 * 
 * @param {Object} params
 * @param {number} params.totalPieces Total items in order
 * @param {number} [params.maxPiecesPerDay] Daily bulk cap (default: 50)
 * @param {number} [params.minutesPerPiece] Average stitch time per piece
 * @returns {Array<Object>} List of daily batch slices
 */
function sliceBulkOrderIntoDailyBatches({ totalPieces = 1, maxPiecesPerDay = 50, minutesPerPiece = 2.0 }) {
    const cap = Math.max(1, maxPiecesPerDay);
    const batches = [];
    let remaining = Math.max(1, totalPieces);
    let day = 0;

    while (remaining > 0) {
        const batchPieces = Math.min(remaining, cap);
        batches.push({
            dayOffset: day,
            pieces: batchPieces,
            estimatedMinutes: Math.ceil(batchPieces * minutesPerPiece)
        });
        remaining -= batchPieces;
        day++;
    }

    return batches;
}

/**
 * Handover identification is handled via claim slip code (#A-XXXX) attached to each
 * packaged order placed on the side, rather than fixed shelf cubby numbers.
 * @returns {null}
 */
function assignNextAvailableCubby() {
    return null;
}

module.exports = {
    SHOP_OPEN_HOUR,
    SHOP_CLOSE_HOUR,
    LUNCH_START_HOUR,
    LUNCH_START_MINUTE,
    LUNCH_END_HOUR,
    LUNCH_END_MINUTE,
    isStoreOpen,
    isLunchBreak,
    fastForwardToActiveTime,
    addActiveProductionMinutes,
    formatPickupLabel,
    estimateArtisanProductionTime,
    calculatePickupSchedule,
    sliceBulkOrderIntoDailyBatches,
    assignNextAvailableCubby
};
