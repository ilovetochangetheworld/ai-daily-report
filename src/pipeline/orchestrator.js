/**
 * 多维度 AI 资讯分析管道
 * 结构参考 CloudFlare-AI-Insight-Daily，包含：
 * 1. 产品与功能更新 (Product Updates)
 * 2. 前沿研究 (Frontier Research)
 * 3. 行业展望与社会影响 (Industry Outlook & Social Impact)
 * 4. 开源 TOP 项目 (Open Source Top Projects)
 * 5. 社媒分享 (Social Media Highlights)
 * 6. AI Coding (AI 编程动态)
 * 7. 发现机会 (Opportunity Discovery)
 */

const { callLLM, callLLMJson } = require('./llm');

async function runPipeline({ date, signals }) {
    console.log('  → 步骤 1/5: 分类信号...');
    const classified = await classifySignals(signals);
    console.log(`    ✓ 分为 ${Object.keys(classified).length} 个类别`);

    console.log('  → 步骤 2/5: 生成分析维度...');
    const dimensions = generateDimensions(classified);
    console.log(`    ✓ 生成 ${dimensions.length} 个分析维度`);

    console.log('  → 步骤 3/5: 专家分析（并行）...');
    const expertAnalyses = await runExpertAnalysis(dimensions, date);
    console.log(`    ✓ ${expertAnalyses.length} 个专家分析完成`);

    console.log('  → 步骤 4/5: 备选标题 & 摘要生成...');
    const headline = await generateHeadline(classified, date);
    console.log(`    ✓ 标题: ${headline}`);

    console.log('  → 步骤 5/5: 生成双语日报...');
    const reports = await generateReports(date, classified, dimensions, expertAnalyses, headline);
    console.log('    ✓ 日报生成完成\n');

    return reports;
}

async function classifySignals(signals) {
    const systemPrompt = `你是 AI 行业分析师。将输入的 AI 相关信号分类到以下 7 个维度：
1. product - 产品与功能更新（新模型发布、产品功能迭代、API 更新、定价变化）
2. research - 前沿研究（论文、新算法、模型架构创新、训练方法突破）
3. industry - 行业展望与社会影响（融资、IPO、政策法规、伦理争议、就业影响）
4. opensource - 开源 TOP 项目（GitHub 新晋热门项目、重大版本发布、社区动态）
5. social - 社媒分享（Twitter/X、Reddit、V2EX 上的热议话题、大V言论）
6. coding - AI Coding（AI 编程工具动态、代码生成模型、Coding Agent、IDE 集成）
7. discovery - 发现机会（新应用场景、市场空白、创业方向）

返回 JSON 格式：{ "product": [...ids], "research": [...ids], "industry": [...ids], "opensource": [...ids], "social": [...ids], "coding": [...ids], "discovery": [...ids] }

如果一条信号可能属于多个类别，放入最相关的那个。`;

    const signalsText = signals.map(s =>
        `[${s.id}] ${s.title} (${s.source}, 分数:${s.score})`
    ).join('\n');

    try {
        const result = await callLLMJson(systemPrompt, `请分类以下 ${signals.length} 条信号：\n\n${signalsText}`);
        const buckets = ['product', 'research', 'industry', 'opensource', 'social', 'coding', 'discovery'];
        const classified = {};
        for (const bucket of buckets) {
            const ids = result[bucket] || [];
            classified[bucket] = signals.filter(s => ids.includes(s.id));
        }
        return classified;
    } catch (error) {
        console.error('分类失败，使用默认分类:', error.message);
        const buckets = ['product', 'research', 'industry', 'opensource', 'social', 'coding', 'discovery'];
        const classified = {};
        const perBucket = Math.ceil(signals.length / 7);
        for (let i = 0; i < 7; i++) {
            classified[buckets[i]] = signals.slice(i * perBucket, (i + 1) * perBucket);
        }
        return classified;
    }
}

