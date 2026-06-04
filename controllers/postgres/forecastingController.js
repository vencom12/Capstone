const prisma = require('../../utils/prisma');
const fetch = global.fetch || require('node-fetch');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');
const { logAiChange } = require('../../utils/aiLogger');
const { fetchGroqChatWithFallback } = require('../../utils/groqClient');

// Simple global in-memory cache for BI suggestions
let biCache = null;
let cacheTime = null;
let lastForceRefresh = null;

// Helper to perform linear regression projections
function calculateLinearProjections(dataPoints, forecastDays = 7) {
    const n = dataPoints.length;
    if (n < 2) {
        const val = n === 1 ? dataPoints[0] : 0;
        return Array.from({ length: forecastDays }, () => val);
    }
    
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += dataPoints[i];
        sumXY += i * dataPoints[i];
        sumXX += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const projections = [];
    for (let j = 0; j < forecastDays; j++) {
        const nextX = n + j;
        const projectedVal = Math.max(0, slope * nextX + intercept);
        projections.push(projectedVal);
    }
    return projections;
}

async function getActiveSuggestionsInternal(force = false) {
    const now = new Date();
    
    if (force) {
        // Throttling: limit force refresh to once every 5 minutes
        if (lastForceRefresh && (now - lastForceRefresh < 5 * 60 * 1000)) {
            console.log('[BI Cache] Throttling active, serving from cache.');
        } else {
            console.log('[BI Cache] Force refresh triggered. Invalidating cache.');
            lastForceRefresh = now;
            biCache = null;
        }
    }

    // Cache hit (1 hour duration)
    if (biCache && cacheTime && (now - cacheTime < 60 * 60 * 1000)) {
        console.log('[BI Cache] Cache hit. Serving cached recommendations.');
        return biCache;
    }

    const date14dAgo = new Date(new Date().setDate(now.getDate() - 14));
    const date365dAgo = new Date(new Date().setDate(now.getDate() - 365));

    console.log('[BI Engine] Querying 365-day database aggregates...');

    // 2. High-performance DB-level aggregations
    const [
        trafficRollups,
        orderRollups,
        orders14d,
        inventory,
        products,
        totalOrders
    ] = await Promise.all([
        // Aggregate daily site traffic visits (365 days)
        prisma.$queryRaw`
            SELECT 
                TO_CHAR(timestamp, 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS count
            FROM "SiteTraffic"
            WHERE timestamp >= ${date365dAgo}
            GROUP BY TO_CHAR(timestamp, 'YYYY-MM-DD')
        `,
        // Aggregate daily orders count and revenue (365 days)
        prisma.$queryRaw`
            SELECT 
                TO_CHAR(COALESCE(date, "createdAt"), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS count,
                SUM("totalAmount")::float AS revenue
            FROM "Order"
            WHERE COALESCE(date, "createdAt") >= ${date365dAgo} AND status != 'Order Canceled'
            GROUP BY TO_CHAR(COALESCE(date, "createdAt"), 'YYYY-MM-DD')
        `,
        // Fetch raw items JSON only for safety stock velocities (last 14 days)
        prisma.order.findMany({
            where: {
                date: { gte: date14dAgo },
                NOT: { status: 'Order Canceled' }
            },
            select: { items: true, createdAt: true }
        }),
        prisma.inventory.findMany(),
        prisma.product.findMany(),
        prisma.order.count()
    ]);

    // Process rollups into maps for fast O(1) lookups
    const trafficMap = {};
    let totalVisits365D = 0;
    trafficRollups.forEach(r => {
        trafficMap[r.day] = r.count;
        totalVisits365D += r.count;
    });

    const orderMap = {};
    let totalOrders365D = 0;
    let totalRevenue365D = 0;
    orderRollups.forEach(r => {
        orderMap[r.day] = { count: r.count, revenue: r.revenue };
        totalOrders365D += r.count;
        totalRevenue365D += r.revenue;
    });

    // 3. Perform Mathematical Projections (Daily trends for last 14 days to project next 7 days)
    const dailyVisits = Array(14).fill(0);
    const dailyOrders = Array(14).fill(0);
    const dailyRevenue = Array(14).fill(0);
    const dateLabels = [];

    // Generate past 14 days date filters
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dateLabels.push(dateStr);
    }

    dateLabels.forEach((dateStr, idx) => {
        dailyVisits[idx] = trafficMap[dateStr] || 0;
        const oStats = orderMap[dateStr] || { count: 0, revenue: 0 };
        dailyOrders[idx] = oStats.count;
        dailyRevenue[idx] = oStats.revenue;
    });

    // Forecast the next 7 days using linear regression
    const projectedVisits = calculateLinearProjections(dailyVisits, 7);
    const projectedOrders = calculateLinearProjections(dailyOrders, 7);
    const projectedRevenue = calculateLinearProjections(dailyRevenue, 7);

    // 4. Inventory Spools Stock Velocity & safety threshold calculations (last 14 days)
    const productRecipes = {};
    products.forEach(p => {
        productRecipes[p.name.toLowerCase()] = p.recipe || [];
    });

    const materialConsumption = {};
    inventory.forEach(inv => {
        materialConsumption[inv.id] = 0;
        materialConsumption[inv.item.toLowerCase()] = 0;
    });

    // Sum consumption of materials from orders in the last 14 days
    orders14d.forEach(order => {
        const items = order.items || [];
        items.forEach(item => {
            const recipe = productRecipes[item.name.toLowerCase()] || [];
            recipe.forEach(recipeItem => {
                const key = recipeItem.inventoryId || recipeItem.name.toLowerCase();
                const qty = (item.quantity || 1) * (recipeItem.quantity || 1);
                if (materialConsumption[key] !== undefined) {
                    materialConsumption[key] += qty;
                } else {
                    materialConsumption[recipeItem.name.toLowerCase()] = (materialConsumption[recipeItem.name.toLowerCase()] || 0) + qty;
                }
            });
        });
    });

    // Calculate Safety Stock Velocity (daily depletion rate)
    const safetyStockProjections = inventory.map(inv => {
        const consumption = materialConsumption[inv.id] || materialConsumption[inv.item.toLowerCase()] || 0;
        const dailyVelocity = consumption / 14;
        const daysRemaining = dailyVelocity > 0 ? (inv.count / dailyVelocity) : 9999;
        return {
            id: inv.id,
            item: inv.item,
            count: inv.count,
            unit: inv.unit,
            minThreshold: inv.minThreshold,
            dailyVelocity,
            daysRemaining: daysRemaining === 9999 ? 'Stable' : parseFloat(daysRemaining.toFixed(1)),
            isAlarmed: inv.count <= inv.minThreshold,
            depletionRisk: daysRemaining <= 5 ? 'Critical' : (daysRemaining <= 10 ? 'Warning' : 'Low')
        };
    });

    // 5. Heuristic Suggestions Generator (Robust Local Fallback)
    const fallbackSuggestions = [];

    // restock alarms
    for (const proj of safetyStockProjections) {
        if (proj.isAlarmed || proj.depletionRisk === 'Critical' || proj.depletionRisk === 'Warning') {
            const suggestAmount = Math.max(10, proj.minThreshold * 2 - proj.count);
            
            // Phase 3: Predictive Procurement - Auto-draft PO for Critical Items
            if (proj.depletionRisk === 'Critical' || proj.isAlarmed) {
                const existingDraft = await prisma.purchaseOrder.findFirst({
                    where: { inventoryId: proj.id, status: 'Draft' }
                });
                if (!existingDraft) {
                    await prisma.purchaseOrder.create({
                        data: {
                            inventoryId: proj.id,
                            quantity: suggestAmount,
                            status: 'Draft',
                            estimatedCost: suggestAmount * 5.0 // Estimated cost mock
                        }
                    });
                }
            }

            fallbackSuggestions.push({
                id: `SUG-INV-${proj.id}`,
                title: `Restock Spools: ${proj.item}`,
                category: 'Inventory',
                severity: proj.depletionRisk === 'Critical' ? 'critical' : 'warning',
                description: `Stock level for spools of "${proj.item}" is currently at ${proj.count} ${proj.unit} (Safety Limit: ${proj.minThreshold}). Based on order consumption velocity of ${proj.dailyVelocity.toFixed(2)} spools/day, stock is projected to deplete in ${proj.daysRemaining} days. Recommend restocking immediately.`,
                actionText: `Restock +${suggestAmount} Spools`,
                action: {
                    type: 'restock',
                    payload: {
                        inventoryId: proj.id,
                        itemName: proj.item,
                        amount: suggestAmount
                    }
                }
            });
        }
    }

    // pricing optimizations based on sales velocity in the last 14 days
    const orderCounts = {};
    orders14d.forEach(order => {
        const items = order.items || [];
        items.forEach(item => {
            orderCounts[item.name.toLowerCase()] = (orderCounts[item.name.toLowerCase()] || 0) + (item.quantity || 1);
        });
    });

    products.forEach(p => {
        const ordersQty = orderCounts[p.name.toLowerCase()] || 0;
        const dailyVelocity = ordersQty / 14;
        
        if (dailyVelocity > 0.3) {
            const originalPrice = p.price;
            const suggestedPrice = parseFloat((originalPrice * 1.1).toFixed(2));
            fallbackSuggestions.push({
                id: `SUG-PRICE-INC-${p.id}`,
                title: `A/B Price Testing: ${p.name}`,
                category: 'Pricing',
                severity: 'info',
                description: `High sales velocity detected for design "${p.name}" (${dailyVelocity.toFixed(2)} orders/day). Current price is $${originalPrice.toFixed(2)}. Suggest running an A/B test with a 10% price increase ($${suggestedPrice.toFixed(2)}) to model price elasticity and maximize margin.`,
                actionText: `Start A/B Test ($${originalPrice.toFixed(2)} vs $${suggestedPrice.toFixed(2)})`,
                action: {
                    type: 'startAbTest',
                    payload: {
                        productId: p.id,
                        variantAPrice: originalPrice,
                        variantBPrice: suggestedPrice
                    }
                }
            });
        } else if (ordersQty === 0 && p.count > 10) {
            const originalPrice = p.price;
            const suggestedPrice = parseFloat((originalPrice * 0.85).toFixed(2));
            fallbackSuggestions.push({
                id: `SUG-PRICE-DEC-${p.id}`,
                title: `Clearance Discount: ${p.name}`,
                category: 'Pricing',
                severity: 'info',
                description: `Design "${p.name}" is slow-moving with 0 orders in the last 14 days. Current stockpile count is ${p.count}. Suggest temporary 15% markdown to $${suggestedPrice.toFixed(2)} to stimulate sales and free up inventory resources.`,
                actionText: `Apply 15% Discount ($${suggestedPrice.toFixed(2)})`,
                action: {
                    type: 'updatePrice',
                    payload: {
                        productId: p.id,
                        price: suggestedPrice
                    }
                }
            });
        }
    });

    // backlog priority escalations
    const pendingBacklog = await prisma.order.findMany({
        where: {
            status: { in: ['Pending Payment', 'Preparing Order', 'In Queue'] },
            isRush: false
        },
        take: 5,
        orderBy: { createdAt: 'asc' }
    });

    pendingBacklog.forEach(order => {
        const ageInHours = (now - new Date(order.createdAt)) / (1000 * 60 * 60);
        if (ageInHours > 24) {
            fallbackSuggestions.push({
                id: `SUG-OPS-${order.id}`,
                title: `Escalate Order Prioritization: ${order.orderId}`,
                category: 'Operations',
                severity: 'warning',
                description: `Order "${order.orderId}" for client "${order.client || 'Valued Customer'}" has been pending for ${Math.round(ageInHours)} hours in status "${order.status}". Suggest escalating to priority rush to prevent customer satisfaction SLA breach.`,
                actionText: `Prioritize Order (Rush)`,
                action: {
                    type: 'prioritizeOrder',
                    payload: {
                        orderId: order.id,
                        orderTicketId: order.orderId,
                        isRush: true,
                        priorityScore: 20
                    }
                }
            });
        }
    });

    // 6. Try Groq AI Suggestion Engine (with fallback)
    let suggestions = [...fallbackSuggestions];
    const apiKey = process.env.GROQ_API_KEY;

    if (apiKey) {
        try {
            let settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
            const GROQ_API_URL = settings?.aiProviderUrl || 'https://api.groq.com/openai/v1/chat/completions';
            const MODEL = settings?.aiChatModel || 'llama-3.3-70b-versatile';

            const systemPrompt = `You are StitchMaster AI, the strategic Business Intelligence advisor for Stitch-Opt.
You are analyzing historical traffic, sales orders, and raw inventory levels to recommend actions.

Here is the current business status:
- Total traffic visits (last 365 days): ${totalVisits365D}
- Total orders (last 365 days): ${totalOrders365D}
- Total realized revenue (last 365 days): $${totalRevenue365D.toFixed(2)}
- Safety spools status & depletion days: ${JSON.stringify(safetyStockProjections)}
- Product price lists & sales velocities: ${JSON.stringify(products.map(p => ({ id: p.id, name: p.name, price: p.price, stock: p.count, velocity: (orderCounts[p.name.toLowerCase()] || 0) / 14 })))}

We have generated these automated baseline suggestions:
${JSON.stringify(fallbackSuggestions, null, 2)}

Your task is to review these baseline suggestions, consolidate them, or refine their strategic reasoning to make them feel highly professional and descriptive.
Format your output as a raw JSON array of objects. Do not include markdown code block formatting (like \`\`\`json).
Each object in the array must contain:
- id: String (unique suggestion ID)
- title: String (compelling, short strategic title)
- category: "Inventory" | "Pricing" | "Operations" | "Demand"
- severity: "info" | "warning" | "critical"
- description: String (clear strategic reasoning referencing specific numbers, e.g. visits, spools count, depletion rate, or pending hours)
- actionText: String (label for the implementation action button)
- action: Object (the execution details, which must match one of the action formats from the baseline suggestions: restock, updatePrice, prioritizeOrder)

Return ONLY the valid JSON array of objects.`;

            const data = await fetchGroqChatWithFallback(apiKey, GROQ_API_URL, MODEL, {
                messages: [{ role: 'user', content: systemPrompt }],
                temperature: 0.1
            });

            if (data) {
                if (data.choices && data.choices[0] && data.choices[0].message?.content) {
                    const contentText = data.choices[0].message.content.trim();
                    const cleanJson = contentText.replace(/^```json/, '').replace(/```$/, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    if (Array.isArray(parsed)) {
                        suggestions = parsed;
                    }
                }
            }
        } catch (err) {
            console.warn('[BI Advisor Warning] LLM Suggestion failed, utilizing baseline heuristics:', err.message);
        }
    }

    const metrics = {
        totalVisits: totalVisits365D,
        avgOrderValue: totalOrders365D > 0 ? (totalRevenue365D / totalOrders365D) : 0,
        conversionRate: totalVisits365D > 0 ? (totalOrders365D / totalVisits365D) : 0,
    };

    const projections = {
        labels: dateLabels,
        visits: dailyVisits,
        orders: dailyOrders,
        revenue: dailyRevenue,
        forecast: {
            visits: projectedVisits,
            orders: projectedOrders,
            revenue: projectedRevenue
        }
    };

    // Filter out declined suggestions
    try {
        // Prune recommendations older than 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await prisma.declinedRecommendation.deleteMany({
            where: { declinedAt: { lt: sevenDaysAgo } }
        });

        const declinedRecs = await prisma.declinedRecommendation.findMany({
            select: { sugId: true }
        });
        const declinedIds = new Set(declinedRecs.map(d => d.sugId));
        suggestions = suggestions.filter(s => !declinedIds.has(s.id));
    } catch (dbErr) {
        console.error('[BI Engine] Failed to fetch declined recommendations:', dbErr.message);
    }

    biCache = { metrics, projections, suggestions };
    cacheTime = now;

    return biCache;
}

