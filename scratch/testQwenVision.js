require('dotenv').config();
const fetch = global.fetch || require('node-fetch');

const apiKey = process.env.GROQ_API_KEY;
const url = "https://api.groq.com/openai/v1/chat/completions";

async function testQwenVision() {
    // 1x1 red pixel PNG base64 data url
    const imgUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAEUlEQVR42mP8z8AARIQB47cA9jMQAwL7/aUAAAAASUVORK5CYII=";
    try {
        console.log(`Testing Qwen vision with base64 image...`);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                model: "qwen/qwen3.6-27b",
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "What color is this image?" },
                        { type: "image_url", image_url: { url: imgUrl } }
                    ]
                }],
                max_tokens: 100
            })
        });
        const data = await res.json();
        console.log("Qwen Vision Response:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.log("Qwen Vision Error:", e.message);
    }
}

testQwenVision();
