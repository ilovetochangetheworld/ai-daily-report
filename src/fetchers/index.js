/**
 * 统一导出所有抓取器
 * 
 * 数据源分层策略（参考 Agent-Reach）:
 * - Tier 0: 零配置公开 API → HackerNews, GitHub Trending, V2EX, HuggingFace, Harness Engineering, arXiv
 * - Tier 0+: 零配置互联网服务 → Jina Reader, Google News RSS, RSS Feeds
 * - Tier 1: 需要 Cookie/CLI → Twitter/X, Reddit, 小红书, Product Hunt
 */

const { HackerNewsFetcher } = require('./hackernews');
const { GitHubTrendingFetcher } = require('./github-trending');
const { HuggingFaceFetcher } = require('./huggingface');
const { V2EXFetcher } = require('./v2ex');
const { AICodingFetcher } = require('./ai-coding');
const { ArxivFetcher } = require('./arxiv');
const { ProductHuntFetcher } = require('./producthunt');

// Tier 0+: Agent-Reach 启发的数据源
const { JinaReaderFetcher } = require('./jina-reader');
const { ExaSearchFetcher } = require('./exa-search');
const { RSSFetcher } = require('./rss');

// Tier 1: 需要 CLI 工具和 Cookie（自动降级）
const { TwitterFetcher } = require('./twitter');
const { RedditCLIFetcher } = require('./reddit-cli');
const { XHSFetcher } = require('./xhs');

const ALL_FETCHERS = [
    // Tier 0: 零配置公开 API
    HackerNewsFetcher,
    GitHubTrendingFetcher,
    HuggingFaceFetcher,
    V2EXFetcher,
    AICodingFetcher,
    ArxivFetcher,
    ProductHuntFetcher,

    // Tier 0+: 零配置互联网服务
    JinaReaderFetcher,
    ExaSearchFetcher,
    RSSFetcher,

    // Tier 1: 需要 CLI + Cookie（自动降级）
    TwitterFetcher,
    RedditCLIFetcher,
    XHSFetcher,
];

async function fetchAll() {
    const fetcherInstances = ALL_FETCHERS.map(FetcherClass => new FetcherClass());
    
    const results = await Promise.allSettled(
        fetcherInstances.map(fetcher => fetcher.safeFetch())
    );

    const allSignals = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            allSignals.push(...result.value);
        }
    }

    return allSignals;
}

module.exports = { ALL_FETCHERS, fetchAll };
