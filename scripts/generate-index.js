/**
 * 生成索引页（供 GitHub Actions 调用）
 */

const { generateIndex, generateZhIndex, generateEnIndex } = require('../src/renderer');

try {
    generateIndex();
    generateZhIndex();
    generateEnIndex();
    console.log('✓ 所有索引页生成完成');
} catch (e) {
    console.error('索引页生成失败:', e.message);
    process.exit(1);
}
