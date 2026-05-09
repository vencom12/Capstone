const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.chat = async (req, res) => {
    try {
        const { message, context, history } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey || apiKey === 'YOUR_FREE_GEMINI_API_KEY_HERE') {
            return res.json({ 
                success: true, 
                reply: "I'm currently in 'Local Mode' because no Gemini API key was found in the .env file. Please add your free key to enable my advanced AI features! 🤖✨" 
            });
        }

        // Initialize the SDK and FORCE STABLE V1
        const genAI = new GoogleGenerativeAI(apiKey);
        // Explicitly set apiVersion to 'v1' in the model options
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: 'v1' });

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
        4. If you don't know something based on the data, say so politely.
        5. Use markdown for formatting (bolding, lists).`;

        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                ...history.map(h => ({
                    role: h.role === 'user' ? 'user' : 'model',
                    parts: [{ text: h.text }]
                }))
            ]
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        const reply = response.text();

        res.json({ success: true, reply });

    } catch (error) {
        console.error('AI SDK Error:', error);
        res.status(500).json({ 
            success: false, 
            message: `AI Processing failed: ${error.message || 'Unknown error'}. Try checking /api/ai/models for available versions.` 
        });
    }
};

// Diagnostic route to see what Render can actually "see"
exports.listModels = async (req, res) => {
    try {
        const fetch = global.fetch || require('node-fetch');
        const apiKey = process.env.GEMINI_API_KEY;
        // Try BOTH v1 and v1beta to see which one works
        const [v1, v1beta] = await Promise.all([
            fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`).then(r => r.json()),
            fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`).then(r => r.json())
        ]);
        res.json({ v1, v1beta });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
