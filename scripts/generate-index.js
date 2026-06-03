/**
 * 生成索引页（ESM 模块，供 GitHub Actions 调用）
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_BASE = path.join(__dirname, '..');

// 动态导入 renderer
const { generateIndex, generateZhIndex } = await import('../src/renderer.js');

try {
    generateIndex();
    generateZhIndex();
    console.log('✓ 索引页生成完成');
} catch (e) {
    console.error('索引页生成失败:', e.message);
    process.exit(1);
}
