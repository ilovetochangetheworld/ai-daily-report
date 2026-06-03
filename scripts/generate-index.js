/**
 * 生成索引页（供 GitHub Actions 调用）
 */

const { generateIndex, generateZhIndex } = require('../src/renderer');

try {
    generateIndex();
    generateZhIndex();
    console.log('✓ 索引页生成完成');
} catch (e) {
    console.error('索引页生成失败:', e.message);
    process.exit(1);
}
