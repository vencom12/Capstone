const prisma = require('../../utils/prisma');
const fetch = global.fetch || require('node-fetch');
const socketUtil = require('../../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');
const { logAiChange } = require('../../utils/aiLogger');
const { handleOrderStateTransition } = require('../../utils/inventoryManager');
const jwt = require('jsonwebtoken');
const { getActiveSuggestions } = require('./forecastingController');

const getAISettings = async () => {
    try {
        let settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
        if (!settings) {
            settings = await prisma.systemSettings.create({ data: { id: 'global' } });
        }
        return {
            aiChatModel: settings.aiChatModel || 'llama-3.3-70b-versatile',
            aiVisionModel: settings.aiVisionModel || 'llama-3.2-11b-vision-preview',
            aiProviderUrl: settings.aiProviderUrl || 'https://api.groq.com/openai/v1/chat/completions',
            minConfidenceScore: settings.minConfidenceScore !== undefined ? settings.minConfidenceScore : 0.75
        };
    } catch (e) {
        console.error('Failed to fetch dynamic AI settings, using defaults:', e);
        return {
            aiChatModel: 'llama-3.3-70b-versatile',
            aiVisionModel: 'llama-3.2-11b-vision-preview',
            aiProviderUrl: 'https://api.groq.com/openai/v1/chat/completions',
            minConfidenceScore: 0.75
        };
    }
};

