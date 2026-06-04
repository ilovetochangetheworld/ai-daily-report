/**
 * AI Coding 动态抓取器
 * 聚合 AI 编程工具相关动态（Cursor, Copilot, Claude Code, Codex 等）
 * 数据源：GitHub releases, Hacker News AI coding 标签
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { BaseFetcher } = require('./base');

// 需要关注的 AI Coding 仓库
const WATCHED_REPOS = [
    { owner: 'anthropics', repo: 'claude-code', name: 'Claude Code' },
    { owner: 'openai', repo: 'codex', name: 'OpenAI Codex CLI' },
    { owner: 'getcursor', repo: 'cursor', name: 'Cursor' },
    { owner: 'github', repo: 'copilot-docs', name: 'GitHub Copilot' },
    { owner: 'tabbyml', repo: 'tabby', name: 'Tabby' },
    { owner: 'continuedev', repo: 'continue', name: 'Continue' },
    { owner: 'sourcegraph', repo: 'cody', name: 'Sourcegraph Cody' },
    { owner: 'codestoryai', repo: 'aide', name: 'Aide' },
    { owner: 'meltylabs', repo: 'melty', name: 'Melty' },
    { owner: 'smallcloudai', repo: 'refact', name: 'Refact' },
];

class AICodingFetcher extends BaseFetcher {
    constructor() {
        super('ai-coding', 'AI Coding');
    }

    async fetch() {
        const signals = [];

        // 1. 检查关注的仓库最新 Release
        const releasePromises = WATCHED_REPOS.map(async (repo) => {
            try {
                const resp = await axios.get(
                    `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=2`,
                    {
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'AI-Daily-Report',
                            'Accept': 'application/vnd.github.v3+json',
                        }
                    }
                );

                const releases = resp.data || [];
                for (const release of releases.slice(0, 2)) {
                    const publishedAt = new Date(release.published_at);
                    const daysAgo = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

                    if (daysAgo > 3) continue; // 只关注最近 3 天的发布

                    signals.push({
                        id: `coding-gh-${repo.owner}-${repo.repo}-${release.id || Date.now()}`,
                        title: `${repo.name} ${release.tag_name || '更新'}`,
                        url: release.html_url,
                        source: 'GitHub Release',
                        summary: (release.body || '').slice(0, 300),
                        score: daysAgo < 1 ? 75 : 60,
                        category: 'coding',
                    });
                }
            } catch (error) {
                // 仓库不存在或无 release，忽略
            }
        });

        await Promise.allSettled(releasePromises);

        // 2. 抓取 HN 上 AI coding 相关讨论
        try {
            const hnResp = await axios.get('https://hn.algolia.com/api/v1/search', {
                timeout: 10000,
                params: {
                    query: 'AI coding OR Cursor OR Copilot OR "Claude Code" OR Codex',
                    tags: 'story',
                    hitsPerPage: 15,
                    numericFilters: 'points>10',
                }
            });

            const hits = (hnResp.data && hnResp.data.hits) || [];
            for (const hit of hits) {
                const createdAt = new Date(hit.created_at);
                const daysAgo = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

                if (daysAgo > 2) continue;

                signals.push({
                    id: `coding-hn-${hit.objectID}`,
                    title: hit.title || '',
                    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
                    source: 'Hacker News',
                    summary: `HN ${hit.points} points, ${hit.num_comments} comments`,
                    score: Math.min(50 + Math.floor((hit.points || 0) / 5), 90),
                    category: 'coding',
                });
            }
        } catch (error) {
            console.error(`  [AI Coding] HN 搜索失败: ${error.message}`);
        }

        return signals;
    }
}

module.exports = { AICodingFetcher };
