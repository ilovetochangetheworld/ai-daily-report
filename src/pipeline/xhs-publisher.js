/**
 * 小红书发布模块
 * - 从完整日报解析7板块全部条目，模板组装小红书正文
 * - 自动生成封面图+板块详解图
 * - 通过 xhs-cli 发布
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const { generateCoverAndCards, parseFullSections } = require('./xhs-cards');

// 板块 emoji 对照表
const SECTION_EMOJIS = {
    '产品与功能更新': '🚀',
    '前沿研究': '🔬',
    '行业展望与社会影响': '🌍',
    '开源 TOP 项目': '⭐',
    '社媒热议': '💬',
    'Harness Engineering': '💻',
    'AI Coding & 工程': '💻',
    'AI Coding & harness 工程': '💻',
    '发现机会': '💡',
};

/**
 * 从完整日报生成小红书正文
 * 策略：解析7板块所有条目，提取核心摘要，用模板组装
 * 无需 LLM，稳定可控，内容完整覆盖
 */
function generateXhsContent(fullMarkdown, date) {
    const sections = parseFullSections(fullMarkdown);

    // 找当天最有冲击力的条目做标题——优先取完整短语（到冒号后截断）
    let headline = '';
    for (const sec of sections) {
        for (const item of sec.items) {
            if (item.subtitle.length > 8 && !headline) {
                const quoted = item.subtitle.match(/“([^”]{4,12})”/);
                if (quoted) {
                    headline = quoted[1];
                    break;
                }
                // 如果有冒号，取冒号前的短标题
                const colonIdx = item.subtitle.indexOf('：');
                if (colonIdx > 2 && colonIdx < 14) {
                    headline = item.subtitle.substring(0, colonIdx);
                } else {
                    headline = item.subtitle.substring(0, 14);
                }
                break;
            }
        }
        if (headline) break;
    }
    const dateStr = date.substring(5).replace('-', '.');
    const title = headline
        ? `⚡️${headline.substring(0, 14)}｜AI日报${dateStr}`
        : `⚡️AI日报${dateStr}`;

    let content = title + '\n\n';
    content += '今天的 AI 信号我整理成卡片了，适合先看图速览，再回到正文抓重点。\n\n';
    content += '━━━━━━━━━━━━━━━━\n\n';
    content += '🔥 今日最值得关注\n\n';

    const highlights = [];
    for (const sec of sections) {
        const emoji = SECTION_EMOJIS[sec.title] || sec.emoji || '📌';
        for (const item of sec.items.slice(0, 2)) {
            highlights.push({ emoji, item });
            if (highlights.length >= 8) break;
        }
        if (highlights.length >= 8) break;
    }

    for (const { emoji, item } of highlights) {
        const brief = compactBrief(item.summary, 54);
        if (!brief) continue;
        content += `${emoji} ${compactTitle(item.subtitle, 24)}\n${brief}\n\n`;
    }

    const datePath = date.replace(/-/g, '/');
    const reportLink = `ilovetochangetheworld.github.io/ai-daily-report/zh/${datePath}.html`;

    content += '━━━━━━━━━━━━━━━━\n\n';
    content += '📌 卡片覆盖完整板块：产品、研究、行业、开源、社媒、Harness Engineering、机会。\n';
    content += `🔗 完整日报：${reportLink}\n`;

    // 统计数据
    const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
    content += `📊 今日数据：${totalItems} 条精华 · ${sections.length} 个维度\n\n`;
    content += '#AI日报 #大模型 #AIAgent #AI工具 #科技趋势 #AI创业';

    return content;
}

/**
 * 发布到小红书
 */
