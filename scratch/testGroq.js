require('dotenv').config();
const { fetchGroqChatWithFallback, fetchGroqVisionWithFallback } = require('../utils/groqClient');

async function testGroq() {
    const apiKey = process.env.GROQ_API_KEY;
    console.log("Testing Groq API key:", apiKey ? apiKey.substring(0, 10) + "..." : "NONE");
    
    try {
        console.log("Testing Chat...");
        const resChat = await fetchGroqChatWithFallback(
            apiKey,
            "https://api.groq.com/openai/v1/chat/completions",
            "llama-3.3-70b-versatile",
            { messages: [{ role: "user", content: "Hello, reply with 'OK'" }] }
        );
        console.log("Chat Response:", resChat.choices[0].message.content);
    } catch (e) {
        console.error("Chat Error:", e.message);
    }

    try {
        console.log("\nTesting Vision...");
        const resVision = await fetchGroqVisionWithFallback(
            apiKey,
            "https://api.groq.com/openai/v1/chat/completions",
            "llama-3.2-11b-vision-preview",
            { messages: [{ role: "user", content: [{ type: "text", text: "What is this?" }, { type: "image_url", image_url: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Glove_compartment_open.jpg/320px-Glove_compartment_open.jpg" } }] }] }
        );
        console.log("Vision Response:", resVision.choices[0].message.content);
    } catch (e) {
        console.error("Vision Error:", e.message);
    }
}

testGroq();
