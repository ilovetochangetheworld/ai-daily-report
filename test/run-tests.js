/**
 * 测试脚本 - 验证各个组件是否正常工作
 */

import { HackerNewsFetcher } from '../src/fetchers/hackernews.js';
import { GitHubTrendingFetcher } from '../src/fetchers/github-trending.js';
import { aggregate } from '../src/aggregator.js';

const TEST_COUNT = 5; // 每个数据源只抓取少量用于测试

async function runTests() {
    console.log('🧪 开始测试 AI 日报系统\n');
    
    // 测试 1: Hacker News
    console.log('测试 1: Hacker News 抓取器');
    try {
        const hnFetcher = new HackerNewsFetcher();
        const hnSignals = await hnFetcher.fetch();
        console.log(`  ✓ 成功抓取 ${hnSignals.length} 条信号`);
        if (hnSignals.length > 0) {
            console.log(`  示例: ${hnSignals[0].title}`);
        }
    } catch (error) {
        console.error(`  ✗ 失败: ${error.message}`);
    }
    console.log('');
    
    // 测试 2: GitHub Trending
    console.log('测试 2: GitHub Trending 抓取器');
    try {
        const ghFetcher = new GitHubTrendingFetcher();
        const ghSignals = await ghFetcher.fetch();
        console.log(`  ✓ 成功抓取 ${ghSignals.length} 条信号`);
        if (ghSignals.length > 0) {
            console.log(`  示例: ${ghSignals[0].title}`);
        }
    } catch (error) {
        console.error(`  ✗ 失败: ${error.message}`);
    }
    console.log('');
    
    // 测试 3: 数据聚合
    console.log('测试 3: 数据聚合与去重');
    try {
        const mockSignals = [
            {
                id: 'test-1',
                title: 'Test AI Project',
                url: 'https://example.com/1',
                source: 'test',
                category: 'project',
                published_date: new Date().toISOString(),
                score: 100,
            },
            {
                id: 'test-2',
                title: 'Another AI Tool',
                url: 'https://example.com/2',
                source: 'test',
                category: 'tool',
                published_date: new Date().toISOString(),
                score: 50,
            },
            // 重复 URL 测试去重
            {
                id: 'test-3',
                title: 'Test AI Project (Duplicate)',
                url: 'https://example.com/1',
                source: 'test',
                category: 'project',
                published_date: new Date().toISOString(),
                score: 120, // 更高的分数
            },
        ];
        
        const aggregated = aggregate(mockSignals);
        console.log(`  ✓ 聚合后 ${aggregated.length} 条信号（原始 ${mockSignals.length} 条）`);
        console.log(`  ✓ 去重测试 ${aggregated.length === 2 ? '通过' : '失败'}`);
    } catch (error) {
        console.error(`  ✗ 失败: ${error.message}`);
    }
    console.log('');
    
    // 测试 4: LLM 调用（需要 API Key）
    console.log('测试 4: LLM 调用');
    try {
        if (!process.env.OPENAI_API_KEY) {
            console.warn('  ⚠ OPENAI_API_KEY 未设置，跳过 LLM 测试');
        } else {
            const { callLLM } = await import('./pipeline/llm.js');
            const response = await callLLM(
                '你是一个助手',
                '请用一句话介绍你自己',
                { maxTokens: 100 }
            );
            console.log(`  ✓ LLM 调用成功`);
            console.log(`  响应: ${response.substring(0, 100)}...`);
        }
    } catch (error) {
        console.error(`  ✗ 失败: ${error.message}`);
    }
    console.log('');
    
    console.log('✅ 测试完成！');
}

runTests().catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});
