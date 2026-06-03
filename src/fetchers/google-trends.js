/**
 * Google Trends 抓取器（简化版）
 */

const { BaseFetcher } = require('./base');

class GoogleTrendsFetcher extends BaseFetcher {
    constructor() {
        super('Google Trends');
    }

    async fetch() {
        console.warn('  ⚠ Google Trends 需要 Python pytrends 库，已跳过');
        return [];
    }
}

module.exports = { GoogleTrendsFetcher };
