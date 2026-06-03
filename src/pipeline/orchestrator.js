/**
 * 多 Agent 分析管道
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

    console.log('  → 步骤 4/5: 生成双语日报...');
    const reports = await generateReports(date, classified, dimensions, expertAnalyses);
    console.log('    ✓ 日报生成完成\n');

    return reports;
}

async function classifySignals(signals) {
    const systemPrompt = `你是 AI 行业分析师。将输入的 AI 相关信号分类到以下 5 个维度：
1. discovery - 新产品、新工具、新应用场景
2. technology - 模型、框架、工具的技术对比
3. competition - 公司/产品之间的竞争动态
4. demand - 用户痛点、市场需求
5. trend - 行业趋势、技术方向

返回 JSON 格式：{ "discovery": [...ids], "technology": [...ids], "competition": [...ids], "demand": [...ids], "trend": [...ids] }`;

    const signalsText = signals.map(s => 
        `[${s.id}] ${s.title} (${s.source}, 分数:${s.score})`
    ).join('\n');

    try {
        const result = await callLLMJson(systemPrompt, `请分类以下 ${signals.length} 条信号：\n\n${signalsText}`);
        const buckets = ['discovery', 'technology', 'competition', 'demand', 'trend'];
        const classified = {};
        for (const bucket of buckets) {
            const ids = result[bucket] || [];
            classified[bucket] = signals.filter(s => ids.includes(s.id));
        }
        return classified;
    } catch (error) {
        console.error('分类失败，使用默认分类:', error.message);
        const buckets = ['discovery', 'technology', 'competition', 'demand', 'trend'];
        const classified = {};
        const perBucket = Math.ceil(signals.length / 5);
        for (let i = 0; i < 5; i++) {
            classified[buckets[i]] = signals.slice(i * perBucket, (i + 1) * perBucket);
        }
        return classified;
    }
}

function generateDimensions(classified) {
    const dims = [
        { id: 'discovery', name: '发现机会', nameEn: 'Discovery Opportunities', signals: classified.discovery || [] },
        { id: 'technology', name: '技术选型', nameEn: 'Technology Selection', signals: classified.technology || [] },
        { id: 'competition', name: '竞争情报', nameEn: 'Competitive Intelligence', signals: classified.competition || [] },
        { id: 'demand', name: '需求雷达', nameEn: 'Demand Radar', signals: classified.demand || [] },
        { id: 'trend', name: '趋势判断', nameEn: 'Trend Analysis', signals: classified.trend || [] },
    ];
    return dims.filter(d => d.signals.length > 0);
}

async function runExpertAnalysis(dimensions, date) {
    return Promise.all(dimensions.map(dim => analyzeAsExpert(dim, date)));
}

async function analyzeAsExpert(dimension, date) {
    const systemPrompt = `你是「${dimension.name}」维度的资深分析师。
请用专业、客观、有洞察力的语言分析提供的信号。
每个分析点包含：核心判断、关键证据、反向视角、实战建议。
输出 Markdown 格式。`;

    const signalsText = dimension.signals.map(s => 
        `- **${s.title}** (${s.source})\n  ${s.summary || '无摘要'}\n  链接: ${s.url}`
    ).join('\n\n');

    try {
        const markdown = await callLLM(systemPrompt, 
            `请分析以下与「${dimension.name}」相关的 ${dimension.signals.length} 条信号（日期：${date}）：\n\n${signalsText}\n\n生成 4 个深度分析点。`,
            { maxTokens: 2000 }
        );
        return { dimension: dimension.id, name: dimension.name, nameEn: dimension.nameEn, markdown };
    } catch (error) {
        console.error(`专家分析失败 (${dimension.id}):`, error.message);
        return { dimension: dimension.id, name: dimension.name, nameEn: dimension.nameEn, 
                 markdown: `### 分析暂时不可用\n${error.message}` };
    }
}

async function generateReports(date, classified, dimensions, expertAnalyses) {
    const reports = {};
    reports.zh = await generateReport('zh', date, classified, expertAnalyses);
    reports.en = await generateReport('en', date, classified, expertAnalyses);
    return reports;
}

async function generateReport(lang, date, classified, expertAnalyses) {
    const isZh = lang === 'zh';
    const systemPrompt = isZh
        ? `你是 AI 日报主编。基于专家分析，生成一份结构化的 AI 日报（中文）。
要求：Markdown 格式；包含头条Top3、5个分析维度、三级构建建议+风险提示；语言专业犀利。`
        : `You are an AI daily report editor. Generate a structured AI daily report (English) based on expert analyses.
Requirements: Markdown format; include Headlines Top 3, 5 analysis dimensions, three-tier build suggestions + risk warning; Professional and sharp tone.`;

    const topSignals = Object.values(classified).flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);

    const topSignalsText = topSignals.map((s, i) => 
        `${i + 1}. **${s.title}** (${s.source}, score:${s.score})\n   ${s.url}`
    ).join('\n');

    const expertText = expertAnalyses.map(ea => 
        `## ${isZh ? ea.name : ea.nameEn}\n\n${ea.markdown}`
    ).join('\n\n---\n\n');

    const userPrompt = isZh
        ? `请生成 ${date} 的 AI 日报（中文版）。\n\n**Top 10 信号：**\n${topSignalsText}\n\n**专家分析：**\n${expertText}\n\n请生成完整的日报 Markdown。`
        : `Please generate the AI Daily Report for ${date} (English version).\n\n**Top 10 Signals:**\n${topSignalsText}\n\n**Expert Analyses:**\n${expertText}\n\nPlease generate the complete report in Markdown.`;

    try {
        const markdown = await callLLM(systemPrompt, userPrompt, { maxTokens: 4000 });
        return { markdown };
    } catch (error) {
        console.error(`日报生成失败 (${lang}):`, error.message);
        return { markdown: `# AI 日报 ${date}\n\n生成失败：${error.message}` };
    }
}

module.exports = { runPipeline };
