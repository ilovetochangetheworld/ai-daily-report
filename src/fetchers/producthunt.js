/**
 * Product Hunt 抓取器
 * 抓取当日热门产品（votes > 50）
 */

import axios from 'axios';
import { BaseFetcher } from './base.js';

export class ProductHuntFetcher extends BaseFetcher {
    constructor() {
        super('Product Hunt');
        this.client = axios.create({
            baseURL: 'https://api.producthunt.com/v2/api/graphql',
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });
    }

    async fetch() {
        const signals = [];
        const token = process.env.PRODUCT_HUNT_TOKEN;
        
        if (!token) {
            console.warn('  ⚠ PRODUCT_HUNT_TOKEN 未设置，跳过 Product Hunt');
            return signals;
        }

        try {
            // GraphQL 查询当日热门产品
            const query = `
                query {
                    posts(order: VOTES_COUNT, first: 20) {
                        edges {
                            node {
                                id
                                name
                                tagline
                                description
                                url
                                votesCount
                                commentsCount
                                createdAt
                                topics {
                                    edges {
                                        node {
                                            name
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            this.client.defaults.headers['Authorization'] = `Bearer ${token}`;
            
            const response = await this.client.post('', { query });
            const posts = response.data?.data?.posts?.edges || [];
            
            for (const { node: post } of posts) {
                if (post.votesCount < 50) continue; // 过滤低票数
                
                // 检查是否与 AI 相关
                const isAI = this._isAIRelated(post);
                if (!isAI) continue;
                
                signals.push({
                    id: `ph-${post.id}`,
                    title: post.name,
                    url: post.url || `https://www.producthunt.com/products/${post.slug}`,
                    source: 'producthunt',
                    category: 'project',
                    published_date: new Date(post.createdAt).toISOString(),
                    score: post.votesCount,
                    summary: post.tagline || post.description,
                    metadata: {
                        votes: post.votesCount,
                        comments: post.commentsCount,
                        topics: post.topics?.edges?.map(e => e.node.name) || [],
                    },
                });
            }
            
        } catch (error) {
            console.error('Product Hunt 抓取失败:', error.message);
        }

        return signals;
    }

    /**
     * 判断产品是否与 AI 相关
     */
    _isAIRelated(post) {
        const aiTopics = [
            'artificial-intelligence', 'machine-learning', 'deep-learning',
            'nlp', 'computer-vision', 'ai-assistant', 'llm', 'gpt',
            'automation', 'productivity', 'developer-tools',
        ];
        
        const topics = post.topics?.edges?.map(e => e.node.name.toLowerCase()) || [];
        const text = `${post.name} ${post.tagline} ${post.description}`.toLowerCase();
        
        // 通过话题判断
        const hasAITopic = topics.some(t => aiTopics.includes(t));
        if (hasAITopic) return true;
        
        // 通过关键词判断
        const aiKeywords = ['ai', 'llm', 'gpt', 'agent', 'smart', 'intelligent', 'automation'];
        return aiKeywords.some(kw => text.includes(kw));
    }
}
