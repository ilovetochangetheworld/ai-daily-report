/**
 * RSS/Atom Feed Fetcher
 * 通过 feedparser 解析 RSS/Atom 订阅源，比 cheerio 猜选择器稳定得多
 * 零配置，无需 API Key
 */

const axios = require('axios');
const FeedParser = require('feedparser');
const { Readable } = require('stream');
const { BaseFetcher } = require('./base');

// 核心 AI 信息 RSS 源
const RSS_FEEDS = [
    // 一手/高权重来源：模型公司、研究机构、开发者生态
    { url: 'https://openai.com/news/rss.xml', name: 'OpenAI News', score: 78, filterAI: false, category: 'product', tier: 'primary' },
    { url: 'https://blog.google/technology/ai/rss/', name: 'Google AI Blog', score: 72, filterAI: false, category: 'product', tier: 'primary' },
    { url: 'https://huggingface.co/blog/feed.xml', name: 'Hugging Face Blog', score: 66, filterAI: false, category: 'opensource', tier: 'primary' },

    // 权威媒体/行业媒体
    { url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', name: 'MIT Tech Review AI', score: 62, filterAI: false, category: 'industry', tier: 'media' },
    { url: 'https://venturebeat.com/category/ai/feed/', name: 'VentureBeat AI', score: 58, filterAI: false, category: 'news', tier: 'media' },
    { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', name: 'TechCrunch AI', score: 56, filterAI: false, category: 'news', tier: 'media' },
    { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', name: 'The Verge AI', score: 52, filterAI: false, category: 'news', tier: 'media' },
    { url: 'https://the-decoder.com/feed/', name: 'The Decoder', score: 52, filterAI: true, category: 'news', tier: 'media' },
    { url: 'https://blogs.nvidia.com/blog/category/deep-learning/feed/', name: 'NVIDIA AI Blog', score: 54, filterAI: false, category: 'industry', tier: 'media' },

    // 社区/开发者情绪
    { url: 'https://news.ycombinator.com/rss', name: 'Hacker News', score: 42, filterAI: true, category: 'social', tier: 'community' },
    { url: 'https://www.reddit.com/r/MachineLearning/.rss', name: 'Reddit ML', score: 45, filterAI: false, category: 'social', tier: 'community' },
    { url: 'https://www.reddit.com/r/LocalLLaMA/.rss', name: 'Reddit LocalLLaMA', score: 45, filterAI: false, category: 'social', tier: 'community' },
    { url: 'https://www.reddit.com/r/ChatGPT/.rss', name: 'Reddit ChatGPT', score: 38, filterAI: false, category: 'social', tier: 'community' },
    
    // 中文
    { url: 'https://www.qbitai.com/feed', name: '量子位', score: 55, filterAI: false, category: 'news', tier: 'media' },
    { url: 'https://36kr.com/feed', name: '36kr', score: 42, filterAI: true, category: 'industry', tier: 'media' },
    { url: 'https://sspai.com/feed', name: '少数派', score: 32, filterAI: true, category: 'news', tier: 'media' },
];

class RSSFetcher extends BaseFetcher {
    constructor() {
        super('RSS Feeds');
    }

    async fetch() {
        const signals = [];

        const results = await Promise.allSettled(
            RSS_FEEDS.map(feed => this.fetchFeed(feed))
        );

        for (const result of results) {
            if (result.status === 'fulfilled') {
                signals.push(...result.value);
            }
        }

        return signals;
    }

    async fetchFeed(feedConfig) {
        const signals = [];

        try {
            const resp = await axios.get(feedConfig.url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'AIDailyReport/1.0',
                    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
                },
                responseType: 'text',
            });

            const items = await this.parseFeed(resp.data);

            const now = new Date();
            const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

            for (const item of items) {
                // 时间过滤
                const pubDate = item.pubdate ? new Date(item.pubdate) : now;
                if (pubDate < twoDaysAgo) continue;

                // AI 相关性过滤
                if (feedConfig.filterAI && !this._isAIRelated(item.title, item.description)) {
                    continue;
                }

                const title = (item.title || '').trim();
                const link = (item.link || item.origLink || '').trim();
                if (!title || !link) continue;

                // 提取图片/视频 URL
                let imageUrl = null;
                let videoUrl = null;

                // 从 enclosures 提取
                const enclosures = item.enclosures || [];
                for (const enc of enclosures) {
                    if (!enc.url) continue;
                    if ((enc.type || '').startsWith('image/') && !imageUrl) {
                        imageUrl = enc.url;
                    } else if ((enc.type || '').startsWith('video/') && !videoUrl) {
                        videoUrl = enc.url;
                    } else if ((enc.type || '').startsWith('audio/') && !videoUrl) {
                        videoUrl = enc.url;
                    }
                }

                // 从 media:content 提取
                const mediaContent = item['media:content'] || item['media:group']?.['media:content'] || [];
                const mediaList = Array.isArray(mediaContent) ? mediaContent : [mediaContent];
                for (const mc of mediaList) {
                    if (!mc || !mc['@']) continue;
                    const attrs = mc['@'];
                    if ((attrs.medium === 'image' || (attrs.type || '').startsWith('image/')) && !imageUrl && attrs.url) {
                        imageUrl = attrs.url;
                    }
                    if ((attrs.medium === 'video' || (attrs.type || '').startsWith('video/')) && !videoUrl && attrs.url) {
                        videoUrl = attrs.url;
                    }
                }

                // 从 media:thumbnail 提取
                const mediaThumbnail = item['media:thumbnail'] || item['media:group']?.['media:thumbnail'];
                if (mediaThumbnail && mediaThumbnail['@']?.url && !imageUrl) {
                    imageUrl = mediaThumbnail['@'].url;
                }

                signals.push({
                    id: `rss-${Buffer.from(link).toString('base64').slice(0, 12)}`,
                    title: title.slice(0, 120),
                    url: link,
                    source: item.author || feedConfig.name,
                    category: feedConfig.category || 'news',
                    published_date: pubDate.toISOString(),
                    score: this.scoreFeedItem(feedConfig, title, item.description || item.summary || ''),
                    summary: (item.description || item.summary || '').replace(/<[^>]*>/g, '').slice(0, 300),
                    image_url: imageUrl,
                    video_url: videoUrl,
                    metadata: {
                        source_tier: feedConfig.tier || 'media',
                        feed_name: feedConfig.name,
                    },
                });
            }

            console.log(`    ✓ RSS [${feedConfig.name}]: ${signals.length} 条`);

        } catch (error) {
            console.error(`    ✗ RSS [${feedConfig.name}] 失败: ${error.message}`);
        }

        return signals;
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

    _isAIRelated(title, description) {
        const aiKeywords = [
            'ai', 'artificial intelligence', 'llm', 'gpt', 'claude', 'gemini',
            'machine learning', 'deep learning', 'neural network', 'transformer',
            '人工智能', '大模型', '机器学习', '深度学习',
            'openai', 'anthropic', 'diffusion', 'agent', 'multimodal',
            'rag', 'inference', 'eval', 'benchmark', 'harness', 'mcp',
            'tool use', 'agents', '机器人', '智能体', '推理', '评测',
        ];
        const text = `${title} ${description || ''}`.toLowerCase();
        return aiKeywords.some(kw => text.includes(kw));
    }

    scoreFeedItem(feedConfig, title, description) {
        let score = feedConfig.score || 40;
        const text = `${title} ${description || ''}`.toLowerCase();

        if (feedConfig.tier === 'primary') score += 8;
        if (feedConfig.tier === 'community') score -= 4;
        if (/(release|launch|announc|发布|上线|推出|开源|open source)/i.test(text)) score += 6;
        if (/(agent|harness|mcp|tool use|eval|benchmark|inference|智能体|工具调用|评测|推理)/i.test(text)) score += 5;
        if (/(rumor|leak|传闻|爆料)/i.test(text)) score -= 8;

        return Math.max(10, Math.min(score, 90));
    }
}

module.exports = { RSSFetcher };