const executeAction = async (functionName, args, req) => {
    if (!req.user || !req.user.id) {
        return `Forbidden: Unauthenticated request.`;
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: req.user.id }
    });

    if (!dbUser) {
        return `Forbidden: User not found.`;
    }

    const userRole = dbUser.role;
    const username = dbUser.username;

    // Strict Role-Based Access Control
    const allowedTools = {
        admin: [
            'updateOrderStatus',
            'updateInventoryStock',
            'createInventoryItem',
            'deleteInventoryItem',
            'createProduct',
            'deleteProduct',
            'updateProduct',
            'getSystemAnalytics',
            'getMachineFleetStatus',
            'getAuditLogs',
            'executeRecommendationAction'
        ],
        employee: [
            'updateOrderStatus',
            'getMachineFleetStatus',
            'getSystemAnalytics'
        ],
        customer: []
    };

    const userAllowed = allowedTools[userRole] || [];
    if (!userAllowed.includes(functionName)) {
        return `Forbidden: Insufficient privileges. Role "${userRole}" is not authorized to execute tool "${functionName}".`;
    }

    let actionResult = "";
    if (functionName === "updateOrderStatus") {
        const order = await prisma.order.findUnique({
            where: { orderId: args.orderId }
        });
        if (!order) {
            actionResult = `Could not find Order ${args.orderId}.`;
        } else {
            let updated;
            try {
                updated = await prisma.$transaction(async (tx) => {
                    return await handleOrderStateTransition(tx, order.id, args.status, username);
                });
                actionResult = `Successfully updated Order ${args.orderId} status to "${args.status}".`;
            } catch (err) {
                console.error('AI Order Status Update Error:', err);
                if (err.isStockError) {
                    await prisma.order.update({
                        where: { id: order.id },
                        data: { status: "On Hold - Awaiting Materials", progress: 5 }
                    });
                    actionResult = `Order ${args.orderId} routed to Hold Queue: ${err.message}`;
                } else {
                    actionResult = `Failed to update Order ${args.orderId} status: ${err.message}`;
                }
            }

            if (updated) {
                const io = req.app.get('io');
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, updated);
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.INVENTORY, await prisma.inventory.findMany());
                const productsList = await prisma.product.findMany();
                const { enrichProductsWithStock } = require('../../utils/inventoryManager');
                const enrichedProducts = await enrichProductsWithStock(productsList);
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.PRODUCT, enrichedProducts);
                logAiChange(username, 'Update Order Status', `Set order ${args.orderId} status to "${args.status}"`);
            }
        }
    } 
    else if (functionName === "updateInventoryStock") {
        const updated = await prisma.inventory.update({
            where: { item: args.itemName },
            data: { count: args.quantity }
        });
        actionResult = updated ? `Successfully updated ${args.itemName} stock level to ${args.quantity}.` : `Could not find inventory item "${args.itemName}".`;
        if (updated) {
            const allInv = await prisma.inventory.findMany();
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.INVENTORY, allInv);
            logAiChange(username, 'Update Stock Count', `Set ${args.itemName} quantity to ${args.quantity}`);
        }
    } 
    else if (functionName === "createInventoryItem") {
        const created = await prisma.inventory.create({
            data: {
                item: args.itemName,
                count: args.count,
                unit: args.unit || 'Cones',
                minThreshold: args.minThreshold || 10
            }
        });
        actionResult = created ? `Successfully created inventory stockpile material "${args.itemName}".` : `Failed to create stockpile item.`;
        if (created) {
            const allInv = await prisma.inventory.findMany();
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.CREATE, ENTITIES.INVENTORY, allInv);
            logAiChange(username, 'Create Stock Material', `Added ${args.itemName} with initial stock of ${args.count}`);
        }
    } 
    else if (functionName === "deleteInventoryItem") {
        const deleted = await prisma.inventory.delete({
            where: { item: args.itemName }
        });
        actionResult = deleted ? `Successfully deleted stockpile material "${args.itemName}".` : `Failed to delete material.`;
        if (deleted) {
            const allInv = await prisma.inventory.findMany();
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.DELETE, ENTITIES.INVENTORY, allInv);
            logAiChange(username, 'Delete Stock Material', `Deleted raw material "${args.itemName}"`);
        }
    } 
    else if (functionName === "createProduct") {
        const created = await prisma.product.create({
            data: {
                name: args.name,
                price: parseFloat(args.price),
                tag: args.tag || 'General',
                description: args.description || '',
                imageUrl: 'https://via.placeholder.com/200'
            }
        });
        actionResult = created ? `Successfully created catalog design product "${args.name}" at price $${args.price}.` : `Failed to create catalog product.`;
        if (created) {
            const { enrichProductsWithStock } = require('../../utils/inventoryManager');
            const [enrichedCreated] = await enrichProductsWithStock([created]);
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.CREATE, ENTITIES.PRODUCT, enrichedCreated);
            logAiChange(username, 'Create Product Catalog', `Created product "${args.name}" at price $${args.price}`);
        }
    } 
    else if (functionName === "deleteProduct") {
        const deleted = await prisma.product.delete({
            where: { id: args.productId }
        });
        actionResult = deleted ? `Successfully deleted catalog product design (ID: ${args.productId}).` : `Failed to delete catalog product.`;
        if (deleted) {
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.DELETE, ENTITIES.PRODUCT, { id: args.productId });
            logAiChange(username, 'Delete Product Catalog', `Deleted design catalog product ID: ${args.productId}`);
        }
    } 
    else if (functionName === "updateProduct") {
        const updated = await prisma.product.update({
            where: { id: args.productId },
            data: {
                name: args.name || undefined,
                price: args.price ? parseFloat(args.price) : undefined,
                tag: args.tag || undefined,
                description: args.description || undefined
            }
        });
        actionResult = updated ? `Successfully updated product "${updated.name}" details.` : `Failed to update product details.`;
        if (updated) {
            const { enrichProductsWithStock } = require('../../utils/inventoryManager');
            const [enrichedUpdated] = await enrichProductsWithStock([updated]);
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.PRODUCT, enrichedUpdated);
            logAiChange(username, 'Update Product Catalog', `Updated details for product catalog design "${updated.name}"`);
        }
    }
    else if (functionName === "getSystemAnalytics") {
        const days = args.days || 7;
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);
        const traffic = await prisma.siteTraffic.findMany({
            where: { timestamp: { gte: sinceDate } },
            orderBy: { timestamp: 'desc' }
        });
        const uniques = traffic.filter(t => t.isUnique).length;
        actionResult = `System traffic analytics for the last ${days} days: Total pageviews: ${traffic.length}, Unique visits: ${uniques}.`;
    }
    else if (functionName === "getMachineFleetStatus") {
        const machines = await prisma.machine.findMany({
            include: { assignedUser: true }
        });
        actionResult = `Active Machinery Fleet Status:\n` + machines.map(m => `- ${m.name} (${m.type}): Status is "${m.status}", Assigned Operator: ${m.assignedUser ? m.assignedUser.username : 'None'}`).join('\n');
    }
    else if (functionName === "getAuditLogs") {
        const limit = args.limit || 10;
        const logs = await prisma.globalAuditLog.findMany({
            take: limit,
            orderBy: { timestamp: 'desc' }
        });
        actionResult = `Recent System Audit Logs:\n` + logs.map(l => `- [${l.timestamp.toISOString()}] User: ${l.userId || 'System'} (${l.userRole || 'Unknown'}) performed "${l.action}" on ${l.entity} (ID: ${l.entityId || 'N/A'})`).join('\n');
    }
    else if (functionName === "executeRecommendationAction") {
        const { suggestionId } = args;
        
        let suggestionsData;
        try {
            suggestionsData = await getActiveSuggestions(false);
        } catch (err) {
            return `Failed to fetch active recommendations: ${err.message}`;
        }
        
        const suggestion = suggestionsData?.suggestions?.find(s => s.id === suggestionId);
        if (!suggestion) {
            return `Could not find active recommendation with ID "${suggestionId}".`;
        }
        
        const { type: actionType, payload } = suggestion.action || {};
        if (!actionType || !payload) {
            return `Recommendation "${suggestionId}" has no valid executable action.`;
        }
        
        let actionDetails = '';
        let entityId = '';
        let entity = '';
        
        if (actionType === 'restock') {
            const { inventoryId, amount, itemName } = payload;
            const existing = await prisma.inventory.findUnique({ where: { id: inventoryId } });
            if (!existing) {
                return `Could not find material "${itemName}" (ID: ${inventoryId}) for restocking.`;
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
            logAiChange(username, 'Restock Spool (AI Recommendation)', actionDetails);

            try {
                await getActiveSuggestions(true);
            } catch (cacheErr) {
                console.warn('[AI Recommendation] Invalidation warning:', cacheErr.message);
            }

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
            logAiChange(username, 'Adjust Product Price (AI Recommendation)', actionDetails);

            try {
                await getActiveSuggestions(true);
            } catch (cacheErr) {
                console.warn('[AI Recommendation] Invalidation warning:', cacheErr.message);
            }

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
            logAiChange(username, 'Prioritize Order (AI Recommendation)', actionDetails);

            try {
                await getActiveSuggestions(true);
            } catch (cacheErr) {
                console.warn('[AI Recommendation] Invalidation warning:', cacheErr.message);
            }

            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.ORDER, updated);
        } 
        else {
            return `Unknown recommendation action type: ${actionType}`;
        }
        
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
        
        actionResult = `Successfully executed recommendation "${suggestionId}": ${actionDetails}`;
    }
    return actionResult;
};

