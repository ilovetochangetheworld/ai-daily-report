/**
 * Google Trends 抓取器
 * 获取 AI 相关关键词的 7 日涨幅（反映用户搜索意图）
 * 需要 pytrends (Python) 或手动实现
 * 这里使用简化版本（通过公开 API）
 */

import axios from 'axios';
import { BaseFetcher } from './base.js';

export class GoogleTrendsFetcher extends BaseFetcher {
    constructor() {
        super('Google Trends');
        
        // AI 相关关键词（独立开发者关注）
        this.keywords = [
            'AI agent', 'LLM', 'ChatGPT', 'Claude', 'local LLM',
            'AI coding', 'prompt engineering', 'RAG', 'fine tuning',
            'AI SaaS', 'indie hacker AI', 'open source AI',
        ];
    }

    async fetch() {
        const signals = [];
        
        // 注意：Google Trends 没有官方 API
        // 这里提供两种方案：
        // 1. 使用 pytrends (Python) - 更准确
        // 2. 使用第三方 API（如果有）
        
        // 简化实现：返回空（实际使用时需要 Python 脚本）
        console.warn('  ⚠ Google Trends 需要 Python pytrends 库');
        console.warn('  → 建议：使用 scripts/fetch_trends.py');
        
        // 如果环境变量启用，尝试调用 Python 脚本
        if (process.env.GOOGLE_TRENDS_ENABLED === 'true') {
            try {
                const { exec } = await import('child_process');
                const util = await import('util');
                const execPromise = util.promisify(exec.exec);
                
                const { stdout } = await execPromise('python3 scripts/fetch_trends.py');
                const trendsData = JSON.parse(stdout);
                
                for (const item of trendsData) {
                    signals.push({
                        id: `trend-${item.keyword.replace(/\s+/g, '-')}`,
                        title: `Google Trends: ${item.keyword}`,
                        url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(item.keyword)}`,
                        source: 'trends',
                        category: 'discussion',
                        published_date: new Date().toISOString(),
                        score: item.growth || 0,
                        summary: `${item.keyword} 搜索量 ${item.growth > 0 ? '上涨' : '下降'} ${Math.abs(item.growth)}%`,
                        metadata: {
                            keyword: item.keyword,
                            growth: item.growth,
                            is_trend: true,
                        },
                    });
                }
            } catch (error) {
                console.error('  ✗ Google Trends 抓取失败:', error.message);
            }
        }

        return signals;
    }
}

/**
 * 备用方案：简单的趋势关键词列表
 * 当无法获取实时数据时，提供静态关键词
 */
export function getDefaultTrends() {
    return [
        { keyword: 'AI agent', growth: 120 },
        { keyword: 'LLM', growth: 85 },
        { keyword: 'local LLM', growth: 95 },
        { keyword: 'AI coding', growth: 110 },
        { keyword: 'RAG', growth: 75 },
    ];
}
