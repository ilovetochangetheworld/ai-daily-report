#!/usr/bin/env node

/**
 * 从已有日报 Markdown 生成小红书卡片图与正文预览。
 *
 * 用法：
 *   node scripts/generate-xhs-assets.js 2026-06-10
 */

const fs = require('fs');
const path = require('path');
const { generateCoverAndCards } = require('../src/pipeline/xhs-cards');
const { generateXhsContent } = require('../src/pipeline/xhs-publisher');

async function main() {
    const date = process.argv[2] || new Date().toISOString().split('T')[0];
    const year = date.substring(0, 4);
    const root = path.resolve(__dirname, '..');
    const mdPath = path.join(root, 'zh', year, `${date}.md`);

    if (!fs.existsSync(mdPath)) {
        throw new Error(`日报不存在: ${mdPath}`);
    }

    const markdown = fs.readFileSync(mdPath, 'utf8');
    const outputDir = path.join(root, 'xhs_covers', date);
    const images = await generateCoverAndCards(date, markdown, outputDir);

    const contentPath = path.join(outputDir, 'xhs_content.txt');
    fs.writeFileSync(contentPath, generateXhsContent(markdown, date), 'utf8');

    console.log('\n小红书素材已生成:');
    console.log(`  图片目录: ${outputDir}`);
    console.log(`  正文预览: ${contentPath}`);
    console.log(`  共 ${images.length} 张图`);
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
