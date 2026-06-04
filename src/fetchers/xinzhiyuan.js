/**
 * 新智元 (xinzhiyuan.com) 抓取器
 * 获取最新 AI 资讯
 */

const axios = require('axios');
const cheerio =require('cheerio');
const { BaseFetcher } = require('./base');

class XinzhiyuanFetcher extends BaseFetcher {
    constructor() {
        super('xinzhiyuan', '新智元');
    }

    async fetch() {
        const signals = [];

        try {
            const resp = await axios.get('https://www.xinzhiyuan.com/', {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'text/html',
                }
            });

            const $ = cheerio.load(resp.data);

            const articles = $('.article-item, .post-item, .content-list .item, a.article-title, .post-card').toArray();
            for (const el of articles.slice(0, 15)) {
                const $el = $(el);
                const title = $el.find('h2, h3, .title, .article-title').text().trim() || $el.text().trim();
                const link = $el.find('a').attr('href') || $el.attr('href') || '';
                const summary = $el.find('p, .desc, .summary, .excerpt').text().trim();

                if (!title || title.length < 5) continue;

                const fullUrl = link.startsWith('http') ? link : `https://www.xinzhiyuan.com${link}`;

                signals.push({
                    id: `xzy-${Buffer.from(fullUrl).toString('base64').slice(0, 12)}`,
                    title: title.slice(0, 120),
                    url: fullUrl,
                    source: '新智元',
                    summary: summary.slice(0, 200),
                    score: 55,
                    category: 'news',
                });
            }
        } catch (error) {
            console.error(`  [${this.name}] 抓取失败: ${error.message}`);
        }

        try {
            // 尝试 RSS
            const rssResp = await axios.get('https://www.xinzhiyuan.com/feed', {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const $ = cheerio.load(rssResp.data, { xmlMode: true });
            $('item').slice(0, 15).each((_, el) => {
                const title = $(el).find('title').text().trim();
                const link = $(el).find('link').text().trim();
                const desc = $(el).find('description').text().trim();

                if (title && link) {
                    signals.push({
                        id: `xzy-rss-${Buffer.from(link).toString('base64').slice(0, 12)}`,
                        title: title.slice(0, 120),
                        url: link,
                        source: '新智元',
                        summary: desc.replace(/<[^>]*>/g, '').slice(0, 200),
                        score: 58,
                        category: 'news',
                    });
                }
            });
        } catch (error) {
            // RSS 不可用则忽略
        }

        return signals;
    }
}

module.exports = { XinzhiyuanFetcher };