function generateDimensions(classified) {
    const dims = [
        {
            id: 'product', name: '产品与功能更新', nameEn: 'Product & Feature Updates',
            icon: '🚀',
            systemHint: '聚焦：新模型发布、产品迭代、API 更新、定价策略变化。每条包含：产品名、更新内容、影响范围、竞争格局变化。'
        },
        {
            id: 'research', name: '前沿研究', nameEn: 'Frontier Research',
            icon: '🔬',
            systemHint: '聚焦：最新论文、算法突破、训练方法创新、评测基准更新。每条包含：研究要点、关键指标、与现有方法对比、潜在应用。'
        },
        {
            id: 'industry', name: '行业展望与社会影响', nameEn: 'Industry Outlook & Social Impact',
            icon: '🌍',
            systemHint: '聚焦：融资/并购/IPO、政策法规、伦理争议、就业影响、地缘政治。每条包含：事件概述、利益方分析、短期/长期影响。'
        },
        {
            id: 'opensource', name: '开源 TOP 项目', nameEn: 'Open Source Top Projects',
            icon: '⭐',
            systemHint: '聚焦：GitHub 热门新项目、重大版本发布、社区动态。每条包含：项目名 + 链接、功能概述、Stars/增长、同类对比。'
        },
        {
            id: 'social', name: '社媒分享', nameEn: 'Social Media Highlights',
            icon: '💬',
            systemHint: '聚焦：大V言论、社区热议、观点碰撞。每条包含：核心观点、来源/作者、社区反应、是否值得深读。'
        },
        {
            id: 'coding', name: 'AI Coding', nameEn: 'AI Coding Dynamics',
            icon: '💻',
            systemHint: '聚焦：AI 编程工具更新（Cursor/Copilot/Claude Code/Codex等）、代码生成模型、Coding Agent、IDE 集成、开发者工作流变革。每条包含：工具/模型名、更新内容、实测效果、对开发者的影响。'
        },
        {
            id: 'discovery', name: '发现机会', nameEn: 'Opportunity Discovery',
            icon: '💡',
            systemHint: '聚焦：新应用场景、市场空白、创业方向、商业模式。每条包含：核心判断、关键证据、反向视角、实战建议。'
        },
    ];
    return dims.filter(d => (classified[d.id] || []).length > 0)
               .map(d => ({ ...d, signals: classified[d.id] || [] }));
}

async function runExpertAnalysis(dimensions, date) {
    return Promise.all(dimensions.map(dim => analyzeAsExpert(dim, date)));
}

async function analyzeAsExpert(dimension, date) {
    const systemPrompt = `你是「${dimension.name}」维度的资深分析师。
${dimension.systemHint}

输出规范：
- 使用 Markdown 格式
- 每个分析点以 ### 开头，包含标题
- 每个分析点包含：核心判断（加粗）、关键证据、反向视角、实战建议
- **引用信号时必须保留原始来源链接**，格式为 [来源名](URL)
- 语言专业犀利，避免空话套话
- 中文输出`;

    const signalsText = dimension.signals.map(s =>
        `- **${s.title}** (${s.source}) [来源](${s.url})\n  ${s.summary || '无摘要'}`
    ).join('\n\n');

    try {
        const markdown = await callLLM(systemPrompt,
            `请分析以下与「${dimension.name}」相关的 ${dimension.signals.length} 条信号（日期：${date}）：\n\n${signalsText}\n\n生成 3-4 个深度分析点。`,
            { maxTokens: 2500 }
        );
        return { dimension: dimension.id, name: dimension.name, nameEn: dimension.nameEn, icon: dimension.icon, markdown };
    } catch (error) {
        console.error(`专家分析失败 (${dimension.id}):`, error.message);
        return {
            dimension: dimension.id, name: dimension.name, nameEn: dimension.nameEn, icon: dimension.icon,
            markdown: `### 分析暂时不可用\n${error.message}`
        };
    }
}

async function generateHeadline(classified, date) {
    const topSignals = Object.values(classified).flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);

    const topText = topSignals.map((s, i) =>
        `${i + 1}. ${s.title} (${s.source})`
    ).join('\n');

    try {
        const headline = await callLLM(
            '你是日报主编。根据今日 Top 5 AI 信号，生成一句话的今日头条摘要（30-50字，中文，突出最重大的变化）。只输出摘要，不要任何前缀。',
            `日期: ${date}\n\nTop 5 信号:\n${topText}`,
            { maxTokens: 100 }
        );
        return headline.trim();
    } catch (error) {
        return 'AI 行业日报';
    }
}

