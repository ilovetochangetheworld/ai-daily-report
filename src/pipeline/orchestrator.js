/**
 * 多维度 AI 资讯分析管道
 * 支持多模型（glm-5.1, minimax-m2.7 等），质量优先
 */

const { callLLM, getModelConfig } = require('./llm');

/**
 * 对不同步骤，设定期望的 maxTokens
 * 推理模型思考链很长，所以统一给足空间，不卡死
 */
const STEP_TOKENS = {
    classify: 8000,     // 分类：推理模型需要大量思考
    headline: 4000,     // 标题生成
    expertAnalysis: 8000,  // 每个专家分析
    finalReport: 16000,    // 最终报告组装
};

async function runPipeline({ date, signals }) {
    console.log('  → 步骤 1/4: 分类信号...');
    const classified = await classifySignals(signals);
    console.log(`    ✓ 分为 ${Object.keys(classified).length} 个类别`);

    console.log('  → 步骤 2/4: 生成分析维度...');
    const dimensions = generateDimensions(classified);
    console.log(`    ✓ 生成 ${dimensions.length} 个分析维度`);

    console.log('  → 步骤 3/4: 专家分析（3+2+2 批次）...');
    const expertAnalyses = await runExpertAnalysis(dimensions, date);
    console.log(`    ✓ ${expertAnalyses.length} 个专家分析完成`);

    console.log('  → 步骤 4/4: 生成日报...');
    const headline = await generateHeadline(classified, date);
    console.log(`    ✓ 标题: ${headline}`);
    const reports = await generateReports(date, classified, dimensions, expertAnalyses, headline);
    console.log('    ✓ 日报生成完成\n');

    return reports;
}

/**
 * 分类策略：
 * - 推理模型：用关键词规则（推理模型做 JSON 输出浪费 token）
 * - 普通模型：可以用 LLM 分类（更精准）
 * 如果设置了 CLASSIFY_METHOD=llm 则强制用 LLM
 */
async function classifySignals(signals) {
    const forceMethod = process.env.CLASSIFY_METHOD; // 'rules' | 'llm'
    const modelConfig = getModelConfig(process.env.OPENAI_MODEL || 'glm-5.1');

    if (forceMethod === 'llm' || (!forceMethod && modelConfig.type !== 'reasoning')) {
        return classifySignalsByLLM(signals);
    }
    return classifySignalsByRules(signals);
}

/**
 * LLM 分类器 — 更精准，适合非推理模型
 */
async function classifySignalsByLLM(signals) {
    const systemPrompt = `你是 AI 行业分析师。将输入的 AI 相关信号分类到以下 7 个维度：
1. product - 产品与功能更新（新模型发布、产品功能迭代、API 更新、定价变化）
2. research - 前沿研究（论文、新算法、模型架构创新、训练方法突破）
3. industry - 行业展望与社会影响（融资、IPO、政策法规、伦理争议、就业影响）
4. opensource - 开源 TOP 项目（GitHub 新晋热门项目、重大版本发布、社区动态）
5. social - 社媒分享（Twitter/X、Reddit、V2EX 上的热议话题、大V言论）
6. coding - AI Coding & harness 工程（AI 编程工具动态、代码生成模型、Coding Agent、harness/脚手架工程、IDE 集成）
7. discovery - 发现机会（新应用场景、市场空白、创业方向）

⚠️ 必须将所有7个分类都输出，即使某个分类为空数组。

返回 JSON 格式：{ "product": [...ids], "research": [...ids], "industry": [...ids], "opensource": [...ids], "social": [...ids], "coding": [...ids], "discovery": [...ids] }

如果一条信号可能属于多个类别，放入最相关的那个。`;

    const signalsText = signals.map(s => `[${s.id}] ${s.title} (${s.source}, 分数:${s.score})`).join('\n');

    try {
        const { callLLMJson } = require('./llm');
        const result = await callLLMJson(systemPrompt, `请分类以下 ${signals.length} 条信号：\n\n${signalsText}`, { maxTokens: STEP_TOKENS.classify });
        const buckets = ['product', 'research', 'industry', 'opensource', 'social', 'coding', 'discovery'];
        const classified = {};
        for (const bucket of buckets) {
            const ids = result[bucket] || [];
            classified[bucket] = signals.filter(s => ids.includes(s.id));
        }
        console.log(`    ✓ LLM分类: ${Object.entries(classified).map(([k,v]) => `${k}:${v.length}`).join(', ')}`);
        return classified;
    } catch (error) {
        console.error('LLM分类失败，降级为关键词:', error.message);
        return classifySignalsByRules(signals);
    }
}

