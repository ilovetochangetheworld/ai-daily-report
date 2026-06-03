/**
 * LLM 调用封装
 * 支持任何 OpenAI 兼容 API
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * 创建 OpenAI 客户端（兼容任何 OpenAI 兼容 API）
 */
function createClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY 未设置');
    }

    return new OpenAI({
        apiKey,
        baseURL,
    });
}

/**
 * 调用 LLM（带重试）
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userPrompt - 用户提示词
 * @param {object} options - 可选参数
 * @returns {Promise<string>} LLM 响应文本
 */
export async function callLLM(systemPrompt, userPrompt, options = {}) {
    const {
        model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
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
            
            if (attempt === retryCount) {
                throw error;
            }
            
            // 指数退避
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
    }
}

/**
 * 调用 LLM 并解析 JSON 响应
 */
export async function callLLMJson(systemPrompt, userPrompt, options = {}) {
    const response = await callLLM(systemPrompt, userPrompt, options);
    
    // 提取 JSON（可能包含在 markdown code block 中）
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

/**
 * 估算 token 数量（粗略）
 */
export function estimateTokens(text) {
    // 简单估算：1 token ≈ 4 字符（英文）或 1.5 字符（中文）
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}
