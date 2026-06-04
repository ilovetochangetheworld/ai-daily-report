/**
 * LLM 调用封装 - 支持任何 OpenAI 兼容 API
 */

const OpenAI = require('openai');

function createClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.lkeap.cloud.tencent.com/plan/v3';
    
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY 未设置');
    }

    return new OpenAI({ apiKey, baseURL });
}

async function callLLM(systemPrompt, userPrompt, options = {}) {
    const {
        model = process.env.OPENAI_MODEL || 'GLM-5.1',
        temperature = 0.7,
        maxTokens = 4000,
        retryCount = 3,
    } = options;

    const client = createClient();
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model,
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

module.exports = { callLLM, callLLMJson };
