const fetch = global.fetch || require('node-fetch');

const fetchGroqChatWithFallback = async (apiKey, url, initialModel, payloadWithoutModel) => {
    const chatFallbackChain = [
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'groq/compound-mini',
        'qwen/qwen3.6-27b',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant'
    ];
    const modelsToTry = [initialModel];
    for (const m of chatFallbackChain) {
        if (!modelsToTry.includes(m)) {
            modelsToTry.push(m);
        }
    }
    
    let lastError = null;
    
    for (const model of modelsToTry) {
        try {
            console.log(`[Groq Fetch] Attempting chat request using model: ${model}`);
            
            // Adjust temperature/max_tokens for fallback models to preserve stability
            let adjustedPayload = { ...payloadWithoutModel };
            if (model !== initialModel && model.includes('8b')) {
                adjustedPayload.temperature = Math.min(adjustedPayload.temperature || 0.7, 0.3); // Lower temp for smaller models
            }
            
            const body = { model, ...adjustedPayload };
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${apiKey}`, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify(body)
            });
            
            const data = await response.json();
            
            if (response.ok && data && !data.error && data.choices && data.choices[0]) {
                data.usedModel = model;
                return data;
            }
            
            const errMsg = data?.error?.message || response.statusText || "Unknown error";
            console.warn(`[Groq Fetch Warning] Model ${model} failed: ${errMsg}`);
            
            // If it's a rate limit, immediately fallback to next model rather than blocking
            // This prevents the thread from being blocked by a 3000ms timeout
            if (errMsg.includes("tokens per minute") || errMsg.includes("TPM") || (data?.error?.code === "rate_limit_exceeded")) {
                console.log(`[Groq Fetch Retry] TPM rate limit hit for ${model}. Failing fast and switching model...`);
            }
            
            lastError = new Error(`Groq API returned error for model ${model}: ${errMsg}`);
            
        } catch (err) {
            console.warn(`[Groq Fetch Error] Exception with model ${model}:`, err.message);
            lastError = err;
        }
    }
    throw lastError || new Error("All Groq chat models failed to return a valid completion.");
};

const fetchGroqVisionWithFallback = async (apiKey, url, initialModel, payloadWithoutModel) => {
    // Implement proper fallback sequence for vision models
    const visionFallbackChain = [
        'qwen/qwen3.6-27b',
        'openai/gpt-oss-120b',
        'llama-3.2-11b-vision-preview'
    ];
    
    const modelsToTry = [initialModel];
    for (const m of visionFallbackChain) {
        if (!modelsToTry.includes(m)) {
            modelsToTry.push(m);
        }
    }
    
    let lastError = null;
    
    for (const model of modelsToTry) {
        try {
            console.log(`[Groq Vision Fetch] Attempting vision request using model: ${model}`);
            const body = { model, ...payloadWithoutModel };
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${apiKey}`, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify(body)
            });
            
            const data = await response.json();
            
            if (response.ok && data && !data.error && data.choices && data.choices[0]) {
                data.usedModel = model;
                return data;
            }
            
            const errMsg = data?.error?.message || data?.error?.code || response.statusText || "Unknown error";
            console.warn(`[Groq Vision Fetch Warning] Model ${model} failed: ${errMsg}`);
            lastError = new Error(`Groq API returned error for model ${model}: ${errMsg}`);
            
        } catch (err) {
            console.warn(`[Groq Vision Fetch Error] Exception with model ${model}:`, err.message);
            lastError = err;
        }
    }
    throw lastError || new Error("All Groq vision models failed to return a valid completion.");
};

module.exports = {
    fetchGroqChatWithFallback,
    fetchGroqVisionWithFallback
};
