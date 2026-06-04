/**
 * 机器之心 (jiqizhixin.com) 抓取器
 * 获取最新 AI 资讯
 */

const axios = require('axios');
const cheerio =require('cheerio');
const { BaseFetcher } = require('./base');

class JiqizhixinFetcher extends BaseFetcher {
    constructor() {
        super('jiqizhixin', '机器之心');
    }

    async fetch() {
        const signals = [];

        try {
            // 机器之心首页
            const resp = await axios.get('https://www.jiqizhixin.com/', {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'text/html',
                }
            });

            const $ = cheerio.load(resp.data);

            // 机器之心文章列表 - 常见选择器
            const articles = $('.article-item, .post-item, .content-list .item, a.article-title').toArray();
            for (const el of articles.slice(0, 15)) {
                const $el = $(el);
                const title = $el.find('h2, h3, .title, .article-title').text().trim() || $el.text().trim();
                const link = $el.find('a').attr('href') || $el.attr('href') || '';
                const summary = $el.find('p, .desc, .summary, .excerpt').text().trim();

                if (!title || title.length < 5) continue;

                const fullUrl = link.startsWith('http') ? link : `https://www.jiqizhixin.com${link}`;

                signals.push({
                    id: `jqzx-${Buffer.from(fullUrl).toString('base64').slice(0, 12)}`,
                    title: title.slice(0, 120),
                    url: fullUrl,
                    source: '机器之心',
                    summary: summary.slice(0, 200),
                    score: 55,
                    category: 'news',
                });
            }
        } catch (error) {
            console.error(`  [${this.name}] 首页抓取失败: ${error.message}`);
        }

        try {
            // 尝试 API
            const apiResp = await axios.get('https://www.jiqizhixin.com/api/articles', {
                timeout: 15000,
                params: { limit: 15, type: 'latest' },
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            if (apiResp.data && Array.isArray(apiResp.data.data || apiResp.data)) {
                const items = apiResp.data.data || apiResp.data;
                for (const item of items.slice(0, 15)) {
                    signals.push({
                        id: `jqzx-${item.id || Date.now()}`,
                        title: (item.title || '').slice(0, 120),
                        url: item.url || item.link || `https://www.jiqizhixin.com/articles/${item.id}`,
                        source: '机器之心',
                        summary: (item.summary || item.abstract || item.description || '').slice(0, 200),
                        score: 60,
                        category: 'news',
                    });
                }
            }
        } catch (error) {
            // API 不公开则忽略
        }

        return signals;
    }
}

module.exports = { JiqizhixinFetcher };