exports.chat = async (req, res) => {
    try {
        const { message, history } = req.body;
        const apiKey = process.env.GROQ_API_KEY;

        const now = new Date();

        const aiSettings = await getAISettings();
        const GROQ_API_URL = aiSettings.aiProviderUrl;
        const MODEL = aiSettings.aiChatModel;

        if (!apiKey) {
            return res.json({ 
                success: true, 
                reply: "AI is in 'Local Mode'. Add GROQ_API_KEY to Render to enable automation! 🤖✨" 
            });
        }

        const [orders, inventory, products] = await Promise.all([
            prisma.order.findMany({ take: 30, orderBy: { createdAt: 'desc' } }),
            prisma.inventory.findMany(),
            prisma.product.findMany({ take: 30, orderBy: { createdAt: 'desc' } })
        ]);

        const date14dAgo = new Date(new Date().setDate(now.getDate() - 14));
        const date365dAgo = new Date(new Date().setDate(now.getDate() - 365));

        const [orders14d, trafficRollups, orderRollups] = await Promise.all([
            // Fetch raw items JSON only for safety stock velocities (last 14 days)
            prisma.order.findMany({
                where: {
                    date: { gte: date14dAgo },
                    NOT: { status: 'Order Canceled' }
                },
                select: { items: true }
            }),
            // Aggregate daily site traffic visits (365 days)
            prisma.$queryRaw`
                SELECT 
                    TO_CHAR(timestamp, 'YYYY-MM-DD') AS day,
                    COUNT(*)::int AS count
                FROM "SiteTraffic"
                WHERE timestamp >= ${date365dAgo}
                GROUP BY TO_CHAR(timestamp, 'YYYY-MM-DD')
            `,
            // Aggregate daily orders count (365 days)
            prisma.$queryRaw`
                SELECT 
                    TO_CHAR(COALESCE(date, "createdAt"), 'YYYY-MM-DD') AS day,
                    COUNT(*)::int AS count
                FROM "Order"
                WHERE COALESCE(date, "createdAt") >= ${date365dAgo} AND status != 'Order Canceled'
                GROUP BY TO_CHAR(COALESCE(date, "createdAt"), 'YYYY-MM-DD')
            `
        ]);

        let totalVisits365D = 0;
        trafficRollups.forEach(r => {
            totalVisits365D += r.count;
        });

        let totalOrders365D = 0;
        orderRollups.forEach(r => {
            totalOrders365D += r.count;
        });

        const conversionRate = totalVisits365D > 0 ? (totalOrders365D / totalVisits365D) : 0;

        const productRecipes = {};
        products.forEach(p => {
            productRecipes[p.name.toLowerCase()] = p.recipe || [];
        });

        const materialConsumption = {};
        inventory.forEach(inv => {
            materialConsumption[inv.id] = 0;
            materialConsumption[inv.item.toLowerCase()] = 0;
        });

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

        const biForecastSummary = inventory.map(inv => {
            const consumption = materialConsumption[inv.id] || materialConsumption[inv.item.toLowerCase()] || 0;
            const velocity = consumption / 14;
            const days = velocity > 0 ? (inv.count / velocity) : 9999;
            return {
                item: inv.item,
                count: inv.count,
                velocity: parseFloat(velocity.toFixed(2)),
                daysRemaining: days === 9999 ? 'Stable' : parseFloat(days.toFixed(1)),
                risk: days <= 5 ? 'Critical' : (days <= 10 ? 'Warning' : 'Low')
            };
        });

        const orderSummary = {
            total: orders.length,
            delivered: orders.filter(o => ['Order Delivered', 'Delivered', 'Completed'].includes(o.status)).length,
            queue: orders.filter(o => o.status === 'In Queue').length,
            preparing: orders.filter(o => o.status === 'Preparing Order').length,
            canceled: orders.filter(o => ['Order Canceled', 'Canceled'].includes(o.status)).length,
            recent: orders.slice(0, 15).map(o => ({ id: o.orderId, status: o.status, client: o.client, design: o.design, total: o.totalAmount }))
        };

        const inventorySummary = inventory.map(i => ({
            item: i.item,
            count: i.count,
            unit: i.unit,
            threshold: i.minThreshold,
            status: i.count <= i.minThreshold ? 'LOW_STOCK' : 'HEALTHY'
        }));

        const productCatalog = products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            tag: p.tag,
            description: p.description
        }));

        const dbUser = await prisma.user.findUnique({
            where: { id: req.user.id }
        });
        if (!dbUser) {
            return res.status(401).json({ message: 'User not found' });
        }

        // Fetch active recommendations
        let activeSuggestions = [];
        try {
            const suggestionsData = await getActiveSuggestions(false);
            activeSuggestions = suggestionsData?.suggestions || [];
        } catch (suggestionErr) {
            console.error('[AI Chat] Failed to fetch active suggestions:', suggestionErr);
        }

        let suggestionsContext = '';
        if (activeSuggestions.length > 0) {
            suggestionsContext = `\nACTIVE BUSINESS INTELLIGENCE STRATEGIC RECOMMENDATIONS:\n`;
            activeSuggestions.forEach(s => {
                suggestionsContext += `- Recommendation ID: ${s.id}\n`;
                suggestionsContext += `  Title: ${s.title}\n`;
                suggestionsContext += `  Category: ${s.category}\n`;
                suggestionsContext += `  Severity: ${s.severity}\n`;
                suggestionsContext += `  Description: ${s.description}\n`;
                suggestionsContext += `  Action Text: ${s.actionText}\n`;
                suggestionsContext += `  Action Payload: ${JSON.stringify(s.action || {})}\n\n`;
            });
            suggestionsContext += `You can execute any recommendation using executeRecommendationAction tool with the suggestionId parameter.\n`;
        } else {
            suggestionsContext = `\nACTIVE BUSINESS INTELLIGENCE STRATEGIC RECOMMENDATIONS: None\n`;
        }

        let userPromptContext = `\nAUTHENTICATED USER PROFILE:\n`;
        userPromptContext += `- Username: ${dbUser.username}\n`;
        userPromptContext += `- Role: ${dbUser.role}\n`;

        if (dbUser.role === 'employee') {
            const userMachines = await prisma.machine.findMany({
                where: { assignedUserId: dbUser.id }
            });
            const machineIds = userMachines.map(m => m.id);
            const activeTasks = machineIds.length > 0 ? await prisma.order.findMany({
                where: {
                    machineId: { in: machineIds },
                    NOT: {
                        status: { in: ['Order Delivered', 'Completed', 'Order Canceled', 'Cancelled'] }
                    }
                }
            }) : [];

            userPromptContext += `\nOPERATOR MACHINE ASSIGNMENTS:\n`;
            if (userMachines.length > 0) {
                userMachines.forEach(m => {
                    userPromptContext += `  * ${m.name} (${m.type}) - Status: ${m.status}\n`;
                });
            } else {
                userPromptContext += `  * None (No machines currently assigned to you)\n`;
            }

            userPromptContext += `\nOPERATOR ACTIVE TASK LIST (Unfinished orders on your assigned machines):\n`;
            if (activeTasks.length > 0) {
                activeTasks.forEach(t => {
                    userPromptContext += `  * Order ID: ${t.orderId}, Client: ${t.client}, Design: ${t.design}, Status: ${t.status}, Progress: ${t.progress}%\n`;
                });
            } else {
                userPromptContext += `  * None (No active tasks)\n`;
            }

            userPromptContext += `\nCRITICAL ROLE PRIVILEGES & DUTIES:
- You are chatting with an Employee / Operator.
- Focus strictly on operator duties: viewing/managing their assigned machines and updating the order workbench queue.
- If they ask to perform administrative tasks (such as adjusting inventory stock, creating/deleting catalog products, purges, or fetching audit logs), explain that they have operator status and lack sufficient privileges. Do NOT run tools they don't have access to.`;
        } else if (dbUser.role === 'admin') {
            userPromptContext += `\nCRITICAL ROLE PRIVILEGES & DUTIES:
- You are chatting with an Administrator.
- You have access to all database mutation tools, audit logs, inventory adjustments, product catalog operations, and business intelligence recommendations.
- You can execute strategic forecasting, optimize pricing, run restocks, and review security logs.`;
        }

        const systemPrompt = `You are StitchMaster AI, the strategic automated business intelligence facilitator for Stitch-Opt.
        
        CRITICAL REAL-TIME SYSTEM CONTEXT:
        - Active Orders: Total ${orderSummary.total} orders. Status: ${orderSummary.delivered} Delivered, ${orderSummary.preparing} Preparing, ${orderSummary.queue} In Queue, ${orderSummary.canceled} Canceled.
        - Recent Orders List: ${JSON.stringify(orderSummary.recent)}
        - Inventory stockpile: ${JSON.stringify(inventorySummary)}
        - Product catalog items: ${JSON.stringify(productCatalog)}
        
        REAL-TIME BI & FORECAST METRICS:
        - Storefront Conversion Rate: ${(conversionRate * 100).toFixed(1)}% (based on ${totalVisits365D} visits and ${totalOrders365D} orders in the past 365 days)
        - Material Depletion Forecasts (velocity/day & days remaining): ${JSON.stringify(biForecastSummary)}
        
        ${suggestionsContext}
        ${userPromptContext}
        
        POWERS & RESPONSIBILITIES:
        - You have dynamic database access via tools based on the user's role.
        - Confirm actions only after executing tools successfully.
        - Provide strategic advice, analysis, strategies, and tactics for the business based on inventory counts and order trends.
        - Format responses beautifully with markdown lists, bold headers, and transparent advice.
        - Every time you modify the database, the system will automatically record it in the change logs.
        
        CRITICAL TOOL USE CONSTRAINTS:
        1. Do NOT call any database mutation functions/tools unless the user explicitly requests an action or modification to the database. For informational queries, brainstorming, or suggestions, do NOT call any tools; reply strictly with text.
        2. If you decide to call a tool, you MUST ONLY generate the tool call itself. Do NOT output any markdown, conversational text, explanations, or thoughts before or after the tool call, as this will crash the API client. You will have a chance to explain or confirm the action in the subsequent chat turn once the system provides the tool execution result.`;

        const tools = [
            {
                type: "function",
                function: {
                    name: "updateOrderStatus",
                    description: "Update the status of an embroidery order ticket",
                    parameters: {
                        type: "object",
                        properties: {
                            orderId: { type: "string", description: "The unique order ID string (e.g. ORD-1234)" },
                            status: { 
                                type: "string", 
                                enum: ["In Queue", "Preparing Order", "Order Delivered", "Order Canceled"],
                                description: "The target status"
                            }
                        },
                        required: ["orderId", "status"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "updateInventoryStock",
                    description: "Update the stock count of an inventory raw material item",
                    parameters: {
                        type: "object",
                        properties: {
                            itemName: { type: "string", description: "The exact name of the inventory material" },
                            quantity: { type: "number", description: "The new stock count quantity" }
                        },
                        required: ["itemName", "quantity"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "createInventoryItem",
                    description: "Create a new raw material item in the inventory stockpile",
                    parameters: {
                        type: "object",
                        properties: {
                            itemName: { type: "string", description: "The name of the stockpile raw material" },
                            count: { type: "number", description: "Initial quantity level" },
                            unit: { type: "string", description: "Units of measurement (default: 'Cones')" },
                            minThreshold: { type: "number", description: "Low stock alert trigger level" }
                        },
                        required: ["itemName", "count"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "deleteInventoryItem",
                    description: "Completely purge a raw material item from the inventory stockpile",
                    parameters: {
                        type: "object",
                        properties: {
                            itemName: { type: "string", description: "The exact name of the stockpile item" }
                        },
                        required: ["itemName"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "createProduct",
                    description: "Add a new embroidery design catalog product",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Catalog display name of product" },
                            price: { type: "string", description: "Product pricing in USD" },
                            tag: { type: "string", description: "Tag category (e.g. Hoodies, Caps)" },
                            description: { type: "string", description: "Visual description details" }
                        },
                        required: ["name", "price"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "deleteProduct",
                    description: "Completely remove a design catalog product",
                    parameters: {
                        type: "object",
                        properties: {
                            productId: { type: "string", description: "The product unique ID" }
                        },
                        required: ["productId"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "updateProduct",
                    description: "Update details of an existing design catalog product",
                    parameters: {
                        type: "object",
                        properties: {
                            productId: { type: "string", description: "The product unique ID" },
                            name: { type: "string" },
                            price: { type: "string" },
                            tag: { type: "string" },
                            description: { type: "string" }
                        },
                        required: ["productId"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "getSystemAnalytics",
                    description: "Fetch site traffic and unique visitor counts for a given duration in days",
                    parameters: {
                        type: "object",
                        properties: {
                            days: { type: "number", description: "The number of days of history to retrieve (default: 7)" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "getMachineFleetStatus",
                    description: "Fetch a status report of all physical machines in the workshop and their assigned operators",
                    parameters: {
                        type: "object",
                        properties: {}
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "getAuditLogs",
                    description: "Fetch the most recent database changes and administrative actions logged in the system",
                    parameters: {
                        type: "object",
                        properties: {
                            limit: { type: "number", description: "The maximum number of recent logs to fetch (default: 10)" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "executeRecommendationAction",
                    description: "Execute a strategic business recommendation from the BI dashboard by its suggestion ID",
                    parameters: {
                        type: "object",
                        properties: {
                            suggestionId: { type: "string", description: "The unique recommendation/suggestion ID (e.g. SUG-INV-1, SUG-PRICE-INC-1, SUG-OPS-1)" }
                        },
                        required: ["suggestionId"]
                    }
                }
            }
        ];

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
            { role: 'user', content: message }
        ];

        let response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto" })
        });

        let data = await response.json();
        
        // Mode A: Native Tool Call execution
        if (data.choices && data.choices[0] && data.choices[0].message.tool_calls) {
            const toolCalls = data.choices[0].message.tool_calls;
            messages.push(data.choices[0].message);
            
            for (const toolCall of toolCalls) {
                const functionName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);
                const actionResult = await executeAction(functionName, args, req);
                messages.push({ role: "tool", tool_call_id: toolCall.id, name: functionName, content: actionResult });
            }

            response = await fetch(GROQ_API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: MODEL, messages })
            });
            data = await response.json();
        }
        // Mode B: Fallback XML-like function parsing (when Llama generates pseudo-XML in plain text)
        else if (data.choices && data.choices[0] && data.choices[0].message.content) {
            const rawContent = data.choices[0].message.content;
            const funcRegex = /<function\((\w+)\)\s*=\s*({.*?})\s*><\/function>/g;
            let match;
            const results = [];
            const matches = [];

            funcRegex.lastIndex = 0;
            while ((match = funcRegex.exec(rawContent)) !== null) {
                matches.push({
                    fullMatch: match[0],
                    name: match[1],
                    argsStr: match[2]
                });
            }

            if (matches.length > 0) {
                for (const m of matches) {
                    try {
                        const args = JSON.parse(m.argsStr);
                        const result = await executeAction(m.name, args, req);
                        results.push(`[${m.name}]: ${result}`);
                    } catch (err) {
                        results.push(`[${m.name}] Error: Failed to execute. ${err.message}`);
                    }
                }

                // Append assistant raw message, and execution results to get clean chat response
                messages.push({ role: 'assistant', content: rawContent });
                messages.push({ 
                    role: 'user', 
                    content: `[SYSTEM] Function execution results:\n${results.join('\n')}\n\nPlease confirm these updates to the user in a natural, friendly conversational reply.` 
                });

                response = await fetch(GROQ_API_URL, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: MODEL, messages })
                });
                data = await response.json();
            }
        }

        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;
            res.json({ success: true, reply });
        } else {
            console.error('[AI Error] Groq API Response lacks choices. Full Response:', JSON.stringify(data));
            res.json({ success: false, reply: "The assistant did not return a valid completion. Please try again." });
        }

    } catch (error) {
        console.error('AI Automation Error:', error);
        res.status(500).json({ success: false, reply: `Automation failed: ${error.message}` });
    }
};

exports.getLogs = async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.resolve(process.cwd(), 'logs/ai_changes.json');
        
        let logs = [];
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            try {
                logs = JSON.parse(content);
            } catch (e) {
                logs = [];
            }
        }
        res.json({ success: true, logs });
    } catch (error) {
        console.error('Failed to get AI logs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.listModels = async (req, res) => {
    const aiSettings = await getAISettings();
    res.json({ message: "Automation Engine is active. Model: " + aiSettings.aiChatModel });
};

exports.verifyReceipt = async (req, res) => {
    try {
        const { receiptUrl, orderTotal, orderId } = req.body;
        const apiKey = process.env.GROQ_API_KEY;
        const crypto = require('crypto');

        // === Input Validation ===
        if (!receiptUrl || typeof receiptUrl !== 'string') {
            return res.status(400).json({ success: false, message: "No receipt URL provided." });
        }
        if (!orderId || typeof orderId !== 'string') {
            return res.status(400).json({ success: false, message: "No order ID provided." });
        }
        if (orderTotal === undefined || isNaN(parseFloat(orderTotal)) || parseFloat(orderTotal) <= 0) {
            return res.status(400).json({ success: false, message: "Invalid order total." });
        }

        const numOrderTotal = parseFloat(orderTotal);

        // === Ownership Validation ===
        const receipt = await prisma.receipt.findFirst({ where: { orderID: orderId } });
        if (!receipt) {
            return res.status(404).json({ success: false, message: "Receipt not found for this order." });
        }
        if (receipt.userId !== req.user.id) {
            return res.status(403).json({ success: false, message: "You are not authorized to verify this receipt." });
        }

        // === Check if already verified ===
        if (receipt.aiVerificationStatus === 'verified') {
            return res.json({ success: true, message: "This receipt has already been verified.", aiResult: receipt.ocrData, updatedReceipt: receipt });
        }

        const aiSettings = await getAISettings();
        const GROQ_API_URL = aiSettings.aiProviderUrl;
        const VISION_MODEL = aiSettings.aiVisionModel;
        const MIN_CONFIDENCE = aiSettings.minConfidenceScore;

        if (!apiKey) {
            return res.status(400).json({ success: false, message: "AI Verification requires an API Key." });
        }

        // === DEFENSE 1: SHA-256 Image Hash Deduplication ===
        console.log(`[AI Vision] Defense 1: Computing image hash for Order ${orderId}...`);
        let imageHash = null;
        try {
            const imageResponse = await fetch(receiptUrl);
            if (imageResponse.ok) {
                const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

                // Check if this exact image was already used
                const existingByHash = await prisma.receipt.findFirst({
                    where: { imageHash, NOT: { id: receipt.id } }
                });
                if (existingByHash) {
                    console.log(`[AI Vision] BLOCKED: Duplicate image hash detected (${imageHash.substring(0, 12)}...)`);
                    await prisma.receipt.update({
                        where: { id: receipt.id },
                        data: {
                            imageHash,
                            aiVerificationStatus: 'flagged',
                            flaggedReason: `Duplicate receipt: This exact image was already used for order ${existingByHash.orderID}.`,
                            status: 'Rejected'
                        }
                    });
                    return res.json({
                        success: false,
                        message: "This receipt image has already been used for another order. Please upload a unique payment screenshot.",
                        flaggedReason: 'duplicate_image'
                    });
                }
            }
        } catch (hashErr) {
            console.warn('[AI Vision] Could not compute image hash (non-fatal):', hashErr.message);
        }

        // === STEP 1 & 2: Visual Classification + OCR Extraction ===
        console.log(`[AI Vision] Steps 1-2: Classifying and extracting data for Order ${orderId}...`);

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: VISION_MODEL,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `You are a payment verification auditor. Analyze this image and perform TWO tasks:

TASK 1 - VISUAL CLASSIFICATION:
Determine if this image is a legitimate digital payment receipt/transaction confirmation (e.g., GCash, PayMaya, BPI, BDO, bank transfer screenshot). Look for:
- Payment platform branding (logos, colors, headers)
- Transaction success indicators ("Sent Successfully", "Payment Received", checkmarks)
- Structured financial data (amounts, reference numbers, dates)

If this is NOT a payment receipt (e.g., a meme, random photo, unrelated screenshot), set isValidReceipt to false.

TASK 2 - DATA EXTRACTION (only if isValidReceipt is true):
Extract these fields from the receipt:
- extractedAmount: The total payment amount as a number
- referenceId: The unique transaction/reference number (e.g., "Ref No: 9012 384 102")
- transactionDate: The date and time of the transaction (ISO format if possible, otherwise as shown)
- recipientName: The name of the recipient/receiver
- paymentPlatform: The payment platform used (e.g., "GCash", "PayMaya", "BDO")

Compare the extracted amount with the expected order total: ${numOrderTotal}.

Output ONLY a JSON object:
{
  "isValidReceipt": boolean,
  "extractedAmount": number or null,
  "referenceId": "string" or null,
  "transactionDate": "string" or null,
  "recipientName": "string" or null,
  "paymentPlatform": "string" or null,
  "isAmountMatch": boolean,
  "confidence": number (0 to 1),
  "reason": "string explaining the analysis"
}`
                            },
                            {
                                type: "image_url",
                                image_url: { url: receiptUrl }
                            }
                        ]
                    }
                ],
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error("AI failed to provide a valid response.");
        }

        let aiResult;
        try {
            aiResult = JSON.parse(data.choices[0].message.content);
        } catch (parseErr) {
            throw new Error("AI returned malformed JSON: " + data.choices[0].message.content.substring(0, 200));
        }

        // Sanitize confidence to a valid range
        const confidence = Math.max(0, Math.min(1, aiResult.confidence !== undefined ? parseFloat(aiResult.confidence) : 0));
        const isPassedGate = confidence >= MIN_CONFIDENCE;

        // === STEP 1 RESULT: Visual Classification ===
        if (!aiResult.isValidReceipt) {
            console.log(`[AI Vision] REJECTED: Not a valid receipt (confidence: ${confidence})`);
            await prisma.receipt.update({
                where: { id: receipt.id },
                data: {
                    imageHash,
                    ocrData: aiResult,
                    confidenceScore: confidence,
                    aiVerificationStatus: 'rejected',
                    flaggedReason: 'Invalid document: The uploaded image is not a payment receipt.',
                    status: 'Rejected'
                }
            });
            return res.json({
                success: false,
                message: "The uploaded image does not appear to be a payment receipt. Please upload a screenshot of your payment transaction.",
                flaggedReason: 'invalid_document',
                aiResult
            });
        }

        // === STEP 3: Database Reconciliation (3 Audit Checks) ===
        console.log(`[AI Vision] Step 3: Running audit checks for Order ${orderId}...`);
        const auditFailures = [];

        // Platform-specific service validations
        if (receipt.paymentMethod === 'gcash') {
            const gcashService = require('../../services/payments/gcashService');
            const platformCheck = gcashService.validateReceiptData(aiResult);
            if (!platformCheck.isValid) {
                auditFailures.push(platformCheck.error);
            }
        } else if (receipt.paymentMethod === 'paymaya') {
            const paymayaService = require('../../services/payments/paymayaService');
            const platformCheck = paymayaService.validateReceiptData(aiResult);
            if (!platformCheck.isValid) {
                auditFailures.push(platformCheck.error);
            }
        }

        // Audit Check A: Price Match
        const extractedAmount = parseFloat(aiResult.extractedAmount) || 0;
        if (extractedAmount < numOrderTotal) {
            auditFailures.push(`Underpayment: Receipt shows ${extractedAmount} but order requires ${numOrderTotal}.`);
        }

        // Audit Check B: Duplicate Reference ID (Defense 2)
        if (aiResult.referenceId) {
            const cleanRefId = aiResult.referenceId.replace(/\s+/g, '');
            const existingByRef = await prisma.receipt.findFirst({
                where: {
                    referenceId: cleanRefId,
                    NOT: { id: receipt.id },
                    aiVerificationStatus: 'verified'
                }
            });
            if (existingByRef) {
                auditFailures.push(`Duplicate reference ID: "${cleanRefId}" was already used for order ${existingByRef.orderID}.`);
            }
            aiResult.referenceId = cleanRefId; // Normalize for storage
        }

        // Audit Check C: Recency (within last 24 hours)
        if (aiResult.transactionDate) {
            try {
                const txDate = new Date(aiResult.transactionDate);
                const now = new Date();
                const hoursAgo = (now - txDate) / (1000 * 60 * 60);
                if (hoursAgo > 24) {
                    auditFailures.push(`Expired receipt: Transaction date (${aiResult.transactionDate}) is more than 24 hours old.`);
                }
            } catch (dateErr) {
                // If date can't be parsed, don't fail on this check alone
                console.warn('[AI Vision] Could not parse transaction date:', aiResult.transactionDate);
            }
        }

        // === STEP 4: Automated Verdict ===
        const allChecksPassed = auditFailures.length === 0 && aiResult.isAmountMatch && isPassedGate;
        const flaggedReason = auditFailures.length > 0 ? auditFailures.join(' | ') : (!isPassedGate ? `Low confidence: ${confidence} (threshold: ${MIN_CONFIDENCE})` : null);
        const verificationStatus = allChecksPassed ? 'verified' : 'flagged';

        console.log(`[AI Vision] Step 4: Verdict for Order ${orderId}: ${verificationStatus}${flaggedReason ? ' — ' + flaggedReason : ''}`);

        // Update Receipt
        const updatedReceipt = await prisma.receipt.update({
            where: { id: receipt.id },
            data: {
                ocrData: aiResult,
                confidenceScore: confidence,
                aiVerificationStatus: verificationStatus,
                status: allChecksPassed ? 'Verified' : 'Manual Review',
                imageHash,
                referenceId: aiResult.referenceId || null,
                flaggedReason
            }
        });

        // Update Order status based on verdict
        if (allChecksPassed) {
            await prisma.order.updateMany({
                where: { orderId: orderId },
                data: {
                    paymentStatus: 'paid',
                    status: 'In Queue',
                    progress: 5
                }
            });

            // Notify via socket
            const io = req.app.get('io');
            if (io) {
                const socketUtil = require('../../utils/socketUtil');
                const { ACTIONS, ENTITIES } = require('../../utils/apiConstants');
                socketUtil.emitDataChanged(io, ACTIONS.UPDATE, ENTITIES.ORDER, { orderId, status: 'In Queue' });
            }
        }

        res.json({
            success: allChecksPassed,
            message: allChecksPassed
                ? "Payment verified by AI! Your order is now in the queue."
                : (flaggedReason || "AI flagged a discrepancy. An admin will review your payment."),
            aiResult: {
                isValidReceipt: aiResult.isValidReceipt,
                extractedAmount,
                referenceId: aiResult.referenceId,
                paymentPlatform: aiResult.paymentPlatform,
                confidence,
                isAmountMatch: aiResult.isAmountMatch
            },
            verificationStatus,
            flaggedReason,
            updatedReceipt
        });

    } catch (error) {
        console.error('[AI Vision Error]:', error);
        res.status(500).json({ success: false, message: "AI Analysis failed: " + error.message });
    }
};

