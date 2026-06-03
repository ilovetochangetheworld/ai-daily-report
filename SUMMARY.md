# 🎉 AI 日报系统搭建完成！

## 📊 系统概览

基于 **DailyDawn** 架构思想，使用 **Node.js + GitHub Actions** 实现的自动化 AI 日报系统。

### 核心特性

✅ **7个数据源**：Hacker News、GitHub Trending、Product Hunt、Reddit、Hugging Face、V2EX、Google Trends  
✅ **双语输出**：同时生成中文和英文日报  
✅ **多维度分析**：发现机会 / 技术选型 / 竞争情报 / 需求雷达 / 趋势判断  
✅ **自动发布**：GitHub Pages 静态网站 + 小红书（手动复制）  
✅ **定时调度**：每天 8:00 UTC（北京时间 16:00）自动运行  

---

## 📁 项目结构

```
ai-daily-report/
├── 📂 src/
│   ├── 📄 index.js              # 主入口
│   ├── 📂 fetchers/             # 数据源抓取器
│   │   ├── base.js            # 基础抓取器类
│   │   ├── hackernews.js      # HN 抓取器
│   │   ├── github-trending.js # GitHub 抓取器
│   │   ├── producthunt.js     # PH 抓取器
│   │   ├── reddit.js          # Reddit 抓取器
│   │   ├── huggingface.js    # HF 抓取器
│   │   ├── v2ex.js           # V2EX 抓取器
│   │   └── google-trends.js  # Trends 抓取器
│   ├── 📄 aggregator.js        # 数据聚合去重
│   ├── 📂 pipeline/            # 分析管道
│   │   ├── orchestrator.js    # 主控制器
│   │   └── llm.js            # LLM 调用封装
│   └── 📄 renderer.js         # Markdown 生成器
├── 📂 .github/workflows/
│   └── daily-report.yml        # GitHub Actions 配置
├── 📂 scripts/
│   └── demo.js                # 演示脚本（生成示例日报）
├── 📂 test/
│   └── run-tests.js           # 测试脚本
├── 📂 zh/                      # 中文日报输出
│   └── 2026/
├── 📂 en/                      # 英文日报输出
│   └── today.md
├── 📄 package.json
├── 📄 README.md               # 详细文档
└── 📄 DEPLOYMENT.md           # 部署指南
```

---

## 🚀 快速开始

### 1️⃣ 本地测试

```bash
# 克隆项目
git clone https://github.com/yourusername/ai-daily-report.git
cd ai-daily-report

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填写你的 API Key

# 运行测试
node test/run-tests.js

# 生成示例日报（无需 API Key）
node scripts/demo.js
```

### 2️⃣ 部署到 GitHub

```bash
# 创建 GitHub 仓库（在 GitHub 上操作）

# 推送代码
git init
git add .
git commit -m "🤖 Initial commit: AI Daily Report System"
git branch -M main
git remote add origin https://github.com/yourusername/ai-daily-report.git
git push -u origin main

# 配置 Secrets（在 GitHub 仓库设置中）
# Settings → Secrets and variables → Actions
# 添加：OPENAI_API_KEY

# 启用 GitHub Pages
# Settings → Pages → Source: "GitHub Actions"

# 手动触发首次运行
# Actions → AI Daily Report → Run workflow
```

---

## 📖 系统工作流程

```
┌─────────────────────────────────────────────────────┐
│  GitHub Actions (每天 8:00 UTC)                 │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  1. 数据抓取 (并发)                              │
│  ├─ Hacker News (AI相关, points>20)              │
│  ├─ GitHub Trending (AI/ML项目)                  │
│  ├─ Product Hunt (当日热门, votes>50)            │
│  ├─ Reddit (12个AI subreddit)                    │
│  ├─ Hugging Face (热门模型/数据集)                │
│  ├─ V2EX (中文技术社区)                          │
│  └─ Google Trends (AI关键词涨幅)                  │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  2. 数据聚合                                    │
│  ├─ 去重（基于 URL）                            │
│  ├─ 排序（按分数）                              │
│  └─ 分类（5个维度）                             │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  3. 多 Agent 分析                               │
│  ├─ 分类器：分到 5 个 bucket                    │
│  ├─ 问题生成器：每个维度生成问题                 │
│  ├─ 专家分析 × 5：并行深度分析                  │
│  └─ 主编合成：生成最终日报                      │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  4. 输出                                         │
│  ├─ 中文日报 → zh/2026/2026-06-03.md          │
│  ├─ 英文日报 → en/today.md                     │
│  └─ GitHub Pages 自动更新                       │
└─────────────────────────────────────────────────────┘
```

