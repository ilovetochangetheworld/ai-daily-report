/**
 * 演示脚本 - 使用模拟数据生成示例日报
 */

const path = require('path');
const { saveReport } = require('../src/renderer');

const DATE = '2026-06-03';

const zhReport = `# AI 日报 ${DATE}

> 📍 **今日 Top 3 信号**
> 1. **高置信度**：Hacker News 热议「Local LLM 部署工具」
> 2. **外部发现**：「AI agent 框架」搜索上涨 +120%
> 3. **双重验证**：GitHub Trending 和 Reddit 同时讨论「llama.cpp 新优化」

---

## 发现机会

### 1. GPU 资源共享平台
**核心判断**：中小企业训练 AI 模型时，GPU 资源浪费严重

---

*报告生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}*  
*数据来源：Hacker News、GitHub Trending、Product Hunt、Reddit、Hugging Face、V2EX*
`;

const enReport = `# AI Daily Report ${DATE}

> 📍 **Today's Top 3 Signals**
> 1. **High Confidence**: "Expanse" hits 347 points on HN
> 2. **External Discovery**: "AI agent" search +120%
> 3. **Double Validation**: GitHub Trending and Reddit both discuss "llama.cpp"

---

*Report generated: ${new Date().toISOString()}*  
*Data sources: Hacker News, GitHub Trending, Product Hunt, Reddit, Hugging Face, V2EX*
`;

console.log('🎭 生成演示日报（模拟数据）...\n');
const zhPath = saveReport(zhReport, 'zh', DATE);
console.log(`✓ 中文日报已保存: ${zhPath}`);
const enPath = saveReport(enReport, 'en', DATE);
console.log(`✓ 英文日报已保存: ${enPath}`);
console.log('\n✅ 演示完成！');
