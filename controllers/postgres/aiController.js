const prisma = require('../../utils/prisma');
const fetch = global.fetch || require('node-fetch');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

exports.chat = async (req, res) => {
    try {
        const { message, context, history } = req.body;
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            return res.json({ 
                success: true, 
                reply: "AI is in 'Local Mode'. Add GROQ_API_KEY to Render to enable automation! 🤖✨" 
            });
        }

        const orderSummary = {
            total: context.orders?.length || 0,
            delivered: context.orders?.filter(o => o.status === 'Order Delivered' || o.status === 'Delivered')?.length || 0,
            queue: context.orders?.filter(o => o.status === 'In Queue')?.length || 0,
            preparing: context.orders?.filter(o => o.status === 'Preparing Order')?.length || 0,
            canceled: context.orders?.filter(o => o.status === 'Order Canceled' || o.status === 'Canceled')?.length || 0,
            recent: context.orders?.slice(-15).map(o => ({ id: o.orderId, status: o.status, client: o.clientName }))
        };

        const systemPrompt = `You are StitchMaster AI, the automated facilitator for Stitch-Opt.
        CRITICAL METRICS: ${orderSummary.delivered} Delivered, ${orderSummary.preparing} Preparing, ${orderSummary.queue} In Queue.
        POWERS: You can update order statuses and inventory levels.`;

        const tools = [
            {
                type: "function",
                function: {
                    name: "updateOrderStatus",
                    description: "Update the status of an embroidery order",
                    parameters: {
                        type: "object",
                        properties: {
                            orderId: { type: "string" },
                            status: { type: "string", enum: ["In Queue", "Preparing Order", "Order Delivered", "Order Canceled"] }
                        },
                        required: ["orderId", "status"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "updateInventoryStock",
                    description: "Update the stock quantity of an inventory item",
                    parameters: {
                        type: "object",
                        properties: {
                            itemName: { type: "string" },
                            quantity: { type: "number" }
                        },
                        required: ["itemName", "quantity"]
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
        
        if (data.choices[0].message.tool_calls) {
            const toolCall = data.choices[0].message.tool_calls[0];
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            let actionResult = "";

            if (functionName === "updateOrderStatus") {
                const updated = await prisma.order.update({
                    where: { orderId: args.orderId },
                    data: { status: args.status }
                });
                actionResult = updated ? `Successfully updated Order ${args.orderId} to ${args.status}.` : `Could not find Order ${args.orderId}.`;
            } else if (functionName === "updateInventoryStock") {
                const updated = await prisma.inventory.update({
                    where: { item: args.itemName },
                    data: { count: args.quantity }
                });
                actionResult = updated ? `Updated ${args.itemName} stock to ${args.quantity}.` : `Could not find inventory item: ${args.itemName}.`;
            }

            messages.push(data.choices[0].message);
            messages.push({ role: "tool", tool_call_id: toolCall.id, name: functionName, content: actionResult });

            response = await fetch(GROQ_API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: MODEL, messages })
            });
            data = await response.json();
        }

        const reply = data.choices[0].message.content;
        res.json({ success: true, reply });

    } catch (error) {
        console.error('AI Automation Error:', error);
        res.status(500).json({ success: false, message: `Automation failed: ${error.message}` });
    }
};

exports.listModels = async (req, res) => {
    res.json({ message: "Automation Engine is active. Model: " + MODEL });
};
