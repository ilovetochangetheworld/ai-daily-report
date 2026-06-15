/**
 * Exa 语义搜索 Fetcher
 * 多搜索引擎聚合，获取最新 AI 相关内容
 * 
 * 优先级：
 * 1. Exa API（如果设置了 EXA_API_KEY）— 语义搜索，质量最高
 * 2. Google News RSS — 免费，无需 API Key，覆盖面广
 * 3. DuckDuckGo HTML — 免费搜索兜底
 */

const axios = require('axios');
const { Readable } = require('stream');
const FeedParser = require('feedparser');
const { BaseFetcher } = require('./base');

// 搜索查询
const SEARCH_QUERIES = [
    { q: 'frontier AI model release OpenAI Anthropic Google DeepMind', lang: 'en', category: 'product' },
    { q: 'AI agents tool use computer use model context protocol MCP', lang: 'en', category: 'coding' },
    { q: 'agent harness engineering evaluation sandbox CLI IDE agents', lang: 'en', category: 'coding' },
    { q: 'open source AI agent LLM inference RAG GitHub trending', lang: 'en', category: 'opensource' },
    { q: 'AI startup funding acquisition enterprise agents infrastructure', lang: 'en', category: 'industry' },
    { q: '大模型 AI 发布 融资 智能体 开源', lang: 'zh', category: 'news' },
];

const GOOGLE_NEWS_RSS_QUERIES = [
    'artificial intelligence AI breakthroughs',
    'OpenAI Anthropic Google DeepMind',
    'LLM GPT Claude Gemini new release',
    'AI agents MCP tool use computer use',
    'open source AI agents GitHub',
    'AI startup funding acquisition',
];

class ExaSearchFetcher extends BaseFetcher {
    constructor() {
        super('Exa Search');
    }

    async fetch() {
        // 优先使用 Exa API
        const apiKey = process.env.EXA_API_KEY;
        if (apiKey) {
            return this.fetchViaExaAPI(apiKey);
        }
        // 降级到 Google News RSS
        return this.fetchViaGoogleNewsRSS();
    }

    async fetchViaExaAPI(apiKey) {
        const signals = [];
        const client = axios.create({
            baseURL: 'https://api.exa.ai',
            timeout: 20000,
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
            },
        });

        const now = new Date();
        const yesterday = new Date(now.getTime() - 36 * 60 * 60 * 1000);

        for (const query of SEARCH_QUERIES) {
            try {
                const resp = await client.post('/search', {
                    query: query.q,
                    num_results: 10,
                    use_autoprompt: true,
                    type: 'neural',
                    startPublishedDate: yesterday.toISOString(),
                    contents: {
                        text: { maxCharacters: 500 },
                    },
                });

                const results = resp.data?.results || [];
                for (const item of results) {
                    if (!item.title || !item.url) continue;

                    signals.push({
                        id: `exa-${Buffer.from(item.url).toString('base64').slice(0, 12)}`,
                        title: item.title.slice(0, 120),
                        url: item.url,
                        source: item.author || this.extractSource(item.url),
                        category: query.category || 'news',
                        published_date: item.publishedDate || new Date().toISOString(),
                        score: this.scoreSearchResult(item, query),
                        summary: (item.text || '').slice(0, 300),
                        metadata: {
                            search_query: query.q,
                            search_lang: query.lang,
                        },
                    });
                }
            } catch (error) {
                console.error(`    ✗ Exa 搜索失败 [${query.q.slice(0, 30)}]: ${error.message}`);
            }
        }

