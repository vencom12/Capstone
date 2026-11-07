const fetch = global.fetch || require('node-fetch');

// In-memory cache of deprecated/decommissioned model IDs so we never retry a dead model twice
const decommissionedModelsCache = new Set();

// In-memory cache for live provider models discovery (10-minute TTL)
let cachedProviderModels = {
    url: null,
    timestamp: 0,
    chatModels: [],
    visionModels: []
};
const MODELS_CACHE_TTL_MS = 10 * 60 * 1000;

const DEFAULT_CHAT_FALLBACKS = [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'allam-2-7b'
];

const DEFAULT_VISION_FALLBACKS = [
    'qwen/qwen3.8-27b'
];

/**
 * Derives the standard OpenAI-compatible /models endpoint from a /chat/completions URL.
 */
function deriveModelsEndpoint(completionsUrl) {
    const cleanUrl = (completionsUrl || 'https://api.groq.com/openai/v1/chat/completions').trim();
    if (cleanUrl.includes('/chat/completions')) {
        return cleanUrl.replace('/chat/completions', '/models');
    }
    return cleanUrl.replace(/\/+$/, '') + '/models';
}

/**
 * Checks if an API error response indicates the model ID is deprecated, decommissioned, or removed.
 */
function isModelDeprecatedError(status, data, errMsg = '') {
    const code = (data?.error?.code || '').toLowerCase();
    const msg = (errMsg || data?.error?.message || '').toLowerCase();
    if (
        code === 'model_decommissioned' ||
        code === 'model_not_found' ||
        msg.includes('decommission') ||
        msg.includes('deprecated') ||
        msg.includes('no longer supported') ||
        msg.includes('does not exist') ||
        msg.includes('model_not_found') ||
        msg.includes('not found')
    ) {
        return true;
    }
    return status === 404;
}

/**
 * Queries the provider's live GET /models endpoint to discover currently active chat and vision models.
 */
async function discoverActiveProviderModels(apiKey, completionsUrl, forceRefresh = false) {
    const modelsUrl = deriveModelsEndpoint(completionsUrl);
    const now = Date.now();

    if (
        !forceRefresh &&
        cachedProviderModels.url === modelsUrl &&
        now - cachedProviderModels.timestamp < MODELS_CACHE_TTL_MS &&
        cachedProviderModels.chatModels.length > 0
    ) {
        return cachedProviderModels;
    }

    if (!apiKey) {
        return {
            url: modelsUrl,
            timestamp: now,
            chatModels: DEFAULT_CHAT_FALLBACKS.filter(m => !decommissionedModelsCache.has(m)),
            visionModels: DEFAULT_VISION_FALLBACKS.filter(m => !decommissionedModelsCache.has(m))
        };
    }

    try {
        const res = await fetch(modelsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            throw new Error(`Provider /models returned HTTP ${res.status}`);
        }

        const payload = await res.json();
        const rawList = Array.isArray(payload?.data) ? payload.data : [];

        // Filter out non-chat models (audio, TTS, guardrails, embeddings)
        const excludedPatterns = /whisper|tts|playai|guard|embed|moderation|orpheus|allam|distil-whisper/i;
        const visionPatterns = /vision|vl|pixtral|llava|qwen3\.8|qwen3\.6|llama-4-scout|llama-4-maverick|gpt-4o|gemini/i;

        const activeIds = rawList
            .filter(item => item && item.id && item.active !== false && !decommissionedModelsCache.has(item.id))
            .map(item => item.id)
            .filter(id => !excludedPatterns.test(id));

        const discoveredVision = [];
        const discoveredChat = [];

        for (const id of activeIds) {
            if (visionPatterns.test(id)) {
                discoveredVision.push(id);
            }
            discoveredChat.push(id);
        }

        // Prioritize flagship models at the top of the discovered list
        const scoreChatModel = (id) => {
            const lower = id.toLowerCase();
            if (lower.includes('gpt-oss-120b')) return 100;
            if (lower.includes('llama-3.3-70b')) return 95;
            if (lower.includes('qwen3')) return 90;
            if (lower.includes('llama-4')) return 85;
            if (lower.includes('gpt-oss-20b')) return 80;
            if (lower.includes('compound')) return 75;
            if (lower.includes('llama-3.1-8b')) return 70;
            return 50;
        };

        discoveredChat.sort((a, b) => scoreChatModel(b) - scoreChatModel(a));

        cachedProviderModels = {
            url: modelsUrl,
            timestamp: now,
            chatModels: discoveredChat.length > 0 ? discoveredChat : DEFAULT_CHAT_FALLBACKS.filter(m => !decommissionedModelsCache.has(m)),
            visionModels: discoveredVision.length > 0 ? discoveredVision : DEFAULT_VISION_FALLBACKS.filter(m => !decommissionedModelsCache.has(m))
        };

        return cachedProviderModels;
    } catch (err) {
        console.warn('[AI Model Discovery] Live /models fetch failed, using fallback defaults:', err.message);
        return {
            url: modelsUrl,
            timestamp: now,
            chatModels: DEFAULT_CHAT_FALLBACKS.filter(m => !decommissionedModelsCache.has(m)),
            visionModels: DEFAULT_VISION_FALLBACKS.filter(m => !decommissionedModelsCache.has(m))
        };
    }
}

