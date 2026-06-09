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
6. coding - AI Coding & harness 工程（AI 编程工具动态、代码生成模型、Coding Agent、harness/脚手架工程、IDE 集成）
7. discovery - 发现机会（新应用场景、市场空白、创业方向）

⚠️ 必须将所有7个分类都输出，即使某个分类为空数组。

返回 JSON 格式：{ "product": [...ids], "research": [...ids], "industry": [...ids], "opensource": [...ids], "social": [...ids], "coding": [...ids], "discovery": [...ids] }

如果一条信号可能属于多个类别，放入最相关的那个。`;

    const signalsText = signals.map(s => {
        let line = `[${s.id}] ${s.title} (${s.source}, 分数:${s.score})`;
        // 只传递有意义的配图（排除小图标、头像）
        if (s.image_url && !s.image_url.includes('avatar') && !s.image_url.includes('s=40') && !s.image_url.includes('s=32')) {
            line += ` [有意义配图]`;
        }
        if (s.video_url) line += ` [视频]`;
        return line;
    }).join('\n');

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

    const signalsText = dimension.signals.length > 0
        ? dimension.signals.map(s => {
            let line = `- **${s.title}** (${s.source}) [来源](${s.url})\n  ${s.summary || '无摘要'}`;
            // 只引用有内容的图片（排除头像、logo、小图标）
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
    const allSignals = Object.values(classified).flat();
    const reports = {};
    reports.zh = await generateReport('zh', date, classified, expertAnalyses, headline, allSignals);
    return reports;
}

async function generateReport(lang, date, classified, expertAnalyses, headline, allSignals) {
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

## 💻 AI Coding & harness 工程
（AI 编程工具更新、代码生成模型、Coding Agent 动态、harness/脚手架工程、开发者工作流变革）

## 💡 发现机会
（新应用场景、市场空白、创业方向）

---

*报告生成时间：填入日期*
*数据来源：列出所有来源*

⚠️ 严格规则：
1. **所有7个板块必须全部输出**，即使某板块内容较少也不能省略
2. 每个板块至少2-3条内容
3. **每条资讯必须附带原始来源链接**，格式为 [来源](URL)，优先使用下方提供的信号链接
4. 开源项目必须附 GitHub 链接
5. 语言专业犀利，重要关键词加粗
6. 不重复已有专家分析的原文，但要整合其洞察
7. **图片引用**：仅当信号包含有实际内容意义的配图（如产品截图、模型效果图、信息图）时才引用，使用格式：![描述](图片URL)。**禁止引用头像、logo、小图标等无内容意义的图片**
8. **视频引用**：当信号包含视频URL时，使用格式：[▶ 观看视频](视频URL)
9. 图片和视频放在资讯条目正文之后、下一条资讯之前`
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

## 💻 AI Coding & Harness Engineering
(AI coding tool updates, code generation models, Coding Agent dynamics, harness/scaffold engineering, developer workflow changes)

## 💡 Opportunity Discovery
(New application scenarios, market gaps, startup directions)

---

*Report generated: fill in date*
*Data sources: list all sources*