async function publishToXhs({ date, fullMarkdown, signals }) {
    console.log('\n📕 小红书发布流程...');

    // 0. 防重发：检查当天是否已发布过同日期的笔记
    const alreadyPublished = await checkTodayPublished(date);
    if (alreadyPublished) {
        console.log(`  ⚠ 今日(${date})小红书笔记已存在，跳过发布（防重复）`);
        return null;
    }

    // 1. 生成小红书版内容（优先平台化文案，失败则模板兜底）
    console.log('  → 生成小红书版内容...');
    const xhsContent = await generateXhsContentForPublish(fullMarkdown, date);
    console.log(`  ✓ 内容生成完成 (${xhsContent.length} 字)`);

    // 2. 生成封面 + 板块详解图 (HTML+Puppeteer)
    const coverDir = path.join(path.resolve(__dirname, '../..'), 'xhs_covers');
    console.log('  → 生成封面+板块详解图 (HTML+Puppeteer)...');
    let imagePaths = null;
    try {
        imagePaths = await generateCoverAndCards(date, fullMarkdown, coverDir);
    } catch (e) {
        console.log('  ⚠ HTML截图生成失败:', e.message?.substring(0, 200));
    }

    if (!imagePaths || imagePaths.length < 1) {
        console.log('  ⚠ 图片生成失败，跳过小红书发布');
        return null;
    }
    console.log(`  ✓ ${imagePaths.length} 张图就绪`);

    // 3. 发布
    const title = extractTitle(xhsContent);
    console.log(`  → 发布到小红书: ${title}`);

    try {
        const parsedSections = parseFullSections(fullMarkdown);
        const topic = parsedSections[0]?.title || 'AI日报';

        // 使用 spawnSync 直接传参数数组，避免 execSync 通过 shell 时 \n 换行符被吞掉
        const args = ['post', '--title', title, '--body', xhsContent];
        for (const p of imagePaths) args.push('--images', p);
        args.push('--topic', topic, '--private', '--json');

        const result = spawnSync('xhs', args, { encoding: 'utf8', timeout: 120000 });
        const stdout = (result.stdout || '').trim();
        const stderr = (result.stderr || '').trim();

        if (!stdout && result.status !== 0) {
            console.error('  ✗ 小红书发布异常 (exit', result.status, '):', stderr.substring(0, 300));
            return null;
        }

        let parsed;
        try { parsed = JSON.parse(stdout); } catch {
            // xhs-cli 可能先输出进度行，找最后一个 JSON
            const lines = stdout.split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                try { parsed = JSON.parse(lines[i]); break; } catch {}
            }
        }
        if (!parsed) {
            console.error('  ✗ 小红书发布: 无法解析响应:', stdout.substring(0, 300));
            return null;
        }

        if (parsed.ok) {
            console.log(`  ✓ 小红书发布成功（仅自己可见）！笔记ID: ${parsed.data?.id}`);
            console.log(`  💡 请在小红书App中审查后手动公开`);
            return parsed.data;
        } else {
            console.log(`  ✗ 小红书发布失败:`, JSON.stringify(parsed));
            return null;
        }
    } catch (error) {
        console.error('  ✗ 小红书发布异常:', error.message?.substring(0, 200));
        return null;
    }
}

async function generateXhsContentForPublish(fullMarkdown, date) {
    if (process.env.XHS_LLM_CONTENT === 'false') {
        return generateXhsContent(fullMarkdown, date);
    }

    try {
        const llmContent = await generateXhsContentByLLM(fullMarkdown, date);
        const validated = fixupXhsContent(llmContent, date);
        if (validated) {
            console.log(`  ✓ LLM 文案校验通过 (${validated.length} 字)`);
            return validated;
        }
        console.log('  ⚠ 小红书 LLM 文案不完整，使用模板文案');
    } catch (error) {
        console.log(`  ⚠ 小红书 LLM 文案生成失败，使用模板文案: ${error.message?.substring(0, 120)}`);
    }
    return generateXhsContent(fullMarkdown, date);
}

/**
 * 修复 LLM 输出的常见缺失：补链接、补标签、去思考链残留
 * 返回修正后的文案，或 null 如果内容太短/太碎
 */
