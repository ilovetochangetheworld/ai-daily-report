# 🚀 快速部署指南

## ✅ 完成的功能

- [x] **数据抓取器**（7个数据源）
  - [x] Hacker News（AI相关热门）
  - [x] GitHub Trending（AI/ML项目）
  - [x] Product Hunt（当日热门产品）
  - [x] Reddit（12个AI相关subreddit）
  - [x] Hugging Face（热门模型和数据集）
  - [x] V2EX（中文技术社区）
  - [x] Google Trends（关键词涨幅）

- [x] **数据处理**
  - [x] 数据聚合去重
  - [x] 按分数排序
  - [x] 分类（新闻/项目/论文/讨论）

- [x] **多Agent分析管道**
  - [x] 信号分类器（5个维度）
  - [x] 问题生成器
  - [x] 专家分析器（并行）
  - [x] 主编合成器

- [x] **双语输出**
  - [x] 中文日报
  - [x] 英文日报
  - [x] Markdown格式

- [x] **GitHub Actions**
  - [x] 每天 8:00 UTC 自动运行
  - [x] 自动提交到仓库
  - [x] GitHub Pages 部署

- [x] **演示和测试**
  - [x] 测试脚本（验证各个组件）
  - [x] 演示脚本（生成示例日报）

## 📋 部署前检查清单

### 1. 获取 API Keys

- [ ] **OpenAI 兼容 API Key**
  - 如果使用 OpenAI：`https://platform.openai.com/api-keys`
  - 如果使用其他兼容服务（DeepSeek、Kimi等）：从其平台获取

- [ ] **Product Hunt Token**（可选）
  - 注册：https://www.producthunt.com/v2/oauth/applications
  - 创建应用 → 获取 `access_token`

### 2. 配置 GitHub 仓库

- [ ] Fork 或推送代码到你的 GitHub 仓库
- [ ] 进入仓库 Settings → Secrets and variables → Actions
- [ ] 添加以下 Secrets：
  - `OPENAI_API_KEY`: 你的 API 密钥
  - `OPENAI_BASE_URL`: （可选）API 地址，默认 OpenAI
  - `OPENAI_MODEL`: （可选）模型名称，默认 gpt-4-turbo-preview
  - `PRODUCT_HUNT_TOKEN`: （可选）Product Hunt Token

### 3. 启用 GitHub Pages

- [ ] 进入仓库 Settings → Pages
- [ ] Source 选择 "GitHub Actions"
- [ ] 保存

### 4. 首次运行

- [ ] 方式1：等待每天 8:00 UTC 自动运行
- [ ] 方式2：手动触发
  - 进入仓库 Actions → AI Daily Report → Run workflow

### 5. 查看结果

- [ ] 日报会保存到：
  - `zh/2026/2026-06-03.md`（中文）
  - `en/today.md`（英文）
- [ ] GitHub Pages 网站：`https://<username>.github.io/ai-daily-report/`

## 🔧 自定义配置

### 修改调度时间

编辑 `.github/workflows/daily-report.yml`：

```yaml
schedule:
  - cron: '0 8 * * *'  # 每天 8:00 UTC
```

常用时间（北京时间 = UTC + 8）：
- 早上 8:00 北京时间 = `0 0 * * *`（UTC 0:00）
- 早上 9:00 北京时间 = `0 1 * * *`（UTC 1:00）
- 下午 16:00 北京时间 = `0 8 * * *`（UTC 8:00）← 当前设置

### 禁用某些数据源

编辑 `src/fetchers/index.js`，注释掉不需要的抓取器：

```javascript
export const ALL_FETCHERS = [
    HackerNewsFetcher,
    GitHubTrendingFetcher,
    // ProductHuntFetcher,  // 注释掉
    RedditFetcher,
    HuggingFaceFetcher,
    V2EXFetcher,
    GoogleTrendsFetcher,
];
```

### 修改日报结构

编辑 `src/pipeline/orchestrator.js` 中的 `generateDimensions()` 函数，添加/删除分析维度。

## 📱 小红书发布方案

### 方案1：手动复制（推荐新手）

1. 生成的 Markdown 文件在 `zh/2026/` 目录
2. 复制到小红书编辑器
3. 添加图片（可以用 AI 生成）
4. 发布

### 方案2：自动发布（高级）

需要：
- 小红书 Cookie（通过浏览器获取）
- 使用 Puppeteer 自动登录和发布

参考代码（需要额外开发）：
```javascript
// 使用 Puppeteer 自动发布到小红书
// 需要安装：npm install puppeteer
```

## 🐛 常见问题

### 1. GitHub Actions 运行失败

**检查**：
- Secrets 是否正确配置
- API Key 是否有效
- 查看 Actions 日志

### 2. 生成的日报为空

**原因**：
- API Key 无效或额度不足
- 数据源全部失败（网络问题）

**解决**：
- 检查 `.env` 配置
- 手动运行测试：`node test/run-tests.js`

### 3. 中文日报乱码

**解决**：
- 确保文件保存为 UTF-8 编码
- 在 `src/renderer.js` 中明确指定编码

## 📊 成本估算

### OpenAI API 成本（每天）

- 输入 Token：约 10,000 tokens
- 输出 Token：约 5,000 tokens
- 使用 GPT-4-turbo：$0.01 + $0.15 = **$0.16/天**
- 使用 GPT-3.5-turbo：$0.001 + $0.002 = **$0.003/天**

### GitHub Actions 成本

- 公开仓库：免费（2000分钟/月）
- 私有仓库：$0.008/分钟
- 每次运行约 3-5 分钟 = **$0.024-$0.04/天**

**总成本估算**：**$5-$10/月**（使用 GPT-4）

## 🎉 完成！

现在你已经拥有：
- ✅ 每天自动生成的 AI 日报（双语）
- ✅ 多维度深度分析
- ✅ GitHub Pages 静态网站
- ✅ 完整的源代码和文档

**下一步**：
1. 关注 GitHub Actions 首次运行结果
2. 根据实际效果调整提示词
3. 添加小红书自动发布功能
4. 分享你的日报网站！

---

**需要帮助？**
- 查看 `README.md` 详细文档
- 检查 `test/run-tests.js` 验证系统
- 查看 GitHub Actions 日志排查问题