// ====================================================
// Storefront AI Attendant — Public, Read-Only Chatbot
// ====================================================
exports.storefrontChat = async (req, res) => {
    try {
        const { message, history, context } = req.body;
        const apiKey = process.env.GROQ_API_KEY;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ success: false, reply: 'Please enter a message.' });
        }

        const aiSettings = await getAISettings();
        const GROQ_API_URL = aiSettings.aiProviderUrl;
        const MODEL = aiSettings.aiChatModel;

        if (!apiKey) {
            return res.json({
                success: true,
                reply: "Hi! I'm the Stitch-Opt store assistant. AI features require an API key to be configured. In the meantime, feel free to browse our catalog! 🧵",
                suggestedProducts: []
            });
        }

        // Fetch user context if authenticated
        const token = req.cookies?.admin_token || req.cookies?.employee_token || req.cookies?.customer_token || req.cookies?.token;
        let customerContext = '';
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const dbUser = await prisma.user.findUnique({
                    where: { id: decoded.id },
                    include: {
                        favorites: {
                            select: {
                                id: true,
                                name: true,
                                price: true
                            }
                        },
                        orders: {
                            take: 5,
                            orderBy: { createdAt: 'desc' },
                            select: {
                                orderId: true,
                                status: true,
                                totalAmount: true,
                                createdAt: true,
                                design: true
                            }
                        }
                    }
                });

                if (dbUser && dbUser.tokenVersion === decoded.tokenVersion) {
                    customerContext = `\nLOGGED-IN CUSTOMER INFO:\n`;
                    customerContext += `- Username: ${dbUser.username}\n`;
                    customerContext += `- Email: ${dbUser.email}\n`;
                    if (dbUser.favorites && dbUser.favorites.length > 0) {
                        customerContext += `- Saved Favorites: ${dbUser.favorites.map(f => `"${f.name}" (ID: ${f.id}, Price: $${f.price})`).join(', ')}\n`;
                    } else {
                        customerContext += `- Saved Favorites: None\n`;
                    }
                    if (dbUser.orders && dbUser.orders.length > 0) {
                        customerContext += `- Recent 5 Orders:\n`;
                        dbUser.orders.forEach(o => {
                            customerContext += `  * Order ID: ${o.orderId}, Design: ${o.design}, Total: $${o.totalAmount}, Status: ${o.status}, Placed: ${o.createdAt.toISOString()}\n`;
                        });
                    } else {
                        customerContext += `- Recent 5 Orders: No orders placed yet.\n`;
                    }
                }
            } catch (err) {
                console.warn('[Storefront AI Auth] Token verification failed:', err.message);
            }
        }

        // Fetch product catalog with stock enrichment
        const { enrichProductsWithStock } = require('../../utils/inventoryManager');
        const rawProducts = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
        const products = await enrichProductsWithStock(rawProducts);

        const productCatalog = products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            tag: p.tag,
            tags: p.tags || [],
            description: p.description || '',
            availableStock: p.availableStock !== undefined ? p.availableStock : Math.max(0, (p.count || 0) - (p.reservedCount || 0)),
            isOutOfStock: p.isOutOfStock || false
        }));

        // Build browsing context string from client-side context
        let browsingContext = '';
        if (context) {
            if (context.selectedCategory && context.selectedCategory !== 'All') {
                browsingContext += `The customer is currently browsing the "${context.selectedCategory}" category. `;
            }
            if (context.searchQuery) {
                browsingContext += `The customer searched for "${context.searchQuery}". `;
            }
        }

        const systemPrompt = `You are the Stitch-Opt Virtual Store Attendant, a warm and knowledgeable AI shopping assistant for Stitch-Opt — a professional embroidery design store.

${customerContext ? `You are chatting with a logged-in customer. Here is their profile:\n${customerContext}\nGreet them by their name/username, and use this information to answer any questions about their account, favorites, or order history. Be sure to check this profile first before stating you don't know about their account details!` : 'You are chatting with a guest visitor (not logged in).'}