⚠️ Strict rules:
1. **ALL 7 sections MUST be output**, even if some sections have fewer items
2. Each section should have at least 2-3 items
3. **Every news item must include a source link**, formatted as [Source](URL), preferring the signal links provided below
4. Open source projects must include GitHub links
5. Use professional and sharp language, bold key terms
6. Do not repeat expert analysis verbatim, but integrate their insights
7. **Image references**: Only include images with meaningful content (product screenshots, model results, infographics), format: ![description](imageURL). **DO NOT include avatars, logos, icons**
8. **Video references**: When a signal includes a video URL, use format: [▶ Watch Video](videoURL)
9. Images and videos should be placed after the news item text and before the next item`;

    const expertText = expertAnalyses.map(ea =>
        `## ${ea.icon} ${isZh ? ea.name : ea.nameEn}\n\n${ea.markdown}`
    ).join('\n\n---\n\n');

    const topSignalsText = topSignals.map((s, i) => {
        let line = `${i + 1}. **${s.title}** [${s.source}](${s.url}) (score:${s.score})`;
        if (s.image_url && !s.image_url.includes('avatar') && !s.image_url.includes('s=40') && !s.image_url.includes('s=32')) {
            line += ` [配图](${s.image_url})`;
        }
        if (s.video_url) line += ` [视频](${s.video_url})`;
        return line;
    }).join('\n');

    const userPrompt = isZh
        ? `请生成 ${date} 的 AI 资讯日报（中文版）。\n\n**Top 5 信号：**\n${topSignalsText}\n\n**专家分析：**\n${expertText}\n\n请生成完整的日报 Markdown。头条摘要为：「${headline}」\n\n⚠️ 关键提醒：\n1. 必须输出全部7个板块标题：🚀产品与功能更新、🔬前沿研究、🌍行业展望与社会影响、⭐开源TOP项目、💬社媒分享、💻AI Coding & harness工程、💡发现机会。缺一不可！\n2. 如果某板块信号不足，请基于行业趋势补充前瞻性分析\n3. 每条资讯必须有可点击的[来源](URL)链接\n4. 配图：如果信号标记了[配图]，在该条目下方插入 ![配图描述](配图URL)\n5. 视频：如果信号标记了[视频]，在该条目下方插入 [▶ 观看视频](视频URL)`
        : `Please generate the AI Daily Report for ${date} (English version).\n\n**Top 5 Signals:**\n${topSignalsText}\n\n**Expert Analyses:**\n${expertText}\n\nPlease generate the complete report in Markdown. Headline: "${headline}"\n\n⚠️ Critical reminders:\n1. MUST output ALL 7 section headers: 🚀Product & Feature Updates, 🔬Frontier Research, 🌍Industry Outlook & Social Impact, ⭐Open Source Top Projects, 💬Social Media Highlights, 💻AI Coding & Harness Engineering, 💡Opportunity Discovery. None can be missing!\n2. If a section lacks signals, add forward-looking analysis based on industry trends\n3. Every news item must have a clickable [Source](URL) link\n4. Images: If a signal is marked [配图], insert ![description](imageURL) below that item\n5. Videos: If a signal is marked [视频], insert [▶ Watch Video](videoURL) below that item`;

    try {
        let markdown = await callLLM(systemPrompt, userPrompt, { maxTokens: 5000 });
        
        // 后处理：补全缺失板块
        if (isZh) {
            const requiredSections = [
                ['## 🚀 产品与功能更新', '### 暂无显著更新\n今日该板块信号较少，但从整体趋势看，大模型能力迭代仍在加速，持续关注头部厂商动态。'],
                ['## 🔬 前沿研究', '### 暂无显著论文\n今日该板块信号较少，arXiv 新论文可能集中在非 AI 分类，建议关注 cs.AI/cs.CL 领域动态。'],
                ['## 🌍 行业展望与社会影响', '### 暂无显著事件\n今日该板块信号较少，但 AI 行业投融资和政策监管节奏未变，持续关注。'],
                ['## ⭐ 开源 TOP 项目', '### 暂无新晋项目\n今日 GitHub AI 分类无显著新晋项目，持续关注明星项目动态。'],
                ['## 💬 社媒分享', '### 暂无热议话题\n今日社媒 AI 话题相对平淡，建议关注大V动态。'],
                ['## 💻 AI Coding & harness 工程', '### 暂无显著更新\n今日 AI 编程工具无重大更新，持续关注 Cursor/Copilot/Claude Code 等工具迭代。'],
                ['## 💡 发现机会', '### 暂无显著信号\n基于当日趋势：AI Agent 落地场景、边缘端多模态、企业自动化仍是值得关注的方向。'],
            ];
            for (const [header, fallback] of requiredSections) {
                if (!markdown.includes(header.trim())) {
                    // 找到该板块应该插入的位置（在上一个板块末尾）
                    const insertBefore = requiredSections.findIndex(([h]) => h.trim() === header.trim());
                    let inserted = false;
                    if (insertBefore > 0) {
                        const prevHeader = requiredSections[insertBefore - 1][0];
                        const prevIdx = markdown.lastIndexOf(prevHeader);
                        if (prevIdx >= 0) {
                            // 找下一个 ## 的位置
                            const afterPrev = markdown.indexOf('\n## ', prevIdx + prevHeader.length);
                            if (afterPrev >= 0) {
                                markdown = markdown.slice(0, afterPrev) + '\n\n' + header + '\n\n' + fallback + markdown.slice(afterPrev);
                                inserted = true;
                            }
                        }
                    }
                    if (!inserted) {
                        markdown += '\n\n' + header + '\n\n' + fallback;
                    }
                }
            }
        }
        
        // 后处理：在每个板块末尾追加媒体引用（LLM 经常忽略图片视频指令）
        if (isZh && allSignals && allSignals.length > 0) {
            // 按信号分类收集媒体
            const bucketMap = { product: '🚀', research: '🔬', industry: '🌍', opensource: '⭐', social: '💬', coding: '💻', discovery: '💡' };
            const sectionHeaders = {
                product: '## 🚀 产品与功能更新',
                research: '## 🔬 前沿研究',
                industry: '## 🌍 行业展望与社会影响',
                opensource: '## ⭐ 开源 TOP 项目',
                social: '## 💬 社媒分享',
                coding: '## 💻 AI Coding & harness 工程',
                discovery: '## 💡 发现机会',
            };
            const classified = {};
            for (const s of allSignals) {
                // 分类逻辑：复用信号的 category 或 source
                const cat = s.category || (s.source === 'github' ? 'opensource' : s.source === 'v2ex' ? 'social' : 'product');
                if (!classified[cat]) classified[cat] = [];
                classified[cat].push(s);
            }
            
            for (const [cat, header] of Object.entries(sectionHeaders)) {
                const catSignals = classified[cat] || [];
                const mediaItems = catSignals.filter(s => 
                    (s.image_url && !s.image_url.includes('avatar') && !s.image_url.includes('s=40') && !s.image_url.includes('s=32')) || s.video_url
                );
                if (mediaItems.length === 0) continue;
                
                const headerIdx = markdown.indexOf(header);
                if (headerIdx < 0) continue;
                
                // 找到下一个 ## 的位置（板块结尾）
                let nextSection = markdown.indexOf('\n## ', headerIdx + header.length);
                if (nextSection < 0) nextSection = markdown.length;
                
                // 追加媒体
                let mediaBlock = '\n\n---\n**📸 今日配图 & 视频**\n';
                let count = 0;
                for (const s of mediaItems) {
                    if (count >= 3) break; // 每板块最多3张
                    if (s.image_url) {
                        mediaBlock += `\n![${(s.title || '').slice(0, 30)}](${s.image_url})`;
                        count++;
                    }
                    if (s.video_url) {
                        mediaBlock += `\n[▶ 观看视频：${(s.title || '').slice(0, 30)}](${s.video_url})`;
                        if (!s.image_url) count++;
                    }
                }
                markdown = markdown.slice(0, nextSection) + mediaBlock + markdown.slice(nextSection);
            }
        }
        
        return { markdown };
    } catch (error) {
        console.error(`日报生成失败 (${lang}):`, error.message);
        return { markdown: `# ${isZh ? 'AI 资讯日报' : 'AI Daily Report'} ${date}\n\n${isZh ? '生成失败' : 'Generation failed'}：${error.message}` };
    }
}

module.exports = { runPipeline };
