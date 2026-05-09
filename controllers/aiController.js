const fetch = global.fetch || require('node-fetch'); // Fallback if needed, though Node 18+ has it

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent';

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

        // Prepare the system prompt with context
        const systemPrompt = `You are StitchMaster AI, an expert production assistant for Stitch-Opt (a premium embroidery business).
        
        CURRENT SYSTEM DATA:
        - Orders: ${context.orders?.length || 0}
        - Products: ${context.products?.length || 0}
        - Inventory: ${context.inventory?.length || 0}
        - Staff: ${context.users?.length || 0}
        - Revenue: $${context.revenue || 0}
        
        DETAILED DATA SNAPSHOT:
        ${JSON.stringify(context).substring(0, 5000)} // Truncate to keep prompt size reasonable
        
        GUIDELINES:
        1. Be professional, helpful, and concise.
        2. Use the provided data to answer specific questions about orders, stock, or revenue.
        3. If asked for suggestions, analyze the stock levels and order queue.
        4. If you don't know something based on the data, say so politely.
        5. Use markdown for formatting (bolding, lists).`;

        const contents = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            ...history.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            })),
            { role: 'user', parts: [{ text: message }] }
        ];

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('Gemini API Error Details:', JSON.stringify(data.error, null, 2));
            return res.status(500).json({ 
                success: false, 
                message: `Gemini API Error: ${data.error.message || 'Unknown error'}`,
                details: data.error
            });
        }

        if (!data.candidates || !data.candidates[0].content) {
             return res.json({ success: false, message: 'AI returned an empty response. Check safety filters.' });
        }

        const reply = data.candidates[0].content.parts[0].text;
        res.json({ success: true, reply });

    } catch (error) {
        console.error('AI Controller Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
