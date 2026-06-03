# AI 日报系统

🤖 自动生成的 AI 行业日报，基于 Node.js + GitHub Actions

## 功能特性

- ✅ **多数据源聚合**：Hacker News、GitHub Trending、Product Hunt、Reddit、HuggingFace、V2EX、Google Trends
- ✅ **双语输出**：同时生成中文和英文日报
- ✅ **多维度分析**：发现机会 / 技术选型 / 竞争情报 / 需求雷达 / 趋势判断
- ✅ **自动发布**：GitHub Pages 静态网站 + 小红书（待实现）
- ✅ **定时调度**：每天 8:00 自动运行（GitHub Actions）

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/yourusername/ai-daily-report.git
cd ai-daily-report
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 到 `.env` 并填写：

```bash
cp .env.example .env
```

必需配置：
- `OPENAI_API_KEY`: OpenAI 兼容 API 密钥
- `OPENAI_BASE_URL`: API 地址（可选，默认 OpenAI）
- `OPENAI_MODEL`: 模型名称（可选，默认 gpt-4-turbo-preview）

可选配置：
- `PRODUCT_HUNT_TOKEN`: Product Hunt API Token（用于抓取 PH 数据）
- `GITHUB_TOKEN`: GitHub Token（用于自动提交）

### 4. 本地运行

```bash
npm start
```

生成的日报会保存到：
- `zh/2026/2026-06-03.md` - 中文日报
- `en/today.md` - 英文日报（今日）

## GitHub Actions 部署

### 1. 推送代码到 GitHub

```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/ai-daily-report.git
git push -u origin main
```

### 2. 配置 Secrets

在 GitHub 仓库设置 → Secrets and variables → Actions 中添加：

- `OPENAI_API_KEY`: 你的 API 密钥
- `PRODUCT_HUNT_TOKEN`: (可选) Product Hunt Token

### 3. 启用 GitHub Pages

1. 进入仓库 Settings → Pages
2. Source 选择 "GitHub Actions"
3. 保存

### 4. 自动运行

- 每天 8:00 UTC（北京时间 16:00）自动运行
- 也可以手动触发：Actions → AI Daily Report → Run workflow

## 项目结构

```
ai-daily-report/
├── src/
│   ├── index.js              # 主入口
│   ├── fetchers/             # 数据源抓取器
│   │   ├── base.js          # 基础抓取器类
│   │   ├── hackernews.js    # HN 抓取器
│   │   ├── github-trending.js
│   │   ├── producthunt.js
│   │   ├── reddit.js
│   │   ├── huggingface.js
│   │   ├── v2ex.js
│   │   └── google-trends.js
│   ├── aggregator.js         # 数据聚合去重
│   ├── pipeline/            # 分析管道
│   │   ├── orchestrator.js  # 主控制器
│   │   └── llm.js          # LLM 调用封装
│   └── renderer.js          # Markdown 生成器
├── .github/
│   └── workflows/
│       └── daily-report.yml  # GitHub Actions 配置
├── zh/                      # 中文日报输出
│   └── 2026/
├── en/                      # 英文日报输出
│   └── today.md
├── package.json
└── README.md
```

## 自定义

### 修改数据源

编辑 `src/fetchers/index.js`，注释或添加数据源。

### 修改分析维度

编辑 `src/pipeline/orchestrator.js` 中的 `generateDimensions()` 函数。

### 修改调度时间

编辑 `.github/workflows/daily-report.yml` 中的 `cron` 表达式：

```yaml
schedule:
  - cron: '0 8 * * *'  # 每天 8:00 UTC
```

## 小红书发布

目前支持两种方式：

1. **手动复制**：生成的 Markdown 可以手动复制到小红书编辑器
2. **自动发布**（待实现）：需要小红书 Cookie 或 API

## 许可证

MIT License

## 致谢

参考项目：
- [DailyDawn](https://github.com/TangSY/dailydawn)
- [CloudFlare-AI-Insight-Daily](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily)
