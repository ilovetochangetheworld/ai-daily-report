/**
 * LLM 调用封装 - 支持多模型、OpenAI 兼容 API
 * 支持 glm-5.1, minimax-m2.7 等推理模型
 */

const OpenAI = require('openai');

const DEFAULT_BASE_URL = 'https://api.lkeap.cloud.tencent.com/plan/v3';

// 模型配置注册表：不同模型可设置不同的默认参数
const MODEL_CONFIGS = {
    'glm-5.1': {
        type: 'reasoning',       // 推理模型，有 reasoning_content
        maxTokens: 16000,        // 推理模型需要大量空间给思考链
        temperature: 0.7,
    },
    'minimax-m2.7': {
        type: 'reasoning',
        maxTokens: 16000,
        temperature: 0.7,
    },
    // 未来可加更多模型
};

const DEFAULT_MODEL = 'glm-5.1';

function resolveModel(model) {
    if (!model) return DEFAULT_MODEL;
    return model;
}

function getModelConfig(model) {
    return MODEL_CONFIGS[model] || { type: 'normal', maxTokens: 16000, temperature: 0.7 };
}

function createClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY 未设置');
    }

    return new OpenAI({ apiKey, baseURL });
}

async function callLLM(systemPrompt, userPrompt, options = {}) {
    const resolvedModel = resolveModel(options.model || process.env.OPENAI_MODEL);
    const modelConfig = getModelConfig(resolvedModel);

    const {
        temperature = modelConfig.temperature,
        maxTokens = modelConfig.maxTokens,
        retryCount = 3,
    } = options;

    console.log(`  🤖 LLM 调用: model=${resolvedModel}, type=${modelConfig.type}, maxTokens=${maxTokens}`);

    const client = createClient();
    const startTime = Date.now();

    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            const requestParams = {
                model: resolvedModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature,
                max_tokens: maxTokens,
            };

            const response = await client.chat.completions.create(requestParams);

            const msg = response.choices[0]?.message;
            const content = msg?.content || '';
            const reasoning = msg?.reasoning_content || '';
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            // 推理模型：思考链占满 token 导致 content 为空
            if (!content && reasoning) {
                console.warn(`  ⚠ ${resolvedModel}: 思考链占满 ${maxTokens} tokens (${elapsed}s)，尝试从思考链尾部提取`);
                const lines = reasoning.split('\n').filter(l => l.trim());
                const extracted = lines.slice(-5).join(' ')
                    .replace(/^\d+\.\s*\*\*|^\*\*/g, '')
                    .replace(/^["\s]+|["\s]+$/g, '')
                    .trim();
                return extracted || '[推理过程中内容被截断，请增大 maxTokens]';
            }

            console.log(`  ✓ ${resolvedModel}: ${content.length}字内容, ${reasoning.length}字思考链 (${elapsed}s)`);
            return content;
        } catch (error) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.error(`LLM 调用失败 (尝试 ${attempt}/${retryCount}, ${elapsed}s):`, error.message);
            if (error.status) console.error(`  HTTP Status: ${error.status}`);
            if (error.error) console.error(`  Error Body: ${JSON.stringify(error.error)}`);
            if (attempt === retryCount) throw error;
            const delay = 2000 * Math.pow(2, attempt - 1);
            console.log(`  → 等待 ${delay / 1000}s 后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function callLLMJson(systemPrompt, userPrompt, options = {}) {
    const response = await callLLM(systemPrompt, userPrompt, options);
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                     response.match(/\{[\s\S]*\}/) ||
                     response.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
        throw new Error('LLM 响应中未找到 JSON');
    }

    try {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch (error) {
        console.error('JSON 解析失败:', error.message);
        console.error('响应内容:', response.substring(0, 500));
        throw error;
    }
}

module.exports = { callLLM, callLLMJson, resolveModel, getModelConfig, MODEL_CONFIGS };
