/**
 * GitHub Trending 抓取器
 * 抓取今日 GitHub Trending 中的 AI/ML 项目
 */

import axios from 'axios';
import { load } from 'cheerio';
import { BaseFetcher } from './base.js';

export class GitHubTrendingFetcher extends BaseFetcher {
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
            // 抓取今日 trending
            const response = await this.client.get('/trending');
            const $ = load(response.data);
            
            // 解析 trending 项目
            $('article.Box-row').each((index, element) => {
                const $el = $(element);
                
                // 仓库名
                const repoLink = $el.find('h2 a');
                const repoPath = repoLink.attr('href');
                if (!repoPath) return;
                
                const repoName = repoPath.replace('/', '');
                const url = `https://github.com${repoPath}`;
                
                // 描述
                const description = $el.find('p').first().text().trim();
                
                // Stars 增长
                const starsText = $el.find('.d-inline-block.float-sm-right').text().trim();
                const starsMatch = starsText.match(/([\d,]+)\s+stars?/);
                const starsToday = starsMatch ? parseInt(starsMatch[1].replace(/,/g, '')) : 0;
                
                // 语言
                const language = $el.find('[itemprop="programmingLanguage"]').text().trim();
                
                // 过滤 AI/ML 相关项目（通过描述或语言判断）
                const isAI = this._isAIRelated(repoName, description, language);
                if (!isAI) return;
                
                signals.push({
                    id: `gh-${repoName.replace('/', '-')}`,
                    title: repoName,
                    url: url,
                    source: 'github',
                    category: 'project',
                    published_date: new Date().toISOString(),
                    score: starsToday || 10,
                    summary: description,
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

    /**
     * 判断项目是否与 AI/ML 相关
     */
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
