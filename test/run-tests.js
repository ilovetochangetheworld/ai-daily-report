/**
 * 测试脚本 - 验证各个组件是否正常工作
 */

const { HackerNewsFetcher } = require('../src/fetchers/hackernews');
const { GitHubTrendingFetcher } = require('../src/fetchers/github-trending');
const { aggregate } = require('../src/aggregator');

async function runTests() {
    console.log('🧪 开始测试 AI 日报系统\n');
    
    // 测试 1: Hacker News
    console.log('测试 1: Hacker News 抓取器');
    try {
        const hnFetcher = new HackerNewsFetcher();
        const hnSignals = await hnFetcher.fetch();
        console.log(`  ✓ 成功抓取 ${hnSignals.length} 条信号`);
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
    } catch (error) {
        console.error(`  ✗ 失败: ${error.message}`);
    }
    console.log('');
    
    // 测试 3: 数据聚合
    console.log('测试 3: 数据聚合与去重');
    try {
        const mockSignals = [
            { id: 'test-1', title: 'Test AI Project', url: 'https://example.com/1', source: 'test', category: 'project', published_date: new Date().toISOString(), score: 100 },
            { id: 'test-2', title: 'Another AI Tool', url: 'https://example.com/2', source: 'test', category: 'tool', published_date: new Date().toISOString(), score: 50 },
            { id: 'test-3', title: 'Test AI Project (Duplicate)', url: 'https://example.com/1', source: 'test', category: 'project', published_date: new Date().toISOString(), score: 120 },
        ];
        
        const aggregated = aggregate(mockSignals);
        console.log(`  ✓ 聚合后 ${aggregated.length} 条信号（原始 ${mockSignals.length} 条）`);
        console.log(`  ✓ 去重测试 ${aggregated.length === 2 ? '通过' : '失败'}`);
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