function fixupXhsContent(content, date) {
    if (!content || typeof content !== 'string') return null;
    let text = content.trim();

    // 太短或太长都不可用
    if (text.length < 120) return null;

    // 去掉残留的思考链标记（推理模型有时把思考链混入 content）
    text = text.replace(/(?:^|\n)(?:分析思路|推演链条|核心判断|关键证据|实战建议|反向视角|不确定性)[：:][^\n]*/g, '');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 120) return null;

    // 强制「🔥 今日最值得关注」区域每条之间空一行
    text = fixHighlightsSpacing(text);

    // 正确的当日日报链接
    const datePath = date.replace(/-/g, '/');  // 2026-06-10 → 2026/06/10
    const correctLink = `ilovetochangetheworld.github.io/ai-daily-report/zh/${datePath}.html`;

    // 先删除 LLM 可能输出的任何旧链接（首页链接或错误日期链接），避免重复
    text = text.replace(/ilovetochangetheworld\.github\.io\/ai-daily-report[^\s\n]*/g, '').trim();
    // 清理残留的 「🔗 完整日报：」「完整日报：」 等前缀文字
    text = text.replace(/^[🔗📅🔍]*\s*完整日报[：:]\s*$/gm, '').trim();

    // 在末尾统一追加正确的链接
    text += `\n🔗 完整日报：${correctLink}`;

    // 补标签：LLM 常漏或格式不对
    if (!text.includes('#')) {
        text += `\n\n#AI日报 #大模型 #AIAgent #AI工具 #科技趋势 #AI创业`;
    }

    // 再次清理连续空行
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    // 超长截断（小红书正文上限约 1800 字）
    if (text.length > 1800) {
        const cut = text.substring(0, 1750);
        const lastPunc = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('\n'));
        text = lastPunc > 500 ? text.substring(0, lastPunc + 1) : cut + '…';
    }

    return text;
}

/**
 * 确保「🔥 今日最值得关注」区域每条新闻之间有空行分隔
 * 处理 LLM 输出中常见的：条目紧贴、只换行不空行
 */
