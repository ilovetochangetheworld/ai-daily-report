/**
 * GitHub Trending 抓取器
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { BaseFetcher } = require('./base');

const SEARCH_QUERIES = [
    'topic:artificial-intelligence stars:>100 pushed:>={date}',
    'topic:llm stars:>100 pushed:>={date}',
    'topic:ai-agent stars:>50 pushed:>={date}',
    'topic:rag stars:>50 pushed:>={date}',
    'topic:mcp stars:>20 pushed:>={date}',
    'topic:inference stars:>50 pushed:>={date}',
    'agent harness stars:>20 pushed:>={date}',
];

function getGitHubToken() {
    return process.env.GH_TOKEN || process.env.AI_DAILY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
}

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
        this.apiClient = axios.create({
            baseURL: 'https://api.github.com',
            timeout: 12000,
            headers: {
                'User-Agent': 'AIDailyReport/1.0',
                'Accept': 'application/vnd.github+json',
                ...(getGitHubToken() ? { Authorization: `Bearer ${getGitHubToken()}` } : {}),
            },
        });
    }

    async fetch() {
        const signals = [];
        
        try {
            const response = await this.client.get('/trending');
            const $ = cheerio.load(response.data);
            
            const reposToEnrich = [];

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

                reposToEnrich.push({
                    id: `gh-${repoName.replace('/', '-')}`,
                    title: repoName,
                    url: url,
                    source: 'github',
                    category: 'project',
                    published_date: new Date().toISOString(),
                    // starsToday 不直接作为 score，限制上限为 50，避免霸占 Top5
                    score: Math.min(starsToday || 10, 50),
                    summary: description,
                    image_url: '',  // 不提取头像等无关小图标
                    metadata: {
                        language: language,
                        stars_today: starsToday,
                        full_name: repoName,
                    },
                });
            });

            const enriched = await Promise.all(reposToEnrich.map(repo => this.enrichRepo(repo)));
            signals.push(...enriched);
            
        } catch (error) {
            console.error('GitHub Trending 抓取失败:', error.message);
        }

        signals.push(...await this.fetchSearchRepos());

        return this.dedupeByUrl(signals)
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 35);
    }

    async fetchSearchRepos() {
        const signals = [];
        const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        for (const queryTemplate of SEARCH_QUERIES) {
            const q = queryTemplate.replace('{date}', since);
            try {
                const response = await this.apiClient.get('/search/repositories', {
                    params: { q, sort: 'stars', order: 'desc', per_page: 8 },
                });

                for (const repo of (response.data.items || [])) {
                    if (!this._isAIRelated(repo.full_name, repo.description || '', repo.language || '')) continue;
                    signals.push({
                        id: `gh-search-${repo.id}`,
                        title: repo.full_name,
                        url: repo.html_url,
                        source: 'github',
                        category: 'project',
                        published_date: repo.pushed_at || repo.updated_at || new Date().toISOString(),
                        score: this.scoreRepo({
                            starsToday: 0,
                            stargazers: repo.stargazers_count || 0,
                            forks: repo.forks_count || 0,
                            openIssues: repo.open_issues_count || 0,
                            pushedAt: repo.pushed_at,
                            description: repo.description || '',
                        }),
                        summary: repo.description || '',
                        metadata: {
                            language: repo.language,
                            stars_today: 0,
                            stargazers_count: repo.stargazers_count,
                            forks_count: repo.forks_count,
                            open_issues_count: repo.open_issues_count,
                            pushed_at: repo.pushed_at,
                            full_name: repo.full_name,
                            discovery: 'github_search',
                        },
                    });
                }
            } catch (error) {
                console.error(`GitHub Search 失败 [${q.slice(0, 36)}]: ${error.message}`);
            }
        }

        return signals;
    }

    async enrichRepo(signal) {
        const fullName = signal.metadata?.full_name;
        if (!fullName || !fullName.includes('/')) return signal;

        try {
            const response = await this.apiClient.get(`/repos/${fullName}`);
            const repo = response.data || {};
            signal.score = this.scoreRepo({
                starsToday: signal.metadata.stars_today || 0,
                stargazers: repo.stargazers_count || 0,
                forks: repo.forks_count || 0,
                openIssues: repo.open_issues_count || 0,
                pushedAt: repo.pushed_at,
                description: signal.summary || repo.description || '',
            });
            signal.metadata = {
                ...signal.metadata,
                stargazers_count: repo.stargazers_count,
                forks_count: repo.forks_count,
                open_issues_count: repo.open_issues_count,
                pushed_at: repo.pushed_at,
                updated_at: repo.updated_at,
                license: repo.license?.spdx_id,
                discovery: 'github_trending',
            };
        } catch {
            signal.score = this.scoreRepo({
                starsToday: signal.metadata.stars_today || 0,
                description: signal.summary || '',
            });
        }
        return signal;
    }

    scoreRepo({ starsToday = 0, stargazers = 0, forks = 0, openIssues = 0, pushedAt = '', description = '' }) {
        const daysSincePush = pushedAt ? (Date.now() - new Date(pushedAt).getTime()) / (1000 * 60 * 60 * 24) : 30;
        let score = 30;
        score += Math.min(starsToday * 1.8, 32);
        score += Math.min(Math.log10(Math.max(stargazers, 1)) * 8, 28);
        score += Math.min(Math.log10(Math.max(forks, 1)) * 5, 14);
        score += daysSincePush <= 3 ? 12 : daysSincePush <= 14 ? 6 : 0;

        const text = description.toLowerCase();
        if (/(agent|harness|mcp|rag|inference|eval|benchmark|llm|tool use)/i.test(text)) score += 8;
        if (openIssues > 1000 && stargazers < 2000) score -= 6;

        return Math.max(10, Math.min(Math.round(score), 95));
    }

    dedupeByUrl(signals) {
        const map = new Map();
        for (const signal of signals) {
            const key = signal.url;
            const existing = map.get(key);
            if (!existing || (signal.score || 0) > (existing.score || 0)) {
                map.set(key, signal);
            }
        }
        return Array.from(map.values());
    }

    _isAIRelated(name, description, language) {
        const aiKeywords = [
            'ai', 'llm', 'gpt', 'transformer', 'neural', 'machine learning', 'deep learning',
            'pytorch', 'tensorflow', 'huggingface', 'anthropic', 'openai', 'gemini',
            'claude', 'agent', 'rag', 'embedding', 'diffusion', 'stable diffusion',
            'inference', 'eval', 'benchmark', 'mcp', 'harness', 'tool-use',
        ];
        const text = `${name} ${description}`.toLowerCase();
        return aiKeywords.some(keyword => text.includes(keyword));
    }
}

module.exports = { GitHubTrendingFetcher };