YOUR ROLE:
- Help customers find the perfect embroidery design based on their needs, occasion, style, or budget.
- Provide a personalized, guided shopping experience through natural conversation.
- Suggest relevant products from the catalog when appropriate.
- Support natural language search — customers may describe what they want instead of searching exact names (e.g. "something blue and floral", "a gift for graduation", "matching cap and shirt designs").
- Be friendly, enthusiastic, and knowledgeable about embroidery and fashion.

CURRENT PRODUCT CATALOG (${productCatalog.length} designs):
${JSON.stringify(productCatalog)}

${browsingContext ? `CUSTOMER BROWSING CONTEXT: ${browsingContext}` : ''}

CRITICAL INSTRUCTIONS FOR PRODUCT SUGGESTIONS:
When you want to suggest or recommend specific products from the catalog, you MUST include a special marker in your response with the product IDs:
[PRODUCTS:id1,id2,id3]

For example, if recommending products with IDs "abc-123" and "def-456", include:
[PRODUCTS:abc-123,def-456]

Rules for the marker:
- Place the marker at the END of your response, after your conversational text.
- Include up to 6 product IDs maximum per response.
- Only include IDs that exist in the catalog above.
- Do NOT include the marker if you're not recommending specific products (e.g. for greetings or general questions).
- Prioritize in-stock items. If an item is out of stock, mention it but still suggest alternatives.

