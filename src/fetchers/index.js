/**
 * 统一导出所有抓取器
 */

import { HackerNewsFetcher } from './hackernews.js';
import { GitHubTrendingFetcher } from './github-trending.js';
import { ProductHuntFetcher } from './producthunt.js';
import { RedditFetcher } from './reddit.js';
import { HuggingFaceFetcher } from './huggingface.js';
import { V2EXFetcher } from './v2ex.js';
import { GoogleTrendsFetcher } from './google-trends.js';

export const ALL_FETCHERS = [
    HackerNewsFetcher,
    GitHubTrendingFetcher,
    ProductHuntFetcher,
    RedditFetcher,
    HuggingFaceFetcher,
    V2EXFetcher,
    GoogleTrendsFetcher,
];

/**
 * 并发抓取所有数据源
 * @param {import('axios').AxiosInstance} client - HTTP 客户端（可选）
 * @returns {Promise<Array<Signal>>} 所有信号
 */
export async function fetchAll() {
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
