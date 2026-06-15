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
5. social - 社媒热议（Twitter/X、Reddit、V2EX、小红书上的热议话题、大V言论）
6. coding - Harness Engineering（Agent harness、工具调用、沙箱、评测、IDE/CLI 工作流与工程化）
7. discovery - 发现机会（新应用场景、市场空白、创业方向、商业模式）

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
 * 关键词优先于来源（内容决定归属）
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
        social: {
            keywords: ['tweet', 'reddit', '热议', '观点', '争论', '网友', '大V', '吐槽', 'v2ex', 'thread', '小红书'],
            sources: ['Twitter/X', 'Reddit'],
        },
        coding: {
            keywords: ['cursor', 'copilot', 'claude code', 'codex', 'coding agent', 'code generation', 'ide', 'vscode', '编程', '代码生成', 'devin', 'windsurf', 'augment', 'cline', 'aider', 'sweep', 'harness', 'agent harness', 'engineering', 'workflow', 'tool use', '工具调用', '沙箱', '评测', '脚手架', 'scaffold', 'ai coding', 'aide'],
            sources: ['ai-coding', 'V2EX'],
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

        // 关键词匹配优先（内容决定归属）
        const priority = ['research', 'opensource', 'industry', 'social', 'coding', 'product', 'discovery'];
        for (const bucket of priority) {
            const rule = rules[bucket];
            if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
                classified[bucket].push(signal);
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // 无关键词匹配时，按来源兜底
        for (const [bucket, rule] of Object.entries(rules)) {
            if (rule.sources.some(src => signal.source.includes(src))) {
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
            systemHint: '聚焦：新模型发布、产品迭代、API更新、定价策略变化。',
            outputHint: '输出时按「变化是什么 / 为什么重要 / 谁该行动 / 下一步观察」组织，不要只复述发布新闻。'
        },
        {
            id: 'research', name: '前沿研究', nameEn: 'Frontier Research',
            icon: '🔬',
            systemHint: '聚焦：最新论文、算法突破、训练方法创新、评测基准更新。',
            outputHint: '输出时按「研究问题 / 方法突破 / 工程成熟度 / 可能应用」组织，区分论文亮点和可落地程度。'
        },
        {
            id: 'industry', name: '行业展望与社会影响', nameEn: 'Industry Outlook & Social Impact',
            icon: '🌍',
            systemHint: '聚焦：融资/并购/IPO、政策法规、伦理争议、就业影响。',
            outputHint: '输出时按「资本/监管/就业/商业化」拆解，明确受影响的公司、岗位或产业链位置。'
        },
        {
            id: 'opensource', name: 'Open-source Radar', nameEn: 'Open-source Radar',
            icon: '⭐',
            systemHint: '聚焦：GitHub热门新项目、重大版本发布、社区动态。',
            outputHint: `必须先输出「### 今日 TOP 5 排名表」。
表格列必须为：排名｜项目｜类型｜关键指标｜上榜理由｜适合谁｜风险。
排序规则：综合动量（今日 stars/近期更新）、规模（总 stars/forks/downloads）、相关性（Agent/LLM/RAG/Harness）、成熟度（release/commit/issue/文档）、可信度（多源交叉提及）。
表格后再输出 1-2 个趋势判断。不要把普通项目新闻写成 TOP。`
        },
        {
            id: 'social', name: '社区信号与反共识', nameEn: 'Community Signals',
            icon: '💬',
            systemHint: '聚焦：大V言论、社区热议、观点碰撞。',
            outputHint: '输出时区分「真实需求信号」和「情绪噪音」。优先提炼反共识、开发者痛点、用户采用阻力。'
        },
        {
            id: 'coding', name: 'Harness Engineering', nameEn: 'Harness Engineering',
            icon: '💻',
            systemHint: '聚焦：Agent harness、工具调用协议、沙箱与权限、评测与回放、CLI/IDE Agent 工作流、开发者工程化实践。',
            outputHint: '输出时按「工程瓶颈 / 解决方案 / 对开发团队的流程影响 / 安全与可靠性风险」组织。'
        },
        {
            id: 'discovery', name: '发现机会', nameEn: 'Opportunity Discovery',
            icon: '💡',
            systemHint: '聚焦：新应用场景、市场空白、创业方向、商业模式。',
            outputHint: '输出时必须包含「机会窗口」「目标用户」「为什么现在」「验证方式」「主要风险」，避免空泛创业建议。'
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
    const systemPrompt = `你是「${dimension.name}」维度的资深分析师。\\n${dimension.systemHint}
${dimension.outputHint ? `\n本板块额外要求：\n${dimension.outputHint}` : ''}

输出规范：
- 使用 Markdown 格式
- 开头先输出一行「**本板块主线：**...」，用一句话概括这个维度今天真正的主线，不要罗列新闻
- 每个分析点以 ### 开头，包含简明标题
- 每个分析点先给出一句核心判断，格式必须是：**核心判断（证据强度：强/中/弱）：...**
- 证据强度判定标准：
  - 强：有多个独立来源互相印证，或来自官方发布/论文/代码仓库/财报等一手来源
  - 中：有单一可信来源，或多个弱来源指向同一趋势
  - 弱：主要是社媒观点、间接推断、早期传闻或样本很少的趋势
- 展开分析时必须说明：你是怎么得出判断的、依据是什么、推演链条是什么
- 当证据强度为弱或中时，必须写一句「不确定性：...」，说明这个判断可能错在哪里
- 不是每条都要写「反向视角」「实战建议」，只有确实有洞察价值时才写，不要凑模板
- **引用信号时必须保留原始来源链接**，格式为 [来源名](URL)
- 语言专业、克制、犀利；宁可少写，也不要把弱信号推演成定论
- 中文输出`;

    const signalsText = dimension.signals.length > 0
        ? dimension.signals.map(s => {
            let line = `- **${s.title}** (${s.source}) [来源](${s.url})\n  ${s.summary || '无摘要'}${formatSignalMetadata(s)}`;
            return line;
        }).join('\n\n')
        : '（今日该维度暂无显著信号，请根据其他维度的关联趋势进行推测性分析）';

    try {
        const markdown = await callLLM(systemPrompt,
            `请分析以下与「${dimension.name}」相关的 ${dimension.signals.length} 条信号（日期：${date}）：\n\n${signalsText}\n\n${dimension.id === 'opensource' ? '先输出 TOP 5 排名表，再输出趋势分析。' : '生成 2-3 个分析点。'}优先找“共同指向的主线”，不要平均分配篇幅。${dimension.signals.length === 0 ? '由于该维度无直接信号，只能给弱证据前瞻；必须明确标注证据强度为弱，并说明不确定性。' : ''}`,
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

function formatSignalMetadata(signal) {
    const md = signal.metadata || {};
    const parts = [];
    if (md.stars_today) parts.push(`今日 stars: ${md.stars_today}`);
    if (md.stargazers_count) parts.push(`总 stars: ${md.stargazers_count}`);
    if (md.forks_count) parts.push(`forks: ${md.forks_count}`);
    if (md.open_issues_count) parts.push(`issues: ${md.open_issues_count}`);
    if (md.downloads) parts.push(`downloads: ${md.downloads}`);
    if (md.likes) parts.push(`likes: ${md.likes}`);
    if (md.pushed_at) parts.push(`最近 push: ${md.pushed_at}`);
    if (md.license) parts.push(`license: ${md.license}`);
    if (md.pipeline_tag) parts.push(`pipeline: ${md.pipeline_tag}`);
    if (md.discovery) parts.push(`发现方式: ${md.discovery}`);
    return parts.length ? `\n  指标：${parts.join('；')}` : '';
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
        // 优先用新闻信号，不足再用全量兜底
        const allSignals = Object.values(classified).flat()
            .sort((a, b) => (b.score || 0) - (a.score || 0));
        const newsOnly = allSignals.filter(s =>
            !s.source.includes('GitHub') && !s.source.includes('Hugging') && !s.source.includes('github') && !s.source.includes('huggingface')
        );
        const topSignals = newsOnly.length >= 3 ? newsOnly.slice(0, 5) : allSignals.slice(0, 5);
        const topText = topSignals.map((s, i) => `${i + 1}. ${s.title} (${s.source})`).join('\n');

        try {
            const headline = await callLLM(
                '你是日报主编。根据今日 Top 5 AI 信号，生成一句话的今日头条摘要（30-60字，中文）。优先提炼“多个信号共同指向的行业变化”，不要只复述单条新闻；避免夸大和标题党。只输出摘要，不要任何前缀。',
                `日期: ${date}\n\nTop 5 信号:\n${topText}`,
                { maxTokens: STEP_TOKENS.headline }
            );
            return headline.trim();
        } catch (error) {
            // 降级到模板
        }
    }

    // 模板生成（推理模型降级方案）
    // 优先选非 GitHub/数据集的真实新闻信号作为标题来源
    const newsSignals = Object.values(classified).flat()
        .filter(s => !s.source.includes('GitHub') && !s.source.includes('Hugging') && !s.source.includes('github') && !s.source.includes('huggingface'))
        .sort((a, b) => (b.score || 0) - (a.score || 0));

    // 如果新闻信号不够，再用全量信号兜底
    const fallbackSignals = Object.values(classified).flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    const pickFrom = newsSignals.length >= 2 ? newsSignals : fallbackSignals;

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
## ⭐ Open-source Radar
## 💬 社区信号与反共识
## 💻 Harness Engineering
## 💡 发现机会

---

*报告生成时间：${date}*
*数据来源：列出所有来源*

⚠️ 严格规则：
1. **所有7个板块必须全部输出**
2. 正文前必须输出「## 🧭 今日决策摘要」，包含 3-5 条可行动判断
3. 每个板块2-4条内容
4. **每条资讯必须附带原始来源链接**
5. Open-source Radar 必须保留 TOP 5 排名表，项目必须附链接和指标
6. 每个板块开头保留或重写一句「本板块主线」，让整篇像主编选题，不像逐条摘要
7. 保留「证据强度：强/中/弱」；弱证据判断不得写成确定结论
8. 语言专业克制、重点关键词加粗
9. 分析要有思路——怎么得出判断的，推演链条是什么；不要凑「反向视角」「实战建议」等模板骨架
10. 整合专家洞察，不是复制粘贴`
        : `You are an AI daily report editor. Generate a structured daily report (English). Same 7-section structure. Same strict rules.`;

    const expertText = expertAnalyses.map(ea =>
        `## ${ea.icon} ${isZh ? ea.name : ea.nameEn}\n\n${ea.markdown}`
    ).join('\n\n---\n\n');

    const allSorted = Object.values(classified).flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    const newsOnly = allSorted.filter(s =>
        !s.source.includes('GitHub') && !s.source.includes('Hugging') && !s.source.includes('github') && !s.source.includes('huggingface')
    );
    const topSignals = newsOnly.length >= 3 ? newsOnly.slice(0, 5) : allSorted.slice(0, 5);
    const topSignalsText = topSignals.map((s, i) => {
        let line = `${i + 1}. **${s.title}** [${s.source}](${s.url})`;
        return line;
    }).join('\n');

    const userPrompt = isZh
        ? `请生成 ${date} 的 AI 资讯日报（中文版）。\n\n**Top 5 信号：**\n${topSignalsText}\n\n**专家分析：**\n${expertText}\n\n请生成完整的日报 Markdown。头条摘要为：「${headline}」\n\n⚠️ 关键：\n1. 必须输出「今日决策摘要」和全部7个板块\n2. 每个板块先给一句「本板块主线」，再给具体分析点\n3. Open-source Radar 必须保留 TOP 5 排名表\n4. 如果某板块信号不足，请基于行业趋势补充前瞻性分析，但必须标注证据强度为弱\n5. 每条资讯必须有[来源](URL)链接\n6. 保留或重写「证据强度：强/中/弱」\n7. 分析要有推演思路，不要凑模板骨架\n8. 站在主编视角重组主线，不要机械拼接专家原文`
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

    const sources = [...new Set(allSignals.map(s => s.source).filter(Boolean))];

    let markdown = `# AI 资讯日报 ${date}\n\n> 📰 ${headline}\n\n---\n\n`;

    markdown += generateExecutiveBrief(headline, classified, allSignals);

    // Top 5 信号摘要
    // 优先展示真实新闻来源，GitHub/HuggingFace 项目不占 Top 5 名额
    const allSorted = Object.values(classified).flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    const newsTop = allSorted.filter(s =>
        !s.source.includes('GitHub') && !s.source.includes('Hugging') && !s.source.includes('github') && !s.source.includes('huggingface')
    ).slice(0, 5);
    // 新闻不够 5 条时用全量兜底
    const topSignals = newsTop.length >= 3 ? newsTop : allSorted.slice(0, 5);

    if (topSignals.length > 0) {
        markdown += `## 📌 今日 Top 5 信号\n\n`;
        for (const s of topSignals) {
            markdown += `- **${s.title}** [${s.source}](${s.url})${formatSignalMetadataInline(s)}\n`;
        }
        markdown += `\n---\n\n`;
    }

    // 7 个板块
    for (const ea of expertAnalyses) {
        const icon = bucketIcons[ea.dimension] || '📌';
        const name = ea.name || ea.dimension;
        markdown += `## ${icon} ${name}\n\n${ea.markdown}\n\n---\n\n`;
    }

    // 数据来源
    markdown += `*报告生成时间：${date}*\n\n*数据来源：${sources.join('、')}*\n`;

    return { markdown };
}

function generateExecutiveBrief(headline, classified, allSignals) {
    const counts = {
        product: classified.product?.length || 0,
        research: classified.research?.length || 0,
        opensource: classified.opensource?.length || 0,
        coding: classified.coding?.length || 0,
        industry: classified.industry?.length || 0,
        social: classified.social?.length || 0,
    };
    const topSource = [...new Set(allSignals.map(s => s.source).filter(Boolean))].slice(0, 6).join('、');

    return `## 🧭 今日决策摘要

- **今日主线**：${headline.replace(/\s+—\s*AI日报.*$/, '')}
- **读者优先级**：先看「📌 Top 5 信号」判断方向，再看「⭐ Open-source Radar」找可试用项目，最后看「💻 Harness Engineering」评估工程落地。
- **信号分布**：产品 ${counts.product} 条、研究 ${counts.research} 条、开源 ${counts.opensource} 条、Harness ${counts.coding} 条、行业 ${counts.industry} 条、社区 ${counts.social} 条。
- **主要来源**：${topSource || '多源聚合'}。

---

`;
}

function formatSignalMetadataInline(signal) {
    const md = signal.metadata || {};
    const bits = [];
    if (md.stars_today) bits.push(`今日 stars ${md.stars_today}`);
    if (md.stargazers_count) bits.push(`总 stars ${md.stargazers_count}`);
    if (md.forks_count) bits.push(`forks ${md.forks_count}`);
    if (md.downloads) bits.push(`downloads ${md.downloads}`);
    return bits.length ? ` · ${bits.join(' / ')}` : '';
}

module.exports = { runPipeline };
