# 🤖 AI 资讯日报

每日自动生成的 AI 行业日报，基于 Node.js + GitHub Actions

## 栏目结构

每日日报包含以下栏目：

| 栏目 | 说明 |
|------|------|
| 🚀 产品与功能更新 | 新模型发布、产品迭代、API 更新、定价变化 |
| 🔬 前沿研究 | 最新论文、算法突破、训练方法创新 |
| 🌍 行业展望与社会影响 | 融资/并购/IPO、政策法规、伦理争议、就业影响 |
| ⭐ 开源 TOP 项目 | GitHub 热门项目、重大版本发布、社区动态 |
| 💬 社媒分享 | 大V言论、社区热议、值得关注的长文 |
| 💻 Harness Engineering | Agent harness、工具调用、沙箱、评测、IDE/CLI 工作流 |
| 💡 发现机会 | 新应用场景、市场空白、创业方向 |

## 数据源

| 来源 | 类型 | 栏目覆盖 |
|------|------|---------|
| Hacker News | 社区讨论 | 全部 |
| GitHub Trending + GitHub Search | 开源项目 | 开源TOP、Harness Engineering |
| Product Hunt | 产品发布 | 产品更新、发现机会 |
| Reddit (r/LocalLLaMA, r/MachineLearning) | 社区讨论 | 前沿研究、社媒分享 |
| Hugging Face | 模型/数据集 | 前沿研究、开源TOP |
| V2EX | 中文社区 | 社媒分享、发现机会 |
| OpenAI / Google AI / Hugging Face Blog | 一手来源 | 产品更新、前沿研究、开源TOP |
| MIT Tech Review / TechCrunch / The Verge / The Decoder / NVIDIA Blog | 行业媒体 | 产品更新、行业展望、趋势判断 |
| 量子位 / 36kr / 少数派 | 中文资讯 | 产品更新、行业展望、社媒分享 |
| Google News RSS / Exa Search | 搜索聚合 | 全部 |
| GitHub Releases | 版本发布 | Harness Engineering、开源TOP |

## 在线访问

👉 **[ilovetochangetheworld.github.io/ai-daily-report](https://ilovetochangetheworld.github.io/ai-daily-report/)**

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/ilovetochangetheworld/ai-daily-report.git
cd ai-daily-report
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

必需：
- `OPENAI_API_KEY`: OpenAI 兼容 API 密钥

可选：
- `OPENAI_BASE_URL`: API 地址
- `OPENAI_MODEL`: 模型名称
- `EXA_API_KEY`: Exa 语义搜索 API Key，未设置时自动降级到 Google News RSS
- `GITHUB_TOKEN`: GitHub API Token，用于提升开源项目搜索和元数据补全稳定性

### 4. 本地运行

```bash
npm start
```

## GitHub Actions 部署

1. 推送代码到 GitHub
2. 在 Settings → Secrets → Actions 中添加 `OPENAI_API_KEY`
3. 在 Settings → Pages 中选择 Source: Deploy from a branch → main / (root)
4. 每天北京时间 8:00 自动运行，或手动触发

## 参考项目

- [CloudFlare-AI-Insight-Daily](https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily) - AI 资讯日报的先驱项目

## 许可证

MIT License