function fixHighlightsSpacing(text) {
    // 匹配 🔥 区域：从标题到段落分隔线 或 「📌 为什么要收藏」
    // 注意：不能把条目开头 emoji（🚀🔬🌍💻💡💬）当成段落结束标志
    const highlightsRegex = /(🔥\s*今日最值得关注)\n([\s\S]*?)(?=\n📌|\n━━|\n🔗|\n📊|\n#[A-Z]|$)/;
    const match = text.match(highlightsRegex);
    if (!match) return text;

    const header = match[1];
    let body = match[2].trim();

    // 每条新闻之间需要空行分隔——最简单的办法是每行后都加空行
    const lines = body.split('\n').map(l => l.trim()).filter(l => l);
    // 每行后面跟一个空行
    const fixedBody = lines.join('\n\n');

    return text.replace(match[0], `${header}\n\n${fixedBody}`);
}

async function generateXhsContentByLLM(fullMarkdown, date) {
    const { callLLM } = require('./llm');
    const sections = parseFullSections(fullMarkdown);
    const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
    const datePath = date.replace(/-/g, '/');  // 2026-06-10 → 2026/06/10
    const sectionBriefs = sections.map(sec => {
        const emoji = SECTION_EMOJIS[sec.title] || sec.emoji || '📌';
        const items = sec.items.slice(0, 3)
            .map(item => {
                const brief = compactBrief(item.summary, 70);
                return brief ? `- ${item.subtitle}：${brief}` : '';
            })
            .filter(Boolean)
            .join('\n');
        return `## ${emoji} ${sec.title}\n${items}`;
    }).join('\n\n');

    const systemPrompt = `你是懂小红书科技内容分发的 AI 日报编辑。把日报整理成一篇小红书笔记正文。

输出要求：
- 第一行是标题，20字以内，格式类似「⚡️主题｜AI日报MM.DD」
- 开头用1句话说明"为什么值得看"，不要官方腔
- 输出「🔥 今日最值得关注」并列出 6-8 条
- 每条格式：emoji + 短标题 + 1句判断，不超过70字
- 【关键】每条新闻之间必须空一行，确保小红书渲染时条目之间有清晰间距
- 加一段「📌 为什么要收藏」：3个短句，强调复盘、选题、产品判断
- 加一句评论区引导问题
- 末尾一行输出完整日报链接，格式固定为：「🔗 完整日报：ilovetochangetheworld.github.io/ai-daily-report/zh/${datePath}.html」
- 不要编造来源、数据、公司名；不确定就写得克制
- 不要输出 Markdown 表格，不要输出代码块
- 不要在链接部分输出任何其他 URL 或多余文字

格式示例：
🔥 今日最值得关注

🚀 Claude Fable 5 发布
安全护栏下的神话级模型，代码工程能力质的飞跃

🔬 SFT范式被打破
传统对演示轨迹的严格拟合会破坏预训练先验

🌍 Agent支付基建落地
百度布局Agent全球支付，标志从辅助工具向自主经济实体演进`;

    const userPrompt = `日期：${date}
总计：${totalItems} 条精华，${sections.length} 个维度
完整日报提炼如下：

${sectionBriefs}

请直接输出小红书笔记正文。`;

    // 推理模型思考链很长，需要给足空间保证正文完整输出
    return callLLM(systemPrompt, userPrompt, { maxTokens: 16384 });
}

function isValidXhsContent(content) {
    if (!content || typeof content !== 'string') return false;
    const text = content.trim();
    return text.length >= 180
        && text.length <= 1800
        && text.includes('AI日报')
        && text.includes('#')
        && text.includes('ilovetochangetheworld.github.io/ai-daily-report')
        && !/核心判断(?:（证据强度[：:][强中弱]）)?[：:]\s*(?:\n|$)/.test(text);
}

/**
 * 从内容中提取标题（第一行）
 */
function extractTitle(content) {
    const firstLine = content.split('\n')[0]?.trim() || 'AI日报';
    return firstLine.substring(0, 20);
}

function compactTitle(title, maxLen) {
    const cleaned = String(title || '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.length > maxLen ? cleaned.substring(0, maxLen - 1) + '…' : cleaned;
}

function compactBrief(summary, maxLen) {
    let brief = String(summary || '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[（(]\s*[）)]/g, '')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/^(分析思路与推演链条|分析推演链条|分析思路|推演链条)[：:]\s*/i, '')
        .replace(/^关键证据[：:]\s*/i, '')
        .replace(/^核心判断(?:（证据强度[：:][强中弱]）)?[：:]\s*/i, '')
        .replace(/^(实战建议|反向视角|不确定性)[：:]\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (/^核心判断(?:（证据强度[：:][强中弱]）)?[：:]?$/.test(brief)) {
        return '';
    }

    if (brief.includes('；')) {
        brief = brief.split('；')[0];
    }
    if (brief.includes('。') && brief.indexOf('。') < brief.length - 1) {
        const firstSentence = brief.substring(0, brief.indexOf('。') + 1);
        if (firstSentence.length > 15) brief = firstSentence;
    }
    if (brief.length > maxLen) {
        const cut = brief.substring(0, maxLen);
        const lastPunc = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'));
        brief = lastPunc > 12 ? brief.substring(0, lastPunc) + '…' : cut + '…';
    }
    return brief.replace(/[，；、\s]+$/, '');
}

/**
 * 检查当天是否已发布过同日期的小红书笔记
 * 通过 xhs my-notes 获取最近笔记，匹配标题中的日期
 */
async function checkTodayPublished(date) {
    try {
        const result = spawnSync('xhs', ['my-notes', '--json'], {
            encoding: 'utf8',
            timeout: 15000,
        });
        const stdout = (result.stdout || '').trim();
        if (!stdout) return false;

        let data;
        try { data = JSON.parse(stdout); } catch {
            // 尝试找最后一行 JSON
            const lines = stdout.split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                try { data = JSON.parse(lines[i]); break; } catch {}
            }
        }
        if (!data?.data?.notes) return false;

        // 日期格式：06.12 或 MM.DD
        const dateShort = date.substring(5).replace('-', '.');
        // 也匹配 MM-DD 和 M.D 格式
        const datePatterns = [
            dateShort,                           // 06.12
            date.substring(5).replace('-', '-'), // 06-12
            date.substring(5),                   // 06-12
        ];

        for (const note of data.data.notes) {
            const title = note.display_title || note.title || '';
            if (title.includes('AI日报') && datePatterns.some(p => title.includes(p))) {
                console.log(`  ℹ 发现已有当日笔记: ${title} (${note.time || ''})`);
                return true;
            }
        }
        return false;
    } catch (error) {
        // 检查失败不阻塞发布
        console.log(`  ⚠ 无法检查已有笔记: ${error.message?.substring(0, 80)}`);
        return false;
    }
}

module.exports = { publishToXhs, generateXhsContent, generateXhsContentForPublish };