exports.getActiveSuggestions = getActiveSuggestionsInternal;

exports.getSuggestions = async (req, res) => {
    try {
        const force = req.query.refresh === 'true';
        const biData = await getActiveSuggestionsInternal(force);
        res.json(biData);
    } catch (err) {
        console.error('getSuggestions BI Error:', err);
        res.status(500).json({ message: 'Error compiling business intelligence metrics' });
    }
};

exports.executeSuggestionAction = async (req, res) => {
    try {
        const { actionType, payload } = req.body;
        const username = req.user?.username || 'Admin (BI)';

        if (!actionType || !payload) {
            return res.status(400).json({ message: 'Missing actionType or payload' });
        }

        let actionDetails = '';
        let entityId = '';
        let entity = '';

        if (actionType === 'restock') {
            const { inventoryId, amount, itemName } = payload;
            const existing = await prisma.inventory.findUnique({ where: { id: inventoryId } });
            if (!existing) {
                return res.status(404).json({ message: `Material ${itemName} not found` });
            }

            const updated = await prisma.inventory.update({
                where: { id: inventoryId },
                data: { count: existing.count + parseInt(amount) }
            });

            await prisma.inventoryLog.create({
                data: {
                    inventoryId: updated.id,
                    action: 'Add',
                    amount: parseInt(amount),
                    newTotal: updated.count,
                    userId: username
                }
            });

            entity = ENTITIES.INVENTORY;
            entityId = updated.id;
            actionDetails = `Restocked spool "${updated.item}" (+${amount} cones). New total: ${updated.count}`;
            logAiChange(username, 'Restock Spool', actionDetails);

            // Invalidate BI Cache so suggestions reflect restock immediately
            biCache = null;

            // Broadcast changes
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.INVENTORY, await prisma.inventory.findMany());
        } 
        else if (actionType === 'updatePrice') {
            const { productId, price } = payload;
            const updated = await prisma.product.update({
                where: { id: productId },
                data: { price: parseFloat(price) }
            });

            entity = ENTITIES.PRODUCT;
            entityId = updated.id;
            actionDetails = `Adjusted price for "${updated.name}" to $${price}`;
            logAiChange(username, 'Adjust Product Price', actionDetails);

            // Invalidate BI Cache so suggestions reflect pricing adjustments
            biCache = null;

            // Broadcast changes
            const { enrichProductsWithStock } = require('../../utils/inventoryManager');
            const productsList = await prisma.product.findMany();
            const enriched = await enrichProductsWithStock(productsList);
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.PRODUCT, enriched);
        }
        else if (actionType === 'startAbTest') {
            const { productId, variantAPrice, variantBPrice } = payload;
            const updated = await prisma.product.update({
                where: { id: productId },
                data: { 
                    isAbTesting: true,
                    variantAPrice: parseFloat(variantAPrice),
                    variantBPrice: parseFloat(variantBPrice),
                    variantAViews: 0,
                    variantBViews: 0,
                    variantAOrders: 0,
                    variantBOrders: 0
                }
            });

            entity = ENTITIES.PRODUCT;
            entityId = updated.id;
            actionDetails = `Started A/B price test for "${updated.name}" ($${variantAPrice} vs $${variantBPrice})`;
            logAiChange(username, 'Start A/B Test', actionDetails);

            biCache = null;

            const { enrichProductsWithStock } = require('../../utils/inventoryManager');
            const productsList = await prisma.product.findMany();
            const enriched = await enrichProductsWithStock(productsList);
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.PRODUCT, enriched);
        } 
        else if (actionType === 'prioritizeOrder') {
            const { orderId, isRush, priorityScore } = payload;
            const updated = await prisma.order.update({
                where: { id: orderId },
                data: { 
                    isRush: isRush,
                    priorityScore: parseFloat(priorityScore) 
                }
            });

            entity = ENTITIES.ORDER;
            entityId = updated.id;
            actionDetails = `Set order ${updated.orderId} to Rush priority (Score: ${priorityScore})`;
            logAiChange(username, 'Prioritize Order', actionDetails);

            // Invalidate BI Cache
            biCache = null;

            // Broadcast changes
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.ORDER, updated);
        } 
        else {
            return res.status(400).json({ message: `Unknown BI action type: ${actionType}` });
        }

        // Add to global audit log
        await prisma.globalAuditLog.create({
            data: {
                userId: req.user?.id || 'system',
                userRole: req.user?.role || 'admin',
                action: `BI_AUTO_${actionType.toUpperCase()}`,
                entity: entity,
                entityId: entityId,
                ipAddress: req.ip || '127.0.0.1',
                diff: payload
            }
        });

        res.json({ success: true, message: actionDetails });

    } catch (err) {
        console.error('executeSuggestionAction Error:', err);
        res.status(500).json({ message: `Failed to execute BI action: ${err.message}` });
    }
};