CONVERSATION STYLE:
- Keep responses concise but helpful (2-4 sentences of text before product suggestions).
- Use emoji sparingly for warmth (1-2 per response max).
- Format text nicely with bold (**text**) for emphasis where appropriate.
- If the customer asks about something not in the catalog, acknowledge it and suggest the closest available alternatives.
- Never mention the [PRODUCTS:] marker syntax to the customer — it's for internal use only.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...(history || []).slice(-10).map(h => ({
                role: h.role === 'user' ? 'user' : 'assistant',
                content: h.text
            })),
            { role: 'user', content: message }
        ];

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: MODEL,
                messages,
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        const data = await response.json();

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('[AI Storefront] No valid response:', JSON.stringify(data));
            return res.json({
                success: false,
                reply: "I'm having trouble thinking right now. Please try again in a moment! 🙏",
                suggestedProducts: []
            });
        }

        let reply = data.choices[0].message.content;
        let suggestedProducts = [];

        // Parse [PRODUCTS:id1,id2,...] marker from the response
        const productMarkerRegex = /\[PRODUCTS?:([\w\-,\s]+)\]/gi;
        const match = productMarkerRegex.exec(reply);

        if (match) {
            const ids = match[1].split(',').map(id => id.trim()).filter(Boolean);
            suggestedProducts = products
                .filter(p => ids.includes(p.id))
                .map(p => ({
                    id: p.id,
                    name: p.name,
                    price: p.price,
                    tag: p.tag,
                    description: p.description,
                    imageUrl: p.imageUrl,
                    availableStock: p.availableStock !== undefined ? p.availableStock : Math.max(0, (p.count || 0) - (p.reservedCount || 0)),
                    isOutOfStock: p.isOutOfStock || false
                }));

            // Remove the marker from the visible reply
            reply = reply.replace(productMarkerRegex, '').trim();
        }

        res.json({
            success: true,
            reply,
            suggestedProducts
        });

    } catch (error) {
        console.error('[AI Storefront Error]:', error);
        res.status(500).json({
            success: false,
            reply: "Something went wrong on my end. Please try again! 🔧",
            suggestedProducts: []
        });
    }
};
