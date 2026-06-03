/**
 * AI 日报生成器 - 主入口
 * 参考 DailyDawn 架构，使用 Node.js 实现
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { fetchAll } from './fetchers/index.js';
import { aggregate } from './aggregator.js';
import { runPipeline } from './pipeline/orchestrator.js';
import { saveReport } from './renderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

const DATE = new Date().toISOString().split('T')[0];

async function main() {
    console.log(`=== AI 日报生成器 · ${DATE} ===\n`);

    // 1. 抓取所有数据源
    console.log('📡 开始抓取数据源...');
    const signals = await fetchAll();
    
    if (!signals || signals.length === 0) {
        console.error('✗ 没有抓取到任何数据，退出');
        process.exit(1);
    }
    console.log(`✓ 共抓取 ${signals.length} 条原始信号\n`);

    // 2. 聚合去重
    console.log('🔄 数据聚合与去重...');
    const ranked = aggregate(signals);
    console.log(`✓ 聚合后共 ${ranked.length} 条唯一信号\n`);

    // 3. 多 Agent 分析管道
    console.log('🤖 启动多 Agent 分析管道...\n');
    const reports = await runPipeline({
        date: DATE,
        signals: ranked,
    });

    // 4. 保存报告
    console.log('\n💾 保存日报...');
    for (const [lang, result] of Object.entries(reports)) {
        if (!result || !result.markdown) {
            console.warn(`⚠ [${lang}] 输出为空，跳过保存`);
            continue;
        }
        
        const outputPath = saveReport(result.markdown, lang, DATE);
        const relativePath = path.relative(__dirname + '/..', outputPath);
        console.log(`✓ [${lang}] 已保存到 ${relativePath}`);
    }

    console.log('\n✅ 日报生成完成！');
}

main().catch(error => {
    console.error('❌ 发生错误:', error);
    process.exit(1);
});
