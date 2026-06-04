const { pipeline, env } = require('@xenova/transformers');

// Prevent downloading models to the global cache folder if deployed on read-only environments
// (In production SaaS, we usually set this to a writable path or bundle the model)
env.allowLocalModels = false; 

let extractor;

async function getExtractor() {
    if (!extractor) {
        // Load Xenova's all-MiniLM-L6-v2 which generates 384-dimensional embeddings (perfect for pgvector)
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return extractor;
}

/**
 * Generate a 384-dimensional vector embedding for a given text string.
 * @param {string} text - The input text to embed
 * @returns {Promise<number[]>} Array of 384 floats
 */
async function generateEmbedding(text) {
    if (!text || typeof text !== 'string') return null;
    
    try {
        const extract = await getExtractor();
        
        // Output will be a tensor with shape [1, seq_length, 384]
        const output = await extract(text, { pooling: 'mean', normalize: true });
        
        // Convert to standard JS array
        const vector = Array.from(output.data);
        return vector;
    } catch (error) {
        console.error('Error generating embedding:', error);
        return null;
    }
}

module.exports = {
    generateEmbedding
};
