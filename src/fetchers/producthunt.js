/**
 * Product Hunt 抓取器
 */

const axios = require('axios');
const { BaseFetcher } = require('./base');

class ProductHuntFetcher extends BaseFetcher {
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
                if (post.votesCount < 50) continue;
                
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

    _isAIRelated(post) {
        const aiKeywords = ['ai', 'llm', 'gpt', 'agent', 'smart', 'intelligent', 'automation'];
        const text = `${post.name} ${post.tagline} ${post.description || ''}`.toLowerCase();
        return aiKeywords.some(kw => text.includes(kw));
    }
}

module.exports = { ProductHuntFetcher };