---

## 🎨 日报结构示例

### 中文日报

```markdown
# AI 日报 2026-06-03

> 📍 **今日 Top 3 信号**
> 1. 高置信度：Hacker News 热议「Local LLM 部署工具」获得 347 票
> 2. 外部发现：「AI agent 框架」Google Trends 7 日搜索 +120%
> 3. 双重验证：GitHub Trending 和 Reddit 同时讨论「llama.cpp 新优化」

## 🗣 技术派说
（600-800字深度开篇，第一人称POV）

## 🎯 今日 2 小时构建
（一个具体可执行的想法）

## 发现机会
### 1. GPU 资源共享平台
### 2. AI Agent 开发工具链
...

## 技术选型
### 1. Ollama vs llama.cpp
...

## 竞争情报
### 1. OpenAI vs Anthropic：代码生成战场
...

## 需求雷达
### 1. 多模态 Agent 开发框架
...

## 趋势判断
### 1. 本地部署成为主流 📈
...

## 🔥 行动触发
### 周末扩展构建
### 这一周更长线的赌注
### 本周最大的风险 / 陷阱
```

---

## 🔧 自定义配置

### 修改调度时间

编辑 `.github/workflows/daily-report.yml`：

```yaml
schedule:
  - cron: '0 8 * * *'  # 每天 8:00 UTC
```

时间对照（北京时间 = UTC + 8）：
- `0 0 * * *` = 早上 8:00
- `0 1 * * *` = 早上 9:00
- `0 8 * * *` = 下午 16:00 ← 当前

### 禁用某些数据源

编辑 `src/fetchers/index.js`：

```javascript
export const ALL_FETCHERS = [
    HackerNewsFetcher,
    GitHubTrendingFetcher,
    // ProductHuntFetcher,  // 注释掉
    RedditFetcher,
    ...
];
```

### 修改分析维度

编辑 `src/pipeline/orchestrator.js` 中的 `generateDimensions()` 函数。

---

## 📱 小红书发布方案

### 方案 1：手动复制（推荐）

1. 打开生成的中文日报 `zh/2026/2026-06-03.md`
2. 复制 Markdown 内容到小红书编辑器
3. 添加图片（可以用 AI 生成或截图）
4. 发布

### 方案 2：自动发布（高级）

需要：
- 小红书 Cookie（通过浏览器获取）
- 使用 Puppeteer 自动登录和发布

参考实现（需要额外开发）：
```javascript
import puppeteer from 'puppeteer';

async function publishToXiaohongshu(content) {
    const browser = await puppeteer.launch();
    // ... 自动发布逻辑
}
```

---

## 💰 成本估算

### OpenAI API 成本（每天）

- 输入 Token：~10,000 tokens
- 输出 Token：~5,000 tokens
- **GPT-4-turbo**：$0.01 + $0.15 = **$0.16/天**
- **GPT-3.5-turbo**：$0.001 + $0.002 = **$0.003/天**

### GitHub Actions 成本

- 公开仓库：**免费**（2000分钟/月）
- 私有仓库：$0.008/分钟
- 每次运行约 3-5 分钟 = **$0.024-$0.04/天**

**总成本估算**：**$5-$10/月**（使用 GPT-4）

---

## ✅ 下一步

1. **配置 API Key**
   - 获取 OpenAI 兼容 API Key
   - 添加到 GitHub Secrets

2. **首次运行**
   - 手动触发 GitHub Actions
   - 查看生成的日报

3. **调整优化**
   - 根据实际效果调整提示词
   - 修改数据源和分析维度

4. **扩展功能**
   - 添加小红书自动发布
   - 添加邮件订阅
   - 添加 Telegram Bot 推送

---

## 🆘 常见问题

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
```bash
# 本地测试
node test/run-tests.js

# 检查环境变量
cat .env
```

### 3. 中文日报乱码

**解决**：
- 确保文件保存为 UTF-8 编码
- 在 `src/renderer.js` 中明确指定编码

---

## 📚 参考资源

- **DailyDawn**：https://github.com/TangSY/dailydawn
- **CloudFlare-AI-Insight-Daily**：https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily
- **OpenAI API 文档**：https://platform.openai.com/docs
- **GitHub Actions 文档**：https://docs.github.com/en/actions

---

## 📄 许可证

MIT License

---

**🎊 恭喜！你现在拥有了一个完整的 AI 日报自动生成系统！**

开始使用：`https://github.com/yourusername/ai-daily-report`

如有问题，查看 `README.md` 或 `DEPLOYMENT.md` 获取详细文档。
