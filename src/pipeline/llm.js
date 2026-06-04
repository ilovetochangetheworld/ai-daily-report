/**
 * LLM 调用封装 - 支持任何 OpenAI 兼容 API
 * 默认配置适配腾讯云 API
 */

const OpenAI = require('openai');

const DEFAULT_BASE_URL = 'https://api.lkeap.cloud.tencent.com/plan/v3';
const DEFAULT_MODEL = 'glm-5.1';

function resolveModel(model) {
    if (!model) return DEFAULT_MODEL;
    // 腾讯云 API 模型名区分大小写，强制小写
    return model.toLowerCase();
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
    console.log(`  🤖 LLM 调用: model=${resolvedModel}, baseURL=${process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL}, maxTokens=${maxTokens}`);
    
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
            console.error(`  请求参数: model=${resolvedModel}, baseURL=${process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL}`);
            if (error.status) console.error(`  HTTP Status: ${error.status}`);
            if (error.error) console.error(`  Error Body: ${JSON.stringify(error.error)}`);
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