        const unique = this.deduplicate(signals);
        console.log(`    ✓ Exa Search: ${unique.length} 条`);
        return unique;
    }

    async fetchViaGoogleNewsRSS() {
        // Google News RSS: 免费、无需 Key、支持任何关键词
        // 格式: https://news.google.com/rss/search?q=QUERY&hl=en&gl=US&ceid=US:en
        const signals = [];

        const feeds = [
            { query: GOOGLE_NEWS_RSS_QUERIES[0], hl: 'en', gl: 'US', ceid: 'US:en', category: 'news' },
            { query: GOOGLE_NEWS_RSS_QUERIES[1], hl: 'en', gl: 'US', ceid: 'US:en', category: 'product' },
            { query: GOOGLE_NEWS_RSS_QUERIES[2], hl: 'en', gl: 'US', ceid: 'US:en', category: 'product' },
            { query: GOOGLE_NEWS_RSS_QUERIES[3], hl: 'en', gl: 'US', ceid: 'US:en', category: 'coding' },
            { query: GOOGLE_NEWS_RSS_QUERIES[4], hl: 'en', gl: 'US', ceid: 'US:en', category: 'opensource' },
            { query: GOOGLE_NEWS_RSS_QUERIES[5], hl: 'en', gl: 'US', ceid: 'US:en', category: 'industry' },
            { query: '人工智能 大模型 最新 智能体 开源', hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans', category: 'news' },
        ];

        for (const feed of feeds) {
            try {
                const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(feed.query)}&hl=${feed.hl}&gl=${feed.gl}&ceid=${feed.ceid}`;
                const resp = await axios.get(rssUrl, {
                    timeout: 15000,
                    headers: { 'User-Agent': 'AIDailyReport/1.0' },
                    responseType: 'text',
                });

                const items = await this.parseFeed(resp.data);
                const now = new Date();
                const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

                for (const item of items.slice(0, 15)) {
                    const pubDate = item.pubdate ? new Date(item.pubdate) : now;
                    if (pubDate < twoDaysAgo) continue;

                    // 清理 Google News 重定向 URL
                    const realUrl = this.extractRealUrl(item.link || '');

                    signals.push({
                        id: `gn-${Buffer.from(item.link || item.title).toString('base64').slice(0, 12)}`,
                        title: (item.title || '').slice(0, 120),
                        url: realUrl,
                        source: item.author || this.extractSource(realUrl) || 'Google News',
                        category: feed.category || 'news',
                        published_date: pubDate.toISOString(),
                        score: this.scoreNewsResult(item.title || '', item.description || item.summary || '', feed.query),
                        summary: (item.description || item.summary || '').replace(/<[^>]*>/g, '').slice(0, 300),
                        metadata: {
                            search_query: feed.query,
                            source_tier: 'news_search',
                        },
                    });
                }
            } catch (error) {
                console.error(`    ✗ Google News RSS 失败 [${feed.query.slice(0, 25)}]: ${error.message}`);
            }
        }

        const unique = this.deduplicate(signals);
        console.log(`    ✓ Google News RSS: ${unique.length} 条`);
        return unique;
    }

    extractRealUrl(link) {
        // 从 Google News URL 提取真实 URL
        try {
            const url = new URL(link);
            if (url.hostname.includes('news.google.com')) {
                // 尝试从 URL 参数中提取
                const realUrl = url.searchParams.get('url');
                if (realUrl) return realUrl;
                // articles 后面的 base64 编码
                const match = link.match(/articles\/(.+)/);
                if (match) {
                    try {
                        const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
                        const urlMatch = decoded.match(/https?:\/\/[^\s]+/);
                        if (urlMatch) return urlMatch[0];
                    } catch { /* ignore */ }
                }
            }
        } catch { /* not a valid URL */ }
        return link;
    }

    extractSource(url) {
        try {
            const hostname = new URL(url).hostname.replace('www.', '');
            const sourceMap = {
                'github.com': 'GitHub',
                'news.ycombinator.com': 'Hacker News',
                'reddit.com': 'Reddit',
                'x.com': 'X/Twitter',
                'techcrunch.com': 'TechCrunch',
                'arxiv.org': 'arXiv',
                'huggingface.co': 'HuggingFace',
                'theverge.com': 'The Verge',
                '36kr.com': '36kr',
                'jiqizhixin.com': '机器之心',
                'qbitai.com': '量子位',
            };
            for (const [domain, name] of Object.entries(sourceMap)) {
                if (hostname.includes(domain)) return name;
            }
            return hostname.split('.')[0];
        } catch {
            return 'web';
        }
    }

    scoreSearchResult(item, query) {
        let score = item.score ? Math.round(item.score * 100) : 50;
        if (query.category === 'product') score += 8;
        if (query.category === 'coding' || query.category === 'opensource') score += 5;
        const text = `${item.title || ''} ${item.text || ''}`.toLowerCase();
        if (/(openai|anthropic|deepmind|google|microsoft|nvidia|hugging face)/i.test(text)) score += 6;
        if (/(agent|harness|mcp|tool use|eval|benchmark|inference|rag)/i.test(text)) score += 6;
        return Math.max(10, Math.min(score, 90));
    }

    scoreNewsResult(title, summary, query) {
        let score = 48;
        const text = `${title} ${summary} ${query}`.toLowerCase();
        if (/(openai|anthropic|deepmind|google|microsoft|nvidia|hugging face)/i.test(text)) score += 8;
        if (/(launch|release|funding|acquisition|policy|发布|融资|收购)/i.test(text)) score += 5;
        if (/(agent|harness|mcp|tool use|eval|benchmark|inference|rag)/i.test(text)) score += 5;
        return Math.max(10, Math.min(score, 82));
    }

    parseFeed(xmlContent) {
        return new Promise((resolve, reject) => {
            const items = [];
            const feedparser = new FeedParser();

            feedparser.on('error', reject);
            feedparser.on('readable', function () {
                let item;
                while ((item = this.read())) {
                    items.push(item);
                }
            });
            feedparser.on('end', () => resolve(items));

            const stream = Readable.from([xmlContent]);
            stream.pipe(feedparser);
        });
    }

    deduplicate(signals) {
        const unique = new Map();
        for (const signal of signals) {
            const key = signal.url || signal.title;
            if (!unique.has(key)) {
                unique.set(key, signal);
            } else if ((unique.get(key).score || 0) < (signal.score || 0)) {
                unique.set(key, signal);
            }
        }
        return Array.from(unique.values());
    }
}

module.exports = { ExaSearchFetcher };
