/**
 * Jina Reader Fetcher
 * 通过 r.jina.ai 将任意网页转为 Markdown，替代脆弱的 cheerio 选择器爬虫
 * 支持：机器之心、36kr-AI、量子位等中文 AI 媒体
 * 零配置，无需 API Key
 */

const axios = require('axios');
const { BaseFetcher } = require('./base');

// 预配置的中文 AI 媒体源
const JINA_SOURCES = [
    {
        name: '36kr-AI',
        url: 'https://36kr.com/information/AI/',
        score: 50,
        category: 'news',
    },
    {
        name: '量子位',
        url: 'https://www.qbitai.com/',
        score: 50,
        category: 'news',
    },
    {
        name: '机器之心',
        url: 'https://www.jiqizhixin.com/',
        score: 55,
        category: 'news',
    },
];

class JinaReaderFetcher extends BaseFetcher {
    constructor() {
        super('Jina Reader');
        this.client = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'AIDailyReport/1.0',
                'Accept': 'text/plain',
            },
        });
    }

    async fetch() {
        const signals = [];

        const results = await Promise.allSettled(
            JINA_SOURCES.map(source => this.fetchSource(source))
        );

        for (const result of results) {
            if (result.status === 'fulfilled') {
                signals.push(...result.value);
            }
        }

        return signals;
    }

    async fetchSource(source) {
        const signals = [];
        const jinaUrl = `https://r.jina.ai/${source.url}`;

        try {
            const resp = await this.client.get(jinaUrl);
            const markdown = resp.data || '';

            // 从 Markdown 文本中提取 og:image meta
            let ogImageUrl = null;
            const ogImageMatch = markdown.match(/og:image["'\s]+content=["']([^"']+)["']/i)
                || markdown.match(/content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
            if (ogImageMatch && ogImageMatch[1] && ogImageMatch[1].startsWith('http')) {
                ogImageUrl = ogImageMatch[1];
            }

            // 从 Markdown 文本中提取链接和标题
            const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
            const seen = new Set();
            let match;

            while ((match = linkRegex.exec(markdown)) !== null) {
                let title = match[1].trim();
                const url = match[2].trim();

                // 清理标题中的图片标记如 ![Image 2: xxx]
                title = title.replace(/!\[Image \d+:\s*/g, '').trim();

                // 过滤
                if (title.length < 8) continue;
                if (url.includes('/search') || url.includes('/login') || url.includes('/register') || url.includes('/column')) continue;
                if (seen.has(url)) continue;
                seen.add(url);

                // AI 相关性过滤
                if (!this._isAIRelated(title)) continue;

                // 排除导航/页脚类标题
                if (this._isNavText(title)) continue;

                signals.push({
                    id: `jina-${Buffer.from(url).toString('base64').slice(0, 12)}`,
                    title: title.slice(0, 120),
                    url: url,
                    source: source.name,
                    category: source.category,
                    published_date: new Date().toISOString(),
                    score: source.score,
                    summary: '',
                    image_url: ogImageUrl,
                });
            }

            console.log(`    ✓ Jina [${source.name}]: ${signals.length} 条`);

        } catch (error) {
            console.error(`    ✗ Jina [${source.name}] 失败: ${error.message}`);
        }

        return signals;
    }

    _isAIRelated(title) {
        const aiKeywords = [
            'ai', '人工智能', '机器学习', '深度学习', '神经网络',
            'llm', 'gpt', 'claude', 'gemini', 'chatgpt', 'openai', 'anthropic',
            '模型', '训练', '推理', 'agent', '智能体', '大模型',
            'diffusion', 'transformer', '多模态', 'aigc', '生成式',
            'cursor', 'copilot', 'coding', 'rag', '微调', 'chatbot',
            'ipo', '融资', '上市',
        ];
        const text = title.toLowerCase();
        return aiKeywords.some(kw => text.includes(kw));
    }

    _isNavText(title) {
        const navPatterns = ['首页', '关于', '联系我们', '登录', '注册', '搜索', '更多', '下载APP', '关注我们', 'ESG', '加入我们'];
        return navPatterns.some(p => title.includes(p));
    }
}

module.exports = { JinaReaderFetcher };
