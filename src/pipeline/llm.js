/**
 * LLM 调用封装 - 支持任何 OpenAI 兼容 API
 * 默认配置适配腾讯云混元 API
 */

const OpenAI = require('openai');

// 已知的错误模型名 → 自动修正映射
const MODEL_ALIASES = {
    'GLM-5.1': 'glm-4-flash',
    'GLM-4': 'glm-4-flash',
    'glm-4': 'glm-4-flash',
    'glm-5.1': 'glm-4-flash',
    'GLM-5': 'glm-4-flash',
    'hunyuan': 'hunyuan-lite',
    'HUNYUAN': 'hunyuan-lite',
};

const DEFAULT_BASE_URL = 'https://api.lkeap.cloud.tencent.com/plan/v3';
const DEFAULT_MODEL = 'glm-4-flash';

function resolveModel(model) {
    if (!model) return DEFAULT_MODEL;
    // 精确匹配别名
    if (MODEL_ALIASES[model]) return MODEL_ALIASES[model];
    // 大小写不敏感匹配
    const lower = model.toLowerCase();
    for (const [alias, resolved] of Object.entries(MODEL_ALIASES)) {
        if (alias.toLowerCase() === lower) return resolved;
    }
    return model;
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
    const {
        model = resolveModel(process.env.OPENAI_MODEL),
        temperature = 0.7,
        maxTokens = 4000,
        retryCount = 3,
    } = options;

    const resolvedModel = resolveModel(model);
    console.log(`  🤖 LLM 调用: model=${resolvedModel}, maxTokens=${maxTokens}`);
    
    const client = createClient();
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model: resolvedModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature,
                max_tokens: maxTokens,
            });

            return response.choices[0]?.message?.content || '';
        } catch (error) {
            console.error(`LLM 调用失败 (尝试 ${attempt}/${retryCount}):`, error.message);
            if (attempt === retryCount) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
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

module.exports = { callLLM, callLLMJson, resolveModel };
