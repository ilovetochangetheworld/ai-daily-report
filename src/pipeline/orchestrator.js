/**
 * 多 Agent 分析管道
 * 参考 DailyDawn 架构：
 * 1. 分类器：将信号分进 5 个 bucket
 * 2. 问题生成器：为每个 bucket 生成分析问题
 * 3. 专家分析：5 个专家并行分析
 * 4. 主编合成：生成最终日报
 */

import { callLLM, callLLMJson } from './llm.js';
import { extractCrossThemes } from '../aggregator.js';

/**
 * 运行完整分析管道
 * @param {object} params
 * @param {string} params.date - 日期
 * @param {Array<Signal>} params.signals - 聚合后的信号
 * @returns {Promise<object>} { zh: { markdown }, en: { markdown } }
 */
export async function runPipeline({ date, signals }) {
    console.log('  → 步骤 1/5: 分类信号...');
    const classified = await classifySignals(signals);
    console.log(`    ✓ 分为 ${Object.keys(classified).length} 个类别`);

    console.log('  → 步骤 2/5: 生成分析维度...');
    const dimensions = await generateDimensions(classified, date);
    console.log(`    ✓ 生成 ${dimensions.length} 个分析维度`);

    console.log('  → 步骤 3/5: 专家分析（并行）...');
    const expertAnalyses = await runExpertAnalysis(dimensions, classified, date);
    console.log(`    ✓ ${expertAnalyses.length} 个专家分析完成`);

    console.log('  → 步骤 4/5: 生成双语日报...');
    const reports = await generateReports(date, classified, dimensions, expertAnalyses);
    console.log('    ✓ 日报生成完成\n');

    return reports;
}

/**
 * 步骤 1: 分类信号到 5 个 bucket
 */
async function classifySignals(signals) {
    const systemPrompt = `你是 AI 行业分析师。将输入的 AI 相关信号分类到以下 5 个维度：
1. 发现机会 (discovery) - 新产品、新工具、新应用场景
2. 技术选型 (technology) - 模型、框架、工具的技术对比
3. 竞争情报 (competition) - 公司/产品之间的竞争动态
4. 需求雷达 (demand) - 用户痛点、市场需求、待解决问题
5. 趋势判断 (trend) - 行业趋势、技术方向、未来预测

返回 JSON 格式：{ "discovery": [...], "technology": [...], "competition": [...], "demand": [...], "trend": [...] }
每个键对应一个数组，包含原始信号的 ID。`;

    const signalsText = signals.map(s => 
        `[${s.id}] ${s.title} (${s.source}, 分数:${s.score})`
    ).join('\n');

    const userPrompt = `请分类以下 ${signals.length} 条信号：\n\n${signalsText}`;
    
    try {
        const result = await callLLMJson(systemPrompt, userPrompt);
        
        // 验证结果
        const buckets = ['discovery', 'technology', 'competition', 'demand', 'trend'];
        for (const bucket of buckets) {
            if (!result[bucket]) result[bucket] = [];
        }
        
        // 将 ID 转换回信号对象
        const classified = {};
        for (const bucket of buckets) {
            const ids = result[bucket] || [];
            classified[bucket] = signals.filter(s => ids.includes(s.id));
        }
        
        return classified;
    } catch (error) {
        console.error('分类失败，使用默认分类:', error.message);
        // 降级：平均分配
        const buckets = ['discovery', 'technology', 'competition', 'demand', 'trend'];
        const classified = {};
        const perBucket = Math.ceil(signals.length / 5);
        
        for (let i = 0; i < 5; i++) {
            classified[buckets[i]] = signals.slice(i * perBucket, (i + 1) * perBucket);
        }
        
        return classified;
    }
}

/**
 * 步骤 2: 为每个维度生成分析问题和上下文
 */
async function generateDimensions(classified, date) {
    const dimensions = [
        {
            id: 'discovery',
            name: '发现机会',
            nameEn: 'Discovery Opportunities',
            description: '新产品、新工具、新应用场景',
            signals: classified.discovery || [],
        },
        {
            id: 'technology',
            name: '技术选型',
            nameEn: 'Technology Selection',
            description: '模型、框架、工具的技术对比',
            signals: classified.technology || [],
        },
        {
            id: 'competition',
            name: '竞争情报',
            nameEn: 'Competitive Intelligence',
            description: '公司/产品之间的竞争动态',
            signals: classified.competition || [],
        },
        {
            id: 'demand',
            name: '需求雷达',
            nameEn: 'Demand Radar',
            description: '用户痛点、市场需求、待解决问题',
            signals: classified.demand || [],
        },
        {
            id: 'trend',
            name: '趋势判断',
            nameEn: 'Trend Analysis',
            description: '行业趋势、技术方向、未来预测',
            signals: classified.trend || [],
        },
    ];

    return dimensions.filter(d => d.signals.length > 0);
}

