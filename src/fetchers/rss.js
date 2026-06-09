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
    // 英文
    { url: 'https://news.ycombinator.com/rss', name: 'Hacker News', score: 40, filterAI: true },
    { url: 'https://www.reddit.com/r/MachineLearning/.rss', name: 'Reddit ML', score: 45, filterAI: false },
    { url: 'https://www.reddit.com/r/LocalLLaMA/.rss', name: 'Reddit LocalLLaMA', score: 45, filterAI: false },
    { url: 'https://www.reddit.com/r/ChatGPT/.rss', name: 'Reddit ChatGPT', score: 40, filterAI: false },
    { url: 'https://feeds.feedburner.com/oreilly/radar', name: "O'Reilly Radar", score: 35, filterAI: true },
    { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', name: 'TechCrunch AI', score: 50, filterAI: false },
    
    // 中文
    { url: 'https://www.xinzhiyuan.com/feed', name: '新智元', score: 55, filterAI: false },
    { url: 'https://www.qbitai.com/feed', name: '量子位', score: 55, filterAI: false },
    { url: 'https://36kr.com/feed', name: '36kr', score: 40, filterAI: true },
    { url: 'https://sspai.com/feed', name: '少数派', score: 30, filterAI: true },
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
                    category: 'news',
                    published_date: pubDate.toISOString(),
                    score: feedConfig.score,
                    summary: (item.description || item.summary || '').replace(/<[^>]*>/g, '').slice(0, 300),
                    image_url: imageUrl,
                    video_url: videoUrl,
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
        ];
        const text = `${title} ${description || ''}`.toLowerCase();
        return aiKeywords.some(kw => text.includes(kw));
    }
}

module.exports = { RSSFetcher };
