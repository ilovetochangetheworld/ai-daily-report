/**
 * 统一导出所有抓取器
 */

const { HackerNewsFetcher } = require('./hackernews');
const { GitHubTrendingFetcher } = require('./github-trending');
const { ProductHuntFetcher } = require('./producthunt');
const { RedditFetcher } = require('./reddit');
const { HuggingFaceFetcher } = require('./huggingface');
const { V2EXFetcher } = require('./v2ex');
const { GoogleTrendsFetcher } = require('./google-trends');
const { JiqizhixinFetcher } = require('./jiqizhixin');
const { XinzhiyuanFetcher } = require('./xinzhiyuan');
const { AICodingFetcher } = require('./ai-coding');

const ALL_FETCHERS = [
    HackerNewsFetcher,
    GitHubTrendingFetcher,
    ProductHuntFetcher,
    RedditFetcher,
    HuggingFaceFetcher,
    V2EXFetcher,
    GoogleTrendsFetcher,
    JiqizhixinFetcher,
    XinzhiyuanFetcher,
    AICodingFetcher,
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
