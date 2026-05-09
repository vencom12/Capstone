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
                reply: "I'm currently in 'Local Mode' because no Groq API key was found. Please add your key to the Render environment variables! 🤖✨" 
            });
        }

        // Create a smart summary to bypass truncation issues
        const orderSummary = {
            total: context.orders?.length || 0,
            delivered: context.orders?.filter(o => o.status === 'Order Delivered' || o.status === 'Delivered')?.length || 0,
            queue: context.orders?.filter(o => o.status === 'In Queue')?.length || 0,
            preparing: context.orders?.filter(o => o.status === 'Preparing Order')?.length || 0,
            canceled: context.orders?.filter(o => o.status === 'Order Canceled' || o.status === 'Canceled')?.length || 0,
            recent: context.orders?.slice(-15).map(o => ({ id: o.orderId, status: o.status, client: o.clientName }))
        };

        // Prepare the system prompt with a much more reliable summary
        const systemPrompt = `You are StitchMaster AI, an expert production assistant for Stitch-Opt (a premium embroidery business).
        
        CRITICAL SYSTEM METRICS (ALWAYS USE THESE FOR COUNTS):
        - Total Orders: ${orderSummary.total}
        - Delivered/Completed: ${orderSummary.delivered} 
        - In Queue: ${orderSummary.queue}
        - Preparing: ${orderSummary.preparing}
        - Canceled: ${orderSummary.canceled}
        
        BUSINESS SNAPSHOT:
        - Total Products: ${context.products?.length || 0}
        - Stock Items: ${context.inventory?.length || 0}
        - Total Revenue: $${context.revenue || 0}
        
        RECENT ORDERS (LAST 15):
        ${JSON.stringify(orderSummary.recent)}
        
        GUIDELINES:
        1. Use the "CRITICAL SYSTEM METRICS" for all status and count questions.
        2. Be professional, helpful, and concise.
        3. Use markdown for lists and bolding.`;

        // Format history for OpenAI-compatible Groq API
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(h => ({
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
                messages: messages,
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('Groq API Error Details:', JSON.stringify(data.error, null, 2));
            return res.status(500).json({ 
                success: false, 
                message: `Groq API Error: ${data.error.message || 'Unknown error'}`
            });
        }

        const reply = data.choices[0].message.content;
        res.json({ success: true, reply });

    } catch (error) {
        console.error('AI Controller Error:', error);
        res.status(500).json({ 
            success: false, 
            message: `AI Processing failed: ${error.message || 'Unknown error'}` 
        });
    }
};

// Diagnostic route
exports.listModels = async (req, res) => {
    res.json({ message: "Groq Engine is active. Model: " + MODEL });
};
