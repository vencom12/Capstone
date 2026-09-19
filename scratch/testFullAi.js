require('dotenv').config();
const { fetchGroqChatWithFallback } = require('../utils/groqClient');

async function testAIChat() {
    const apiKey = process.env.GROQ_API_KEY;
    const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
    const MODEL = "openai/gpt-oss-120b";
    
    console.log("Testing full AI Chat pipeline with model:", MODEL);
    try {
        const data = await fetchGroqChatWithFallback(
            apiKey,
            GROQ_API_URL,
            MODEL,
            { messages: [{ role: "user", content: "Hello StitchMaster AI! Are you operational?" }] }
        );
        console.log("AI Chat Reply:", data.choices[0].message.content);
    } catch (e) {
        console.error("AI Chat Test Error:", e.message);
    }
}

testAIChat();