async function generateReports(date, classified, dimensions, expertAnalyses, headline) {
    const reports = {};
    reports.zh = await generateReport('zh', date, classified, expertAnalyses, headline);
    return reports;
}

async function generateReport(lang, date, classified, expertAnalyses, headline) {
    const isZh = lang === 'zh';

    const topSignals = Object.values(classified).flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);

    const systemPrompt = isZh
        ? `你是 AI 日报主编。基于专家分析，生成一份完整结构的 AI 资讯日报（中文）。

输出结构与格式要求（Markdown）：

# AI 资讯日报 ${date}

> 📰 ${headline}

---

## 🚀 产品与功能更新
（新模型发布、产品迭代、API 更新、定价变化）

## 🔬 前沿研究
（最新论文、算法突破、训练方法创新）

## 🌍 行业展望与社会影响
（融资并购、政策法规、伦理争议、就业影响）

## ⭐ 开源 TOP 项目
（GitHub 热门项目、重大版本、社区动态，附项目链接）

## 💬 社媒分享
（大V言论、社区热议、值得关注的长文）

## 💻 AI Coding
（AI 编程工具更新、代码生成模型、Coding Agent 动态、开发者工作流变革）

## 💡 发现机会
（新应用场景、市场空白、创业方向）

---

*报告生成时间：填入日期*
*数据来源：列出所有来源*

注意事项：
- 每个板块至少2-3条内容
- **每条资讯必须附带原始来源链接**，格式为在条目标题或来源名后加 [来源](URL)，优先使用下方提供的信号链接
- 开源项目必须附 GitHub 链接
- 语言专业犀利，重要关键词加粗
- 不重复已有专家分析的原文，但要整合其洞察`
        : `You are an AI daily report editor. Generate a structured AI news daily report (English) based on expert analyses.

Output structure (Markdown):

# AI Daily Report ${date}

> 📰 ${headline}

---

## 🚀 Product & Feature Updates
(New model releases, product iterations, API updates, pricing changes)

## 🔬 Frontier Research
(Latest papers, algorithm breakthroughs, training innovations)

## 🌍 Industry Outlook & Social Impact
(Funding/M&A, policy/regulation, ethics, employment impact)

## ⭐ Open Source Top Projects
(Trending GitHub repos, major releases, community updates, with links)

## 💬 Social Media Highlights
(Key influencer opinions, community discussions, worth-reading long posts)

## 💻 AI Coding
(AI coding tool updates, code generation models, Coding Agent dynamics, developer workflow changes)

## 💡 Opportunity Discovery
(New application scenarios, market gaps, startup directions)

---

*Report generated: fill in date*
*Data sources: list all sources*`;

    const expertText = expertAnalyses.map(ea =>
        `## ${ea.icon} ${isZh ? ea.name : ea.nameEn}\n\n${ea.markdown}`
    ).join('\n\n---\n\n');

    const topSignalsText = topSignals.map((s, i) =>
        `${i + 1}. **${s.title}** [${s.source}](${s.url}) (score:${s.score})`
    ).join('\n');

    const userPrompt = isZh
        ? `请生成 ${date} 的 AI 资讯日报（中文版）。\n\n**Top 5 信号：**\n${topSignalsText}\n\n**专家分析：**\n${expertText}\n\n请生成完整的日报 Markdown。头条摘要为：「${headline}」\n\n⚠️ 重要：每条资讯条目都必须附带可点击的来源链接！`
        : `Please generate the AI Daily Report for ${date} (English version).\n\n**Top 5 Signals:**\n${topSignalsText}\n\n**Expert Analyses:**\n${expertText}\n\nPlease generate the complete report in Markdown. Headline: "${headline}"`;

    try {
        const markdown = await callLLM(systemPrompt, userPrompt, { maxTokens: 5000 });
        return { markdown };
    } catch (error) {
        console.error(`日报生成失败 (${lang}):`, error.message);
        return { markdown: `# ${isZh ? 'AI 资讯日报' : 'AI Daily Report'} ${date}\n\n${isZh ? '生成失败' : 'Generation failed'}：${error.message}` };
    }
}

module.exports = { runPipeline };
