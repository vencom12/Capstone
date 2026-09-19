require('dotenv').config();
const fetch = global.fetch || require('node-fetch');

const apiKey = process.env.GROQ_API_KEY;
const url = "https://api.groq.com/openai/v1/chat/completions";

async function testModel(modelName) {
    try {
        console.log(`Testing model: ${modelName}...`);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                model: modelName,
                messages: [{ role: "user", content: "Hello! Reply with 'OK'" }]
            })
        });
        const data = await res.json();
        if (data.choices && data.choices[0]) {
            console.log(`SUCCESS [${modelName}]:`, data.choices[0].message.content);
            return true;
        } else {
            console.log(`FAILED [${modelName}]:`, data.error ? data.error.message : JSON.stringify(data));
            return false;
        }
    } catch (e) {
        console.log(`ERROR [${modelName}]:`, e.message);
        return false;
    }
}

async function testVisionModel(modelName) {
    try {
        console.log(`Testing vision model: ${modelName}...`);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                model: modelName,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "What is this image?" },
                        { type: "image_url", image_url: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Glove_compartment_open.jpg/320px-Glove_compartment_open.jpg" } }
                    ]
                }]
            })
        });
        const data = await res.json();
        if (data.choices && data.choices[0]) {
            console.log(`VISION SUCCESS [${modelName}]:`, data.choices[0].message.content);
            return true;
        } else {
            console.log(`VISION FAILED [${modelName}]:`, data.error ? data.error.message : JSON.stringify(data));
            return false;
        }
    } catch (e) {
        console.log(`VISION ERROR [${modelName}]:`, e.message);
        return false;
    }
}

async function runTests() {
    const chatModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'groq/compound', 'groq/compound-mini'];
    for (const m of chatModels) {
        await testModel(m);
    }
    for (const m of chatModels) {
        await testVisionModel(m);
    }
}

runTests();
