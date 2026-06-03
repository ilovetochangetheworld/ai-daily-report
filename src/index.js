/**
 * AI 日报生成器 - 主入口
 * 参考 DailyDawn 架构，使用 Node.js 实现
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// dotenv 只在本地开发时使用（CI 通过环境变量直接设置）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: envPath });
    console.log('✓ 已加载 .env 文件');
} else {
    console.log('✓ 使用环境变量（CI 模式）');
}

import { fetchAll } from './fetchers/index.js';
import { aggregate } from './aggregator.js';
import { runPipeline } from './pipeline/orchestrator.js';
import { saveReport, generateIndex, generateZhIndex } from './renderer.js';

async function main() {
    // 日期
    const date = new Date().toISOString().split('T')[0];
    console.log(`\n🤖 AI 日报生成器 - ${date}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 步骤 1: 抓取数据
    console.log('\n📡 步骤 1/4: 抓取数据源...');
    const rawData = await fetchAll();
    const totalItems = Object.values(rawData).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`  ✓ 共抓取 ${totalItems} 条数据`);

    // 步骤 2: 聚合 & 去重 & 打分
    console.log('\n🔄 步骤 2/4: 聚合 & 去重 & 打分...');
    const signals = aggregate(rawData);
    console.log(`  ✓ 聚合后 ${signals.length} 条信号`);

    // 步骤 3: 多 Agent 分析
    console.log('\n🧠 步骤 3/4: 多 Agent 分析管道...');
    const reports = await runPipeline({ date, signals });

    // 步骤 4: 渲染 & 保存
    console.log('\n📄 步骤 4/4: 渲染 & 保存...');
    const zhPath = saveReport(reports.zh.markdown, 'zh', date);
    console.log(`  ✓ 中文日报: ${zhPath}`);

    const enPath = saveReport(reports.en.markdown, 'en', date);
    console.log(`  ✓ English Daily: ${enPath}`);

    // 生成索引页
    try {
        generateIndex();
        generateZhIndex();
    } catch (e) {
        console.log(`  ⚠ 索引页生成跳过: ${e.message}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ AI 日报生成完成！ ${date}\n`);
}

main().catch(err => {
    console.error('❌ 生成失败:', err);
    process.exit(1);
});