/**
 * 关键词规则分类器 — 速度快，适合推理模型
 */
async function classifySignalsByRules(signals) {
    const rules = {
        research: {
            keywords: ['arxiv', 'paper', '论文', '研究', 'model', '架构', '训练', '算法', 'benchmark', '评测', 'diffusion', 'transformer', 'rlhf', 'dpo', 'grpo', 'lora', 'finetune', '微调', 'CVPR', 'NeurIPS', 'ICML', 'ICLR', 'ACL', 'EMNLP'],
            sources: ['arXiv'],
        },
        opensource: {
            keywords: ['github', '开源', 'open source', 'stars', 'fork', 'release', '仓库', 'repo', 'hugging', 'model hub', 'ollama', 'llamafile', 'whisper', 'stable-diffusion', 'comfyui', 'langchain'],
            sources: ['GitHub Trending', 'HuggingFace'],
        },
        industry: {
            keywords: ['融资', '投资', '并购', 'IPO', '监管', '政策', '法规', '伦理', '隐私', '数据安全', '就业', '裁员', '估值', '上市', '制裁', '出口管制', '拨款', '法案', 'filing', 'SEC', 'antitrust', 'billion', '营收', 'revenue'],
            sources: [],
        },
        coding: {
            keywords: ['cursor', 'copilot', 'claude code', 'codex', 'coding agent', 'code generation', 'ide', 'vscode', '编程', '代码生成', 'devin', 'windsurf', 'augment', 'cline', 'aider', 'sweep', 'harness', '脚手架', 'scaffold', 'ai coding', 'aide'],
            sources: ['ai-coding', 'V2EX'],
        },
        social: {
            keywords: ['tweet', 'reddit', '热议', '观点', '争论', '网友', '大V', '吐槽', 'v2ex', 'thread'],
            sources: ['Twitter/X', 'Reddit'],
        },
        product: {
            keywords: ['发布', 'gpt', 'claude', 'gemini', 'openai', 'anthropic', 'google', '微软', 'meta', 'apple', '百度', '阿里', '字节', '腾讯', 'api', '定价', '功能', '上线', '更新', '升级', 'launch', 'release', 'beta', '新版', 'notebooklm', 'chatgpt', 'sora', 'midjourney', 'perplexity'],
            sources: ['Product Hunt'],
        },
        discovery: {
            keywords: ['创业', '机会', '市场', '空白', '商业模式', '应用场景', '需求', '痛点', '副业', '赚钱', 'AI应用', '落地', '垂直', '行业方案', '场景创新'],
            sources: [],
        },
    };

    const classified = {};
    for (const bucket of Object.keys(rules)) {
        classified[bucket] = [];
    }

    for (const signal of signals) {
        const text = `${signal.title} ${signal.summary || ''} ${signal.source}`.toLowerCase();
        let matched = false;

        // 优先匹配来源
        for (const [bucket, rule] of Object.entries(rules)) {
            if (rule.sources.some(src => signal.source.includes(src))) {
                classified[bucket].push(signal);
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // 关键词匹配
        const priority = ['research', 'opensource', 'coding', 'industry', 'social', 'product', 'discovery'];
        for (const bucket of priority) {
            const rule = rules[bucket];
            if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
                classified[bucket].push(signal);
                matched = true;
                break;
            }
        }

        if (!matched) {
            classified.product.push(signal);
        }
    }

    console.log(`    ✓ 关键词分类: ${Object.entries(classified).map(([k,v]) => `${k}:${v.length}`).join(', ')}`);
    return classified;
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
            id: 'coding', name: 'AI Coding & harness 工程', nameEn: 'AI Coding & Harness Engineering',
            icon: '💻',
            systemHint: '聚焦：AI 编程工具更新（Cursor/Copilot/Claude Code/Codex等）、代码生成模型、Coding Agent、harness/脚手架工程、IDE 集成、开发者工作流变革。每条包含：工具/模型名、更新内容、实测效果、对开发者的影响。'
        },
        {
            id: 'discovery', name: '发现机会', nameEn: 'Opportunity Discovery',
            icon: '💡',
            systemHint: '聚焦：新应用场景、市场空白、创业方向、商业模式。每条包含：核心判断、关键证据、反向视角、实战建议。'
        },
    ];
    return dims.map(d => ({ ...d, signals: classified[d.id] || [] }));
}