/**
 * Self-heals SystemSettings in PostgreSQL when a configured primary model is confirmed deprecated.
 */
async function autoHealDatabaseModel(field, oldModel, newModel) {
    if (!oldModel || !newModel || oldModel === newModel) return;
    try {
        const prisma = require('./prisma');
        await prisma.systemSettings.updateMany({
            where: { id: 'global', [field]: oldModel },
            data: { [field]: newModel }
        });
        console.log(`[AI Self-Heal] Automatically migrated deprecated ${field} "${oldModel}" -> "${newModel}" in SystemSettings.`);
    } catch (err) {
        console.warn(`[AI Self-Heal] Could not persist new ${field} to DB:`, err.message);
    }
}

const fetchGroqChatWithFallback = async (apiKeyOrOpts, urlArg, initialModelArg, payloadWithoutModelArg) => {
    let apiKey = apiKeyOrOpts;
    let url = urlArg;
    let initialModel = initialModelArg;
    let payloadWithoutModel = payloadWithoutModelArg;

    if (apiKeyOrOpts && typeof apiKeyOrOpts === 'object') {
        const { apiKey: k, url: u, primaryModel, initialModel: im, model, ...restPayload } = apiKeyOrOpts;
        apiKey = k;
        url = u || 'https://api.groq.com/openai/v1/chat/completions';
        initialModel = primaryModel || im || model;
        payloadWithoutModel = restPayload;
    }

    const modelsToTry = [];
    const addCandidate = (m) => {
        if (m && !modelsToTry.includes(m) && !decommissionedModelsCache.has(m)) {
            modelsToTry.push(m);
        }
    };

    if (initialModel) addCandidate(initialModel);
    for (const m of DEFAULT_CHAT_FALLBACKS) addCandidate(m);

    let lastError = null;
    let initialModelDeprecated = Boolean(initialModel && decommissionedModelsCache.has(initialModel));
    let didAttemptLiveDiscovery = false;

    for (let i = 0; i < modelsToTry.length; i++) {
        const model = modelsToTry[i];
        try {
            console.log(`[Groq Fetch] Attempting chat request using model: ${model}`);

            let adjustedPayload = { ...payloadWithoutModel };
            if (model !== initialModel && model.includes('8b')) {
                adjustedPayload.temperature = Math.min(adjustedPayload.temperature || 0.7, 0.3);
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
                if (initialModelDeprecated && model !== initialModel) {
                    data.autoHealedFrom = initialModel;
                    autoHealDatabaseModel('aiChatModel', initialModel, model);
                }
                return data;
            }

            const errMsg = data?.error?.message || response.statusText || 'Unknown error';
            console.warn(`[Groq Fetch Warning] Model ${model} failed: ${errMsg}`);

            if (isModelDeprecatedError(response.status, data, errMsg)) {
                decommissionedModelsCache.add(model);
                if (model === initialModel) {
                    initialModelDeprecated = true;
                }
            }

            if (errMsg.includes('tokens per minute') || errMsg.includes('TPM') || (data?.error?.code === 'rate_limit_exceeded')) {
                console.log(`[Groq Fetch Retry] TPM rate limit hit for ${model}. Failing fast and switching model...`);
            }

            lastError = new Error(`Groq API returned error for model ${model}: ${errMsg}`);
        } catch (err) {
            console.warn(`[Groq Fetch Error] Exception with model ${model}:`, err.message);
            lastError = err;
        }

        // If we are about to exhaust the static list, dynamically query live /models from the provider
        if (i === modelsToTry.length - 1 && !didAttemptLiveDiscovery) {
            didAttemptLiveDiscovery = true;
            const discovered = await discoverActiveProviderModels(apiKey, url, true);
            for (const liveModel of discovered.chatModels) {
                addCandidate(liveModel);
            }
        }
    }

    throw lastError || new Error('All AI chat models failed to return a valid completion.');
};

const sleepMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchGroqVisionWithFallback = async (apiKey, url, initialModel, payloadWithoutModel) => {
    const modelsToTry = [];
    const addCandidate = (m) => {
        if (m && !modelsToTry.includes(m) && !decommissionedModelsCache.has(m)) {
            modelsToTry.push(m);
        }
    };

    if (initialModel) addCandidate(initialModel);
    for (const m of DEFAULT_VISION_FALLBACKS) addCandidate(m);

    let lastError = null;
    let initialModelDeprecated = Boolean(initialModel && decommissionedModelsCache.has(initialModel));
    let didAttemptLiveDiscovery = false;

    for (let i = 0; i < modelsToTry.length; i++) {
        const model = modelsToTry[i];
        let rateLimitRetries = 0;
        const maxRateLimitRetries = 2;

        while (rateLimitRetries <= maxRateLimitRetries) {
            try {
                console.log(`[Groq Vision Fetch] Attempting vision request using model: ${model}${rateLimitRetries > 0 ? ` (retry ${rateLimitRetries})` : ''}`);
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
                    if (initialModelDeprecated && model !== initialModel) {
                        data.autoHealedFrom = initialModel;
                        autoHealDatabaseModel('aiVisionModel', initialModel, model);
                    }
                    return data;
                }

                const errMsg = data?.error?.message || data?.error?.code || response.statusText || 'Unknown error';
                console.warn(`[Groq Vision Fetch Warning] Model ${model} failed: ${errMsg}`);

                if (isModelDeprecatedError(response.status, data, errMsg)) {
                    decommissionedModelsCache.add(model);
                    if (model === initialModel) {
                        initialModelDeprecated = true;
                    }
                    lastError = new Error(`Groq API returned error for model ${model}: ${errMsg}`);
                    break;
                }

                const isRateLimited = response.status === 429 || data?.error?.code === 'rate_limit_exceeded' || /rate limit|tokens per minute|ITPM|TPM/i.test(errMsg);
                if (isRateLimited && rateLimitRetries < maxRateLimitRetries) {
                    const retryMatch = errMsg.match(/try again in\s+(\d+(?:\.\d+)?)s/i);
                    const waitSeconds = retryMatch ? Math.min(20, Math.ceil(parseFloat(retryMatch[1])) + 1) : 6;
                    console.log(`[Groq Vision Fetch] Rate limit hit on ${model}; waiting ${waitSeconds}s before retrying...`);
                    rateLimitRetries += 1;
                    await sleepMs(waitSeconds * 1000);
                    continue;
                }

                lastError = new Error(`Groq API returned error for model ${model}: ${errMsg}`);
                break;
            } catch (err) {
                console.warn(`[Groq Vision Fetch Error] Exception with model ${model}:`, err.message);
                lastError = err;
                break;
            }
        }

        // If static vision fallbacks fail, dynamically query live vision models from the provider
        if (i === modelsToTry.length - 1 && !didAttemptLiveDiscovery) {
            didAttemptLiveDiscovery = true;
            const discovered = await discoverActiveProviderModels(apiKey, url, true);
            for (const liveVisionModel of discovered.visionModels) {
                addCandidate(liveVisionModel);
            }
        }
    }

    throw lastError || new Error('All AI vision models failed to return a valid completion.');
};

module.exports = {
    fetchGroqChatWithFallback,
    fetchGroqVisionWithFallback,
    discoverActiveProviderModels,
    isModelDeprecatedError
};
