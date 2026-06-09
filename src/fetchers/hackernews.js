/**
 * Hacker News Fetcher
 * 使用 Algolia HN Search API，按热度获取 AI 相关帖子
 * 零配置，无需 API Key
 */

const axios = require('axios');
const { BaseFetcher } = require('./base');

class HackerNewsFetcher extends BaseFetcher {
    constructor() {
        super('Hacker News');
        this.client = axios.create({
            baseURL: 'https://hn.algolia.com/api/v1',
            timeout: 15000,
        });
    }

    async fetch() {
        const signals = [];

        const now = new Date();
        const twoDaysAgo = Math.floor((now.getTime() - 48 * 60 * 60 * 1000) / 1000);

        // 搜索策略 1: 时间窗口内（48h），低门槛
        try {
            const resp = await this.client.get('/search', {
                params: {
                    query: 'AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic',
                    tags: 'story',
                    hitsPerPage: 50,
                    numericFilters: `created_at_i>${twoDaysAgo}`,
                    attributesToRetrieve: 'objectID,title,url,points,num_comments,created_at',
                },
            });

            for (const hit of (resp.data.hits || [])) {
                if ((hit.points || 0) < 15) continue;
                if (!this._isAIRelated(hit.title)) continue;

                signals.push({
                    id: `hn-${hit.objectID}`,
                    title: hit.title,
                    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
                    source: 'hackernews',
                    category: 'discussion',
                    published_date: hit.created_at,
                    score: hit.points,
                    metadata: { comments: hit.num_comments, hn_id: hit.objectID },
                });
            }
        } catch (error) {
            console.error('HN 近期搜索失败:', error.message);
        }

        // 搜索策略 2: 不限时间，高热度（兜底保底帖）
        if (signals.length < 5) {
            try {
                const resp = await this.client.get('/search', {
                    params: {
                        query: 'AI OR LLM OR machine learning',
                        tags: 'story',
                        hitsPerPage: 30,
                        numericFilters: 'points>100',
                        attributesToRetrieve: 'objectID,title,url,points,num_comments,created_at',
                    },
                });

                for (const hit of (resp.data.hits || [])) {
                    if (!this._isAIRelated(hit.title)) continue;
                    signals.push({
                        id: `hn-${hit.objectID}`,
                        title: hit.title,
                        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
                        source: 'hackernews',
                        category: 'discussion',
                        published_date: hit.created_at,
                        score: hit.points,
                        metadata: { comments: hit.num_comments, hn_id: hit.objectID },
                    });
                }
            } catch (error) {
                console.error('HN 高热度搜索失败:', error.message);
            }
        }

        // URL 去重
        const unique = new Map();
        for (const signal of signals) {
            const key = signal.url || signal.id;
            if (!unique.has(key) || unique.get(key).score < signal.score) {
                unique.set(key, signal);
            }
        }

        return Array.from(unique.values());
    }

    _isAIRelated(title) {
        if (!title) return false;
        const keywords = [
            'ai', 'llm', 'gpt', 'claude', 'gemini', 'openai', 'anthropic', 'deepmind',
            'machine learning', 'deep learning', 'neural net', 'transformer', 'diffusion',
            'model', 'agent', 'chatgpt', 'copilot', 'cursor', 'rag', 'embedding',
        ];
        const text = title.toLowerCase();
        return keywords.some(kw => text.includes(kw));
    }
}

module.exports = { HackerNewsFetcher };
