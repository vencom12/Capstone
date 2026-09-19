require('dotenv').config();
const fetch = global.fetch || require('node-fetch');

async function checkModels() {
    const apiKey = process.env.GROQ_API_KEY;
    console.log("Checking Groq models with key:", apiKey ? apiKey.substring(0, 10) + "..." : "NONE");
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await response.json();
        console.log("Models response status:", response.status);
        if (data.data) {
            console.log("Active models:");
            data.data.forEach(m => console.log("- ", m.id));
        } else {
            console.log("Response:", JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

checkModels();
