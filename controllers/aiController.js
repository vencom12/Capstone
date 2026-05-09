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

        // Prepare the system prompt with context
        const systemPrompt = `You are StitchMaster AI, an expert production assistant for Stitch-Opt (a premium embroidery business).
        
        CURRENT SYSTEM DATA:
        - Orders: ${context.orders?.length || 0}
        - Products: ${context.products?.length || 0}
        - Inventory: ${context.inventory?.length || 0}
        - Staff: ${context.users?.length || 0}
        - Revenue: $${context.revenue || 0}
        
        DETAILED DATA SNAPSHOT:
        ${JSON.stringify(context).substring(0, 5000)}
        
        GUIDELINES:
        1. Be professional, helpful, and concise.
        2. Use the provided data to answer specific questions about orders, stock, or revenue.
        3. If asked for suggestions, analyze the stock levels and order queue.
        4. Use markdown for formatting (bolding, lists).`;

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