async function runExpertAnalysis(dimensions, date) {
    // 推理模型耗时较长，分批次并行避免限频超时
    const modelConfig = getModelConfig(process.env.OPENAI_MODEL || 'glm-5.1');
    const batchSize = modelConfig.type === 'reasoning' ? 2 : 7; // 推理模型2个一批，普通模型全部并行

    const batches = [];
    for (let i = 0; i < dimensions.length; i += batchSize) {
        batches.push(dimensions.slice(i, i + batchSize));
    }

    const results = [];
    for (let i = 0; i < batches.length; i++) {
        if (i > 0) {
            const delay = modelConfig.type === 'reasoning' ? 3000 : 500;
            console.log(`    ⏳ 批次 ${i + 1}/${batches.length}，等待 ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        const batchResults = await Promise.all(batches[i].map(dim => analyzeAsExpert(dim, date)));
        results.push(...batchResults);
    }
    return results;
}

async function analyzeAsExpert(dimension, date) {
    const systemPrompt = `你是「${dimension.name}」维度的资深分析师。\n${dimension.systemHint}

输出规范：
- 使用 Markdown 格式
- 每个分析点以 ### 开头，包含标题
- 每个分析点包含：核心判断（加粗）、关键证据、反向视角、实战建议
- **引用信号时必须保留原始来源链接**，格式为 [来源名](URL)
- 语言专业犀利，避免空话套话
- 中文输出`;

    const signalsText = dimension.signals.length > 0
        ? dimension.signals.map(s => {
            let line = `- **${s.title}** (${s.source}) [来源](${s.url})\n  ${s.summary || '无摘要'}`;
            if (s.image_url && !s.image_url.includes('avatar') && !s.image_url.includes('s=40') && !s.image_url.includes('s=32')) {
                line += `\n  📷 图片: ${s.image_url}`;
            }
            if (s.video_url) line += `\n  🎬 视频: ${s.video_url}`;
            return line;
        }).join('\n\n')
        : '（今日该维度暂无显著信号，请根据其他维度的关联趋势进行推测性分析）';

    try {
        const markdown = await callLLM(systemPrompt,
            `请分析以下与「${dimension.name}」相关的 ${dimension.signals.length} 条信号（日期：${date}）：\n\n${signalsText}\n\n生成 2-3 个分析点。${dimension.signals.length === 0 ? '由于该维度无直接信号，请结合当日AI行业整体趋势给出前瞻性观点。' : ''}`,
            { maxTokens: STEP_TOKENS.expertAnalysis }
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

/**
 * 标题生成：
 * - 非推理模型：用 LLM 生成更优美的标题
 * - 推理模型：模板拼接（避免思考链占满 token）
 */
async function generateHeadline(classified, date) {
    const modelConfig = getModelConfig(process.env.OPENAI_MODEL || 'glm-5.1');

    if (modelConfig.type !== 'reasoning') {
        // 非推理模型，用 LLM 生成高质量标题
        const topSignals = Object.values(classified).flat()
            .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
        const topText = topSignals.map((s, i) => `${i + 1}. ${s.title} (${s.source})`).join('\n');

        try {
            const headline = await callLLM(
                '你是日报主编。根据今日 Top 5 AI 信号，生成一句话的今日头条摘要（30-60字，中文，突出最重大的变化和趋势）。只输出摘要，不要任何前缀。',
                `日期: ${date}\n\nTop 5 信号:\n${topText}`,
                { maxTokens: STEP_TOKENS.headline }
            );
            return headline.trim();
        } catch (error) {
            // 降级到模板
        }
    }

    // 模板生成（推理模型降级方案）
    const topSignals = Object.values(classified).flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0));

    // 优先选非 GitHub/数据集的真实新闻信号
    const newsSignals = topSignals.filter(s =>
        !s.source.includes('GitHub') && !s.source.includes('Hugging') && !s.source.includes('github')
    );
    const pickFrom = newsSignals.length >= 2 ? newsSignals : topSignals;

    if (pickFrom.length === 0) return 'AI 行业日报';

    const top = pickFrom.slice(0, 2);
    const titles = top.map(s => s.title.replace(/[【】\[\]]/g, '').substring(0, 40));
    return `${titles.join(' | ')} — AI日报 ${date}`;
}

async function generateReports(date, classified, dimensions, expertAnalyses, headline) {
    const allSignals = Object.values(classified).flat();
    const reports = {};
    reports.zh = await generateReport('zh', date, classified, expertAnalyses, headline, allSignals);
    return reports;
}

async function generateReport(lang, date, classified, expertAnalyses, headline, allSignals) {
    const modelConfig = getModelConfig(process.env.OPENAI_MODEL || 'glm-5.1');

    // 非推理模型：尝试 LLM 组装最终日报（更流畅的叙事）
    if (modelConfig.type !== 'reasoning') {
        try {
            const llmReport = await generateReportByLLM(lang, date, classified, expertAnalyses, headline, allSignals);
            if (llmReport && llmReport.markdown && llmReport.markdown.length > 500) {
                return llmReport;
            }
        } catch (error) {
            console.error('LLM日报生成失败，降级为模板组装:', error.message);
        }
    }

    // 模板组装（推理模型默认走这里，或在 LLM 失败时降级）
    return generateReportByTemplate(lang, date, classified, expertAnalyses, headline, allSignals);
}

/**
 * LLM 组装最终日报 — 用于非推理模型，叙事更流畅
 */
async function generateReportByLLM(lang, date, classified, expertAnalyses, headline, allSignals) {
    const isZh = lang === 'zh';

    const systemPrompt = isZh
        ? `你是 AI 日报主编。基于专家分析，生成一份完整结构的 AI 资讯日报（中文）。

输出结构与格式要求（Markdown）：

# AI 资讯日报 ${date}

> 📰 ${headline}

---

## 🚀 产品与功能更新
## 🔬 前沿研究
## 🌍 行业展望与社会影响
## ⭐ 开源 TOP 项目
## 💬 社媒分享
## 💻 AI Coding & harness 工程
## 💡 发现机会

---

*报告生成时间：${date}*
*数据来源：列出所有来源*

⚠️ 严格规则：
1. **所有7个板块必须全部输出**
2. 每个板块至少2-3条内容
3. **每条资讯必须附带原始来源链接**
4. 开源项目必须附链接
5. 语言专业犀利，重要关键词加粗
6. 整合专家洞察，不是复制粘贴
7. **图片引用**：信号包含有意义的配图时使用 ![描述](URL)，禁止引用头像/logo/图标
8. **视频引用**：信号含视频时使用 [▶ 观看视频](URL)`
        : `You are an AI daily report editor. Generate a structured daily report (English). Same 7-section structure. Same strict rules.`;

    const expertText = expertAnalyses.map(ea =>
        `## ${ea.icon} ${isZh ? ea.name : ea.nameEn}\n\n${ea.markdown}`
    ).join('\n\n---\n\n');

    const topSignals = Object.values(classified).flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
    const topSignalsText = topSignals.map((s, i) => {
        let line = `${i + 1}. **${s.title}** [${s.source}](${s.url})`;
        if (s.image_url && !s.image_url.includes('avatar')) line += ` [配图](${s.image_url})`;
        if (s.video_url) line += ` [视频](${s.video_url})`;
        return line;
    }).join('\n');

    const userPrompt = isZh
        ? `请生成 ${date} 的 AI 资讯日报（中文版）。\n\n**Top 5 信号：**\n${topSignalsText}\n\n**专家分析：**\n${expertText}\n\n请生成完整的日报 Markdown。头条摘要为：「${headline}」\n\n⚠️ 关键：\n1. 必须输出全部7个板块\n2. 如果某板块信号不足，请基于行业趋势补充前瞻性分析\n3. 每条资讯必须有[来源](URL)链接\n4. 配图/视频在该条目下发插入`
        : `Generate the AI Daily Report for ${date} (English). Same rules.`;

    const { markdown } = await generateReportByTemplate(lang, date, classified, expertAnalyses, headline, allSignals);
    // 先用模板兜底，同时尝试 LLM

    let llmMarkdown = '';
    try {
        llmMarkdown = await callLLM(systemPrompt, userPrompt, { maxTokens: STEP_TOKENS.finalReport });
    } catch (e) {
        return { markdown };
    }

    // 验证 LLM 输出完整性（所有7个板块都在）
    const requiredSections = ['🚀', '🔬', '🌍', '⭐', '💬', '💻', '💡'];
    const allPresent = requiredSections.every(icon => llmMarkdown.includes(icon));
    if (!allPresent || llmMarkdown.length < 500) {
        console.log('  ⚠ LLM日报不完整，使用模板组装');
        return { markdown };
    }

    return { markdown: llmMarkdown };
}

/**
 * 模板组装 — 稳定可靠，保证 7 板块完整
 */
async function generateReportByTemplate(lang, date, classified, expertAnalyses, headline, allSignals) {
    const bucketIcons = {
        product: '🚀', research: '🔬', industry: '🌍',
        opensource: '⭐', social: '💬', coding: '💻', discovery: '💡'
    };

    function buildMediaBlock(category) {
        const catSignals = classified[category] || [];
        const mediaItems = catSignals.filter(s =>
            (s.image_url && !s.image_url.includes('avatar') && !s.image_url.includes('s=40') && !s.image_url.includes('s=32')) || s.video_url
        );
        if (mediaItems.length === 0) return '';
        let block = '\n\n---\n**📸 今日配图 & 视频**\n';
        let count = 0;
        for (const s of mediaItems) {
            if (count >= 3) break;
            if (s.image_url) {
                block += `\n![${(s.title || '').slice(0, 30)}](${s.image_url})`;
                count++;
            }
            if (s.video_url) {
                block += `\n[▶ 观看视频：${(s.title || '').slice(0, 30)}](${s.video_url})`;
                if (!s.image_url) count++;
            }
        }
        return block;
    }

    const sources = [...new Set(allSignals.map(s => s.source).filter(Boolean))];

    let markdown = `# AI 资讯日报 ${date}\n\n> 📰 ${headline}\n\n---\n\n`;

    // Top 5 信号摘要
    const topSignals = Object.values(classified).flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);

    if (topSignals.length > 0) {
        markdown += `## 📌 今日 Top 5 信号\n\n`;
        for (const s of topSignals) {
            markdown += `- **${s.title}** [${s.source}](${s.url})\n`;
        }
        markdown += `\n---\n\n`;
    }

    // 7 个板块
    for (const ea of expertAnalyses) {
        const icon = bucketIcons[ea.dimension] || '📌';
        const name = ea.name || ea.dimension;
        markdown += `## ${icon} ${name}\n\n${ea.markdown}${buildMediaBlock(ea.dimension)}\n\n---\n\n`;
    }

    // 数据来源
    markdown += `*报告生成时间：${date}*\n\n*数据来源：${sources.join('、')}*\n`;

    return { markdown };
}

module.exports = { runPipeline };