exports.declineSuggestionAction = async (req, res) => {
    try {
        const { suggestionId } = req.body;
        if (!suggestionId) {
            return res.status(400).json({ message: 'Missing suggestionId' });
        }

        await prisma.declinedRecommendation.upsert({
            where: { sugId: suggestionId },
            update: {},
            create: { sugId: suggestionId }
        });

        // Invalidate BI Cache so declined suggestions disappear
        biCache = null;

        res.json({ success: true, message: `Recommendation ${suggestionId} declined successfully.` });
    } catch (err) {
        console.error('declineSuggestionAction Error:', err);
        res.status(500).json({ message: `Failed to decline recommendation: ${err.message}` });
    }
};

exports.getPurchaseOrders = async (req, res) => {
    try {
        const pos = await prisma.purchaseOrder.findMany({
            include: { inventory: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(pos);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching purchase orders' });
    }
};

exports.approvePurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.purchaseOrder.update({
            where: { id },
            data: { status: 'Approved' }
        });

        // Add to global audit log
        await prisma.globalAuditLog.create({
            data: {
                userId: req.user?.id || 'system',
                userRole: req.user?.role || 'admin',
                action: 'APPROVE_PURCHASE_ORDER',
                entity: 'PurchaseOrder',
                entityId: updated.id,
                ipAddress: req.ip || '127.0.0.1',
                diff: { status: 'Approved' }
            }
        });

        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Error approving purchase order' });
    }
};

exports.trackProductView = async (req, res) => {
    try {
        const { id } = req.params;
        const { variant } = req.body; // 'A' or 'B'
        
        const dataToUpdate = {};
        if (variant === 'A') dataToUpdate.variantAViews = { increment: 1 };
        if (variant === 'B') dataToUpdate.variantBViews = { increment: 1 };

        if (Object.keys(dataToUpdate).length > 0) {
            await prisma.product.update({
                where: { id },
                data: dataToUpdate
            });
        }
        res.json({ success: true });
    } catch (err) {
        // silent fail to avoid interrupting user experience
        res.status(500).json({ success: false });
    }
};