/**
 * 步骤 3: 专家分析（并行）
 */
async function runExpertAnalysis(dimensions, classified, date) {
    const analyses = await Promise.all(
        dimensions.map(dim => analyzeAsExpert(dim, date))
    );
    return analyses;
}

/**
 * 单个专家分析
 */
async function analyzeAsExpert(dimension, date) {
    const systemPrompt = `你是「${dimension.name}」维度的资深分析师。
你的专长：${dimension.description}

请用专业、客观、有洞察力的语言分析提供的信号。
每个分析点包含：
1. 核心判断（1-2句话）
2. 关键证据（引用具体数据）
3. 反向视角（可能的反例或风险）
4. 实战建议（可执行的行动建议）

输出格式：Markdown 格式，每个分析点用 ### 标题`;

    const signalsText = dimension.signals.map(s => 
        `- **${s.title}** (${s.source})\n  ${s.summary || '无摘要'}\n  链接: ${s.url}`
    ).join('\n\n');

    const userPrompt = `请分析以下与「${dimension.name}」相关的 ${dimension.signals.length} 条信号（日期：${date}）：\n\n${signalsText}\n\n生成 4 个深度分析点。`;

    try {
        const markdown = await callLLM(systemPrompt, userPrompt, {
            maxTokens: 2000,
        });
        
        return {
            dimension: dimension.id,
            name: dimension.name,
            nameEn: dimension.nameEn,
            markdown,
        };
    } catch (error) {
        console.error(`专家分析失败 (${dimension.id}):`, error.message);
        return {
            dimension: dimension.id,
            name: dimension.name,
            nameEn: dimension.nameEn,
            markdown: `### 分析暂时不可用\n${error.message}`,
        };
    }
}

/**
 * 步骤 4: 生成双语日报
 */
async function generateReports(date, classified, dimensions, expertAnalyses) {
    const reports = {};
    
    // 中文日报
    reports.zh = await generateReport('zh', date, classified, dimensions, expertAnalyses);
    
    // 英文日报
    reports.en = await generateReport('en', date, classified, dimensions, expertAnalyses);
    
    return reports;
}

/**
 * 生成单个语言的日报
 */
async function generateReport(lang, date, classified, dimensions, expertAnalyses) {
    const isZh = lang === 'zh';
    const langName = isZh ? '中文' : 'English';
    
    const systemPrompt = isZh
        ? `你是 AI 日报主编。基于专家分析，生成一份结构化的 AI 日报（中文）。
要求：
1. 使用 Markdown 格式
2. 包含：头条（Top 3信号）、5 个分析维度（发现机会/技术选型/竞争情报/需求雷达/趋势判断）
3. 每个维度 4 个分析点（来源于专家分析）
4. 结尾：三级构建建议（2小时/周末/本周）+ 风险提示
5. 语言：专业、犀利、有洞察力，避免套话`
        : `You are an AI daily report editor. Generate a structured AI daily report (English) based on expert analyses.
Requirements:
1. Use Markdown format
2. Include: Headlines (Top 3 signals), 5 analysis dimensions (Discovery/Technology/Competition/Demand/Trend)
3. 4 analysis points per dimension (from expert analyses)
4. Closing: Three-tier build suggestions (2-hour/Weekend/This week) + Risk warning
5. Tone: Professional, sharp, insightful, avoid clichés`;

    // 构建输入
    const topSignals = Object.values(classified)
        .flat()
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 10);

    const topSignalsText = topSignals.map((s, i) => 
        `${i + 1}. **${s.title}** (${s.source}, 分数:${s.score})\n   ${s.url}`
    ).join('\n');

    const expertText = expertAnalyses.map(ea => 
        `## ${isZh ? ea.name : ea.nameEn}\n\n${ea.markdown}`
    ).join('\n\n---\n\n');

    const userPrompt = isZh
        ? `请生成 ${date} 的 AI 日报（中文版）。\n\n**Top 10 信号：**\n${topSignalsText}\n\n**专家分析：**\n${expertText}\n\n请生成完整的日报 Markdown。`
        : `Please generate the AI Daily Report for ${date} (English version).\n\n**Top 10 Signals:**\n${topSignalsText}\n\n**Expert Analyses:**\n${expertText}\n\nPlease generate the complete report in Markdown.`;

    try {
        const markdown = await callLLM(systemPrompt, userPrompt, {
            maxTokens: 4000,
        });
        
        return { markdown };
    } catch (error) {
        console.error(`日报生成失败 (${lang}):`, error.message);
        return { markdown: `# AI 日报 ${date}\n\n生成失败：${error.message}` };
    }
}
