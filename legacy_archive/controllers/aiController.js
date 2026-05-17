const fetch = global.fetch || require('node-fetch');
const Order = require('../models/Order');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const socketUtil = require('../utils/socketUtil');
const { ACTIONS, ENTITIES } = require('../utils/apiConstants');
const { logAiChange } = require('../utils/aiLogger');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const executeAction = async (functionName, args, req) => {
    let actionResult = "";
    if (functionName === "updateOrderStatus") {
        const updated = await Order.findOneAndUpdate(
            { orderId: args.orderId },
            { 
                status: args.status,
                progress: args.status === 'Completed' || args.status === 'Order Delivered' ? 100 : undefined
            },
            { new: true }
        );
        actionResult = updated ? `Successfully updated Order ${args.orderId} status to "${args.status}".` : `Could not find Order ${args.orderId}.`;
        if (updated) {
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.ORDER, updated);
            logAiChange('StitchMaster AI', 'Update Order Status', `Set order ${args.orderId} status to "${args.status}"`);
        }
    } 
    else if (functionName === "updateInventoryStock") {
        const updated = await Inventory.findOneAndUpdate(
            { item: new RegExp('^' + args.itemName + '$', 'i') },
            { count: args.quantity },
            { new: true }
        );
        actionResult = updated ? `Successfully updated ${args.itemName} stock level to ${args.quantity}.` : `Could not find inventory item "${args.itemName}".`;
        if (updated) {
            const allInv = await Inventory.find();
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.INVENTORY, allInv);
            logAiChange('StitchMaster AI', 'Update Stock Count', `Set ${args.itemName} quantity to ${args.quantity}`);
        }
    } 
    else if (functionName === "createInventoryItem") {
        const created = await Inventory.create({
            item: args.itemName,
            count: args.count,
            unit: args.unit || 'Cones',
            minThreshold: args.minThreshold || 10
        });
        actionResult = created ? `Successfully created inventory stockpile material "${args.itemName}".` : `Failed to create stockpile item.`;
        if (created) {
            const allInv = await Inventory.find();
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.CREATE, ENTITIES.INVENTORY, allInv);
            logAiChange('StitchMaster AI', 'Create Stock Material', `Added ${args.itemName} with initial stock of ${args.count}`);
        }
    } 
    else if (functionName === "deleteInventoryItem") {
        const deleted = await Inventory.findOneAndDelete({
            item: new RegExp('^' + args.itemName + '$', 'i')
        });
        actionResult = deleted ? `Successfully deleted stockpile material "${args.itemName}".` : `Failed to delete material.`;
        if (deleted) {
            const allInv = await Inventory.find();
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.DELETE, ENTITIES.INVENTORY, allInv);
            logAiChange('StitchMaster AI', 'Delete Stock Material', `Deleted raw material "${args.itemName}"`);
        }
    } 
    else if (functionName === "createProduct") {
        const created = await Product.create({
            name: args.name,
            price: parseFloat(args.price),
            tag: args.tag || 'General',
            description: args.description || '',
            imageUrl: 'https://via.placeholder.com/200'
        });
        actionResult = created ? `Successfully created catalog design product "${args.name}" at price $${args.price}.` : `Failed to create catalog product.`;
        if (created) {
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.CREATE, ENTITIES.PRODUCT, created);
            logAiChange('StitchMaster AI', 'Create Product Catalog', `Created product "${args.name}" at price $${args.price}`);
        }
    } 
    else if (functionName === "deleteProduct") {
        const deleted = await Product.findByIdAndDelete(args.productId);
        actionResult = deleted ? `Successfully deleted catalog product design (ID: ${args.productId}).` : `Failed to delete catalog product.`;
        if (deleted) {
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.DELETE, ENTITIES.PRODUCT, { id: args.productId });
            logAiChange('StitchMaster AI', 'Delete Product Catalog', `Deleted design catalog product ID: ${args.productId}`);
        }
    } 
    else if (functionName === "updateProduct") {
        const updated = await Product.findByIdAndUpdate(
            args.productId,
            {
                name: args.name || undefined,
                price: args.price ? parseFloat(args.price) : undefined,
                tag: args.tag || undefined,
                description: args.description || undefined
            },
            { new: true }
        );
        actionResult = updated ? `Successfully updated product "${updated.name}" details.` : `Failed to update product details.`;
        if (updated) {
            socketUtil.emitDataChanged(req.app.get('io'), ACTIONS.UPDATE, ENTITIES.PRODUCT, updated);
            logAiChange('StitchMaster AI', 'Update Product Catalog', `Updated details for product catalog design "${updated.name}"`);
        }
    }
    return actionResult;
};

