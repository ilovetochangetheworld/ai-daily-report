/**
 * Hacker News 抓取器
 */

const axios = require('axios');
const { BaseFetcher } = require('./base');

class HackerNewsFetcher extends BaseFetcher {
    constructor() {
        super('Hacker News');
        this.client = axios.create({
            baseURL: 'https://hn.algolia.com/api/v1',
            timeout: 10000,
        });
    }

    async fetch() {
        const signals = [];
        const keywords = [
            'AI OR artificial intelligence OR machine learning OR deep learning OR neural network',
            'LLM OR GPT OR Claude OR Gemini',
            'OpenAI OR Anthropic OR DeepMind',
        ];

        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const numericDate = Math.floor(yesterday.getTime() / 1000);

        for (const query of keywords) {
            try {
                const response = await this.client.get('/search', {
                    params: {
                        query,
                        tags: 'story',
                        numericFilters: `created_at_i>${numericDate}`,
                        attributesToRetrieve: 'objectID,title,url,points,num_comments,created_at',
                        hitsPerPage: 50,
                    },
                });

                const hits = response.data.hits || [];
                
                for (const hit of hits) {
                    if (hit.points < 20) continue;
                    
                    signals.push({
                        id: `hn-${hit.objectID}`,
                        title: hit.title,
                        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
                        source: 'hackernews',
                        category: 'discussion',
                        published_date: hit.created_at,
                        score: hit.points,
                        metadata: {
                            comments: hit.num_comments,
                            hn_id: hit.objectID,
                        },
                    });
                }
            } catch (error) {
                console.error(`HN 查询失败 (${query}):`, error.message);
            }
        }

        const unique = new Map();
        for (const signal of signals) {
            const key = signal.url || signal.id;
            if (!unique.has(key) || unique.get(key).score < signal.score) {
                unique.set(key, signal);
            }
        }

        return Array.from(unique.values());
    }
}

module.exports = { HackerNewsFetcher };
