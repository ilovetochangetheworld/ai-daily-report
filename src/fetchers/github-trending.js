/**
 * GitHub Trending 抓取器
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { BaseFetcher } = require('./base');

class GitHubTrendingFetcher extends BaseFetcher {
    constructor() {
        super('GitHub Trending');
        this.client = axios.create({
            baseURL: 'https://github.com',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AIDailyReport/1.0)',
            },
        });
    }

    async fetch() {
        const signals = [];
        
        try {
            const response = await this.client.get('/trending');
            const $ = cheerio.load(response.data);
            
            $('article.Box-row').each((index, element) => {
                const $el = $(element);
                const repoLink = $el.find('h2 a');
                const repoPath = repoLink.attr('href');
                if (!repoPath) return;
                
                const repoName = repoPath.replace('/', '').trim();
                const url = `https://github.com${repoPath}`;
                const description = $el.find('p').first().text().trim();
                const starsText = $el.find('.d-inline-block.float-sm-right').text().trim();
                const starsMatch = starsText.match(/([\d,]+)\s+stars?/);
                const starsToday = starsMatch ? parseInt(starsMatch[1].replace(/,/g, '')) : 0;
                const language = $el.find('[itemprop="programmingLanguage"]').text().trim();
                
                const isAI = this._isAIRelated(repoName, description, language);
                if (!isAI) return;
                
                // 提取仓库 avatar 图片地址
                const avatarImg = $el.find('img.avatar').attr('src') || '';
                const imageUrl = avatarImg.startsWith('http') ? avatarImg : null;
                
                signals.push({
                    id: `gh-${repoName.replace('/', '-')}`,
                    title: repoName,
                    url: url,
                    source: 'github',
                    category: 'project',
                    published_date: new Date().toISOString(),
                    score: starsToday || 10,
                    summary: description,
                    image_url: imageUrl,
                    metadata: {
                        language: language,
                        stars_today: starsToday,
                        full_name: repoName,
                    },
                });
            });
            
        } catch (error) {
            console.error('GitHub Trending 抓取失败:', error.message);
        }

        return signals;
    }

    _isAIRelated(name, description, language) {
        const aiKeywords = [
            'ai', 'ml', 'llm', 'gpt', 'transformer', 'neural', 'deep', 'learning',
            'pytorch', 'tensorflow', 'huggingface', 'anthropic', 'openai', 'gemini',
            'claude', 'agent', 'rag', 'embedding', 'diffusion', 'stable',
        ];
        const text = `${name} ${description}`.toLowerCase();
        return aiKeywords.some(keyword => text.includes(keyword));
    }
}

module.exports = { GitHubTrendingFetcher };