exports.chat = async (req, res) => {
    try {
        const { message, history } = req.body;
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            return res.json({ 
                success: true, 
                reply: "AI is in 'Local Mode'. Add GROQ_API_KEY to Render to enable automation! 🤖✨" 
            });
        }

        const [orders, inventory, products] = await Promise.all([
            Order.find().sort({ createdAt: -1 }).limit(30),
            Inventory.find(),
            Product.find().sort({ createdAt: -1 }).limit(30)
        ]);

        const orderSummary = {
            total: orders.length,
            delivered: orders.filter(o => ['Order Delivered', 'Delivered', 'Completed'].includes(o.status)).length,
            queue: orders.filter(o => o.status === 'In Queue').length,
            preparing: orders.filter(o => o.status === 'Preparing Order').length,
            canceled: orders.filter(o => ['Order Canceled', 'Canceled'].includes(o.status)).length,
            recent: orders.slice(0, 15).map(o => ({ id: o.orderId, status: o.status, client: o.clientName || o.client, design: o.design, total: o.totalAmount }))
        };

        const inventorySummary = inventory.map(i => ({
            item: i.item || i.itemName,
            count: i.count || i.quantity,
            unit: i.unit,
            threshold: i.minThreshold,
            status: (i.count || i.quantity) <= i.minThreshold ? 'LOW_STOCK' : 'HEALTHY'
        }));

        const productCatalog = products.map(p => ({
            id: p._id,
            name: p.name,
            price: p.price,
            tag: p.tag,
            description: p.description
        }));

        const systemPrompt = `You are StitchMaster AI, the super-privileged automated business intelligence facilitator for Stitch-Opt.
        
        CRITICAL REAL-TIME SYSTEM CONTEXT:
        - Active Orders: Total ${orderSummary.total} orders. Status: ${orderSummary.delivered} Delivered, ${orderSummary.preparing} Preparing, ${orderSummary.queue} In Queue, ${orderSummary.canceled} Canceled.
        - Recent Orders List: ${JSON.stringify(orderSummary.recent)}
        - Inventory stockpile: ${JSON.stringify(inventorySummary)}
        - Product catalog items: ${JSON.stringify(productCatalog)}
        
        POWERS & RESPONSIBILITIES:
        - You have FULL privileges to alter database records dynamically (Orders, Inventory Stockpile, and Design Catalog Products) based on user instructions.
        - Always look for exact matches or IDs. If a user asks to modify "White Thread" but it is "White Thread Cone" in the stockpile, use "White Thread Cone".
        - Confirm mutations immediately using the tools provided.
        - Provide strategic advice, analysis, strategies, and tactics for the business based on inventory counts and order trends.
        - Format responses beautifully with markdown lists, bold headers, and transparent advice.
        - Every time you modify the database, the system will automatically record it in the change logs.
        
        CRITICAL TOOL USE CONSTRAINTS:
        1. Do NOT call any database mutation functions/tools (like createProduct, updateOrderStatus, etc.) unless the user explicitly requests an action or modification to the database. For informational queries, brainstorming, or suggestions (like "suggest name for four designs"), do NOT call any tools; reply strictly with text.
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
            const toolCall = data.choices[0].message.tool_calls[0];
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            
            const actionResult = await executeAction(functionName, args, req);

            messages.push(data.choices[0].message);
            messages.push({ role: "tool", tool_call_id: toolCall.id, name: functionName, content: actionResult });

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
    res.json({ message: "Automation Engine is active. Model: " + MODEL });
};
