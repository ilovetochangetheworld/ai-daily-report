/**
 * V2EX 抓取器
 * 抓取 V2EX 热门主题（中文技术社区）
 */

import axios from 'axios';
import { BaseFetcher } from './base.js';

export class V2EXFetcher extends BaseFetcher {
    constructor() {
        super('V2EX');
        this.client = axios.create({
            baseURL: 'https://www.v2ex.com',
            timeout: 10000,
            headers: {
                'User-Agent': 'AIDailyReport/1.0',
            },
        });
    }

    async fetch() {
        const signals = [];
        
        try {
            // V2EX API: 获取最新主题
            const response = await this.client.get('/api/topics/hot.json');
            const topics = response.data || [];
            
            for (const topic of topics) {
                // 检查是否与 AI 相关
                const isAI = this._isAIRelated(topic.title, topic.content || '');
                if (!isAI) continue;
                
                signals.push({
                    id: `v2ex-${topic.id}`,
                    title: topic.title,
                    url: `https://www.v2ex.com/t/${topic.id}`,
                    source: 'v2ex',
                    category: 'discussion',
                    published_date: new Date(topic.created * 1000).toISOString(),
                    score: topic.replies || 0,
                    summary: topic.content?.substring(0, 300) || '',
                    metadata: {
                        node_name: topic.node?.name,
                        node_title: topic.node?.title,
                        replies: topic.replies,
                        member: topic.member?.username,
                    },
                });
            }
            
        } catch (error) {
            console.error('V2EX 抓取失败:', error.message);
        }

        return signals;
    }

    /**
     * 判断主题是否与 AI 相关
     */
    _isAIRelated(title, content) {
        const aiKeywords = [
            'ai', '人工智能', '机器学习', '深度学习', '神经网络',
            'llm', 'gpt', 'claude', 'gemini', 'chatgpt',
            '模型', '训练', '推理', 'agent', '智能体',
            'huggingface', 'transformer', 'diffusion',
        ];
        
        const text = `${title} ${content || ''}`.toLowerCase();
        return aiKeywords.some(kw => text.includes(kw));
    }
}
