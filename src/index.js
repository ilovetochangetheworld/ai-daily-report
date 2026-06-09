/**
 * AI 日报生成器 - 主入口
 */

const fs = require('fs');
const path = require('path');

// 加载 .env（本地开发用，CI 通过环境变量直接设置）
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('✓ 已加载 .env 文件');
} else {
    console.log('✓ 使用环境变量（CI 模式）');
}

const { fetchAll } = require('./fetchers/index');
const { aggregate } = require('./aggregator');
const { runPipeline } = require('./pipeline/orchestrator');
const { saveReport, generateIndex, generateZhIndex } = require('./renderer');
const { publishToXhs } = require('./pipeline/xhs-publisher');

async function main() {
    const date = new Date().toISOString().split('T')[0];
    console.log(`\n🤖 AI 日报生成器 - ${date}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n📡 步骤 1/4: 抓取数据源...');
    const rawData = await fetchAll();
    const totalItems = rawData.length;
    console.log(`  ✓ 共抓取 ${totalItems} 条数据`);

    console.log('\n🔄 步骤 2/4: 聚合 & 去重 & 打分...');
    const signals = aggregate(rawData);
    console.log(`  ✓ 聚合后 ${signals.length} 条信号`);

    console.log('\n🧠 步骤 3/4: 多 Agent 分析管道...');
    const reports = await runPipeline({ date, signals });

    console.log('\n📄 渲染 & 保存...');
    const zhPath = saveReport(reports.zh.markdown, 'zh', date);
    console.log(`  ✓ 中文日报: ${zhPath}`);

    try {
        generateIndex();
        generateZhIndex();
    } catch (e) {
        console.log(`  ⚠ 索引页生成跳过: ${e.message}`);
    }

    // 小红书发布（可通过环境变量控制开关）
    if (process.env.XHS_PUBLISH !== 'false') {
        console.log('\n📕 步骤 4/4: 发布小红书...');
        try {
            await publishToXhs({
                date,
                fullMarkdown: reports.zh.markdown,
                signals
            });
        } catch (e) {
            console.log(`  ⚠ 小红书发布跳过: ${e.message}`);
        }
    } else {
        console.log('\n📕 步骤 4/4: 小红书发布（已跳过，XHS_PUBLISH=false）');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ AI 日报生成完成！ ${date}\n`);
}

main().catch(err => {
    console.error('❌ 生成失败:', err);
    process.exit(1);
});
